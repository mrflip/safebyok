import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { deriveWrappingKey, makeVaultKey, toB64, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import { VaultError, type RefusalKind, type RefusalMeta } from '../src/errors'
import type { KeyDeriver } from '../src/key-deriver'
import { type GatedVaultRecord, VaultRecord, headerOf, passphraseCleartext } from '../src/shapes/vault'
import { PasskeyProving, PassphraseProving, OutsideGating, freshPasskeyAnswer, passphraseKeyOf, provingTools } from '../src/proving'
import { wayinCtxOf } from '../src/wayin'
import type { Vault } from '../src/vault'
import { heldLeaseOf } from '../src/held-lease'
import * as TH from './test-helpers'
import { makeRacingWorld, makeWorld, storedVaultRecordOf, vaultWithPasskey } from './vault/world'

/** The gated vault record `world` stores now. */
const storedRecordOf = (world: ReturnType<typeof makeWorld>): GatedVaultRecord => VaultRecord.parse(storedVaultRecordOf(world)) as GatedVaultRecord

/** A world holding `u1`'s vault with the passphrase `pw`, locked, and its stored vault record. */
const lockedWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.lock()
  return { world, vault, stored: storedRecordOf(world) }
}

/** A gating a test lands at will. */
const landableGating = () => {
  let landed = false
  return { gating: { get landed() { return landed } }, land: () => { landed = true } }
}

// == [Sealing]: PassphraseProving.seal, PasskeyProving.seal, provingTools

describe("PassphraseProving.seal", () => {
  it("makes a proving over the current passphrase's header, as its first example shows, showing only its slotlabel", async () => {
    const { vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    expect(proving.slotlabel).to.eq('passphrase')
    expect(proving.header).to.deep.eq(headerOf(stored.gate.passphrase))
    expect(JSON.stringify(proving)).to.eq('{"slotlabel":"passphrase"}')
    expect(Object.keys(proving)).to.not.include.members(['header', 'vault', 'gating'])
    expect(proving.gating).to.eq(OutsideGating)
  })

  it("keeps its stamp readable for the demand, but shows none of it in a spread or a log line", async () => {
    const { vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    expect(proving).to.include({ applabel: vault.applabel, user_id: vault.user_id, vaultlabel: vault.vaultlabel, vault_tok: vault.vault_tok, gate_epoch: stored.gate_epoch })
    expect(Object.keys(proving)).to.deep.eq(['slotlabel'])
    expect(Object.fromEntries(Object.entries(proving))).to.deep.eq({ slotlabel: 'passphrase' })
    expect(inspect(proving)).to.not.include(vault.vault_tok)
  })

  it("derives its key once, and runs no HKDF", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const world = makeWorld({ keyDeriver })
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    derivations.mockClear()
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey')
    await PassphraseProving.seal(vault, headerOf(storedRecordOf(world).gate.passphrase), 'pw', { gating: OutsideGating })
    expect(derivations).toHaveBeenCalledOnce()
    expect(deriveKey).not.toHaveBeenCalled()
  })

  it("mints a fresh header for { slotlabel }, as its second example shows: the vault's deriver, a fresh salt, this device's id, and the time now", async () => {
    const { world, vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next', { gating: OutsideGating })
    expect(proving.header).to.include({ wayinkind: 'passphrase', key_deriver_label: TH.testDeriver.key_deriver_label, device_id: stored.gate.passphrase.device_id, registered_at: world.clock.now() })
    expect(proving.header.salt_b64).to.not.eq(stored.gate.passphrase.salt_b64)
    const again = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next', { gating: OutsideGating })
    expect(again.header.salt_b64).to.not.eq(proving.header.salt_b64)
  })

  it("refuses over a current header, deriving nothing: a blank passphrase wrong_passphrase, another deriver's unknown_key_deriver, a misshapen salt damaged_wayin", async () => {
    const keyDeriver = { ...TH.testDeriver }
    const world = makeWorld({ keyDeriver })
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const stored = storedRecordOf(world)
    const derive = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const header = headerOf(stored.gate.passphrase)
    await TH.expectRefusal(PassphraseProving.seal(vault, header, '  ', { gating: OutsideGating }), 'wrong_passphrase')
    await TH.expectRefusal(PassphraseProving.seal(vault, { ...header, key_deriver_label: 'other' }, 'pw', { gating: OutsideGating }), 'unknown_key_deriver')
    await TH.expectRefusal(PassphraseProving.seal(vault, { ...header, salt_b64: 'c2hvcnQ' as never }, 'pw', { gating: OutsideGating }), 'damaged_wayin')
    expect(derive).not.toHaveBeenCalled()
  })

  it("refuses a passphrase that is not text as bad_option", async () => {
    const { vault, stored } = await lockedWorld()
    await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 42 as unknown as string, { gating: OutsideGating }), 'bad_option')
  })

  it("demands on the proving after the derivation: a gate changed meanwhile refuses gate_moved", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const header = headerOf(storedRecordOf(world).gate.passphrase)
    const held = world.holdNextDerive()
    const sealing = PassphraseProving.seal(vault, header, 'pw', { gating: OutsideGating })
    await held.reached
    const other = await world.open({ vaultDB: world.deafVaultDB() })
    await TH.unlock(other, 'pw')
    await TH.putWayin(other, 'pw', 'next')
    await vault.hello({ staleMinutes: 0 })
    held.release()
    await TH.expectRefusal(sealing, 'gate_moved')
  })
})

describe("PasskeyProving.seal", () => {
  it("makes a proving over the current passkey's header, as its first example shows, and zeroes the answer's bytes", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const stored = storedRecordOf(world)
    const proving = await PasskeyProving.seal(vault, headerOf(stored.gate.passkey!), laptop, { gating: OutsideGating })
    expect(proving.slotlabel).to.eq('passkey')
    expect([...laptop.prfBytes].every((byte) => byte === 0)).to.be.true
  })

  it("runs one HKDF over the answer's bytes, and no key derivation", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const world = makeWorld({ keyDeriver })
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    derivations.mockClear()
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey')
    await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    expect(deriveKey).toHaveBeenCalledOnce()
    expect(deriveKey.mock.calls[0]?.[0]).to.include({ name: 'HKDF' })
    expect(derivations).not.toHaveBeenCalled()
  })

  it("mints a fresh header of the answer's credential and salt, as its second example shows", async () => {
    const { vault, stored } = await lockedWorld()
    const answer = await TH.passkeyOf('phone')
    const proving = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer, { gating: OutsideGating })
    expect(proving.header).to.include({ wayinkind: 'passkey', credential_id: answer.credential_id, prf_salt_b64: answer.prf_salt_b64, device_id: stored.gate.passphrase.device_id })
  })

  it("refuses another credential's answer, or one over another salt, as wrong_passkey; a fresh one over a short salt as bad_option; and zeroes the bytes all the same", async () => {
    const { world, vault } = await vaultWithPasskey()
    const header = headerOf(storedRecordOf(world).gate.passkey!)
    const phone = await TH.passkeyOf('phone')
    await TH.expectRefusal(PasskeyProving.seal(vault, header, phone, { gating: OutsideGating }), 'wrong_passkey')
    expect([...phone.prfBytes].every((byte) => byte === 0)).to.be.true
    const otherSalt = toB64(new Uint8Array(32).fill(9))
    const overOtherSalt = await TH.passkeyOf('laptop', otherSalt)
    await TH.expectRefusal(PasskeyProving.seal(vault, header, overOtherSalt, { gating: OutsideGating }), 'wrong_passkey')
    const shortSalt = await TH.passkeyOf('phone', 'c2hvcnQ')
    await TH.expectRefusal(PasskeyProving.seal(vault, { slotlabel: 'passkey' }, shortSalt, { gating: OutsideGating }), 'bad_option')
  })

  it("refuses what is no passkey's answer as bad_option, quoting none of it", async () => {
    const { vault } = await lockedWorld()
    const err = await TH.expectRefusal(PasskeyProving.seal(vault, { slotlabel: 'passkey' }, { credential_id: 'abc' } as never, { gating: OutsideGating }), 'bad_option')
    expect(err.message).to.not.include('abc')
  })
})

describe("provingTools", () => {
  it("keys the Vault object's getter of what a seal reads, which no Object.keys, spread or JSON of the vault shows, as its example shows: a symbol of the module's own, registered under no name", async () => {
    const { vault } = await lockedWorld()
    expect(vault[provingTools].vaultRecord().vault_tok).to.eq(vault.vault_tok)
    expect(Object.keys(vault)).to.not.include('provingTools')
    expect(Object.getOwnPropertySymbols(vault), 'an accessor of the class, no own key a spread would copy').to.deep.eq([])
    expect(JSON.stringify(vault)).to.not.include('provingTools')
    expect(Symbol.keyFor(provingTools)).to.be.undefined
  })

  it("is what a seal refuses 'bad_option' without: a slice of a vault is no Vault object", async () => {
    const slice = TH.vaultSliceOf('u1') as unknown as Vault
    await TH.expectRefusal(PassphraseProving.seal(slice, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating }), 'bad_option')
    await TH.expectRefusal(PasskeyProving.seal(slice, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating }), 'bad_option')
  })
})

// == [Using]: demandOpens, resealWayinFor, sealWayins, wrappedWith, grantLease

describe("proving.demandOpens", () => {
  it("resolves for the passphrase that opens the gate's wayin, as its example shows, and refuses wrong_passphrase for another", async () => {
    const { vault, stored } = await lockedWorld()
    const proven = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    await proven.demandOpens()
    const mistyped = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'nope', { gating: OutsideGating })
    await TH.expectRefusal(mistyped.demandOpens(), 'wrong_passphrase')
  })

  it("refuses wrong_passkey for an answer that does not open the passkey's wrap", async () => {
    const { world, vault } = await vaultWithPasskey()
    const header = headerOf(storedRecordOf(world).gate.passkey!)
    const laptop = await TH.passkeyOf('laptop')
    const proving = await PasskeyProving.seal(vault, header, { ...laptop, prfBytes: new Uint8Array(32).fill(5) }, { gating: OutsideGating })
    await TH.expectRefusal(proving.demandOpens(), 'wrong_passkey')
  })

  it("refuses gating_landed once its gating landed, opening nothing", async () => {
    const { vault, stored } = await lockedWorld()
    const { gating, land } = landableGating()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating })
    land()
    await TH.expectRefusal(proving.demandOpens(), 'gating_landed')
  })

  it("refuses a vault whose stamp fails its check as 'bad_record', never as a wrong proof: the wayin's ctx is built before the unwrap's catch", async () => {
    const { vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    await proving.demandOpens()
    // The Vault object is frozen, so the stamp is broken at its getter, on the prototype, and mended after.
    const broken = vi.spyOn(Object.getPrototypeOf(vault) as Vault, 'stamp', 'get').mockReturnValue({ ...vault.stamp, registered_at: 'yesterday' as unknown as number })
    try {
      await TH.expectRefusal(proving.demandOpens(), 'bad_record')
    } finally {
      broken.mockRestore()
    }
  })
})

describe("proving.resealWayinFor", () => {
  it("wraps the vaultKey under the new proving, bound to its header, as its example shows: the new proving opens the wayin it makes", async () => {
    const { vault, stored } = await lockedWorld()
    const current = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    const next = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next', { gating: OutsideGating })
    const wayin = await current.resealWayinFor(next)
    expect(wayin.wayinkind).to.eq('passphrase')
    expect(headerOf(wayin.record)).to.deep.eq(next.header)
  })

  it("refuses wrong_passphrase for a current proving that does not open its wayin", async () => {
    const { vault, stored } = await lockedWorld()
    const current = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'nope', { gating: OutsideGating })
    const next = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next', { gating: OutsideGating })
    await TH.expectRefusal(current.resealWayinFor(next), 'wrong_passphrase')
  })

  it("refuses gate_moved for a passphrase another device has since replaced", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const current = await PassphraseProving.seal(vault, headerOf(storedRecordOf(world).gate.passphrase), 'pw', { gating: OutsideGating })
    const next = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    const other = await world.open({ vaultDB: world.deafVaultDB() })
    await TH.unlock(other, 'pw')
    await TH.putWayin(other, 'pw', 'replaced')
    await vault.hello({ staleMinutes: 0 })
    await TH.expectRefusal(current.resealWayinFor(next), 'gate_moved')
  })
})

describe("passphraseProving.sealWayins", () => {
  it("wraps one fresh vaultKey under the passphrase's header and the passkey's, as its example shows: each opens its own", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const passphrase = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating })
    const passkey = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    const wayins = await passphrase.sealWayins(passkey)
    expect(wayins.passphrase.wayinkind).to.eq('passphrase')
    expect(wayins.passkey?.wayinkind).to.eq('passkey')
    expect(wayins.passphrase.vault_tok).to.eq(vault.vault_tok)
  })

  it("makes no passkey wayin when given none", async () => {
    const vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating })
    const wayins = await proving.sealWayins()
    expect(wayins.passkey).to.be.null
  })
})

describe("proving.grantLease", () => {
  it("grants, stores and holds a lease by the wayin it opens, as its example shows", async () => {
    const { world, vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    const lease = await proving.grantLease()
    expect(TH.stateOf(vault.getSnapshot())).to.eq('unlocked')
    expect(heldLeaseOf(vault)).to.eq(lease)
    expect(await world.getLease()).to.deep.include(TH.shownOf(lease)).and.have.property('lease_key')
    expect(lease.gate_epoch).to.eq(stored.gate_epoch)
  })

  it("refuses wrong_passphrase, storing nothing, for a proving that does not open its wayin", async () => {
    const { world, vault, stored } = await lockedWorld()
    const mistyped = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'nope', { gating: OutsideGating })
    await TH.expectRefusal(mistyped.grantLease(), 'wrong_passphrase')
    expect(await world.getLease()).to.be.null
  })

  it("refuses gating_landed for a lock landing while putLease is in flight, holding no lease in memory or in the device store", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const { gating, land } = landableGating()
    const proving = await PassphraseProving.seal(vault, headerOf(storedRecordOf(world).gate.passphrase), 'pw', { gating })
    const held = world.holdNextLease()
    const granting = proving.grantLease()
    await held.reached
    land()
    await vault.lock()
    held.release()
    await TH.expectRefusal(granting, 'gating_landed')
    expect(heldLeaseOf(vault)).to.be.null
    expect(await world.getLease()).to.be.null
    expect(TH.stateOf(vault.getSnapshot())).to.eq('locked')
  })

  it("refuses gating_landed before putLease for a gating that landed while the vaultKey was wrapped, storing nothing", async () => {
    const { world, vault, stored } = await lockedWorld()
    const { gating, land } = landableGating()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating })
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    const granting = proving.grantLease()
    land()
    await TH.expectRefusal(granting, 'gating_landed')
    expect(putLease).not.toHaveBeenCalled()
  })
})

describe("passphraseKeyOf", () => {
  it("makes the non-extractable passphraseKey, as its example shows", async () => {
    const wayinKey = await passphraseKeyOf(TH.testDeriver, passphraseCleartext.parse('pw'), new Uint8Array(16).fill(7), TH.spyLogger().logger)
    expect(wayinKey.extractable).to.be.false
    expect(wayinKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })
})

describe("proving.wrappedWith", () => {
  it("wraps a key bound to a header, as its example shows", async () => {
    const vault: Vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating })
    const wrapped = await proving.wrappedWith(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['wrapKey']), proving.header)
    expect(wrapped).to.have.keys(['cipher_iv_b64', 'ciphertext_b64'])
  })
})

// == [Key bytes and answers]: passphraseKeyOf, a key deriver's bytes, freshPasskeyAnswer, a proving's secret

/** A fresh 16-byte salt, as a passphrase's wayin keeps it. */
const saltBytes = new Uint8Array(16).fill(7)

/** `count` bytes of `filler`, as an array to compare a view's bytes with. */
const bytesOf = (filler: number, count: number): number[] => Array.from({ length: count }, () => filler)

/** True when `wayinKey` wraps a vaultKey that `again` unwraps: the two are the same key. */
const wrapsAlike = async (wayinKey: CryptoKey, again: CryptoKey): Promise<boolean> => {
  const ctx = new Uint8Array(1)
  const wrapped = await wrapKeyUnder(wayinKey, await makeVaultKey(), ctx)
  return (await unwrapKeyUnder(again, wrapped, ctx, { extractable: false, usage: ['wrapKey'] })) instanceof CryptoKey
}

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, salt: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, salt))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** A testDeriver whose handed-back bytes the test keeps hold of, to look at once the proving is through with them. */
const keepingDeriver = () => {
  const handed: Uint8Array[] = []
  const keyDeriver: KeyDeriver = {
    ...TH.testDeriver,
    deriveKeyBytes: async (passphrase, salt) => {
      const bytes = await TH.testDeriver.deriveKeyBytes(passphrase, salt)
      handed.push(bytes)
      return bytes
    },
  }
  return { keyDeriver, handed }
}

/** The passphraseKey of 'pw' over {@link saltBytes}, by `keyDeriver`. */
const keyBy = async (keyDeriver: KeyDeriver) => await passphraseKeyOf(keyDeriver, passphraseCleartext.parse('pw'), saltBytes, TH.spyLogger().logger)

/** A key deriver handing back `handed` whatever it is asked. */
const handingBack = (handed: unknown): KeyDeriver => ({ ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(handed as Uint8Array) })

describe("passphraseKeyOf, deriving", () => {
  it("is the key deriver's bytes over the passphrase and salt, derived once: the same two make the same key", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const wayinKey = await passphraseKeyOf(keyDeriver, passphraseCleartext.parse('pw'), saltBytes, TH.spyLogger().logger)
    expect(derivations).toHaveBeenCalledOnce()
    expect(derivations.mock.calls[0]?.[0]).to.eq('pw')
    expect([...derivations.mock.calls[0]?.[1] ?? []]).to.deep.equal(bytesOf(7, 16))
    expect(await wrapsAlike(wayinKey, await keyBy(TH.testDeriver))).to.be.true
  })

  it("makes another key of another passphrase, or another salt", async () => {
    const wayinKey = await keyBy(TH.testDeriver)
    const otherPassphrase = await passphraseKeyOf(TH.testDeriver, passphraseCleartext.parse('pW'), saltBytes, TH.spyLogger().logger)
    await expect(wrapsAlike(wayinKey, otherPassphrase)).rejects.toThrow()
    const otherSalt = await passphraseKeyOf(TH.testDeriver, passphraseCleartext.parse('pw'), new Uint8Array(16), TH.spyLogger().logger)
    await expect(wrapsAlike(wayinKey, otherSalt)).rejects.toThrow()
  })

  it("lets a vault's proving refuse a key deriver's throw quoting the passphrase as unexpected_error, keeping nothing of it, the logger hearing only that it threw", async () => {
    const thrown = Object.assign(new Error('the deriver fell over on pw-the-passphrase'), { typed: 'pw-the-passphrase' })
    const world = makeWorld({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) } })
    const vault = await world.open()
    const heard = world.logged.length
    const err = await TH.expectRefusal(PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw-the-passphrase', { gating: OutsideGating }), 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include('pw-the-passphrase')
    expect(TH.loggedText(world.logged)).to.not.include('pw-the-passphrase')
    expect(world.logged.slice(heard).map((logged) => [logged.level, logged.story])).to.deep.equal([['error', { call: 'deriveKeyBytes', refusalkind: null }]])
  })
})

/** What a key deriver might throw, quoting the passphrase 'pw-the-passphrase', and the kind it is refused as. */
const DeriverThrowCases = [
  // a condition, for the caller to show or retry, its kind kept:
  [new VaultError('storage_unavailable', 'The word list for pw-the-passphrase could not be loaded.'),                         "storage_unavailable", null,            'keeps the kind of a condition, in words of safebyok'],
  [new VaultError('wrong_passphrase', "pw-the-passphrase can't be empty.", { meta: { typed: 'pw-the-passphrase' } as RefusalMeta }), "wrong_passphrase",    null,            'keeps the kind of a condition, none of its meta'],
  // anything else:
  [new VaultError('bad_option', 'pw-the-passphrase is no passphrase I can judge.'),                                          "unexpected_error",    "bad_option",    'refuses a VaultError of misuse as unexpected_error, logging its kind'],
  [new VaultError('damaged_vault', 'pw-the-passphrase broke me.'),                                                           "unexpected_error",    "damaged_vault", 'refuses a VaultError of bad news as unexpected_error, never to be told to onBadNews'],
  [new VaultError('pw-the-passphrase' as RefusalKind, 'A refusal made up.'),                                                 "unexpected_error",    null,            'refuses a VaultError whose kind is off the list as unexpected_error, logging no kind, as the host wrote that kind'],
  [new TypeError('could not judge pw-the-passphrase'),                                                                       "unexpected_error",    null,            'refuses a throw that is no VaultError as unexpected_error'],
] as const

describe("passphraseKeyOf, when its key deriver throws", () => {
  for (const [thrown, kind, loggedKind, blurb] of DeriverThrowCases) {
    it(`${blurb}, keeping nothing of the throw: no cause, text or property, and nothing in the log`, async () => {
      const spy = TH.spyLogger()
      const err = await TH.expectRefusal(passphraseKeyOf({ ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) }, passphraseCleartext.parse('pw-the-passphrase'), saltBytes, spy.logger), kind)
      expect(err).to.not.eq(thrown)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('pw-the-passphrase')
      expect(TH.loggedText(spy.calls)).to.not.include('pw-the-passphrase')
      const story = kind === 'unexpected_error' ? [['error', { call: 'deriveKeyBytes', refusalkind: loggedKind }]] : []
      expect(spy.calls.map((logged) => [logged.level, logged.story])).to.deep.equal(story)
    })
  }
})

describe("a key deriver's bytes", () => {
  it("are zeroed once they have made the passphraseKey, which still wraps and unwraps", async () => {
    const { keyDeriver, handed } = keepingDeriver()
    const wayinKey = await keyBy(keyDeriver)
    expect(handed).to.have.lengthOf(1)
    expect([...handed[0] ?? []]).to.deep.equal(bytesOf(0, 32))
    // The key made of them still opens what it wrapped: zeroing is after the import.
    expect(await wrapsAlike(wayinKey, await keyBy(TH.testDeriver))).to.be.true
  })

  it("are zeroed after every proving of a vault's passphrase, a wrong passphrase's included", async () => {
    const { keyDeriver, handed } = keepingDeriver()
    const world = makeWorld({ keyDeriver })
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const header = headerOf(storedRecordOf(world).gate.passphrase)
    const mistyped = await PassphraseProving.seal(vault, header, 'wrong', { gating: OutsideGating })
    await TH.expectRefusal(mistyped.demandOpens(), 'wrong_passphrase')
    const proven = await PassphraseProving.seal(vault, header, 'pw', { gating: OutsideGating })
    await proven.demandOpens()
    expect(handed.length).to.be.greaterThanOrEqual(3)
    for (const bytes of handed) { expect(bytes.every((byte) => byte === 0)).to.be.true }
  })

  it("are zeroed through a view with an offset, touching nothing around it", async () => {
    const backing = new Uint8Array(48).fill(9)
    const keyDeriver: KeyDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase, salt) => {
      backing.set(await TH.testDeriver.deriveKeyBytes(passphrase, salt), 8)
      return backing.subarray(8, 40)
    } }
    await keyBy(keyDeriver)
    expect([...backing.subarray(8, 40)]).to.deep.equal(bytesOf(0, 32))
    expect([...backing.subarray(0, 8)]).to.deep.equal(bytesOf(9, 8))
    expect([...backing.subarray(40)]).to.deep.equal(bytesOf(9, 8))
  })

  it("are refused as bad_option, untouched, when they sit in shared memory, saying so and not quoting them", async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(32)).fill(5)
    const err = await TH.expectRefusal(keyBy(handingBack(shared)), 'bad_option')
    expect(err.message).to.include('SharedArrayBuffer')
    expect(err.message).to.not.include('5,5')
    expect([...shared]).to.deep.equal(bytesOf(5, 32))
  })

  it("are zeroed when refused for their length, as when imported", async () => {
    const long = new Uint8Array(64).fill(5)
    await TH.expectRefusal(keyBy(handingBack(long)), 'bad_option')
    expect([...long]).to.deep.equal(bytesOf(0, 64))
  })

  it("are refused as bad_option when they are 32 zero bytes, a key anyone could rebuild", async () => {
    const zeros = new Uint8Array(32)
    const err = await TH.expectRefusal(keyBy(handingBack(zeros)), 'bad_option')
    expect(err.message).to.include('zero bytes')
  })

  it("are refused as bad_option when they are not 32 bytes of a view at all", async () => {
    for (const handed of [new Uint8Array(31), new Uint8Array(33), 'thirty-two bytes, honest', null, new ArrayBuffer(32)]) {
      await TH.expectRefusal(keyBy(handingBack(handed)), 'bad_option')
    }
  })
})

describe("PassphraseProving.seal, the passphrase", () => {
  it("refuses anything but text as bad_option, a passkey's answer among it", async () => {
    const { vault, stored } = await lockedWorld()
    for (const given of [42, null, undefined, await TH.passkeyOf('laptop')]) {
      await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), given as unknown as string, { gating: OutsideGating }), 'bad_option')
    }
  })

  it("refuses every blank over a current header as wrong_passphrase, deriving nothing", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const world = makeWorld({ keyDeriver })
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const header = headerOf(storedRecordOf(world).gate.passphrase)
    derivations.mockClear()
    for (const blank of ['', ' '.repeat(3), '\t\n']) {
      await TH.expectRefusal(PassphraseProving.seal(vault, header, blank, { gating: OutsideGating }), 'wrong_passphrase')
    }
    expect(derivations).not.toHaveBeenCalled()
  })

  it("takes the passphrase as typed, spaces and all: a padded one does not open the wayin its bare words sealed", async () => {
    const { vault, stored } = await lockedWorld()
    const padded = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), '  pw  ', { gating: OutsideGating })
    await TH.expectRefusal(padded.demandOpens(), 'wrong_passphrase')
  })
})

describe("PasskeyProving.seal, the key", () => {
  it("is HKDF over the answer's bytes with the header's wayin ctx as its info, and over no other info", async () => {
    const { vault } = await lockedWorld()
    const { prfBytes } = await TH.passkeyOf('laptop')
    const proving = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    const ctx = wayinCtxOf(vault, proving.header)
    const wrapped = await proving.wrappedWith(await makeVaultKey(), proving.header)
    const passkeyKey = await deriveWrappingKey(prfBytes, ctx)
    expect(await unwrapKeyUnder(passkeyKey, wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).to.be.instanceOf(CryptoKey)
    const elsewhere = await deriveWrappingKey(prfBytes, new Uint8Array(1))
    await expect(unwrapKeyUnder(elsewhere, wrapped, ctx, { extractable: false, usage: ['wrapKey'] })).rejects.toThrow()
  })
})

/** Salts no new passkey's wayin is sealed over. */
const SaltShapeCases = [
  [toB64(new Uint8Array(16)), 'a salt of 16 bytes, not 32'],
  ["not base64url!",          'a salt that is not base64url'],
] as const

describe("freshPasskeyAnswer", () => {
  it("passes an answer over a fresh 32-byte salt, as its first example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    expect(freshPasskeyAnswer.parse(answer).prfBytes).to.eq(answer.prfBytes)
  })

  it("refuses an answer over a salt too short as bad_option, as its second example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    TH.expectSyncRefusal(() => freshPasskeyAnswer.parse({ ...answer, prf_salt_b64: 'c2hvcnQ' }), 'bad_option')
  })

  for (const [saltB64, blurb] of SaltShapeCases) {
    it(`refuses an answer over ${blurb} as bad_option, naming the field and createPasskey`, async () => {
      const answer = await TH.passkeyOf('laptop', saltB64)
      const err = TH.expectSyncRefusal(() => freshPasskeyAnswer.parse(answer), 'bad_option')
      expect(err.message).to.match(/^prf_salt_b64: .*createPasskey/)
    })
  }

  it("refuses what is no passkey's answer as passkeyAnswerShape does, bad_option", () => {
    TH.expectSyncRefusal(() => freshPasskeyAnswer.parse({ credential_id: 'abc' }), 'bad_option')
  })

  it("refuses a second sealing with an answer already used, its bytes zeroed at the first, as bad_option", async () => {
    const { vault } = await lockedWorld()
    const usedAnswer = await TH.passkeyOf('laptop')
    await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, usedAnswer, { gating: OutsideGating })
    const err = await TH.expectRefusal(PasskeyProving.seal(vault, { slotlabel: 'passkey' }, usedAnswer, { gating: OutsideGating }), 'bad_option')
    expect(err.message).to.include('used already')
  })

  it("refuses a sealing over a fresh header with an answer over a short salt, bad_option, and zeroes its bytes all the same", async () => {
    const { vault } = await lockedWorld()
    const answer = await TH.passkeyOf('laptop', toB64(new Uint8Array(16)))
    await TH.expectRefusal(PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer, { gating: OutsideGating }), 'bad_option')
    expect(answer.prfBytes.every((byte) => byte === 0)).to.be.true
  })
})

describe("a proving's secret", () => {
  it("shows in no JSON: toJSON is the slotlabel alone, as the Proving's second example shows", async () => {
    const { vault, stored } = await lockedWorld()
    const passphrase = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'hunter2-hunter2', { gating: OutsideGating })
    expect(JSON.stringify(passphrase)).to.eq('{"slotlabel":"passphrase"}')
    const passkey = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    expect(JSON.stringify(passkey)).to.eq('{"slotlabel":"passkey"}')
  })

  it("is in no key, spread or log line: neither the passphrase nor the wayinKey made of it", async () => {
    const { vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'hunter2-hunter2', { gating: OutsideGating })
    const spread = Object.fromEntries(Object.entries(proving))
    expect(JSON.stringify(spread)).to.not.include('hunter2')
    expect(Object.values(proving).some((val) => val instanceof CryptoKey)).to.be.false
    expect(inspect(proving, { depth: 4 })).to.not.include('hunter2')
    expect(inspect(proving, { depth: 4 })).to.not.include('CryptoKey')
  })

  it("holds no passkey answer bytes in a key, a spread or a log line", async () => {
    const { vault } = await lockedWorld()
    const proving = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    expect(Object.values(proving).some((val) => val instanceof Uint8Array || val instanceof CryptoKey)).to.be.false
    expect(inspect(proving, { depth: 4 })).to.not.include('Uint8Array')
    expect(inspect(proving, { depth: 4 })).to.not.include('CryptoKey')
  })

  it("holds its vault, not enumerable, so a proving serializes in no circle", async () => {
    const { vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    expect(proving.vault).to.eq(vault)
    expect(Object.keys(proving)).to.not.include('vault')
  })

  it("cannot be written over: a proving is frozen", async () => {
    const { vault, stored } = await lockedWorld()
    const passphrase = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    const passkey = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    expect(Object.isFrozen(passphrase)).to.be.true
    expect(Object.isFrozen(passkey)).to.be.true
    for (const field of ['slotlabel', 'vault_tok', 'vault', 'header', 'gating']) {
      expect(Reflect.set(passphrase, field, 'other'), field).to.be.false
    }
    expect(Object.isFrozen(passphrase.header)).to.be.true
    expect(passphrase.slotlabel).to.eq('passphrase')
  })
})
// --

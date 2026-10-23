import { describe, expect, it, vi } from 'vitest'
import { toB64 } from '../src/crypto'
import { GatedVaultProps } from '../src/types'
import { PasskeyProving, PassphraseProving, StandingGating, headerOf, passphraseKeyOf } from '../src/proving'
import type { Vault } from '../src/vault'
import { leaseRecordOf } from '../src/lease'
import { heldLeaseOf } from '../src/held-lease'
import * as TH from './test-helpers'
import { makeRacingWorld, makeWorld, storedVaultPropsOf, vaultWithPasskey } from './vault/world'

/** The gated vault props `world` stores now. */
const propsOf = (world: ReturnType<typeof makeWorld>): GatedVaultProps => GatedVaultProps.parse(storedVaultPropsOf(world))

/** A world holding `u1`'s vault with the passphrase `pw`, locked, and its stored props. */
const lockedWorld = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  await vault.lock()
  return { world, vault, props: propsOf(world) }
}

/** A gating a test lands at will. */
const landableGating = () => {
  let landed = false
  return { gating: { get landed() { return landed } }, land: () => { landed = true } }
}

// == [Sealing]: PassphraseProving.seal, PasskeyProving.seal

describe("PassphraseProving.seal", () => {
  it("makes a proving over the current passphrase's header, as its first example shows, showing only its slotlabel", async () => {
    const { vault, props } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
    expect(proving.slotlabel).to.eq('passphrase')
    expect(proving.header).to.deep.eq(headerOf(props.passphrase))
    expect(JSON.stringify(proving)).to.eq('{"slotlabel":"passphrase"}')
    expect(Object.keys(proving)).to.not.include.members(['header', 'vault', 'gating'])
    expect(proving.gating).to.eq(StandingGating)
  })

  it("mints a fresh header for { slotlabel }, as its second example shows: the vault's deriver, a fresh salt, this device's id, and the time now", async () => {
    const { vault, props } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next')
    expect(proving.header).to.include({ wayinkind: 'passphrase', key_deriver_label: TH.testDeriver.key_deriver_label, device_id: props.passphrase.device_id, registered_at: vault.now() })
    expect(proving.header.salt_b64).to.not.eq(props.passphrase.salt_b64)
    const again = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next')
    expect(again.header.salt_b64).to.not.eq(proving.header.salt_b64)
  })

  it("refuses over a current header, deriving nothing: a blank passphrase wrong_passphrase, another deriver's unknown_key_deriver, a misshapen salt damaged_wayin", async () => {
    const { vault, props } = await lockedWorld()
    const derive = vi.spyOn(vault.keyDeriver, 'deriveKeyBytes')
    const header = headerOf(props.passphrase)
    await TH.expectRefusal(PassphraseProving.seal(vault, header, '  '), 'wrong_passphrase')
    await TH.expectRefusal(PassphraseProving.seal(vault, { ...header, key_deriver_label: 'other' }, 'pw'), 'unknown_key_deriver')
    await TH.expectRefusal(PassphraseProving.seal(vault, { ...header, salt_b64: 'c2hvcnQ' }, 'pw'), 'damaged_wayin')
    expect(derive).not.toHaveBeenCalled()
  })

  it("refuses a passphrase that is not text as bad_option", async () => {
    const { vault, props } = await lockedWorld()
    await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(props.passphrase), 42 as unknown as string), 'bad_option')
  })

  it("demands on the proving after the derivation: a gate changed meanwhile refuses gate_moved", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    const header = headerOf(propsOf(world).passphrase)
    const held = world.holdNextDerive()
    const sealing = PassphraseProving.seal(vault, header, 'pw')
    await held.reached
    const other = await world.open({ vaultDB: world.deafVaultDB() })
    await other.unlock('pw')
    await other.putWayin('pw', 'next')
    await vault.hello({ staleMinutes: 0 })
    held.release()
    await TH.expectRefusal(sealing, 'gate_moved')
  })
})

describe("PasskeyProving.seal", () => {
  it("makes a proving over the current passkey's header, as its first example shows, and zeroes the answer's bytes", async () => {
    const { world, vault, laptop } = await vaultWithPasskey()
    const props = propsOf(world)
    const proving = await PasskeyProving.seal(vault, headerOf(props.passkey!), laptop)
    expect(proving.slotlabel).to.eq('passkey')
    expect([...laptop.prfBytes].every((byte) => byte === 0)).to.eq(true)
  })

  it("mints a fresh header of the answer's credential and salt, as its second example shows", async () => {
    const { vault, props } = await lockedWorld()
    const answer = await TH.passkeyOf('phone')
    const proving = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer)
    expect(proving.header).to.include({ wayinkind: 'passkey', credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64, device_id: props.passphrase.device_id })
  })

  it("refuses another credential's answer, or one over another salt, as wrong_passkey; a fresh one over a short salt as bad_option; and zeroes the bytes all the same", async () => {
    const { world, vault } = await vaultWithPasskey()
    const header = headerOf(propsOf(world).passkey!)
    const phone = await TH.passkeyOf('phone')
    await TH.expectRefusal(PasskeyProving.seal(vault, header, phone), 'wrong_passkey')
    expect([...phone.prfBytes].every((byte) => byte === 0)).to.eq(true)
    const otherSalt = toB64(new Uint8Array(32).fill(9))
    const overOtherSalt = await TH.passkeyOf('laptop', otherSalt)
    await TH.expectRefusal(PasskeyProving.seal(vault, header, overOtherSalt), 'wrong_passkey')
    const shortSalt = await TH.passkeyOf('phone', 'c2hvcnQ')
    await TH.expectRefusal(PasskeyProving.seal(vault, { slotlabel: 'passkey' }, shortSalt), 'bad_option')
  })

  it("refuses what is no passkey's answer as bad_option, quoting none of it", async () => {
    const { vault } = await lockedWorld()
    const err = await TH.expectRefusal(PasskeyProving.seal(vault, { slotlabel: 'passkey' }, { credentialId: 'abc' } as never), 'bad_option')
    expect(err.message).to.not.include('abc')
  })
})

// == [Using]: checkWayin, resealWayinFor, sealWayins, wrappedWith, grantLease

describe("proving.checkWayin", () => {
  it("resolves for the passphrase that opens the gate's wayin, as its example shows, and refuses wrong_passphrase for another", async () => {
    const { vault, props } = await lockedWorld()
    const proven = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
    await proven.checkWayin()
    const mistyped = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'nope')
    await TH.expectRefusal(mistyped.checkWayin(), 'wrong_passphrase')
  })

  it("refuses wrong_passkey for an answer that does not open the passkey's wrap", async () => {
    const { world, vault } = await vaultWithPasskey()
    const header = headerOf(propsOf(world).passkey!)
    const laptop = await TH.passkeyOf('laptop')
    const proving = await PasskeyProving.seal(vault, header, { ...laptop, prfBytes: new Uint8Array(32).fill(5) })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
  })

  it("refuses gating_landed once its gating landed, opening nothing", async () => {
    const { vault, props } = await lockedWorld()
    const { gating, land } = landableGating()
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw', { gating })
    land()
    await TH.expectRefusal(proving.checkWayin(), 'gating_landed')
  })
})

describe("proving.resealWayinFor", () => {
  it("wraps the vaultKey under the new proving, bound to its header, as its example shows: the new proving opens the wayin it makes", async () => {
    const { vault, props } = await lockedWorld()
    const current = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
    const next = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next')
    const wayin = await current.resealWayinFor(next)
    expect(wayin.wayinkind).to.eq('passphrase')
    expect(headerOf(wayin.record as typeof props.passphrase)).to.deep.eq(next.header)
  })

  it("refuses wrong_passphrase for a current proving that does not open its wayin", async () => {
    const { vault, props } = await lockedWorld()
    const current = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'nope')
    const next = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next')
    await TH.expectRefusal(current.resealWayinFor(next), 'wrong_passphrase')
  })

  it("refuses gate_moved for a passphrase another device has since replaced", async () => {
    const world = makeWorld()
    const vault = await world.openUnlocked('pw')
    const current = await PassphraseProving.seal(vault, headerOf(propsOf(world).passphrase), 'pw')
    const next = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'))
    const other = await world.open({ vaultDB: world.deafVaultDB() })
    await other.unlock('pw')
    await other.putWayin('pw', 'replaced')
    await vault.hello({ staleMinutes: 0 })
    await TH.expectRefusal(current.resealWayinFor(next), 'gate_moved')
  })
})

describe("passphraseProving.sealWayins", () => {
  it("wraps one fresh vaultKey under the passphrase's header and the passkey's, as its example shows: each opens its own", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const passphrase = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw')
    const passkey = await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, await TH.passkeyOf('laptop'))
    const wayins = await passphrase.sealWayins(passkey)
    expect(wayins.passphrase.wayinkind).to.eq('passphrase')
    expect(wayins.passkey?.wayinkind).to.eq('passkey')
    expect(wayins.passphrase.vault_tok).to.eq(vault.vault_tok)
  })

  it("makes no passkey wayin when given none", async () => {
    const vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw')
    const wayins = await proving.sealWayins()
    expect(wayins.passkey).to.eq(null)
  })
})

describe("proving.grantLease", () => {
  it("grants, stores and holds a lease by the wayin it opens, as its example shows", async () => {
    const { world, vault, props } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
    const lease = await proving.grantLease()
    expect(vault.getSnapshot().state).to.eq('unlocked')
    expect(heldLeaseOf(vault)).to.eq(lease)
    expect(leaseRecordOf(lease)).to.deep.eq(await world.getLease())
    expect(lease.gate_epoch).to.eq(props.gate_epoch)
  })

  it("refuses wrong_passphrase, storing nothing, for a proving that does not open its wayin", async () => {
    const { world, vault, props } = await lockedWorld()
    const mistyped = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'nope')
    await TH.expectRefusal(mistyped.grantLease(), 'wrong_passphrase')
    expect(await world.getLease()).to.eq(null)
  })

  it("refuses gating_landed for a lock landing while putLease is in flight, holding no lease in memory or in the device store", async () => {
    const world = makeRacingWorld()
    const vault = await world.openUnlocked('pw')
    await vault.lock()
    const { gating, land } = landableGating()
    const proving = await PassphraseProving.seal(vault, headerOf(propsOf(world).passphrase), 'pw', { gating })
    const held = world.holdNextLease()
    const granting = proving.grantLease()
    await held.reached
    land()
    await vault.lock()
    held.release()
    await TH.expectRefusal(granting, 'gating_landed')
    expect(heldLeaseOf(vault)).to.eq(null)
    expect(await world.getLease()).to.eq(null)
    expect(vault.getSnapshot().state).to.eq('locked')
  })

  it("refuses gating_landed before putLease for a gating that landed while the vaultKey was wrapped, storing nothing", async () => {
    const { world, vault, props } = await lockedWorld()
    const { gating, land } = landableGating()
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw', { gating })
    const putLease = vi.spyOn(world.deviceDB, 'putLease')
    const granting = proving.grantLease()
    land()
    await TH.expectRefusal(granting, 'gating_landed')
    expect(putLease).not.toHaveBeenCalled()
  })
})

describe("passphraseKeyOf", () => {
  it("makes the non-extractable passphraseKey, as its example shows", async () => {
    const wayinKey = await passphraseKeyOf(TH.testDeriver, 'pw', new Uint8Array(16).fill(7))
    expect(wayinKey.extractable).to.eq(false)
    expect(wayinKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })
})

describe("proving.wrappedWith", () => {
  it("wraps a key bound to a header, as its example shows", async () => {
    const vault: Vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw')
    const wrapped = await proving.wrappedWith(await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['wrapKey']), proving.header)
    expect(wrapped).to.have.keys(['cipher_iv_b64', 'ciphertext_b64'])
  })
})

describe("headerOf", () => {
  it("is a wayin record without its wrap, as its example shows", async () => {
    const { props } = await lockedWorld()
    expect(headerOf(props.passphrase)).to.not.have.property('vault_key_wayin_wrapped')
    expect(headerOf(props.passphrase)).to.include({ salt_b64: props.passphrase.salt_b64 })
  })
})

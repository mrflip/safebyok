import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { cipherCtx, deriveWrappingKey, fromB64, makeVaultKey, toB64, unwrapKeyUnder } from '../src/crypto'
import type { KeyDeriver } from '../src/key-deriver'
import { PasskeyProving, PassphraseProving, OutsideGating, headerOf, passphraseKeyOf } from '../src/proving'
import type { PasskeyAnswer } from '../src/types/types'
import { type GatedVaultRecord, VaultRecord, type PasskeyWayinRecord } from '../src/vault-record'
import { passphraseCleartext, prf_salt_b64 } from '../src/types/type-aliases'
import type { Vault } from '../src/vault'
import { PasskeyWayin, PassphraseWayin, Wayin, wayinCtxOf } from '../src/wayin'
import * as TH from './test-helpers'
import { addLaptopPasskey, makeWorld, storedVaultRecordOf, u1VaultScopepath } from './vault/world'

/** The slice of a vault every record-only way in here is made under: `u1`'s `main` vault, deriving with the test deriver. */
const slice: TH.VaultSlice = TH.vaultSliceOf('u1', TH.testDeriver, { now: () => Date.UTC(2026, 9, 15) })
/** The vault record every record-only way in here is one of. */
const vaultRecord = TH.vaultRecordOf('u1')

/** The vaultKey's usage when it is unwrapped only to see that it opens. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const

/** The gated vault record `world` stores now. */
const storedRecordOf = (world: ReturnType<typeof makeWorld>): GatedVaultRecord => VaultRecord.parse(storedVaultRecordOf(world)) as GatedVaultRecord

/** The passkey way in `stored` holds: the test's vault was given one. */
const passkeyRecordOf = (stored: GatedVaultRecord): PasskeyWayinRecord => {
  if (stored.gate.passkey === null) { throw new Error("this vault record holds no passkey") }
  return stored.gate.passkey
}

/**
 * A world holding `u1`'s vault with the passphrase `pw` and, with `opts.passkey`, the passkey
 * `laptop`, locked; its stored vault record; and its key deriver, its own copy of testDeriver, so a spy
 * on it stays here.
 */
const lockedWorld = async (opts: { passkey?: boolean } = {}) => {
  const keyDeriver: KeyDeriver = { ...TH.testDeriver }
  const world = makeWorld({ keyDeriver })
  const vault = await world.openUnlocked('pw')
  if (opts.passkey === true) { await addLaptopPasskey(vault) }
  await vault.lock()
  return { world, vault, keyDeriver, stored: storedRecordOf(world) }
}

/** `world`'s stored vault record with `changes` written over it, a Vault object opened on it afresh, and the record as stored. */
const reopenedWith = async (world: ReturnType<typeof makeWorld>, changes: Record<string, unknown>) => {
  world.dbStore.write(u1VaultScopepath, JSON.stringify({ ...storedVaultRecordOf(world), ...changes }))
  const vault = await world.open()
  return { vault, stored: storedRecordOf(world) }
}

/** A novel vault's first way ins, sealed by fresh provings of `passphrase` and, when given, `answer`: the vault, the passphrase's proving, and the way ins. */
const novelWayins = async (passphrase = 'pw', answer?: PasskeyAnswer) => {
  const world = makeWorld()
  const vault = await world.open()
  const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, passphrase, { gating: OutsideGating })
  const passkeyProving = answer === undefined ? undefined : await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer, { gating: OutsideGating })
  const wayins = await proving.sealWayins(passkeyProving)
  return { world, vault, proving, ...wayins }
}

/** A novel vault's passkey way in, sealed for the passkey that answered `answer`, and the vault. */
const novelPasskey = async (answer: PasskeyAnswer): Promise<{ vault: Vault, passkey: PasskeyWayin }> => {
  const { vault, passkey } = await novelWayins('pw', answer)
  if (passkey === null) { throw new Error("sealWayins made no passkey way in") }
  return { vault, passkey }
}

/** The passphrase way in a proving of `pw` reseals in `vault`, whose stored vault record is `stored`, for a fresh proving of `next`: a fresh header, minted. */
const resealedPassphrase = async (vault: Vault, stored: GatedVaultRecord): Promise<PassphraseWayin> => {
  const current = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
  const fresh = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next', { gating: OutsideGating })
  const wayin = await current.resealWayinFor(fresh)
  if (! (wayin instanceof PassphraseWayin)) { throw new TypeError("a passphrase's reseal made another kind of way in") }
  return wayin
}

/** The passphraseKey the test deriver makes of `pw` over `saltB64`: the key a proving of `pw` over that salt holds. */
const passphraseKeyOver = async (saltB64: string): Promise<CryptoKey> => (
  await passphraseKeyOf(TH.testDeriver, passphraseCleartext.parse('pw'), fromB64(saltB64), TH.spyLogger().logger)
)

/** The vaultKey's raw bytes, to compare two handles on it. */
const rawOf = async (vaultKey: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)))

// == [Making]: make, record, toJSON, summary, wayinCtx

describe("Wayin.make", () => {
  it("makes a PassphraseWayin of a passphrase's record, as its first example shows", () => {
    const wayin = Wayin.make(vaultRecord, TH.wayinOf('passphrase'), slice)
    expect(wayin).to.be.instanceOf(PassphraseWayin)
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.wayinkind).to.eq('passphrase')
  })

  it("makes the vault record's passphrase a PassphraseWayin, bound to that record, as the Wayin's first example shows", async () => {
    const { keyDeriver, stored } = await lockedWorld()
    const passphrase = Wayin.make(stored, stored.gate.passphrase, { keyDeriver })
    expect(passphrase.wayinkind).to.eq('passphrase')
    const passphraseKey = await passphraseKeyOver(stored.gate.passphrase.salt_b64)
    const { vault_key_wayin_wrapped: wrapped } = passphrase.record
    expect(await unwrapKeyUnder(passphraseKey, wrapped, passphrase.wayinCtx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("makes a PasskeyWayin of a passkey's record, told apart by its wayinkind", () => {
    const wayin = Wayin.make(vaultRecord, TH.passkeyWayinOf('laptop'), slice)
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    expect(wayin.wayinkind).to.eq('passkey')
  })

  it("gives each visible field as a field of its own, read from the record: its kind, device and time, and a passkey's credential and salt, and the vault_tok it was made under", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(vaultRecord, record, slice)
    expect(TH.shownOf(wayin)).to.deep.equal({ wayinkind: 'passphrase', device_id: record.device_id, registered_at: record.registered_at, vault_tok: 'vault-tok-u1' })
    const passkeyRecord = TH.passkeyWayinOf('laptop')
    const passkey = Wayin.make(vaultRecord, passkeyRecord, slice)
    expect(TH.shownOf(passkey)).to.deep.equal({
      wayinkind: 'passkey', device_id: passkeyRecord.device_id, registered_at: passkeyRecord.registered_at, vault_tok: 'vault-tok-u1',
      credential_id: passkeyRecord.credential_id, prf_salt_b64: passkeyRecord.prf_salt_b64,
    })
  })

  it("refuses a record this package never writes as bad_record, as its second example shows", () => {
    TH.expectSyncRefusal(() => Wayin.make(vaultRecord, { ...TH.wayinOf('passphrase'), device_id: '' }, slice), 'bad_record')
  })

  const MisshapenCases = [
    [{ ...TH.wayinOf('passphrase'), wayinkind: 'fingerprint' },       'a wayinkind this package does not know'],
    [{ ...TH.wayinOf('passphrase'), salt_b64: undefined },            'a passphrase with no salt'],
    [{ ...TH.passkeyWayinOf('laptop'), credential_id: 7 },             'a passkey whose credential is not text'],
    [{ ...TH.wayinOf('passphrase'), vault_key_wayin_wrapped: 'nope' }, 'a wrap that is not ciphered'],
    [null,                                                            'nothing at all'],
  ] as const

  for (const [record, blurb] of MisshapenCases) {
    it(`refuses ${blurb} as the schema's own bad_record, with no cause`, () => {
      const err = TH.expectSyncRefusal(() => Wayin.make(vaultRecord, record, slice), 'bad_record')
      expect(err.cause).to.be.undefined
    })
  }

  it("names a failing field, and never a key it does not take", () => {
    const pasted = 'sk-ant-api03-' + 'x'.repeat(40)
    const err = TH.expectSyncRefusal(() => Wayin.make(vaultRecord, { ...TH.wayinOf('passphrase'), device_id: '', [pasted]: 1 }, slice), 'bad_record')
    expect(TH.thrownText(err)).to.include('device_id')
    expect(TH.thrownText(err)).to.not.include(pasted)
  })

  it("holds its record as `record`, a frozen copy, its wrap frozen with it", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(vaultRecord, record, slice)
    expect(wayin.record).to.deep.equal(record)
    expect(wayin.record).to.not.eq(record)
    expect(Object.isFrozen(wayin.record)).to.be.true
    expect(Object.isFrozen(wayin.record.vault_key_wayin_wrapped)).to.be.true
  })

  it("shows each visible field once in a key list, JSON and a log line, its vault_tok among them, and nothing else: no wrap, no passphrase's salt or key deriver, no vault", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(vaultRecord, record, slice)
    expect(Object.keys(wayin)).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_tok'])
    expect(Object.keys(TH.jsonOf(wayin))).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_tok'])
    for (const hidden of ['applabel', record.salt_b64, record.key_deriver_label, record.vault_key_wayin_wrapped.ciphertext_b64, 'salt_b64', 'vault_key_wayin_wrapped']) {
      expect(JSON.stringify(wayin)).to.not.include(hidden)
      expect(inspect(wayin)).to.not.include(hidden)
    }
    expect(inspect(wayin).match(/device_id/g)).to.have.lengthOf(1)
    const passkey = Wayin.make(vaultRecord, TH.passkeyWayinOf('laptop'), slice)
    expect(Object.keys(passkey)).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_tok', 'credential_id', 'prf_salt_b64'])
    expect(inspect(passkey)).to.not.include('vault_key_wayin_wrapped')
  })

  it("makes what each kind's own constructor makes of a record already checked", () => {
    const passphrase = new PassphraseWayin(vaultRecord, TH.wayinOf('passphrase'), slice)
    const passkey = new PasskeyWayin(vaultRecord, TH.passkeyWayinOf('laptop'), slice)
    expect(passphrase.record).to.deep.equal(Wayin.make(vaultRecord, TH.wayinOf('passphrase'), slice).record)
    expect(passkey.record).to.deep.equal(Wayin.make(vaultRecord, TH.passkeyWayinOf('laptop'), slice).record)
    expect(Object.isFrozen(passkey)).to.be.true
  })

  it("is frozen: a field, or the record, written over throws, and nothing moves", () => {
    const wayin = Wayin.make(vaultRecord, TH.wayinOf('passphrase'), slice)
    for (const field of ['device_id', 'record', 'wayinkind']) {
      expect(Reflect.set(wayin, field, null), field).to.be.false
    }
    expect(wayin.device_id).to.eq('device-one')
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("wayin.toJSON", () => {
  it("gives the kind and the device and time that sealed it, its spread, so JSON.stringify of the way in carries no salt and no wrap, as the Wayin's second example shows", async () => {
    const { world, vault, proving, passphrase: wayin } = await novelWayins()
    expect(wayin.toJSON()).to.deep.equal({ wayinkind: 'passphrase', device_id: proving.header.device_id, registered_at: world.clock.now(), vault_tok: vault.vault_tok })
    expect(wayin.toJSON()).to.deep.equal(TH.shownOf(wayin))
    for (const stored of [wayin.record.salt_b64, wayin.record.vault_key_wayin_wrapped.ciphertext_b64, 'vault_key_wayin_wrapped', 'salt_b64']) {
      expect(JSON.stringify(wayin)).to.not.include(stored)
    }
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and never its wrap", () => {
    const record = TH.passkeyWayinOf('laptop')
    const wayin = Wayin.make(vaultRecord, record, slice)
    expect(wayin.toJSON()).to.deep.equal({
      wayinkind: 'passkey', device_id: record.device_id, registered_at: record.registered_at, vault_tok: 'vault-tok-u1',
      credential_id: 'cred-laptop', prf_salt_b64: record.prf_salt_b64,
    })
    expect(JSON.stringify(wayin)).to.not.include('vault_key_wayin_wrapped')
  })
})

describe("wayin.wayinCtx", () => {
  it("is the vault record's stamp, the purpose, and the whole header, whatever else the record it was made with holds", () => {
    const record = TH.passkeyWayinOf('laptop')
    const { vault_key_wayin_wrapped: _wrapped, ...header } = record
    const { format, applabel, user_id, vaultlabel, vault_tok, registered_at } = vaultRecord
    expect(Wayin.make(vaultRecord, record, slice).wayinCtx).to.deep.equal(
      cipherCtx({ format, applabel, user_id, vaultlabel, vault_tok, registered_at }, 'vault_key_passkey_wrapped', header),
    )
  })

  it("refuses 'bad_record' at its making for a stamp missing a field, rather than binding less", () => {
    const { registered_at: _registeredAt, ...stampless } = vaultRecord
    TH.expectSyncRefusal(() => Wayin.make(stampless as never, TH.passkeyWayinOf('laptop'), slice), 'bad_record')
  })
})

describe("wayin.isDamaged", () => {
  const DamagedCases = [
    [TH.wayinOf('passphrase', { salt_b64: 'c2FsdA' as never }),   true,  'a passphrase whose salt is not the deriver\'s length'],
    [TH.wayinOf('passphrase', { salt_b64: 'not base64!' as never }), true,  'a passphrase whose salt is not base64url'],
    [TH.wayinOf('passphrase', { key_deriver_label: 'elsewhere_v1', salt_b64: 'c2FsdA' as never }), false, "a passphrase another deriver made, whose salt is not this vault's to judge"],
    [TH.wayinOf('passphrase'),                                    false, 'a passphrase stored as this package writes it'],
    [TH.passkeyWayinOf('laptop', { prf_salt_b64: 'c2FsdA' as never }), true,  'a passkey whose salt is not 32 bytes'],
    [TH.passkeyWayinOf('laptop'),                                  false, 'a passkey stored as this package writes it'],
  ] as const

  for (const [record, expected, blurb] of DamagedCases) {
    it(`says ${String(expected)} of ${blurb}`, () => {
      expect(Wayin.make(vaultRecord, record, slice).isDamaged()).to.eq(expected)
    })
  }
})
// --

// == [Sealing]: a way in as a proving seals it

describe("a passphrase's way in, as a proving seals it", () => {
  it("makes a valid passphrase's way in that names its deriver and a fresh salt", async () => {
    const { passphrase: one } = await novelWayins()
    const { passphrase: two } = await novelWayins()
    expect(one).to.be.instanceOf(PassphraseWayin)
    const record = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passphrase: one.record }) })
    expect(VaultRecord.safeParse(record).success).to.be.true
    expect(one.record).to.include({ wayinkind: 'passphrase', key_deriver_label: 'test_digest_v0' })
    expect(one.record.salt_b64).to.not.eq(two.record.salt_b64)
  })

  it("keeps nothing of the passphrase in the way in it makes", async () => {
    const { passphrase: wayin } = await novelWayins('hunter2-hunter2')
    expect(JSON.stringify(wayin.record)).to.not.include('hunter2')
    expect(Object.values(wayin.record)).to.not.include('hunter2-hunter2')
  })
})

describe("each field of a way in, as sealed (Contract: Wayin, How each field is made)", () => {
  it("makes a passphrase's salt 16 fresh random bytes, names the vault's key deriver, and stamps it with this device and the time now", async () => {
    const { world, vault, stored } = await lockedWorld()
    const wayin = await resealedPassphrase(vault, stored)
    expect(fromB64(wayin.record.salt_b64)).to.have.lengthOf(16)
    expect(wayin.record.salt_b64).to.not.eq(stored.gate.passphrase.salt_b64)
    expect(wayin.record.key_deriver_label).to.eq(TH.testDeriver.key_deriver_label)
    expect(wayin).to.include({ device_id: stored.gate.passphrase.device_id, registered_at: world.clock.now() })
    const again = await resealedPassphrase(vault, stored)
    expect(again.record.salt_b64).to.not.eq(wayin.record.salt_b64)
  })

  it("keeps a passkey's 32-byte salt and credential as the answer brings them, and no key deriver", async () => {
    const answer = await TH.passkeyOf('laptop')
    const { passkey: wayin } = await novelPasskey(answer)
    expect(fromB64(wayin.prf_salt_b64)).to.have.lengthOf(32)
    expect(wayin).to.include({ credential_id: answer.credential_id, prf_salt_b64: answer.prf_salt_b64 })
    expect(wayin.record).to.not.have.property('key_deriver_label')
  })

  it("wraps the vaultKey under the wayinKey, bound to wayinCtx: the passphraseKey unwraps it under that ctx", async () => {
    const vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating })
    const vaultKey = await makeVaultKey()
    const wrapped = await proving.wrappedWith(vaultKey, proving.header)
    const wayin = Wayin.make(vault, { ...proving.header, vault_key_wayin_wrapped: wrapped }, { keyDeriver: TH.testDeriver })
    const passphraseKey = await passphraseKeyOver(proving.header.salt_b64)
    const unwrapped = await unwrapKeyUnder(passphraseKey, wrapped, wayin.wayinCtx, { extractable: true, usage: ['wrapKey'] })
    expect(await rawOf(unwrapped)).to.eq(await rawOf(vaultKey))
  })

  it("hands back the way in alone, holding no key: the vault takes its key out of a way in as stored", async () => {
    const { passphrase } = await novelWayins()
    const { passkey } = await novelPasskey(await TH.passkeyOf('laptop'))
    for (const wayin of [passphrase, passkey]) {
      expect(Object.values(wayin).some((val) => val instanceof CryptoKey)).to.be.false
    }
  })
})

describe("a passkey's way in, as a proving seals it", () => {
  it("makes a valid passkey's way in that keeps the credential and its salt, and never the answer", async () => {
    const answer = await TH.passkeyOf('laptop')
    const prfB64 = toB64(answer.prfBytes)
    const { passkey: wayin } = await novelPasskey(answer)
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    const record = TH.vaultRecordOf('u1', { gate: TH.gateOf('u1', { passkey: wayin.record }) })
    expect(VaultRecord.safeParse(record).success).to.be.true
    expect(wayin).to.include({ wayinkind: 'passkey', credential_id: answer.credential_id, prf_salt_b64: answer.prf_salt_b64 })
    expect(JSON.stringify(wayin.record)).to.not.include(prfB64)
  })
})
// --

// == [Refusing]: what a proving refuses of a way in

describe("a proving's refusals of a way in", () => {
  it("refuses wrong_passphrase when the passphrase does not open it, quoting nothing", async () => {
    const { vault, stored } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'swordfish', { gating: OutsideGating })
    const err = await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
    expect(err.message).to.not.include('swordfish')
  })

  it("refuses wrong_passkey when the answer did not open the wrap, or was for another salt", async () => {
    const { vault, stored } = await lockedWorld({ passkey: true })
    const header = headerOf(passkeyRecordOf(stored))
    const laptop = await TH.passkeyOf('laptop')
    const notIt = await PasskeyProving.seal(vault, header, { ...laptop, prfBytes: new Uint8Array(32).fill(1) }, { gating: OutsideGating })
    await TH.expectRefusal(notIt.checkWayin(), 'wrong_passkey')
    const { prf_salt_b64: otherSalt } = await TH.passkeyOf('elsewhere')
    const overOtherSalt = await TH.passkeyOf('laptop', otherSalt)
    await TH.expectRefusal(PasskeyProving.seal(vault, header, overOtherSalt, { gating: OutsideGating }), 'wrong_passkey')
  })

  it("refuses damaged_wayin for a header in a form this package never writes, deriving nothing", async () => {
    const { vault, stored, keyDeriver } = await lockedWorld({ passkey: true })
    const derivations = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const passphrase = { ...headerOf(stored.gate.passphrase), salt_b64: 'c2FsdA' as never }
    await TH.expectRefusal(PassphraseProving.seal(vault, passphrase, 'pw', { gating: OutsideGating }), 'damaged_wayin')
    const passkey = { ...headerOf(passkeyRecordOf(stored)), prf_salt_b64: 'c2FsdA' as never }
    await TH.expectRefusal(PasskeyProving.seal(vault, passkey, await TH.passkeyOf('laptop'), { gating: OutsideGating }), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses unknown_key_deriver for a passphrase another key deriver made, deriving nothing", async () => {
    const { vault, stored, keyDeriver } = await lockedWorld()
    const derivations = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const header = { ...headerOf(stored.gate.passphrase), key_deriver_label: 'someone_elses_deriver_v9' }
    await TH.expectRefusal(PassphraseProving.seal(vault, header, 'pw', { gating: OutsideGating }), 'unknown_key_deriver')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses the other kind of proof as bad_option: a passkey's answer for a passphrase, a passphrase for a passkey", async () => {
    const { vault, stored } = await lockedWorld({ passkey: true })
    const answer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), answer as never, { gating: OutsideGating }), 'bad_option')
    const passkey = headerOf(passkeyRecordOf(stored))
    await TH.expectRefusal(PasskeyProving.seal(vault, passkey, 'pw' as never, { gating: OutsideGating }), 'bad_option')
  })

  it("refuses wrong_passkey for another credential's answer", async () => {
    const { vault, stored } = await lockedWorld({ passkey: true })
    const { prf_salt_b64: saltB64 } = passkeyRecordOf(stored)
    const phone = await TH.passkeyOf('phone', saltB64)
    const header = headerOf(passkeyRecordOf(stored))
    await TH.expectRefusal(PasskeyProving.seal(vault, header, phone, { gating: OutsideGating }), 'wrong_passkey')
  })

  it("refuses unexpected_error when the key deriver throws, keeping nothing of what it threw", async () => {
    const { vault, stored, keyDeriver } = await lockedWorld()
    const thrown = new Error('the deriver fell over')
    vi.spyOn(keyDeriver, 'deriveKeyBytes').mockRejectedValue(thrown)
    const err = await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating }), 'unexpected_error')
    expect(err.cause).to.be.undefined
  })

  it("refuses bad_option when the key deriver hands back 31 bytes, not a 256-bit key", async () => {
    const { vault, stored, keyDeriver } = await lockedWorld()
    vi.spyOn(keyDeriver, 'deriveKeyBytes').mockResolvedValue(new Uint8Array(31))
    await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating }), 'bad_option')
  })
})
// --

// == [Ctx]: what each wrap and key is bound to

/** Each of a passphrase's way in's visible fields altered: every one is in its wrap's ctx. */
const TamperCases = [
  [{ key_deriver_label: 'test_digest_v1' },      'its key_deriver_label swapped, to one the deriver then wears'],
  [{ device_id: 'device-elsewhere' },            'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) },      'its registered_at moved'],
] as const

describe("a passphrase's way in's ctx", () => {
  for (const [altered, blurb] of TamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const { world, stored } = await lockedWorld()
      const header = { ...headerOf(stored.gate.passphrase), ...altered }
      const vault = await world.open({ keyDeriver: { ...TH.testDeriver, key_deriver_label: header.key_deriver_label } })
      const proving = await PassphraseProving.seal(vault, header, 'pw', { gating: OutsideGating })
      await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
    })
  }

  it("refuses to open with its salt swapped for another way in's", async () => {
    const { vault, stored } = await lockedWorld()
    const other = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw', { gating: OutsideGating })
    const proving = await PassphraseProving.seal(vault, { ...headerOf(stored.gate.passphrase), salt_b64: other.header.salt_b64 }, 'pw', { gating: OutsideGating })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const { stored } = await lockedWorld()
    const { world: elsewhere } = await lockedWorld()
    const { vault: other } = await reopenedWith(elsewhere, { gate: { ...storedRecordOf(elsewhere).gate, passphrase: stored.gate.passphrase } })
    expect(other.vault_tok).to.not.eq(stored.vault_tok)
    const proving = await PassphraseProving.seal(other, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
    const passphraseKey = await passphraseKeyOver(stored.gate.passphrase.salt_b64)
    const { vault_key_wayin_wrapped: wrapped } = stored.gate.passphrase
    const ownCtx = wayinCtxOf(stored, headerOf(stored.gate.passphrase))
    expect(await unwrapKeyUnder(passphraseKey, wrapped, ownCtx, CheckUsage)).to.be.instanceOf(CryptoKey)
    const otherUserCtx = wayinCtxOf({ ...stored, ...TH.scopeOf('u2') }, headerOf(stored.gate.passphrase))
    await expect(unwrapKeyUnder(passphraseKey, wrapped, otherUserCtx, CheckUsage)).rejects.toThrow()
  })

  it("binds the vault record's registered_at, with the rest of its stamp: a record whose registered_at moved in storage no longer opens", async () => {
    const { world, stored: before } = await lockedWorld()
    const { vault, stored } = await reopenedWith(world, { registered_at: before.registered_at + 1 })
    expect(stored.registered_at).to.eq(before.registered_at + 1)
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
  })

  it("does not bind the gate epoch: a way in opens at any epoch of its vault", async () => {
    const { world } = await lockedWorld()
    const { vault, stored } = await reopenedWith(world, { gate_epoch: 7 })
    expect(stored.gate_epoch).to.eq(7)
    const proving = await PassphraseProving.seal(vault, headerOf(stored.gate.passphrase), 'pw', { gating: OutsideGating })
    await proving.checkWayin()
  })
})

const PasskeyTamperCases = [
  [{ credential_id: 'Y3JlZC1vdGhlcg' },    'its credential_id swapped, the answer kept'],
  [{ device_id: 'device-elsewhere' },      'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) }, 'its registered_at moved'],
] as const

/** Unwrap `wayin` under the key HKDF makes of `prfBytes` with `info`, its wrap bound to `ctx`. */
const unwrapsUnder = async (wayin: PasskeyWayinRecord, prfBytes: Uint8Array, info: Uint8Array, ctx: Uint8Array) => {
  const passkeyKey = await deriveWrappingKey(prfBytes, info)
  return await unwrapKeyUnder(passkeyKey, wayin.vault_key_wayin_wrapped, ctx, CheckUsage)
}

describe("a passkey's way in's ctx", () => {
  for (const [altered, blurb] of PasskeyTamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const { vault, stored } = await lockedWorld({ passkey: true })
      const header = { ...headerOf(passkeyRecordOf(stored)), ...altered }
      const answering = { ...await TH.passkeyOf('laptop'), credential_id: header.credential_id }
      const proving = await PasskeyProving.seal(vault, header, answering, { gating: OutsideGating })
      await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const { vault, stored } = await lockedWorld({ passkey: true })
    const laptop = await TH.passkeyOf('laptop')
    const { prf_salt_b64: otherSalt } = await TH.passkeyOf('elsewhere')
    const header = { ...headerOf(passkeyRecordOf(stored)), prf_salt_b64: prf_salt_b64.parse(otherSalt) }
    const proving = await PasskeyProving.seal(vault, header, { ...laptop, prf_salt_b64: otherSalt }, { gating: OutsideGating })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const { stored } = await lockedWorld({ passkey: true })
    const record = passkeyRecordOf(stored)
    const { world: elsewhere } = await lockedWorld()
    const { vault: other } = await reopenedWith(elsewhere, { gate: { ...storedRecordOf(elsewhere).gate, passkey: record } })
    const proving = await PasskeyProving.seal(other, headerOf(record), await TH.passkeyOf('laptop'), { gating: OutsideGating })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
    const { prfBytes } = await TH.passkeyOf('laptop')
    const ownCtx = wayinCtxOf(stored, headerOf(record))
    expect(await unwrapsUnder(record, prfBytes, ownCtx, ownCtx)).to.be.instanceOf(CryptoKey)
    const otherUserCtx = wayinCtxOf({ ...stored, ...TH.scopeOf('u2') }, headerOf(record))
    await expect(unwrapsUnder(record, prfBytes, otherUserCtx, otherUserCtx)).rejects.toThrow()
  })

  it("binds the vault record's registered_at, with the rest of its stamp: a record whose registered_at moved in storage no longer opens", async () => {
    const { world, stored: before } = await lockedWorld({ passkey: true })
    const { vault, stored } = await reopenedWith(world, { registered_at: before.registered_at + 1 })
    expect(stored.registered_at).to.eq(before.registered_at + 1)
    const header = headerOf(passkeyRecordOf(stored))
    const proving = await PasskeyProving.seal(vault, header, await TH.passkeyOf('laptop'), { gating: OutsideGating })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
  })
})

describe("a passkey's way in's key", () => {
  it("is HKDF over the answer with the wrap's whole ctx as its info: the vault record's stamp, the purpose and the header", async () => {
    const { stored } = await lockedWorld({ passkey: true })
    const wayin = passkeyRecordOf(stored)
    const laptop = await TH.passkeyOf('laptop')
    const { format, applabel, user_id, vaultlabel, vault_tok, registered_at } = stored
    const ctx = cipherCtx({ format, applabel, user_id, vaultlabel, vault_tok, registered_at }, 'vault_key_passkey_wrapped', headerOf(wayin))
    expect(await unwrapsUnder(wayin, laptop.prfBytes, ctx, ctx)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const { stored } = await lockedWorld({ passkey: true })
    const wayin = passkeyRecordOf(stored)
    const laptop = await TH.passkeyOf('laptop')
    const ctx = wayinCtxOf(stored, headerOf(wayin))
    const vaultlessInfo = cipherCtx({ format: stored.format }, 'vault_key_passkey_wrapped', { credential_id: laptop.credential_id })
    await expect(unwrapsUnder(wayin, laptop.prfBytes, vaultlessInfo, ctx)).rejects.toThrow()
  })
})
// --

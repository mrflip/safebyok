import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { cipherCtx, deriveWrappingKey, fromB64, makeVaultKey, toB64, unwrapKeyUnder } from '../src/crypto'
import type { KeyDeriver } from '../src/key-deriver'
import { PasskeyProving, PassphraseProving, headerOf, passphraseKeyOf } from '../src/proving'
import { GatedVaultProps, VaultProps, type PasskeyAnswer, type PasskeyWayinRecord } from '../src/types'
import type { Vault } from '../src/vault'
import { PasskeyWayin, PassphraseWayin, Wayin, wayinCtxOf } from '../src/wayin'
import * as TH from './test-helpers'
import { addLaptopPasskey, makeWorld, storedVaultPropsOf, u1VaultPropsCkey } from './vault/world'

/** The slice of a vault every record-only way in here is made under: `u1`'s `main` vault, deriving with the test deriver. */
const slice: TH.VaultSlice = TH.vaultSliceOf('u1', TH.testDeriver, { now: () => Date.UTC(2026, 9, 15) })
/** The token of the vault props every record-only way in here is made for. */
const { vault_tok: vaultTok } = TH.vaultPropsOf('u1')

/** The vaultKey's usage when it is unwrapped only to see that it opens. */
const CheckUsage = { extractable: false, usage: ['wrapKey'] } as const

/** The gated vault props `world` stores now. */
const propsOf = (world: ReturnType<typeof makeWorld>): GatedVaultProps => GatedVaultProps.parse(storedVaultPropsOf(world))

/** The passkey way in `props` hold: the test's vault was given one. */
const passkeyRecordOf = (props: GatedVaultProps): PasskeyWayinRecord => {
  if (props.passkey === null) { throw new Error("these vault props hold no passkey") }
  return props.passkey
}

/**
 * A world holding `u1`'s vault with the passphrase `pw` and, with `opts.passkey`, the passkey
 * `laptop`, locked; its stored props; and its key deriver, its own copy of testDeriver, so a spy
 * on it stays here.
 */
const lockedWorld = async (opts: { passkey?: boolean } = {}) => {
  const keyDeriver: KeyDeriver = { ...TH.testDeriver }
  const world = makeWorld({ keyDeriver })
  const vault = await world.openUnlocked('pw')
  if (opts.passkey === true) { await addLaptopPasskey(vault) }
  await vault.lock()
  return { world, vault, keyDeriver, props: propsOf(world) }
}

/** `world`'s stored vault props with `changes` written over them, a Vault object opened on them afresh, and the props as stored. */
const reopenedWith = async (world: ReturnType<typeof makeWorld>, changes: Record<string, unknown>) => {
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), ...changes }))
  const vault = await world.open()
  return { vault, props: propsOf(world) }
}

/** A novel vault's first way ins, sealed by fresh provings of `passphrase` and, when given, `answer`: the vault, the passphrase's proving, and the way ins. */
const novelWayins = async (passphrase = 'pw', answer?: PasskeyAnswer) => {
  const vault = await makeWorld().open()
  const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, passphrase)
  const passkeyProving = answer === undefined ? undefined : await PasskeyProving.seal(vault, { slotlabel: 'passkey' }, answer)
  const wayins = await proving.sealWayins(passkeyProving)
  return { vault, proving, ...wayins }
}

/** A novel vault's passkey way in, sealed for the passkey that answered `answer`, and the vault. */
const novelPasskey = async (answer: PasskeyAnswer): Promise<{ vault: Vault, passkey: PasskeyWayin }> => {
  const { vault, passkey } = await novelWayins('pw', answer)
  if (passkey === null) { throw new Error("sealWayins made no passkey way in") }
  return { vault, passkey }
}

/** The passphrase way in a proving of `pw` reseals in `vault`, whose stored props are `props`, for a fresh proving of `next`: a fresh header, minted. */
const resealedPassphrase = async (vault: Vault, props: GatedVaultProps): Promise<PassphraseWayin> => {
  const current = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
  const fresh = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'next')
  const wayin = await current.resealWayinFor(fresh)
  if (! (wayin instanceof PassphraseWayin)) { throw new TypeError("a passphrase's reseal made another kind of way in") }
  return wayin
}

/** The passphraseKey the test deriver makes of `pw` over `saltB64`: the key a proving of `pw` over that salt holds. */
const passphraseKeyOver = async (saltB64: string): Promise<CryptoKey> => (
  await passphraseKeyOf(TH.testDeriver, 'pw', fromB64(saltB64))
)

/** The vaultKey's raw bytes, to compare two handles on it. */
const rawOf = async (vaultKey: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)))

// == [Making]: make, props, toJSON, summary, wayinCtx

describe("Wayin.make", () => {
  it("makes a PassphraseWayin of a passphrase's record, as its first example shows", () => {
    const wayin = Wayin.make(slice, vaultTok, TH.wayinOf('passphrase'))
    expect(wayin).to.be.instanceOf(PassphraseWayin)
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.wayinkind).to.eq('passphrase')
  })

  it("makes the vault props' passphrase a PassphraseWayin, bound to those props, as the Wayin's first example shows", async () => {
    const { vault, props } = await lockedWorld()
    const passphrase = Wayin.make(vault, props.vault_tok, props.passphrase)
    expect(passphrase.wayinkind).to.eq('passphrase')
    const passphraseKey = await passphraseKeyOver(props.passphrase.salt_b64)
    const { vault_key_wayin_wrapped: wrapped } = passphrase.record
    expect(await unwrapKeyUnder(passphraseKey, wrapped, passphrase.wayinCtx, CheckUsage)).to.be.instanceOf(CryptoKey)
  })

  it("makes a PasskeyWayin of a passkey's record, told apart by its wayinkind", () => {
    const wayin = Wayin.make(slice, vaultTok, TH.passkeyWayinOf('laptop'))
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    expect(wayin.wayinkind).to.eq('passkey')
  })

  it("gives each visible field as a field of its own, read from the record: its kind, device and time, and a passkey's credential and salt, and the vault_tok it was made under", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, vaultTok, record)
    expect(TH.shownOf(wayin)).to.deep.equal({ wayinkind: 'passphrase', device_id: record.device_id, registered_at: record.registered_at, vault_tok: 'vault-tok-u1' })
    const passkeyRecord = TH.passkeyWayinOf('laptop')
    const passkey = Wayin.make(slice, vaultTok, passkeyRecord)
    expect(TH.shownOf(passkey)).to.deep.equal({
      wayinkind: 'passkey', device_id: passkeyRecord.device_id, registered_at: passkeyRecord.registered_at, vault_tok: 'vault-tok-u1',
      credential_id: passkeyRecord.credential_id, prf_salt_b64: passkeyRecord.prf_salt_b64,
    })
  })

  it("refuses a record this package never writes as damaged_wayin, as its second example shows", () => {
    TH.expectSyncRefusal(() => Wayin.make(slice, vaultTok, { ...TH.wayinOf('passphrase'), device_id: '' }), 'damaged_wayin')
  })

  const MisshapenCases = [
    [{ ...TH.wayinOf('passphrase'), wayinkind: 'fingerprint' },       'a wayinkind this package does not know'],
    [{ ...TH.wayinOf('passphrase'), salt_b64: undefined },            'a passphrase with no salt'],
    [{ ...TH.passkeyWayinOf('laptop'), credential_id: 7 },             'a passkey whose credential is not text'],
    [{ ...TH.wayinOf('passphrase'), vault_key_wayin_wrapped: 'nope' }, 'a wrap that is not ciphered'],
    [null,                                                            'nothing at all'],
  ] as const

  for (const [record, blurb] of MisshapenCases) {
    it(`refuses ${blurb} as damaged_wayin, the schema's complaint its cause`, () => {
      const err = TH.expectSyncRefusal(() => Wayin.make(slice, vaultTok, record), 'damaged_wayin')
      expect(err.cause).to.be.instanceOf(Error)
    })
  }

  it("holds its record as `record`, a frozen copy, its wrap frozen with it", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, vaultTok, record)
    expect(wayin.record).to.deep.equal(record)
    expect(wayin.record).to.not.eq(record)
    expect(Object.isFrozen(wayin.record)).to.be.true
    expect(Object.isFrozen(wayin.record.vault_key_wayin_wrapped)).to.be.true
  })

  it("shows each visible field once in a key list, JSON and a log line, its vault_tok among them, and nothing else: no wrap, no passphrase's salt or key deriver, no vault", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, vaultTok, record)
    expect(Object.keys(wayin)).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_tok'])
    expect(Object.keys(TH.jsonOf(wayin))).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_tok'])
    for (const hidden of ['applabel', record.salt_b64, record.key_deriver_label, record.vault_key_wayin_wrapped.ciphertext_b64, 'salt_b64', 'vault_key_wayin_wrapped']) {
      expect(JSON.stringify(wayin)).to.not.include(hidden)
      expect(inspect(wayin)).to.not.include(hidden)
    }
    expect(inspect(wayin).match(/device_id/g)).to.have.lengthOf(1)
    const passkey = Wayin.make(slice, vaultTok, TH.passkeyWayinOf('laptop'))
    expect(Object.keys(passkey)).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_tok', 'credential_id', 'prf_salt_b64'])
    expect(inspect(passkey)).to.not.include('vault_key_wayin_wrapped')
  })

  it("makes what each kind's own constructor makes of a record already checked", () => {
    const passphrase = new PassphraseWayin(slice, vaultTok, TH.wayinOf('passphrase'))
    const passkey = new PasskeyWayin(slice, vaultTok, TH.passkeyWayinOf('laptop'))
    expect(passphrase.record).to.deep.equal(Wayin.make(slice, vaultTok, TH.wayinOf('passphrase')).record)
    expect(passkey.record).to.deep.equal(Wayin.make(slice, vaultTok, TH.passkeyWayinOf('laptop')).record)
    expect(Object.isFrozen(passkey)).to.be.true
  })

  it("is frozen: a field, or the record, written over throws, and nothing moves", () => {
    const wayin = Wayin.make(slice, vaultTok, TH.wayinOf('passphrase'))
    for (const field of ['device_id', 'record', 'wayinkind']) {
      expect(Reflect.set(wayin, field, null), field).to.be.false
    }
    expect(wayin.device_id).to.eq('device-one')
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("wayin.toJSON", () => {
  it("gives the kind and the device and time that sealed it, its spread, so JSON.stringify of the way in carries no salt and no wrap, as the Wayin's second example shows", async () => {
    const { vault, proving, passphrase: wayin } = await novelWayins()
    expect(wayin.toJSON()).to.deep.equal({ wayinkind: 'passphrase', device_id: proving.header.device_id, registered_at: vault.now(), vault_tok: vault.vault_tok })
    expect(wayin.toJSON()).to.deep.equal(TH.shownOf(wayin))
    for (const stored of [wayin.record.salt_b64, wayin.record.vault_key_wayin_wrapped.ciphertext_b64, 'vault_key_wayin_wrapped', 'salt_b64']) {
      expect(JSON.stringify(wayin)).to.not.include(stored)
    }
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and never its wrap", () => {
    const record = TH.passkeyWayinOf('laptop')
    const wayin = Wayin.make(slice, vaultTok, record)
    expect(wayin.toJSON()).to.deep.equal({
      wayinkind: 'passkey', device_id: record.device_id, registered_at: record.registered_at, vault_tok: 'vault-tok-u1',
      credential_id: 'cred-laptop', prf_salt_b64: record.prf_salt_b64,
    })
    expect(JSON.stringify(wayin)).to.not.include('vault_key_wayin_wrapped')
  })
})

describe("wayin.wayinCtx", () => {
  it("is the vault props' scope and vault_tok, the purpose, and the whole header", () => {
    const record = TH.passkeyWayinOf('laptop')
    const { vault_key_wayin_wrapped: _wrapped, ...header } = record
    expect(Wayin.make(slice, vaultTok, record).wayinCtx).to.deep.equal(
      cipherCtx('safebyok-vault-v6', 'acme', 'u1', 'main', 'vault-tok-u1', 'vault_key_passkey_wrapped', header),
    )
  })
})

describe("wayin.isDamaged", () => {
  const DamagedCases = [
    [TH.wayinOf('passphrase', { salt_b64: 'c2FsdA' }),            true,  'a passphrase whose salt is not the deriver\'s length'],
    [TH.wayinOf('passphrase', { salt_b64: 'not base64!' }),       true,  'a passphrase whose salt is not base64url'],
    [TH.wayinOf('passphrase', { key_deriver_label: 'elsewhere_v1', salt_b64: 'c2FsdA' }), false, "a passphrase another deriver made, whose salt is not this vault's to judge"],
    [TH.wayinOf('passphrase'),                                    false, 'a passphrase stored as this package writes it'],
    [TH.passkeyWayinOf('laptop', { prf_salt_b64: 'c2FsdA' }),      true,  'a passkey whose salt is not 32 bytes'],
    [TH.passkeyWayinOf('laptop'),                                  false, 'a passkey stored as this package writes it'],
  ] as const

  for (const [record, expected, blurb] of DamagedCases) {
    it(`says ${String(expected)} of ${blurb}`, () => {
      expect(Wayin.make(slice, vaultTok, record).isDamaged()).to.eq(expected)
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
    expect(VaultProps.safeParse(TH.vaultPropsOf('u1', { passphrase: one.record })).success).to.be.true
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
    const { vault, props } = await lockedWorld()
    const wayin = await resealedPassphrase(vault, props)
    expect(fromB64(wayin.record.salt_b64)).to.have.lengthOf(16)
    expect(wayin.record.salt_b64).to.not.eq(props.passphrase.salt_b64)
    expect(wayin.record.key_deriver_label).to.eq(TH.testDeriver.key_deriver_label)
    expect(wayin).to.include({ device_id: props.passphrase.device_id, registered_at: vault.now() })
    const again = await resealedPassphrase(vault, props)
    expect(again.record.salt_b64).to.not.eq(wayin.record.salt_b64)
  })

  it("keeps a passkey's 32-byte salt and credential as the answer brings them, and no key deriver", async () => {
    const answer = await TH.passkeyOf('laptop')
    const { passkey: wayin } = await novelPasskey(answer)
    expect(fromB64(wayin.prf_salt_b64)).to.have.lengthOf(32)
    expect(wayin).to.include({ credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64 })
    expect(wayin.record).to.not.have.property('key_deriver_label')
  })

  it("wraps the vaultKey under the wayinKey, bound to wayinCtx: the passphraseKey unwraps it under that ctx", async () => {
    const vault = await makeWorld().open()
    const proving = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw')
    const vaultKey = await makeVaultKey()
    const wrapped = await proving.wrappedWith(vaultKey, proving.header)
    const wayin = Wayin.make(vault, vault.vault_tok, { ...proving.header, vault_key_wayin_wrapped: wrapped })
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
    expect(VaultProps.safeParse(TH.vaultPropsOf('u1', { passkey: wayin.record })).success).to.be.true
    expect(wayin).to.include({ wayinkind: 'passkey', credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64 })
    expect(JSON.stringify(wayin.record)).to.not.include(prfB64)
  })
})
// --

// == [Refusing]: what a proving refuses of a way in

describe("a proving's refusals of a way in", () => {
  it("refuses wrong_passphrase when the passphrase does not open it, quoting nothing", async () => {
    const { vault, props } = await lockedWorld()
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'swordfish')
    const err = await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
    expect(err.message).to.not.include('swordfish')
  })

  it("refuses wrong_passkey when the answer did not open the wrap, or was for another salt", async () => {
    const { vault, props } = await lockedWorld({ passkey: true })
    const header = headerOf(passkeyRecordOf(props))
    const laptop = await TH.passkeyOf('laptop')
    const notIt = await PasskeyProving.seal(vault, header, { ...laptop, prfBytes: new Uint8Array(32).fill(1) })
    await TH.expectRefusal(notIt.checkWayin(), 'wrong_passkey')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const overOtherSalt = await TH.passkeyOf('laptop', otherSalt)
    await TH.expectRefusal(PasskeyProving.seal(vault, header, overOtherSalt), 'wrong_passkey')
  })

  it("refuses damaged_wayin for a header in a form this package never writes, deriving nothing", async () => {
    const { vault, props, keyDeriver } = await lockedWorld({ passkey: true })
    const derivations = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const passphrase = { ...headerOf(props.passphrase), salt_b64: 'c2FsdA' }
    await TH.expectRefusal(PassphraseProving.seal(vault, passphrase, 'pw'), 'damaged_wayin')
    const passkey = { ...headerOf(passkeyRecordOf(props)), prf_salt_b64: 'c2FsdA' }
    await TH.expectRefusal(PasskeyProving.seal(vault, passkey, await TH.passkeyOf('laptop')), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses unknown_key_deriver for a passphrase another key deriver made, deriving nothing", async () => {
    const { vault, props, keyDeriver } = await lockedWorld()
    const derivations = vi.spyOn(keyDeriver, 'deriveKeyBytes')
    const header = { ...headerOf(props.passphrase), key_deriver_label: 'someone_elses_deriver_v9' }
    await TH.expectRefusal(PassphraseProving.seal(vault, header, 'pw'), 'unknown_key_deriver')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses the other kind of proof as bad_option: a passkey's answer for a passphrase, a passphrase for a passkey", async () => {
    const { vault, props } = await lockedWorld({ passkey: true })
    const answer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(props.passphrase), answer as never), 'bad_option')
    const passkey = headerOf(passkeyRecordOf(props))
    await TH.expectRefusal(PasskeyProving.seal(vault, passkey, 'pw' as never), 'bad_option')
  })

  it("refuses wrong_passkey for another credential's answer", async () => {
    const { vault, props } = await lockedWorld({ passkey: true })
    const { prf_salt_b64: saltB64 } = passkeyRecordOf(props)
    const phone = await TH.passkeyOf('phone', saltB64)
    const header = headerOf(passkeyRecordOf(props))
    await TH.expectRefusal(PasskeyProving.seal(vault, header, phone), 'wrong_passkey')
  })

  it("refuses unexpected_error when the key deriver throws, what it threw the cause", async () => {
    const { vault, props, keyDeriver } = await lockedWorld()
    const thrown = new Error('the deriver fell over')
    vi.spyOn(keyDeriver, 'deriveKeyBytes').mockRejectedValue(thrown)
    const err = await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw'), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
  })

  it("passes a key deriver's own refusal through as it came", async () => {
    const { vault, props, keyDeriver } = await lockedWorld()
    vi.spyOn(keyDeriver, 'deriveKeyBytes').mockResolvedValue(new Uint8Array(31))
    await TH.expectRefusal(PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw'), 'bad_option')
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
      const { world, props } = await lockedWorld()
      const header = { ...headerOf(props.passphrase), ...altered }
      const vault = await world.open({ keyDeriver: { ...TH.testDeriver, key_deriver_label: header.key_deriver_label } })
      const proving = await PassphraseProving.seal(vault, header, 'pw')
      await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
    })
  }

  it("refuses to open with its salt swapped for another way in's", async () => {
    const { vault, props } = await lockedWorld()
    const other = await PassphraseProving.seal(vault, { slotlabel: 'passphrase' }, 'pw')
    const proving = await PassphraseProving.seal(vault, { ...headerOf(props.passphrase), salt_b64: other.header.salt_b64 }, 'pw')
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const { props } = await lockedWorld()
    const { world: elsewhere } = await lockedWorld()
    const { vault: other } = await reopenedWith(elsewhere, { passphrase: props.passphrase })
    expect(other.vault_tok).to.not.eq(props.vault_tok)
    const proving = await PassphraseProving.seal(other, headerOf(props.passphrase), 'pw')
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passphrase')
    const passphraseKey = await passphraseKeyOver(props.passphrase.salt_b64)
    const { vault_key_wayin_wrapped: wrapped } = props.passphrase
    const ownCtx = wayinCtxOf(TH.scopeOf('u1'), props.vault_tok, headerOf(props.passphrase))
    expect(await unwrapKeyUnder(passphraseKey, wrapped, ownCtx, CheckUsage)).to.be.instanceOf(CryptoKey)
    const otherUserCtx = wayinCtxOf(TH.scopeOf('u2'), props.vault_tok, headerOf(props.passphrase))
    await expect(unwrapKeyUnder(passphraseKey, wrapped, otherUserCtx, CheckUsage)).rejects.toThrow()
  })

  it("does not bind the vault props' registered_at: their vault_tok, random and never reused, names them alone", async () => {
    const { world, props: before } = await lockedWorld()
    const { vault, props } = await reopenedWith(world, { registered_at: before.registered_at + 1 })
    expect(props.registered_at).to.eq(before.registered_at + 1)
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
    await proving.checkWayin()
  })

  it("does not bind the gate epoch: a way in opens at any epoch of its vault", async () => {
    const { world } = await lockedWorld()
    const { vault, props } = await reopenedWith(world, { gate_epoch: 7 })
    expect(props.gate_epoch).to.eq(7)
    const proving = await PassphraseProving.seal(vault, headerOf(props.passphrase), 'pw')
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
      const { vault, props } = await lockedWorld({ passkey: true })
      const header = { ...headerOf(passkeyRecordOf(props)), ...altered }
      const answering = { ...await TH.passkeyOf('laptop'), credentialId: header.credential_id }
      const proving = await PasskeyProving.seal(vault, header, answering)
      await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const { vault, props } = await lockedWorld({ passkey: true })
    const laptop = await TH.passkeyOf('laptop')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const header = { ...headerOf(passkeyRecordOf(props)), prf_salt_b64: otherSalt }
    const proving = await PasskeyProving.seal(vault, header, { ...laptop, prfSaltB64: otherSalt })
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const { props } = await lockedWorld({ passkey: true })
    const record = passkeyRecordOf(props)
    const { world: elsewhere } = await lockedWorld()
    const { vault: other } = await reopenedWith(elsewhere, { passkey: record })
    const proving = await PasskeyProving.seal(other, headerOf(record), await TH.passkeyOf('laptop'))
    await TH.expectRefusal(proving.checkWayin(), 'wrong_passkey')
    const { prfBytes } = await TH.passkeyOf('laptop')
    const ownCtx = wayinCtxOf(TH.scopeOf('u1'), props.vault_tok, headerOf(record))
    expect(await unwrapsUnder(record, prfBytes, ownCtx, ownCtx)).to.be.instanceOf(CryptoKey)
    const otherUserCtx = wayinCtxOf(TH.scopeOf('u2'), props.vault_tok, headerOf(record))
    await expect(unwrapsUnder(record, prfBytes, otherUserCtx, otherUserCtx)).rejects.toThrow()
  })

  it("does not bind the vault props' registered_at: their vault_tok, random and never reused, names them alone", async () => {
    const { world, props: before } = await lockedWorld({ passkey: true })
    const { vault, props } = await reopenedWith(world, { registered_at: before.registered_at + 1 })
    expect(props.registered_at).to.eq(before.registered_at + 1)
    const header = headerOf(passkeyRecordOf(props))
    const proving = await PasskeyProving.seal(vault, header, await TH.passkeyOf('laptop'))
    await proving.checkWayin()
  })
})

describe("a passkey's way in's key", () => {
  it("is HKDF over the answer with the wrap's whole ctx as its info: scope, vault_tok, registered_at, purpose and header", async () => {
    const { props } = await lockedWorld({ passkey: true })
    const wayin = passkeyRecordOf(props)
    const laptop = await TH.passkeyOf('laptop')
    const ctx = cipherCtx('safebyok-vault-v6', 'acme', 'u1', 'main', props.vault_tok, 'vault_key_passkey_wrapped', headerOf(wayin))
    expect(await unwrapsUnder(wayin, laptop.prfBytes, ctx, ctx)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const { props } = await lockedWorld({ passkey: true })
    const wayin = passkeyRecordOf(props)
    const laptop = await TH.passkeyOf('laptop')
    const ctx = cipherCtx('safebyok-vault-v6', 'acme', 'u1', 'main', props.vault_tok, 'vault_key_passkey_wrapped', headerOf(wayin))
    const vaultlessInfo = cipherCtx('safebyok-vault-v6', 'vault_key_passkey_wrapped', laptop.credentialId)
    await expect(unwrapsUnder(wayin, laptop.prfBytes, vaultlessInfo, ctx)).rejects.toThrow()
  })
})
// --

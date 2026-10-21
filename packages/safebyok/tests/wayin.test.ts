import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import { cipherCtx, deriveWrappingKey, fromB64, makeVaultKey, toB64, unwrapKeyUnder } from '../src/crypto'
import type { KeyDeriver } from '../src/key-deriver'
import { valOf } from '../src/outcome'
import { PasskeyProof, PassphraseProof, Proof } from '../src/proof'
import { VaultProps, type PasskeyAnswer, type PasskeyWayinRecord, type PassphraseWayinRecord, type VaultScope } from '../src/types'
import { PasskeyWayin, PassphraseWayin, Wayin, type WayinStamp } from '../src/wayin'
import * as TH from './test-helpers'

const scope = TH.scopeOf('u1')
/** When every way in here is sealed: it is stamped with it. */
const SealedAt = Date.UTC(2026, 9, 15)
/** The slice of a vault every proof here is parsed under: `u1`'s `main` vault, deriving with the test deriver. */
const slice: TH.VaultSlice = TH.vaultSliceOf('u1', TH.testDeriver, { now: () => SealedAt })
/** The id of the vault props every way in here is sealed for: with their scope, what a wrap binds of them. */
const { vault_id: vaultId } = TH.vaultPropsOf('u1')

/** The slice of a vault deriving with `keyDeriver`. */
const sliceOf = (keyDeriver: KeyDeriver = TH.testDeriver): TH.VaultSlice => ({ ...slice, keyDeriver })

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** What a way in here is stamped with: the device that sealed it and when. */
const stamp: WayinStamp = {
  device_id:       'device-one',
  registered_at:   SealedAt,
}

/** A real passphrase's way in around `vaultKey`: its record. */
const sealed = async (passphrase: string, vaultKey: CryptoKey): Promise<PassphraseWayinRecord> => {
  const wayin = await Wayin.seal(slice, vaultId, PassphraseProof.parse(slice, passphrase), 'device-one', vaultKey)
  return wayin.record
}

/** A real passkey's way in around `vaultKey`, for the passkey that answered `answer`: its record. */
const sealedPasskey = async (answer: PasskeyAnswer, vaultKey: CryptoKey): Promise<PasskeyWayinRecord> => {
  const wayin = await Wayin.seal(slice, vaultId, PasskeyProof.parse(slice, answer), 'device-one', vaultKey)
  return wayin.record
}

/** Vault props of `passphrase` and `passkey`, validated as storage would read them back. */
const vaultPropsWith = (passphrase: PassphraseWayinRecord, passkey: PasskeyWayinRecord | null = null): VaultProps => (
  VaultProps.parse(TH.vaultPropsOf('u1', { passphrase, passkey }))
)

/**
 * The vaultKey out of `vaultProps`' way in of `given`'s kind, as the vault picks it, its refusal
 * thrown: the way in made for `opts.scope`'s vault, deriving with `opts.keyDeriver`.
 */
const openIn = async (vaultProps: VaultProps, given: string | PasskeyAnswer, opts: { keyDeriver?: KeyDeriver, scope?: VaultScope } = {}) => {
  const opening = sliceOf(opts.keyDeriver)
  const proof = Proof.parse(opening, given)
  const record = proof.kind === 'passphrase' ? vaultProps.passphrase : vaultProps.passkey
  if (record === null) { throw new Error('these vault props hold no passkey') }
  return valOf(await Wayin.make({ ...opening, ...(opts.scope ?? scope) }, vaultProps.vault_id, record).tryOpen(proof))
}

/** The vaultKey's raw bytes, to compare two handles on it. */
const rawOf = async (vaultKey: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)))

// == [Making]: make, props, toJSON, summary, wayinCtx

describe("Wayin.make", () => {
  it("makes a PassphraseWayin of a passphrase's record, as its first example shows", () => {
    const wayin = Wayin.make(slice, vaultId, TH.wayinOf('passphrase'))
    expect(wayin).to.be.instanceOf(PassphraseWayin)
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.wayinkind).to.eq('passphrase')
  })

  it("makes the vault props' passphrase a PassphraseWayin, bound to those props, as the Wayin's first example shows", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith(await sealed('pw', vaultKey))
    const passphrase = Wayin.make(slice, vaultProps.vault_id, vaultProps.passphrase)
    expect(passphrase.wayinkind).to.eq('passphrase')
    await TH.expectGood(passphrase.tryOpen(PassphraseProof.parse(slice, 'pw')))
  })

  it("makes a PasskeyWayin of a passkey's record, told apart by its wayinkind", () => {
    const wayin = Wayin.make(slice, vaultId, TH.passkeyWayinOf('laptop'))
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    expect(wayin.wayinkind).to.eq('passkey')
  })

  it("gives each visible field as a field of its own, read from the record: its kind, device and time, and a passkey's credential and salt, and the vault_id it was made under", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, vaultId, record)
    expect(TH.shownOf(wayin)).to.deep.equal({ wayinkind: 'passphrase', device_id: record.device_id, registered_at: record.registered_at, vault_id: 'vault-id-u1' })
    const passkeyRecord = TH.passkeyWayinOf('laptop')
    const passkey = Wayin.make(slice, vaultId, passkeyRecord)
    expect(TH.shownOf(passkey)).to.deep.equal({
      wayinkind: 'passkey', device_id: passkeyRecord.device_id, registered_at: passkeyRecord.registered_at, vault_id: 'vault-id-u1',
      credential_id: passkeyRecord.credential_id, prf_salt_b64: passkeyRecord.prf_salt_b64,
    })
  })

  it("refuses a record this package never writes as damaged_wayin, as its second example shows", () => {
    TH.expectSyncRefusal(() => Wayin.make(slice, vaultId, { ...TH.wayinOf('passphrase'), device_id: '' }), 'damaged_wayin')
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
      const err = TH.expectSyncRefusal(() => Wayin.make(slice, vaultId, record), 'damaged_wayin')
      expect(err.cause).to.be.instanceOf(Error)
    })
  }

  it("holds its record as `record`, a frozen copy, its wrap frozen with it", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, vaultId, record)
    expect(wayin.record).to.deep.equal(record)
    expect(wayin.record).to.not.eq(record)
    expect(Object.isFrozen(wayin.record)).to.be.true
    expect(Object.isFrozen(wayin.record.vault_key_wayin_wrapped)).to.be.true
  })

  it("shows each visible field once in a key list, JSON and a log line, its vault_id among them, and nothing else: no wrap, no passphrase's salt or key deriver, no vault", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, vaultId, record)
    expect(Object.keys(wayin)).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_id'])
    expect(Object.keys(TH.jsonOf(wayin))).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_id'])
    for (const hidden of ['applabel', record.salt_b64, record.key_deriver_label, record.vault_key_wayin_wrapped.ciphertext_b64, 'salt_b64', 'vault_key_wayin_wrapped']) {
      expect(JSON.stringify(wayin)).to.not.include(hidden)
      expect(inspect(wayin)).to.not.include(hidden)
    }
    expect(inspect(wayin).match(/device_id/g)).to.have.lengthOf(1)
    const passkey = Wayin.make(slice, vaultId, TH.passkeyWayinOf('laptop'))
    expect(Object.keys(passkey)).to.deep.equal(['wayinkind', 'device_id', 'registered_at', 'vault_id', 'credential_id', 'prf_salt_b64'])
    expect(inspect(passkey)).to.not.include('vault_key_wayin_wrapped')
  })

  it("makes what each kind's own constructor makes of a record already checked", () => {
    const passphrase = new PassphraseWayin(slice, vaultId, TH.wayinOf('passphrase'))
    const passkey = new PasskeyWayin(slice, vaultId, TH.passkeyWayinOf('laptop'))
    expect(passphrase.record).to.deep.equal(Wayin.make(slice, vaultId, TH.wayinOf('passphrase')).record)
    expect(passkey.record).to.deep.equal(Wayin.make(slice, vaultId, TH.passkeyWayinOf('laptop')).record)
    expect(Object.isFrozen(passkey)).to.be.true
  })

  it("is frozen: a field, or the record, written over throws, and nothing moves", () => {
    const wayin = Wayin.make(slice, vaultId, TH.wayinOf('passphrase'))
    for (const field of ['device_id', 'record', 'wayinkind']) {
      expect(Reflect.set(wayin, field, null), field).to.be.false
    }
    expect(wayin.device_id).to.eq('device-one')
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("wayin.toJSON", () => {
  it("gives the kind and the device and time that sealed it, its spread, so JSON.stringify of the way in carries no salt and no wrap, as the Wayin's second example shows", async () => {
    const wayin = Wayin.make(slice, vaultId, await sealed('pw', await makeVaultKey()))
    expect(wayin.toJSON()).to.deep.equal({ wayinkind: 'passphrase', device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15), vault_id: 'vault-id-u1' })
    expect(wayin.toJSON()).to.deep.equal(TH.shownOf(wayin))
    for (const stored of [wayin.record.salt_b64, wayin.record.vault_key_wayin_wrapped.ciphertext_b64, 'vault_key_wayin_wrapped', 'salt_b64']) {
      expect(JSON.stringify(wayin)).to.not.include(stored)
    }
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and never its wrap", () => {
    const record = TH.passkeyWayinOf('laptop')
    const wayin = Wayin.make(slice, vaultId, record)
    expect(wayin.toJSON()).to.deep.equal({
      wayinkind: 'passkey', device_id: record.device_id, registered_at: record.registered_at, vault_id: 'vault-id-u1',
      credential_id: 'cred-laptop', prf_salt_b64: record.prf_salt_b64,
    })
    expect(JSON.stringify(wayin)).to.not.include('vault_key_wayin_wrapped')
  })
})

describe("wayin.wayinCtx", () => {
  it("is the vault props' scope and vault_id, the purpose, and the whole header", () => {
    const record = TH.passkeyWayinOf('laptop')
    const { vault_key_wayin_wrapped: _wrapped, ...header } = record
    expect(Wayin.make(slice, vaultId, record).wayinCtx).to.deep.equal(
      cipherCtx('safebyok-vault-v6', 'acme', 'u1', 'main', 'vault-id-u1', 'vault_key_passkey_wrapped', header),
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
      expect(Wayin.make(slice, vaultId, record).isDamaged()).to.eq(expected)
    })
  }
})
// --

// == [Sealing]: seal

describe("Wayin.seal, for a passphrase", () => {
  it("makes a valid passphrase's way in that names its deriver and a fresh salt, as its first example shows", async () => {
    const vaultKey = await makeVaultKey()
    const one = await Wayin.seal(slice, vaultId, PassphraseProof.parse(slice, 'pw'), 'device-one', vaultKey)
    const two = await sealed('pw', vaultKey)
    expect(one).to.be.instanceOf(PassphraseWayin)
    expect(VaultProps.safeParse(TH.vaultPropsOf('u1', { passphrase: one.record })).success).to.be.true
    expect(one.record).to.include({ wayinkind: 'passphrase', key_deriver_label: 'test_digest_v0' })
    expect(one).to.include(stamp)
    expect(one.record.salt_b64).to.not.eq(two.salt_b64)
  })

  it("keeps nothing of the passphrase in the way in it makes", async () => {
    const wayin = await Wayin.seal(slice, vaultId, PassphraseProof.parse(slice, 'hunter2-hunter2'), 'device-one', await makeVaultKey())
    expect(JSON.stringify(wayin)).to.not.include('hunter2')
    expect(Object.values(wayin)).to.not.include('hunter2-hunter2')
  })
})

describe("each field of a way in, as sealed (Contract: Wayin, How each field is made)", () => {
  it("makes a passphrase's salt 16 fresh random bytes, names the key deriver its proof derives through, and stamps it with the vault props' epoch, the device and the time it is handed", async () => {
    const wayin = await Wayin.seal(slice, vaultId, PassphraseProof.parse(slice, 'pw'), 'device-one', await makeVaultKey())
    expect(fromB64(wayin.record.salt_b64)).to.have.lengthOf(16)
    expect(wayin.record.key_deriver_label).to.eq(TH.testDeriver.key_deriver_label)
    expect(wayin).to.include(stamp)
    const again = await Wayin.seal(slice, vaultId, PassphraseProof.parse(slice, 'pw'), 'device-one', await makeVaultKey())
    expect(again.record.salt_b64).to.not.eq(wayin.record.salt_b64)
  })

  it("keeps a passkey's 32-byte salt and credential as the answer brings them, and no key deriver", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = await Wayin.seal(slice, vaultId, PasskeyProof.parse(slice, answer), 'device-one', await makeVaultKey())
    expect(fromB64(wayin.prf_salt_b64)).to.have.lengthOf(32)
    expect(wayin).to.include({ credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64 })
    expect(wayin.record).to.not.have.property('key_deriver_label')
  })

  it("wraps the vaultKey under the wayinKey, bound to wayinCtx: the proof's key unwraps it under that ctx", async () => {
    const vaultKey = await makeVaultKey()
    const proof = PassphraseProof.parse(slice, 'pw')
    const wayin = await Wayin.seal(slice, vaultId, proof, 'device-one', vaultKey)
    const unwrapped = await unwrapKeyUnder(await proof.wayinKeyFor(wayin.record), wayin.record.vault_key_wayin_wrapped, wayin.wayinCtx, { extractable: true, usage: ['wrapKey'] })
    expect(await rawOf(unwrapped)).to.eq(await rawOf(vaultKey))
  })
})

describe("Wayin.seal's stamp and answer", () => {
  it("stamps the device it is given, and the time it is handed", async () => {
    const wayin = await Wayin.seal({ ...slice, now: () => SealedAt + 1000 }, vaultId, PassphraseProof.parse(slice, 'pw'), 'device-two', await makeVaultKey())
    expect(wayin).to.include({ device_id: 'device-two', registered_at: SealedAt + 1000 })
  })

  it("hands back the way in alone, holding no key: the vault takes its key out of a way in as stored", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = await Wayin.seal(slice, vaultId, PassphraseProof.parse(slice, 'pw'), 'device-one', vaultKey)
    expect(wayin).to.be.instanceOf(PassphraseWayin)
    expect(Object.values(wayin).some((val) => val instanceof CryptoKey)).to.be.false
  })
})

describe("Wayin.seal, for a passkey", () => {
  it("makes a valid passkey's way in that keeps the credential and its salt, and never the answer, as its second example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = await Wayin.seal(slice, vaultId, PasskeyProof.parse(slice, answer), 'device-one', await makeVaultKey())
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    const vaultProps = TH.vaultPropsOf('u1', { passkey: wayin.record })
    expect(VaultProps.safeParse(vaultProps).success).to.be.true
    expect(wayin).to.include({ wayinkind: 'passkey', credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64 })
    expect(JSON.stringify(wayin)).to.not.include(toB64(answer.prfBytes))
  })

})
// --

// == [Opening one]: tryOpen, by the Contract

describe("wayin.tryOpen, by the Contract", () => {
  it("asks the proof for the way in's key: one key derivation for a passphrase (Contract: wayin.tryOpen, Does 1)", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(keyDeriver)
    const wayin = Wayin.make(opening, vaultId, await sealed('pw', await makeVaultKey()))
    const proof = PassphraseProof.parse(opening, 'pw')
    const asked = vi.spyOn(PassphraseProof.prototype, 'wayinKeyFor')
    try {
      await TH.expectGood(wayin.tryOpen(proof))
      expect(asked).toHaveBeenCalledWith(wayin.record)
      expect(asked.mock.contexts).to.deep.equal([proof])
    } finally {
      asked.mockRestore()
    }
    expect(derivations).toHaveBeenCalledTimes(1)
  })

  it("asks the proof for the way in's key: one HKDF for a passkey, and no key derivation (Contract: wayin.tryOpen, Does 1)", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(keyDeriver)
    const answer = await TH.passkeyOf('laptop')
    const wayin = Wayin.make(opening, vaultId, await sealedPasskey(answer, await makeVaultKey()))
    const proof = PasskeyProof.parse(opening, answer)
    const asked = vi.spyOn(PasskeyProof.prototype, 'wayinKeyFor')
    try {
      await TH.expectGood(wayin.tryOpen(proof))
      expect(asked).toHaveBeenCalledWith(wayin)
      expect(asked.mock.contexts).to.deep.equal([proof])
    } finally {
      asked.mockRestore()
    }
    expect(derivations).not.toHaveBeenCalled()
  })

  it("unwraps the wrap bound to its wayinCtx, and under no other (Contract: wayin.tryOpen, Does 2)", async () => {
    const record = await sealed('pw', await makeVaultKey())
    await TH.expectGood(Wayin.make(slice, vaultId, record).tryOpen(PassphraseProof.parse(slice, 'pw')))
    const moved = Wayin.make(slice, 'vault-id-moved', record)
    await TH.expectBad(moved.tryOpen(PassphraseProof.parse(slice, 'pw')), 'wrong_passphrase')
  })

  it("hands back a vaultKey only from its own wrap under a proof that matched, keeping no proof (Contract: wayin.tryOpen, Guarantees)", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = Wayin.make(slice, vaultId, await sealed('pw', vaultKey))
    const before = Object.getOwnPropertyNames(wayin)
    await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(slice, 'not it')), 'wrong_passphrase')
    const { transientKey } = await TH.expectGood(wayin.tryOpen(PassphraseProof.parse(slice, 'pw')))
    expect(await rawOf(transientKey)).to.eq(await rawOf(vaultKey))
    expect(Object.getOwnPropertyNames(wayin)).to.deep.equal(before)
    expect(JSON.stringify(wayin)).to.not.include('"pw"')
  })

  it("returns the vaultKey as a non-extractable handle for the session and an extractable one for the grant (Contract: wayin.tryOpen, Returns)", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = Wayin.make(slice, vaultId, await sealed('pw', vaultKey))
    const { transientKey, sessionKey } = await TH.expectGood(wayin.tryOpen(PassphraseProof.parse(slice, 'pw')))
    expect(sessionKey.extractable).to.be.false
    expect(sessionKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
    expect(transientKey.extractable).to.be.true
    expect(await rawOf(transientKey)).to.eq(await rawOf(vaultKey))
  })

  it("refuses wrong_passphrase when the passphrase does not open it, quoting nothing (Contract: wayin.tryOpen, Refuses)", async () => {
    const wayin = Wayin.make(slice, vaultId, await sealed('pw', await makeVaultKey()))
    const err = await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(slice, 'swordfish')), 'wrong_passphrase')
    expect(err.message).to.not.include('swordfish')
  })

  it("refuses wrong_passkey when the answer did not open the wrap, or was for another salt (Contract: wayin.tryOpen, Refuses)", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = Wayin.make(slice, vaultId, await sealedPasskey(answer, await makeVaultKey()))
    const notIt = PasskeyProof.parse(slice, { ...answer, prfBytes: new Uint8Array(32).fill(1) })
    await TH.expectBad(wayin.tryOpen(notIt), 'wrong_passkey')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const overOtherSalt = PasskeyProof.parse(slice, await TH.passkeyOf('laptop', otherSalt))
    await TH.expectBad(wayin.tryOpen(overOtherSalt), 'wrong_passkey')
  })

  it("refuses damaged_wayin for a record in a form this package never writes, deriving nothing (Contract: wayin.tryOpen, Refuses)", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(keyDeriver)
    const record = await sealed('pw', await makeVaultKey())
    await TH.expectBad(Wayin.make(opening, vaultId, { ...record, salt_b64: 'c2FsdA' }).tryOpen(PassphraseProof.parse(opening, 'pw')), 'damaged_wayin')
    const answer = await TH.passkeyOf('laptop')
    const passkey = await sealedPasskey(answer, await makeVaultKey())
    await TH.expectBad(Wayin.make(opening, vaultId, { ...passkey, prf_salt_b64: 'c2FsdA' }).tryOpen(PasskeyProof.parse(opening, answer)), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses unknown_key_deriver for a passphrase another key deriver made, deriving nothing", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf({ ...keyDeriver, key_deriver_label: 'someone_elses_deriver_v9' })
    const wayin = Wayin.make(opening, vaultId, await sealed('pw', await makeVaultKey()))
    await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(opening, 'pw')), 'unknown_key_deriver')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses the other kind of proof as bad_option: a passkey's answer for a passphrase, a passphrase for a passkey", async () => {
    const answer = await TH.passkeyOf('laptop')
    const passphrase = Wayin.make(slice, vaultId, await sealed('pw', await makeVaultKey()))
    const passkey = Wayin.make(slice, vaultId, await sealedPasskey(answer, await makeVaultKey()))
    await TH.expectBad(passphrase.tryOpen(PasskeyProof.parse(slice, answer)), 'bad_option')
    await TH.expectBad(passkey.tryOpen(PassphraseProof.parse(slice, 'pw')), 'bad_option')
  })

  it("refuses wrong_passkey for another credential's answer", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = Wayin.make(slice, vaultId, await sealedPasskey(answer, await makeVaultKey()))
    const phone = PasskeyProof.parse(slice, await TH.passkeyOf('phone', answer.prfSaltB64))
    await TH.expectBad(wayin.tryOpen(phone), 'wrong_passkey')
  })

  it("refuses unexpected_error, never thrown and never logged, when the key deriver throws, what it threw the cause", async () => {
    const thrown = new Error('the deriver fell over')
    const opening = sliceOf({ ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) })
    const wayin = Wayin.make(opening, vaultId, await sealed('pw', await makeVaultKey()))
    const err = await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(opening, 'pw')), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
  })

  it("passes a key deriver's own refusal through as it came", async () => {
    const opening = sliceOf({ ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(new Uint8Array(31)) })
    const wayin = Wayin.make(opening, vaultId, await sealed('pw', await makeVaultKey()))
    await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(opening, 'pw')), 'bad_option')
  })

  it("opens as its example shows", async () => {
    const vault = slice
    const typed = 'pw'
    const wayin = Wayin.make(vault, vaultId, await sealed(typed, await makeVaultKey()))
    const { ok, val } = await wayin.tryOpen(Proof.parse(vault, typed))
    expect(ok).to.be.true
    expect(val?.sessionKey).to.be.instanceOf(CryptoKey)
  })
})
// --

// == [Ctx]: what each wrap and key is bound to

/** Each of a passphrase's way in's visible fields altered: every one is in its wrap's ctx. */
const TamperCases: readonly (readonly [Partial<PassphraseWayinRecord>, string])[] = [
  [{ key_deriver_label: 'test_digest_v1' },      'its key_deriver_label swapped, to one the deriver then wears'],
  [{ device_id: 'device-elsewhere' },            'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) },      'its registered_at moved'],
]

describe("a passphrase's way in's ctx", () => {
  for (const [altered, blurb] of TamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const vaultKey = await makeVaultKey()
      const vaultProps = vaultPropsWith({ ...await sealed('pw', vaultKey), ...altered })
      const keyDeriver = { ...TH.testDeriver, key_deriver_label: vaultProps.passphrase.key_deriver_label }
      await TH.expectRefusal(openIn(vaultProps, 'pw', { keyDeriver }), 'wrong_passphrase')
    })
  }

  it("refuses to open with its salt swapped for another way in's", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', vaultKey)
    const two = await sealed('pw', vaultKey)
    const vaultProps = vaultPropsWith({ ...one, salt_b64: two.salt_b64 })
    await TH.expectRefusal(openIn(vaultProps, 'pw'), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = await sealed('pw', vaultKey)
    const otherVault = VaultProps.parse(TH.vaultPropsOf('u1', { vault_id: 'vault-id-other', passphrase: wayin }))
    await TH.expectRefusal(openIn(otherVault, 'pw'), 'wrong_passphrase')
    await TH.expectRefusal(openIn(vaultPropsWith(wayin), 'pw', { scope: TH.scopeOf('u2') }), 'wrong_passphrase')
  })

  it("does not bind the vault props' registered_at: their vault_id, random and never reused, names them alone", async () => {
    const wayin = await sealed('pw', await makeVaultKey())
    const redated = VaultProps.parse(TH.vaultPropsOf('u1', { registered_at: TH.vaultPropsOf('u1').registered_at + 1, passphrase: wayin }))
    expect(await openIn(redated, 'pw')).to.have.property('sessionKey')
  })

  it("does not bind the unlock epoch: a way in opens at any epoch of its vault", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = VaultProps.parse(TH.vaultPropsOf('u1', { unlock_epoch: 7, passphrase: await sealed('pw', vaultKey) }))
    const opened = await openIn(vaultProps, 'pw')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
  })
})

const PasskeyTamperCases = [
  [{ credential_id: 'Y3JlZC1vdGhlcg' }, 'its credential_id swapped, the answer kept'],
  [{ device_id: 'device-elsewhere' },  'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) }, 'its registered_at moved'],
] as const

describe("a passkey's way in's ctx", () => {
  for (const [altered, blurb] of PasskeyTamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const laptop = await TH.passkeyOf('laptop')
      const vaultProps = vaultPropsWith(TH.wayinOf('passphrase'), { ...await sealedPasskey(laptop, await makeVaultKey()), ...altered })
      const answering = { ...laptop, credentialId: vaultProps.passkey?.credential_id ?? '' }
      await TH.expectRefusal(openIn(vaultProps, answering), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const vaultProps = vaultPropsWith(TH.wayinOf('passphrase'), { ...await sealedPasskey(laptop, await makeVaultKey()), prf_salt_b64: otherSalt })
    await TH.expectRefusal(openIn(vaultProps, { ...laptop, prfSaltB64: otherSalt }), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, await makeVaultKey())
    const otherVault = VaultProps.parse(TH.vaultPropsOf('u1', { vault_id: 'vault-id-other', passkey: wayin }))
    await TH.expectRefusal(openIn(otherVault, laptop), 'wrong_passkey')
    const sound = vaultPropsWith(TH.wayinOf('passphrase'), wayin)
    await TH.expectRefusal(openIn(sound, laptop, { scope: TH.scopeOf('u2') }), 'wrong_passkey')
  })

  it("does not bind the vault props' registered_at: their vault_id, random and never reused, names them alone", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, await makeVaultKey())
    const redated = VaultProps.parse(TH.vaultPropsOf('u1', { registered_at: TH.vaultPropsOf('u1').registered_at + 1, passkey: wayin }))
    expect(await openIn(redated, laptop)).to.have.property('sessionKey')
  })
})

/** Unwrap `wayin` under the key HKDF makes of `prfBytes` with `info`, its wrap bound to `ctx`. */
const unwrapsUnder = async (wayin: PasskeyWayinRecord, prfBytes: Uint8Array, info: Uint8Array, ctx: Uint8Array) => {
  const passkeyKey = await deriveWrappingKey(prfBytes, info)
  return await unwrapKeyUnder(passkeyKey, wayin.vault_key_wayin_wrapped, ctx, { extractable: false, usage: ['wrapKey'] })
}

describe("a passkey's way in's key", () => {
  it("is HKDF over the answer with the wrap's whole ctx as its info: scope, vault_id, registered_at, purpose and header", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, await makeVaultKey())
    const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
    const ctx = cipherCtx('safebyok-vault-v6', 'acme', 'u1', 'main', 'vault-id-u1', 'vault_key_passkey_wrapped', header)
    expect(await unwrapsUnder(wayin, laptop.prfBytes, ctx, ctx)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, await makeVaultKey())
    const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
    const ctx = cipherCtx('safebyok-vault-v6', 'acme', 'u1', 'main', 'vault-id-u1', 'vault_key_passkey_wrapped', header)
    const vaultlessInfo = cipherCtx('safebyok-vault-v6', 'vault_key_passkey_wrapped', laptop.credentialId)
    await expect(unwrapsUnder(wayin, laptop.prfBytes, vaultlessInfo, ctx)).rejects.toThrow()
  })
})
// --

import { describe, expect, it, vi } from 'vitest'
import { cipherCtx, deriveWrappingKey, fromB64, makeBoxKey, makeVaultKey, toB64, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import type { KeyDeriver } from '../src/key-deriver'
import { valOf } from '../src/outcome'
import { PasskeyProof, PassphraseProof, Proof } from '../src/proof'
import { VaultProps, type PasskeyAnswer, type PasskeyWayinRecord, type PassphraseWayinRecord, type VaultScope } from '../src/types'
import { PasskeyWayin, PassphraseWayin, Wayin, type WayinStamp, type WayinVault } from '../src/wayin'
import * as TH from './test-helpers'

const scope = TH.scopeOf('u1')
/** The slice of a vault every way in here belongs to: `u1`'s `main` vault, deriving with the test deriver. */
const slice = TH.vaultSliceOf('u1')
/** The vault props every way in here is sealed for: their `vault_id` and `registered_at` are what a wrap binds of them. */
const identity = TH.vaultPropsOf('u1')

/** The slice of a vault of `vaultScope`, deriving with `keyDeriver`. */
const sliceOf = (vaultScope: VaultScope, keyDeriver: KeyDeriver = TH.testDeriver): WayinVault => ({ ...vaultScope, keyDeriver })

/** A testDeriver that counts its derivations: the deriver, and the spy that counts. */
const countingDeriver = () => {
  const derivations = vi.fn(async (passphrase: string, saltBytes: Uint8Array) => await TH.testDeriver.deriveKeyBytes(passphrase, saltBytes))
  return { keyDeriver: { ...TH.testDeriver, deriveKeyBytes: derivations }, derivations }
}

/** What a way in labelled `wayinlabel` is stamped with: its id, the vault props' vaultKey epoch, the device that added it and when. */
const stampOf = (wayinlabel: string): WayinStamp => ({
  wayin_id:        `wayin-${wayinlabel}`,
  wayinlabel,
  vault_key_epoch: 1,
  device_id:       'device-one',
  registered_at:   Date.UTC(2026, 9, 15),
})

/** A real passphrase's way in around `vaultKey`, labelled `wayinlabel`: its record. */
const sealed = async (passphrase: string, wayinlabel: string, vaultKey: CryptoKey, keyDeriver: KeyDeriver = TH.testDeriver): Promise<PassphraseWayinRecord> => {
  const sealing = sliceOf(scope, keyDeriver)
  const wayin = await Wayin.sealPassphrase(sealing, PassphraseProof.parse(sealing, passphrase), identity, stampOf(wayinlabel), vaultKey)
  return wayin.props
}

/** A real passkey's way in around `vaultKey`, labelled `wayinlabel`, for the passkey that answered `answer`: its record. */
const sealedPasskey = async (answer: PasskeyAnswer, wayinlabel: string, vaultKey: CryptoKey): Promise<PasskeyWayinRecord> => {
  const wayin = await Wayin.sealPasskey(slice, PasskeyProof.parse(slice, answer), identity, stampOf(wayinlabel), vaultKey)
  return wayin.props
}

/** Vault props of `wayins`, validated as storage would read it back. */
const vaultPropsWith = (wayins: VaultProps['wayins']): VaultProps => VaultProps.parse(TH.vaultPropsOf('u1', { wayins }))

/** Vault props of `wayins` at vaultKey epoch 2, validated as storage would read it back. */
const epochTwoVaultPropsWith = (wayins: VaultProps['wayins']): VaultProps => VaultProps.parse({ ...TH.vaultPropsAtEpochOf('u1', 2), wayins })

/**
 * The vaultKey out of whichever of `vaultProps`' ways in `given` opens, as the vault seeks it, its
 * refusal thrown: {@link Wayin.tryOpenAmong} over the ways in made for `opts.scope`'s vault, deriving
 * with `opts.keyDeriver`.
 */
const openAmong = async (vaultProps: VaultProps, given: string | PasskeyAnswer, opts: { keyDeriver?: KeyDeriver, scope?: VaultScope, wayinId?: string } = {}) => {
  const opening = sliceOf(opts.scope ?? scope, opts.keyDeriver)
  return valOf(await Wayin.tryOpenAmong(Wayin.listOf(opening, vaultProps), Proof.parse(opening, given), opts.wayinId))
}

/** The vaultKey's raw bytes, to compare two handles on it. */
const rawOf = async (vaultKey: CryptoKey) => toB64(new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)))

// == [Making]: make, listOf, props, toJSON, summary, wayinCtx

describe("Wayin.make", () => {
  it("makes a PassphraseWayin of a passphrase's record, as its first example shows", () => {
    const wayin = Wayin.make(slice, TH.wayinOf('passphrase'), identity)
    expect(wayin).to.be.instanceOf(PassphraseWayin)
    expect(wayin).to.be.instanceOf(Wayin)
    expect(wayin.wayinkind).to.eq('passphrase')
  })

  it("makes a PasskeyWayin of a passkey's record, told apart by its wayinkind", () => {
    const wayin = Wayin.make(slice, TH.passkeyWayinOf('laptop'), identity)
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    expect(wayin.wayinkind).to.eq('passkey')
  })

  it("gives every stored field as a first-class field of its own", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, record, identity) as PassphraseWayin
    for (const [field, stored] of Object.entries(record)) {
      expect(wayin[field as keyof PassphraseWayinRecord], field).to.deep.equal(stored)
    }
    const passkeyRecord = TH.passkeyWayinOf('laptop')
    const passkey = Wayin.make(slice, passkeyRecord, identity) as PasskeyWayin
    expect(passkey.credential_id).to.eq(passkeyRecord.credential_id)
    expect(passkey.prf_salt_b64).to.eq(passkeyRecord.prf_salt_b64)
  })

  it("refuses a record this package never writes as damaged_wayin, as its second example shows", () => {
    TH.expectSyncRefusal(() => Wayin.make(slice, { ...TH.wayinOf('passphrase'), wayin_id: '' }, identity), 'damaged_wayin')
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
      const err = TH.expectSyncRefusal(() => Wayin.make(slice, record, identity), 'damaged_wayin')
      expect(err.cause).to.be.instanceOf(Error)
    })
  }

  it("holds its record as `props`, a frozen copy, its wrap frozen with it", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, record, identity)
    expect(wayin.props).to.deep.equal(record)
    expect(wayin.props).to.not.eq(record)
    expect(Object.isFrozen(wayin.props)).to.be.true
    expect(Object.isFrozen(wayin.props.vault_key_wayin_wrapped)).to.be.true
    expect(wayin.vault_key_wayin_wrapped).to.eq(wayin.props.vault_key_wayin_wrapped)
  })

  it("holds its vault, its holder and its props, none of them enumerable, so JSON and a spread show the record alone", () => {
    const record = TH.wayinOf('passphrase')
    const wayin = Wayin.make(slice, record, identity)
    expect(wayin.vault).to.eq(slice)
    expect(wayin.holder).to.eq(identity)
    expect(Object.keys(wayin)).to.have.members(Object.keys(record))
    expect(JSON.stringify(wayin)).to.eq(JSON.stringify(record))
    const spread = Object.fromEntries(Object.entries(wayin))
    expect(JSON.stringify(spread)).to.not.include('applabel')
  })

  it("is frozen: a field, the vault or the props written over throws, and nothing moves", () => {
    const wayin = Wayin.make(slice, TH.wayinOf('passphrase'), identity)
    for (const field of ['wayinlabel', 'vault', 'holder', 'props', 'salt_b64']) {
      expect(Reflect.set(wayin, field, null), field).to.be.false
    }
    expect(wayin.wayinlabel).to.eq('passphrase')
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("Wayin.listOf", () => {
  it("makes every way in of the vault props, in their order, as its example shows", () => {
    const vaultProps = TH.vaultPropsOf('u1', { wayins: [TH.wayinOf('passphrase'), TH.passkeyWayinOf('laptop')] })
    const wayins = Wayin.listOf(slice, vaultProps)
    expect(wayins.map((wayin) => wayin.wayinkind)).to.deep.equal(['passphrase', 'passkey'])
    expect(wayins.every((wayin) => wayin.holder === vaultProps)).to.be.true
  })
})

describe("wayin.toJSON", () => {
  it("is the record, so JSON.stringify of the way in is the record's, as the Wayin's second example shows", () => {
    const wayin = Wayin.make(slice, TH.passkeyWayinOf('laptop'), identity)
    expect(wayin.toJSON()).to.eq(wayin.props)
    expect(JSON.stringify(wayin)).to.eq(JSON.stringify(wayin.props))
  })
})

describe("wayin.summary", () => {
  it("gives the kind, id, label and the device and time that added it, and nothing of the salt or wrap", async () => {
    const wayin = Wayin.make(slice, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    expect(wayin.summary).to.deep.equal({
      wayinkind: 'passphrase', wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase', device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15),
    })
  })

  it("gives a passkey's credential and salt besides, what a host asks its authenticator with, and not its wrap", () => {
    const record = TH.passkeyWayinOf('laptop')
    expect(Wayin.make(slice, record, identity).summary).to.deep.equal({
      wayinkind: 'passkey', wayin_id: 'wayin-laptop', wayinlabel: 'laptop', device_id: record.device_id, registered_at: record.registered_at,
      credential_id: 'cred-laptop', prf_salt_b64: record.prf_salt_b64,
    })
  })
})

describe("wayin.wayinCtx", () => {
  it("is the vault's scope, the holder's vault_id and registered_at, the purpose, and the whole header", () => {
    const record = TH.passkeyWayinOf('laptop')
    const { vault_key_wayin_wrapped: _wrapped, ...header } = record
    expect(Wayin.make(slice, record, identity).wayinCtx).to.deep.equal(
      cipherCtx('safebyok-vault-v4', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header),
    )
  })
})

describe("wayin.isDamaged", () => {
  const DamagedCases = [
    [TH.wayinOf('passphrase', { salt_b64: 'c2FsdA' }),            true,  'a passphrase whose salt is not the deriver\'s length'],
    [TH.wayinOf('passphrase', { salt_b64: 'not base64!' }),       true,  'a passphrase whose salt is not base64url'],
    [TH.wayinOf('passphrase', { vault_key_epoch: 2 }),            true,  'a passphrase at another vaultKey epoch than its vault props'],
    [TH.wayinOf('passphrase', { key_deriver_label: 'elsewhere_v1', salt_b64: 'c2FsdA' }), false, "a passphrase another deriver made, whose salt is not this vault's to judge"],
    [TH.wayinOf('passphrase'),                                    false, 'a passphrase stored as this package writes it'],
    [TH.passkeyWayinOf('laptop', { prf_salt_b64: 'c2FsdA' }),      true,  'a passkey whose salt is not 32 bytes'],
    [TH.passkeyWayinOf('laptop', { vault_key_epoch: 2 }),          true,  'a passkey at another vaultKey epoch than its vault props'],
    [TH.passkeyWayinOf('laptop'),                                  false, 'a passkey stored as this package writes it'],
  ] as const

  for (const [record, expected, blurb] of DamagedCases) {
    it(`says ${String(expected)} of ${blurb}`, () => {
      expect(Wayin.make(slice, record, identity).isDamaged()).to.eq(expected)
    })
  }
})
// --

// == [Sealing]: sealPassphrase, sealFirstPassphrase, sealPasskey

describe("Wayin.sealPassphrase", () => {
  it("makes a valid passphrase's way in that names its deriver and a fresh salt, as its example shows", async () => {
    const vaultKey = await makeVaultKey()
    const one = await Wayin.sealPassphrase(slice, PassphraseProof.parse(slice, 'pw'), identity, stampOf('passphrase'), vaultKey)
    const two = await sealed('pw', 'home_phrase', vaultKey)
    expect(one).to.be.instanceOf(PassphraseWayin)
    expect(VaultProps.safeParse(TH.vaultPropsOf('u1', { wayins: [one.props, two] })).success).to.be.true
    expect(one).to.include({ wayinkind: 'passphrase', wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase', key_deriver_label: 'test_digest_v0' })
    expect(one).to.include({ vault_key_epoch: 1, device_id: 'device-one', registered_at: Date.UTC(2026, 9, 15) })
    expect(one.salt_b64).to.not.eq(two.salt_b64)
    expect(one.holder).to.eq(identity)
  })

  it("keeps nothing of the passphrase in the way in it makes", async () => {
    const wayin = await Wayin.sealPassphrase(slice, PassphraseProof.parse(slice, 'hunter2-hunter2'), identity, stampOf('passphrase'), await makeVaultKey())
    expect(JSON.stringify(wayin)).to.not.include('hunter2')
    expect(Object.values(wayin)).to.not.include('hunter2-hunter2')
  })
})

describe("each field of a way in, as sealed (Contract: Wayin, How each field is made)", () => {
  it("makes a passphrase's salt 16 fresh random bytes, names its key deriver, and keeps the stamp it was given", async () => {
    const wayin = await Wayin.sealPassphrase(slice, PassphraseProof.parse(slice, 'pw'), identity, stampOf('passphrase'), await makeVaultKey())
    expect(fromB64(wayin.salt_b64)).to.have.lengthOf(16)
    expect(wayin.key_deriver_label).to.eq(TH.testDeriver.key_deriver_label)
    expect(wayin).to.include(stampOf('passphrase'))
    const again = await Wayin.sealPassphrase(slice, PassphraseProof.parse(slice, 'pw'), identity, stampOf('passphrase'), await makeVaultKey())
    expect(again.salt_b64).to.not.eq(wayin.salt_b64)
  })

  it("keeps a passkey's 32-byte salt and credential as the answer brings them, and no key deriver", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = await Wayin.sealPasskey(slice, PasskeyProof.parse(slice, answer), identity, stampOf('laptop'), await makeVaultKey())
    expect(fromB64(wayin.prf_salt_b64)).to.have.lengthOf(32)
    expect(wayin).to.include({ credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64 })
    expect(wayin).to.not.have.property('key_deriver_label')
  })

  it("wraps the vaultKey under the wayinKey, bound to wayinCtx: the proof's key unwraps it under that ctx", async () => {
    const vaultKey = await makeVaultKey()
    const proof = PassphraseProof.parse(slice, 'pw')
    const wayin = await Wayin.sealPassphrase(slice, proof, identity, stampOf('passphrase'), vaultKey)
    const unwrapped = await unwrapKeyUnder(await proof.wayinKeyFor(wayin), wayin.vault_key_wayin_wrapped, wayin.wayinCtx, { extractable: true, usage: ['wrapKey'] })
    expect(await rawOf(unwrapped)).to.eq(await rawOf(vaultKey))
  })
})

describe("Wayin.sealFirstPassphrase", () => {
  it("makes the way in sealPassphrase would, and hands back a session handle on the vaultKey that cannot be exported, as its example shows", async () => {
    const vaultKey = await makeVaultKey()
    const { wayin, sessionKey } = await Wayin.sealFirstPassphrase(slice, PassphraseProof.parse(slice, 'pw'), identity, stampOf('one'), vaultKey)
    expect(wayin).to.include({ wayinkind: 'passphrase', wayin_id: 'wayin-one', key_deriver_label: 'test_digest_v0' })
    expect(sessionKey.extractable).to.be.false
    expect(sessionKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
    // The handle is the vaultKey: what the vaultKey wraps, it unwraps.
    const boxKey = await makeBoxKey()
    const wrapped = await wrapKeyUnder(vaultKey, boxKey, new Uint8Array(1))
    const unwrapped = await unwrapKeyUnder(sessionKey, wrapped, new Uint8Array(1), { extractable: true, usage: ['encrypt', 'decrypt'] })
    expect(await rawOf(unwrapped)).to.eq(await rawOf(boxKey))
  })
})

describe("Wayin.sealPasskey", () => {
  it("makes a valid passkey's way in that keeps the credential and its salt, and never the answer, as its example shows", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = await Wayin.sealPasskey(slice, PasskeyProof.parse(slice, answer), identity, stampOf('laptop'), await makeVaultKey())
    expect(wayin).to.be.instanceOf(PasskeyWayin)
    const vaultProps = TH.vaultPropsOf('u1', { wayins: [TH.wayinOf('passphrase'), wayin.props] })
    expect(VaultProps.safeParse(vaultProps).success).to.be.true
    expect(wayin).to.include({ wayinkind: 'passkey', wayin_id: 'wayin-laptop', wayinlabel: 'laptop', credential_id: answer.credentialId, prf_salt_b64: answer.prfSaltB64 })
    expect(JSON.stringify(wayin)).to.not.include(toB64(answer.prfBytes))
  })

  const FreshSaltCases = [
    [toB64(new Uint8Array(16)), 'a salt of 16 bytes, not 32'],
    ["not base64url!",          'a salt that is not base64url'],
  ] as const

  for (const [prfSaltB64, blurb] of FreshSaltCases) {
    it(`refuses an answer over ${blurb} as bad_option, wrapping nothing`, async () => {
      const answer = await TH.passkeyOf('laptop', prfSaltB64)
      await TH.expectRefusal(Wayin.sealPasskey(slice, PasskeyProof.parse(slice, answer), identity, stampOf('laptop'), await makeVaultKey()), 'bad_option')
    })
  }
})
// --

// == [Opening one]: tryOpen, by the Contract

describe("wayin.tryOpen, by the Contract", () => {
  it("asks the proof for the way in's key: one key derivation for a passphrase (Contract: wayin.tryOpen, Does 1)", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(scope, keyDeriver)
    const wayin = Wayin.make(opening, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    const proof = PassphraseProof.parse(opening, 'pw')
    const asked = vi.spyOn(PassphraseProof.prototype, 'wayinKeyFor')
    try {
      await TH.expectGood(wayin.tryOpen(proof))
      expect(asked).toHaveBeenCalledWith(wayin)
      expect(asked.mock.contexts).to.deep.equal([proof])
    } finally {
      asked.mockRestore()
    }
    expect(derivations).toHaveBeenCalledTimes(1)
  })

  it("asks the proof for the way in's key: one HKDF for a passkey, and no key derivation (Contract: wayin.tryOpen, Does 1)", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(scope, keyDeriver)
    const answer = await TH.passkeyOf('laptop')
    const wayin = Wayin.make(opening, await sealedPasskey(answer, 'laptop', await makeVaultKey()), identity)
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
    const record = await sealed('pw', 'passphrase', await makeVaultKey())
    await TH.expectGood(Wayin.make(slice, record, identity).tryOpen(PassphraseProof.parse(slice, 'pw')))
    const moved = Wayin.make(slice, record, { ...identity, vault_id: 'vault-id-moved' })
    await TH.expectBad(moved.tryOpen(PassphraseProof.parse(slice, 'pw')), 'wrong_passphrase')
  })

  it("hands back a vaultKey only from its own wrap under a proof that matched, keeping no proof (Contract: wayin.tryOpen, Guarantees)", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = Wayin.make(slice, await sealed('pw', 'passphrase', vaultKey), identity)
    const before = Object.getOwnPropertyNames(wayin)
    await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(slice, 'not it')), 'wrong_passphrase')
    const { transientKey } = await TH.expectGood(wayin.tryOpen(PassphraseProof.parse(slice, 'pw')))
    expect(await rawOf(transientKey)).to.eq(await rawOf(vaultKey))
    expect(Object.getOwnPropertyNames(wayin)).to.deep.equal(before)
    expect(JSON.stringify(wayin)).to.not.include('"pw"')
  })

  it("returns the vaultKey as a non-extractable handle for the session and an extractable one for the grant (Contract: wayin.tryOpen, Returns)", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = Wayin.make(slice, await sealed('pw', 'passphrase', vaultKey), identity)
    const { transientKey, sessionKey } = await TH.expectGood(wayin.tryOpen(PassphraseProof.parse(slice, 'pw')))
    expect(sessionKey.extractable).to.be.false
    expect(sessionKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
    expect(transientKey.extractable).to.be.true
    expect(await rawOf(transientKey)).to.eq(await rawOf(vaultKey))
  })

  it("refuses wrong_passphrase when the passphrase does not open it, quoting nothing (Contract: wayin.tryOpen, Refuses)", async () => {
    const wayin = Wayin.make(slice, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    const err = await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(slice, 'swordfish')), 'wrong_passphrase')
    expect(err.message).to.not.include('swordfish')
  })

  it("refuses wrong_passkey when the answer did not open the wrap, or was for another salt (Contract: wayin.tryOpen, Refuses)", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = Wayin.make(slice, await sealedPasskey(answer, 'laptop', await makeVaultKey()), identity)
    const notIt = PasskeyProof.parse(slice, { ...answer, prfBytes: new Uint8Array(32).fill(1) })
    await TH.expectBad(wayin.tryOpen(notIt), 'wrong_passkey')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const overOtherSalt = PasskeyProof.parse(slice, await TH.passkeyOf('laptop', otherSalt))
    await TH.expectBad(wayin.tryOpen(overOtherSalt), 'wrong_passkey')
  })

  it("refuses damaged_wayin for a record in a form this package never writes, deriving nothing (Contract: wayin.tryOpen, Refuses)", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(scope, keyDeriver)
    const record = await sealed('pw', 'passphrase', await makeVaultKey())
    await TH.expectBad(Wayin.make(opening, { ...record, salt_b64: 'c2FsdA' }, identity).tryOpen(PassphraseProof.parse(opening, 'pw')), 'damaged_wayin')
    await TH.expectBad(Wayin.make(opening, record, { ...identity, vault_key_epoch: 2 }).tryOpen(PassphraseProof.parse(opening, 'pw')), 'damaged_wayin')
    const answer = await TH.passkeyOf('laptop')
    const passkey = await sealedPasskey(answer, 'laptop', await makeVaultKey())
    await TH.expectBad(Wayin.make(opening, { ...passkey, prf_salt_b64: 'c2FsdA' }, identity).tryOpen(PasskeyProof.parse(opening, answer)), 'damaged_wayin')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses unknown_key_deriver for a passphrase another key deriver made, deriving nothing", async () => {
    const { keyDeriver, derivations } = countingDeriver()
    const opening = sliceOf(scope, { ...keyDeriver, key_deriver_label: 'someone_elses_deriver_v9' })
    const wayin = Wayin.make(opening, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(opening, 'pw')), 'unknown_key_deriver')
    expect(derivations).not.toHaveBeenCalled()
  })

  it("refuses the other kind of proof as bad_option: a passkey's answer for a passphrase, a passphrase for a passkey", async () => {
    const answer = await TH.passkeyOf('laptop')
    const passphrase = Wayin.make(slice, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    const passkey = Wayin.make(slice, await sealedPasskey(answer, 'laptop', await makeVaultKey()), identity)
    await TH.expectBad(passphrase.tryOpen(PasskeyProof.parse(slice, answer)), 'bad_option')
    await TH.expectBad(passkey.tryOpen(PassphraseProof.parse(slice, 'pw')), 'bad_option')
  })

  it("refuses wrong_passkey for another credential's answer", async () => {
    const answer = await TH.passkeyOf('laptop')
    const wayin = Wayin.make(slice, await sealedPasskey(answer, 'laptop', await makeVaultKey()), identity)
    const phone = PasskeyProof.parse(slice, await TH.passkeyOf('phone', answer.prfSaltB64))
    await TH.expectBad(wayin.tryOpen(phone), 'wrong_passkey')
  })

  it("refuses unexpected_error, never thrown and never logged, when the key deriver throws, what it threw the cause", async () => {
    const thrown = new Error('the deriver fell over')
    const opening = sliceOf(scope, { ...TH.testDeriver, deriveKeyBytes: () => Promise.reject(thrown) })
    const wayin = Wayin.make(opening, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    const err = await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(opening, 'pw')), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
  })

  it("passes a key deriver's own refusal through as it came", async () => {
    const opening = sliceOf(scope, { ...TH.testDeriver, deriveKeyBytes: () => Promise.resolve(new Uint8Array(31)) })
    const wayin = Wayin.make(opening, await sealed('pw', 'passphrase', await makeVaultKey()), identity)
    await TH.expectBad(wayin.tryOpen(PassphraseProof.parse(opening, 'pw')), 'bad_option')
  })

  it("opens as its example shows", async () => {
    const vault = slice
    const typed = 'pw'
    const wayin = Wayin.make(vault, await sealed(typed, 'passphrase', await makeVaultKey()), identity)
    const { ok, val } = await wayin.tryOpen(Proof.parse(vault, typed))
    expect(ok).to.be.true
    expect(val?.sessionKey).to.be.instanceOf(CryptoKey)
  })
})
// --

// == [Opening among several]: tryOpenAmong with a passphrase, with a passkey

describe("Wayin.tryOpenAmong, with a passphrase", () => {
  it("opens the way in the passphrase belongs to, and says which, as its first example shows", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'passphrase', vaultKey), await sealed('second', 'home_phrase', vaultKey)])
    const opened = await openAmong(vaultProps, 'second')
    expect(opened.wayinId).to.eq('wayin-home_phrase')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
  })

  it("tries the ways in in order, one derivation each, and stops at the first that opens", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey), await sealed('third', 'three', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    await openAmong(vaultProps, 'second', { keyDeriver })
    expect(derivations).toHaveBeenCalledTimes(2)
  })

  it("refuses a wrong passphrase only after trying every way in", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const err = await TH.expectRefusal(openAmong(vaultProps, 'neither', { keyDeriver }), 'wrong_passphrase')
    expect(derivations).toHaveBeenCalledTimes(2)
    expect(err.message).to.not.include('neither')
  })

  it("says how many passphrases another key deriver made went untried, and that opening the vault where it was made may help", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey, alienDeriver), await sealed('third', 'three', vaultKey, alienDeriver)])
    const err = await TH.expectRefusal(openAmong(vaultProps, 'second'), 'wrong_passphrase')
    expect(err.message).to.include('2 of this vault\'s passphrases were made with a key deriver this package does not carry')
    expect(err.message).to.include('open the vault where it was made')
    expect(err.message).to.not.include('second')
  })

  it("says it of one passphrase in the singular", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey, alienDeriver)])
    const err = await TH.expectRefusal(openAmong(vaultProps, 'second'), 'wrong_passphrase')
    expect(err.message).to.include("One of this vault's passphrases was made with a key deriver this package does not carry, so it was not tried")
  })

  it("says it beside a damaged passphrase too, and says nothing of other derivers when none was passed over", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const damagedToo = vaultPropsWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }, await sealed('third', 'three', vaultKey, alienDeriver)])
    const told = await TH.expectRefusal(openAmong(damagedToo, 'nope'), 'wrong_passphrase')
    expect(told.message).to.include('stored damaged')
    expect(told.message).to.include('One of this vault')
    const soundOnly = vaultPropsWith([await sealed('first', 'one', vaultKey)])
    const plain = await TH.expectRefusal(openAmong(soundOnly, 'nope'), 'wrong_passphrase')
    expect(plain.message).to.not.include('key deriver')
  })

  it("aimed at one way in, derives once, and refuses a passphrase that is another's, as its second example shows", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await openAmong(vaultProps, 'second', { keyDeriver, wayinId: 'wayin-two' })
    expect(opened.wayinId).to.eq('wayin-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await TH.expectRefusal(openAmong(vaultProps, 'first', { wayinId: 'wayin-two' }), 'wrong_passphrase')
  })

  it("refuses an aim at a wayin_id the vault props do not hold as absent_wayin", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey)])
    await TH.expectRefusal(openAmong(vaultProps, 'first', { wayinId: 'wayin-gone' }), 'absent_wayin')
  })

  it("refuses as unknown_key_deriver when no way in it would try was made by this deriver", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey)])
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    await TH.expectRefusal(openAmong(vaultProps, 'first', { keyDeriver: alienDeriver }), 'unknown_key_deriver')
  })

  it("hands on a key deriver's throw as unexpected_error, trying no other way in", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), await sealed('second', 'two', vaultKey)])
    const throwing = { ...TH.testDeriver, deriveKeyBytes: vi.fn(() => Promise.reject(new Error('down'))) }
    await TH.expectRefusal(openAmong(vaultProps, 'second', { keyDeriver: throwing }), 'unexpected_error')
    expect(throwing.deriveKeyBytes).toHaveBeenCalledTimes(1)
  })

  // A salt no deriver of its label could have made: each decodes, or not, but never to 16 bytes.
  const DamagedSaltCases = [
    ["c2FsdA",       'a salt of another length, base64url that decodes and so passes the schema'],
    ["not base64!",  'a salt of text that is not base64url'],
    ["aaaaa",        'a salt of base64url letters that decode to no whole bytes'],
  ] as const

  describe("over a way in stored damaged", () => {
    for (const [saltB64, blurb] of DamagedSaltCases) {
      it(`passes over one with ${blurb}, deriving nothing for it, and opens a sound one`, async () => {
        const vaultKey = await makeVaultKey()
        const vaultProps = vaultPropsWith([{ ...await sealed('first', 'one', vaultKey), salt_b64: saltB64 }, await sealed('second', 'two', vaultKey)])
        const { keyDeriver, derivations } = countingDeriver()
        const opened = await openAmong(vaultProps, 'second', { keyDeriver })
        expect(opened.wayinId).to.eq('wayin-two')
        expect(derivations).toHaveBeenCalledTimes(1)
      })
    }

    it("refuses as wrong_passphrase, saying a damaged one went untried, when no sound one opens", async () => {
      const vaultKey = await makeVaultKey()
      const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await TH.expectRefusal(openAmong(vaultProps, 'second'), 'wrong_passphrase')
      expect(err.message).to.include('stored damaged')
    })

    it("refuses as damaged_wayin, deriving nothing, when every one it would try is damaged", async () => {
      const vaultKey = await makeVaultKey()
      const vaultProps = vaultPropsWith([{ ...await sealed('first', 'one', vaultKey), salt_b64: 'c2FsdA' }, { ...await sealed('second', 'two', vaultKey), salt_b64: 'aaaaa' }])
      const { keyDeriver, derivations } = countingDeriver()
      const err = await TH.expectRefusal(openAmong(vaultProps, 'first', { keyDeriver }), 'damaged_wayin')
      expect(err.message).to.include('Every passphrase')
      expect(derivations).not.toHaveBeenCalled()
    })

    it("refuses as damaged_wayin, not saying every passphrase is damaged, when another deriver made the rest", async () => {
      const vaultKey = await makeVaultKey()
      const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
      const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey, alienDeriver), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await TH.expectRefusal(openAmong(vaultProps, 'first'), 'damaged_wayin')
      expect(err.message).to.include('a key deriver this package does not carry')
      expect(err.message).to.not.include('Every passphrase of this vault is stored damaged')
    })

    it("passes over, deriving nothing for it, a way in at another vaultKey epoch than the vault props', and opens a sound one beside it", async () => {
      const vaultKey = await makeVaultKey()
      const spliced = { ...await sealed('second', 'two', vaultKey), vault_key_epoch: 2 }
      const vaultProps = vaultPropsWith([spliced, await sealed('first', 'one', vaultKey)])
      const { keyDeriver, derivations } = countingDeriver()
      await TH.expectRefusal(openAmong(vaultProps, 'second', { keyDeriver }), 'wrong_passphrase')
      expect(derivations).toHaveBeenCalledTimes(1)
      const opened = await openAmong(vaultProps, 'first')
      expect(opened.wayinId).to.eq('wayin-one')
    })

    it("refuses as damaged_wayin when every passphrase is at another vaultKey epoch than the vault props'", async () => {
      const vaultKey = await makeVaultKey()
      const vaultProps = epochTwoVaultPropsWith([await sealed('first', 'one', vaultKey)])
      const err = await TH.expectRefusal(openAmong(vaultProps, 'first'), 'damaged_wayin')
      expect(err.message).to.include('Every passphrase')
    })

    it("refuses as damaged_wayin an aim at a damaged one, though a sound one stands beside it", async () => {
      const vaultKey = await makeVaultKey()
      const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey), { ...await sealed('second', 'two', vaultKey), salt_b64: 'c2FsdA' }])
      const err = await TH.expectRefusal(openAmong(vaultProps, 'first', { wayinId: 'wayin-two' }), 'damaged_wayin')
      expect(err.message).to.include("That passphrase's way into the vault")
    })
  })

  it("says, refusing a passphrase no way in opens, that the stored vault may be damaged", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey)])
    const err = await TH.expectRefusal(openAmong(vaultProps, 'wrong'), 'wrong_passphrase')
    expect(err.message).to.include('Check for typos')
    expect(err.message).to.include('the stored vault may be damaged')
  })

  it("passes over ways in another deriver made, and opens one this deriver did", async () => {
    const vaultKey = await makeVaultKey()
    const alienDeriver = { ...TH.testDeriver, key_deriver_label: 'someone_elses_deriver_v9' }
    const vaultProps = vaultPropsWith([await sealed('first', 'one', vaultKey, alienDeriver), await sealed('second', 'two', vaultKey)])
    const { keyDeriver, derivations } = countingDeriver()
    const opened = await openAmong(vaultProps, 'second', { keyDeriver })
    expect(opened.wayinId).to.eq('wayin-two')
    expect(derivations).toHaveBeenCalledTimes(1)
    await TH.expectRefusal(openAmong(vaultProps, 'first'), 'wrong_passphrase')
  })

  it("passes over the passkeys, and refuses an aim at one as absent_wayin", async () => {
    const vaultKey = await makeVaultKey()
    const { keyDeriver, derivations } = countingDeriver()
    const vaultProps = vaultPropsWith([await sealedPasskey(await TH.passkeyOf('laptop'), 'laptop', vaultKey), await sealed('pw', 'passphrase', vaultKey)])
    const opened = await openAmong(vaultProps, 'pw', { keyDeriver })
    expect(opened.wayinId).to.eq('wayin-passphrase')
    expect(derivations).toHaveBeenCalledTimes(1)
    await TH.expectRefusal(openAmong(vaultProps, 'pw', { wayinId: 'wayin-laptop' }), 'absent_wayin')
  })

  it("refuses as bad_option a proof that is neither a passphrase nor a passkey's answer", async () => {
    class Stranger extends Proof {
      readonly kind = 'passphrase'
      constructor() { super(slice) }
    }
    const wayins = Wayin.listOf(slice, TH.vaultPropsOf('u1'))
    await TH.expectBad(Wayin.tryOpenAmong(wayins, new Stranger()), 'bad_option')
  })
})

describe("Wayin.tryOpenAmong, with a passkey's answer", () => {
  it("opens the way in of the credential that answered, among passphrases and other passkeys, with no key derivation", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const phone = await TH.passkeyOf('phone')
    const { keyDeriver, derivations } = countingDeriver()
    const vaultProps = vaultPropsWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey), await sealedPasskey(phone, 'phone', vaultKey)])
    const opened = await openAmong(vaultProps, phone, { keyDeriver })
    expect(opened.wayinId).to.eq('wayin-phone')
    expect(await rawOf(opened.transientKey)).to.eq(await rawOf(vaultKey))
    expect(opened.sessionKey.extractable).to.be.false
    expect(derivations).not.toHaveBeenCalled()
    const aimed = await openAmong(vaultProps, laptop, { wayinId: 'wayin-laptop' })
    expect(aimed.wayinId).to.eq('wayin-laptop')
  })

  it("refuses as absent_wayin a passkey the vault does not hold, or one aimed at another way in", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const vaultProps = vaultPropsWith([await sealed('pw', 'passphrase', vaultKey), await sealedPasskey(laptop, 'laptop', vaultKey)])
    await TH.expectRefusal(openAmong(vaultProps, await TH.passkeyOf('stranger')), 'absent_wayin')
    await TH.expectRefusal(openAmong(vaultProps, laptop, { wayinId: 'wayin-passphrase' }), 'absent_wayin')
  })

  it("refuses as wrong_passkey an answer over another salt, or one that does not open the way in", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const vaultProps = vaultPropsWith([await sealedPasskey(laptop, 'laptop', vaultKey)])
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    await TH.expectRefusal(openAmong(vaultProps, await TH.passkeyOf('laptop', otherSalt)), 'wrong_passkey')
    await TH.expectRefusal(openAmong(vaultProps, { ...laptop, prfBytes: new Uint8Array(32) }), 'wrong_passkey')
  })

  it("refuses as damaged_wayin a way in whose salt is not base64url of 32 bytes", async () => {
    const vaultKey = await makeVaultKey()
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', vaultKey)
    for (const prfSaltB64 of ['not base64url!', toB64(new Uint8Array(16))]) {
      const vaultProps = vaultPropsWith([{ ...wayin, prf_salt_b64: prfSaltB64 }])
      await TH.expectRefusal(openAmong(vaultProps, { ...laptop, prfSaltB64 }), 'damaged_wayin')
    }
  })

  it("refuses as damaged_wayin a way in at another vaultKey epoch than the vault props'", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const vaultProps = vaultPropsWith([{ ...wayin, vault_key_epoch: 2 }])
    const err = await TH.expectRefusal(openAmong(vaultProps, laptop), 'damaged_wayin')
    expect(err.message).to.include('stored damaged')
  })

  it("says, refusing an answer for its own salt that does not open it, that the way in may be damaged", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const vaultProps = vaultPropsWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await TH.expectRefusal(openAmong(vaultProps, { ...laptop, prfBytes: new Uint8Array(32) }), 'wrong_passkey')
    expect(err.message).to.include('may be damaged')
    expect(err.message).to.include('Unlock with a passphrase')
  })

  it("never refuses with the answer in the error", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const vaultProps = vaultPropsWith([await sealedPasskey(laptop, 'laptop', await makeVaultKey())])
    const err = await TH.expectRefusal(openAmong(vaultProps, { ...laptop, prfBytes: laptop.prfBytes.toReversed() }), 'wrong_passkey')
    expect(JSON.stringify({ kind: err.refusalkind, message: err.message, cause: err.cause })).to.not.include(toB64(laptop.prfBytes))
  })
})
// --

// == [Ctx]: what each wrap and key is bound to

/** Each of a passphrase's way in's visible fields altered: every one is in its wrap's ctx. */
const TamperCases: readonly (readonly [Partial<PassphraseWayinRecord>, string])[] = [
  [{ wayin_id: 'wayin-elsewhere' },              'its wayin_id swapped'],
  [{ wayinlabel: 'relabelled' },                 'its wayinlabel swapped'],
  [{ key_deriver_label: 'test_digest_v1' },      'its key_deriver_label swapped, to one the deriver then wears'],
  [{ device_id: 'device-elsewhere' },            'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) },      'its registered_at moved'],
]

describe("a passphrase's way in's ctx", () => {
  for (const [altered, blurb] of TamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const vaultKey = await makeVaultKey()
      const vaultProps = vaultPropsWith([{ ...await sealed('pw', 'passphrase', vaultKey), ...altered }])
      const keyDeriver = { ...TH.testDeriver, key_deriver_label: (vaultProps.wayins[0] as PassphraseWayinRecord).key_deriver_label }
      await TH.expectRefusal(openAmong(vaultProps, 'pw', { keyDeriver }), 'wrong_passphrase')
    })
  }

  it("refuses to open with its vault_key_epoch moved, though the vault props' is moved with it", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = epochTwoVaultPropsWith([{ ...await sealed('pw', 'passphrase', vaultKey), vault_key_epoch: 2 }])
    await TH.expectRefusal(openAmong(vaultProps, 'pw'), 'wrong_passphrase')
  })

  it("refuses to open with its salt swapped for another way in's", async () => {
    const vaultKey = await makeVaultKey()
    const one = await sealed('pw', 'one', vaultKey)
    const two = await sealed('pw', 'two', vaultKey)
    const vaultProps = vaultPropsWith([{ ...one, salt_b64: two.salt_b64 }])
    await TH.expectRefusal(openAmong(vaultProps, 'pw'), 'wrong_passphrase')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const vaultKey = await makeVaultKey()
    const wayin = await sealed('pw', 'passphrase', vaultKey)
    const otherVault = VaultProps.parse(TH.vaultPropsOf('u1', { vault_id: 'vault-id-other', wayins: [wayin] }))
    await TH.expectRefusal(openAmong(otherVault, 'pw'), 'wrong_passphrase')
    await TH.expectRefusal(openAmong(vaultPropsWith([wayin]), 'pw', { scope: TH.scopeOf('u2') }), 'wrong_passphrase')
  })

  it("refuses to open in vault props whose registered_at was altered", async () => {
    const wayin = await sealed('pw', 'passphrase', await makeVaultKey())
    const redated = VaultProps.parse(TH.vaultPropsOf('u1', { registered_at: identity.registered_at + 1, wayins: [wayin] }))
    await TH.expectRefusal(openAmong(redated, 'pw'), 'wrong_passphrase')
  })

  it("does not bind the unlock epoch: a way in opens at any epoch of its vault", async () => {
    const vaultKey = await makeVaultKey()
    const vaultProps = VaultProps.parse(TH.vaultPropsOf('u1', { unlock_epoch: 7, wayins: [await sealed('pw', 'passphrase', vaultKey)] }))
    const opened = await openAmong(vaultProps, 'pw')
    expect(opened.wayinId).to.eq('wayin-passphrase')
  })
})

const PasskeyTamperCases = [
  [{ wayin_id: 'wayin-other' },     'its wayin_id changed'],
  [{ wayinlabel: 'other' },          'its wayinlabel changed'],
  [{ credential_id: 'Y3JlZC1vdGhlcg' }, 'its credential_id swapped, the answer kept'],
  [{ device_id: 'device-elsewhere' },  'its device_id swapped'],
  [{ registered_at: Date.UTC(2026, 9, 1) }, 'its registered_at moved'],
] as const

describe("a passkey's way in's ctx", () => {
  for (const [altered, blurb] of PasskeyTamperCases) {
    it(`refuses to open with ${blurb}`, async () => {
      const laptop = await TH.passkeyOf('laptop')
      const vaultProps = vaultPropsWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), ...altered }])
      const answering = { ...laptop, credentialId: (vaultProps.wayins[0] as PasskeyWayinRecord).credential_id }
      await TH.expectRefusal(openAmong(vaultProps, answering), 'wrong_passkey')
    })
  }

  it("refuses to open with its salt swapped for another, the answer kept", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const { prfSaltB64: otherSalt } = await TH.passkeyOf('elsewhere')
    const vaultProps = vaultPropsWith([{ ...await sealedPasskey(laptop, 'laptop', await makeVaultKey()), prf_salt_b64: otherSalt }])
    await TH.expectRefusal(openAmong(vaultProps, { ...laptop, prfSaltB64: otherSalt }), 'wrong_passkey')
  })

  it("refuses to open in another vault, or for another user", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const otherVault = VaultProps.parse(TH.vaultPropsOf('u1', { vault_id: 'vault-id-other', wayins: [wayin] }))
    await TH.expectRefusal(openAmong(otherVault, laptop), 'wrong_passkey')
    await TH.expectRefusal(openAmong(vaultPropsWith([wayin]), laptop, { scope: TH.scopeOf('u2') }), 'wrong_passkey')
  })

  it("refuses to open in vault props whose registered_at was altered", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const redated = VaultProps.parse(TH.vaultPropsOf('u1', { registered_at: identity.registered_at + 1, wayins: [wayin] }))
    await TH.expectRefusal(openAmong(redated, laptop), 'wrong_passkey')
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
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
    const ctx = cipherCtx('safebyok-vault-v4', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    expect(await unwrapsUnder(wayin, laptop.prfBytes, ctx, ctx)).to.be.instanceOf(CryptoKey)
  })

  it("is not the key an info of the purpose and credential alone makes: the vault is in it", async () => {
    const laptop = await TH.passkeyOf('laptop')
    const wayin = await sealedPasskey(laptop, 'laptop', await makeVaultKey())
    const { vault_key_wayin_wrapped: _wrapped, ...header } = wayin
    const ctx = cipherCtx('safebyok-vault-v4', 'acme', 'u1', 'main', 'vault-id-u1', identity.registered_at, 'vault_key_passkey_wrapped', header)
    const vaultlessInfo = cipherCtx('safebyok-vault-v4', 'vault_key_passkey_wrapped', laptop.credentialId)
    await expect(unwrapsUnder(wayin, laptop.prfBytes, vaultlessInfo, ctx)).rejects.toThrow()
  })
})
// --

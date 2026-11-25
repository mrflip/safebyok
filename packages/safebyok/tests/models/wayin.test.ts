import { describe, expect, it } from 'vitest'
import { Consts, Crypto } from 'safebyok-big/internals'
import { Wayin, wayinCtxOf } from '../../src/models/wayin'
import * as TH from '../test-helpers'

function passphraseRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    wayinkind:              'passphrase',
    label:                  'main',
    key_deriver_label:      'test_digest_v0',
    salt_b64:               Crypto.toB64(Crypto.randomBytes(16)),
    devicetok:             TH.Devicetok,
    born_at:                TH.T0,
    bank_key_wayin_wrapped: TH.fakeCiphered('wayin-pp'),
    ...overrides,
  }
}

function passkeyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    wayinkind:              'passkey',
    label:                  'passkey0',
    credential_id:          'cred-test-1',
    prf_salt_b64:           Crypto.toB64(Crypto.randomBytes(Consts.PasskeySaltSize)),
    devicetok:             TH.Devicetok,
    born_at:                TH.T0,
    bank_key_wayin_wrapped: TH.fakeCiphered('wayin-pk'),
    ...overrides,
  }
}

describe("Wayin.make(record)", () => {
  it("accepts a wayin record of either kind", () => {
    expect(Wayin.make(passphraseRecord() as never).wayinkind).to.eq('passphrase')
    expect(Wayin.make(passkeyRecord() as never).wayinkind).to.eq('passkey')
  })

  const RecordRefusalCases = [
    // the passkey's salt:
    [() => passkeyRecord({ prf_salt_b64: Crypto.toB64(Crypto.randomBytes(Consts.PasskeySaltSize - 1)) }), 'refuses a passkey salt one byte short'],
    [() => passkeyRecord({ prf_salt_b64: Crypto.toB64(Crypto.randomBytes(Consts.PasskeySaltSize + 1)) }), 'refuses a passkey salt one byte long'],
    [() => passkeyRecord({ prf_salt_b64: 'not base64url!' }),                                            'refuses a passkey salt that is not base64url'],
    // fields of the wrong kind, missing or extra:
    [() => passphraseRecord({ credential_id: 'cred-test-1' }),                                           "refuses a passphrase record carrying a passkey's field"],
    [() => passkeyRecord({ key_deriver_label: 'test_digest_v0' }),                                       "refuses a passkey record carrying a passphrase's field"],
    [() => passphraseRecord({ bank_key_wayin_wrapped: undefined }),                                      'refuses a record with no wrapped bankKey'],
    [() => passphraseRecord({ salt_b64: '' }),                                                           'refuses an empty passphrase salt'],
    [() => passphraseRecord({ salt_b64: Crypto.toB64(Crypto.randomBytes(15)) }),                         'refuses a passphrase salt of 15 bytes'],
    [() => passphraseRecord({ salt_b64: Crypto.toB64(Crypto.randomBytes(17)) }),                         'refuses a passphrase salt of 17 bytes'],
    [() => passphraseRecord({ devicetok: undefined }),                                                  'refuses a record with no devicetok'],
    [() => passphraseRecord({ devicetok: 'device_one' }),                                               'refuses a record whose devicetok is a label'],
    [() => passphraseRecord({ wayinkind: 'password' }),                                                  'refuses a wayinkind of no known kind'],
    [() => passphraseRecord({ label: undefined }),                                                       'refuses a record with no label'],
    [() => passphraseRecord({ label: 'passkey0' }),                                                      "refuses a passphrase record under the passkey's label"],
    [() => passkeyRecord({ label: 'main' }),                                                             "refuses a passkey record under the passphrase's label"],
    [() => passphraseRecord({ born_at: '2023-11-14T22:13:20.000Z' }),                                    'refuses a time written as an ISO string'],
    [() => passphraseRecord({ bank_key_wayin_wrapped: { ciphertext_b64: 'ct' } }),                       'refuses a wrap with no cipherIv'],
    // absurd:
    [() => null,                                                                                         'refuses null'],
    [() => 42,                                                                                           'refuses a number'],
  ] as const

  for (const [recordOf, blurb] of RecordRefusalCases) {
    it(blurb, () => {
      TH.expectSyncRefusal(() => Wayin.make(recordOf() as never))
    })
  }

  it("quotes none of a refused record in its refusal: neither its ciphertext nor its salt", () => {
    const record = passkeyRecord({ prf_salt_b64: 'c2hvcnQ', bank_key_wayin_wrapped: TH.fakeCiphered('SECRETWRAP') })
    const err = TH.expectSyncRefusal(() => Wayin.make(record as never))
    expect(TH.thrownText(err)).to.not.include('SECRETWRAP')
    expect(TH.thrownText(err)).to.not.include('c2hvcnQ')
  })
})

describe("wayin.pickle()", () => {
  it("is the record as given, every field, frozen with its wrap", () => {
    const record = passphraseRecord()
    const pickle = Wayin.make(record as never).pickle()
    expect(pickle).to.deep.equal(record)
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.bank_key_wayin_wrapped)).to.be.true
  })

  it("is a copy: the record handed in is neither frozen nor retained", () => {
    const record = passkeyRecord()
    const pickle = Wayin.make(record as never).pickle()
    expect(pickle).to.not.equal(record)
    expect(Object.isFrozen(record)).to.be.false
    expect(Object.isFrozen(record['bank_key_wayin_wrapped'])).to.be.false
  })

  it("round-trips through Wayin.make", () => {
    const wayin = Wayin.make(passkeyRecord() as never)
    expect(Wayin.make(wayin.pickle()).pickle()).to.deep.equal(wayin.pickle())
  })

  it("shows the record's fields as the wayin's own, read-only", () => {
    const record = passphraseRecord()
    const wayin = Wayin.make(record as never)
    expect(Object.keys(wayin)).to.have.members(Object.keys(record))
    expect(wayin.salt_b64).to.eq(record['salt_b64'])
    expect(() => { (wayin as { devicetok: string }).devicetok = 'device_other' }).to.throw(TypeError)
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("wayin.toJSON()", () => {
  const HeaderCases = [
    [passphraseRecord, ['wayinkind', 'label', 'key_deriver_label', 'salt_b64', 'devicetok', 'born_at'], 'a passphrase wayin'],
    [passkeyRecord,    ['wayinkind', 'label', 'credential_id', 'prf_salt_b64', 'devicetok', 'born_at'], 'a passkey wayin'],
  ] as const

  for (const [recordOf, fieldnames, blurb] of HeaderCases) {
    it(`is every field of ${blurb} but its wrapped bankKey`, () => {
      const wayin = Wayin.make(recordOf() as never)
      expect(Object.keys(wayin.toJSON())).to.have.members([...fieldnames])
      expect(JSON.stringify(wayin)).to.not.include('ciphertext_b64')
      expect(TH.jsonOf(wayin)).to.deep.equal(wayin.toJSON())
    })
  }

  it("leaves the pickle whole", () => {
    const wayin = Wayin.make(passphraseRecord() as never)
    wayin.toJSON()
    expect(wayin.pickle()).to.have.property('bank_key_wayin_wrapped')
  })
})

describe("a wayin's Thing-like getters", () => {
  const KindCases = [
    [passphraseRecord, "wayin/main",      'a passphrase wayin'],
    [passkeyRecord,    "wayin/passkey0",  'a passkey wayin'],
  ] as const

  for (const [recordOf, labelpath, blurb] of KindCases) {
    it(`give ${blurb} its labelpath, am 'a' and written_at its born_at`, () => {
      const wayin = Wayin.make(recordOf({ born_at: TH.T0 + 7 }) as never)
      expect(wayin.labelpath).to.eq(labelpath)
      expect(wayin.am).to.eq('a')
      expect(wayin.written_at).to.eq(TH.T0 + 7)
    })

    it(`stay out of the keys, the pickle and the toJSON of ${blurb}`, () => {
      const record = recordOf()
      const wayin = Wayin.make(record as never)
      const { bank_key_wayin_wrapped: _wrapped, ...header } = record
      expect(Object.keys(wayin)).to.have.members(Object.keys(record))
      expect(Object.keys(wayin.pickle())).to.have.members(Object.keys(record))
      expect(Object.keys(wayin.toJSON())).to.have.members(Object.keys(header))
    })
  }
})

describe("wayinCtxOf(bankStamp, gateStamp, header)", () => {
  const BadHeaderCases = [
    [{ wayinkind: 'telepathy' }, 'of an unknown kind'],
    [{ label: 'passkey0' },      "under the other kind's label"],
    [{ label: undefined },       'with no label'],
  ] as const

  for (const [altered, blurb] of BadHeaderCases) {
    it(`refuses a wayin header ${blurb}`, () => {
      const { bank_key_wayin_wrapped: _wrapped, ...header } = passphraseRecord()
      TH.expectSyncRefusal(() => wayinCtxOf(TH.WorldBankStamp, TH.WorldGateStamp, { ...header, ...altered } as never), 'bad_record')
    })
  }

  it("gives each kind of wayin its own purpose", () => {
    const { bank_key_wayin_wrapped: _pp, ...passphraseHeader } = passphraseRecord()
    const { bank_key_wayin_wrapped: _pk, ...passkeyHeader } = passkeyRecord()
    expect(new TextDecoder().decode(wayinCtxOf(TH.WorldBankStamp, TH.WorldGateStamp, passphraseHeader as never))).to.include('"bank_key_passphrase_wrapped"')
    expect(new TextDecoder().decode(wayinCtxOf(TH.WorldBankStamp, TH.WorldGateStamp, passkeyHeader as never))).to.include('"bank_key_passkey_wrapped"')
  })
})

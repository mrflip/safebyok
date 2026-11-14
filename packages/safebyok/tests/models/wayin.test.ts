import { describe, expect, it } from 'vitest'
import { Consts, Crypto } from 'safebyok-big/internals'
import { Wayin, wayinCtxOf } from '../../src/models/wayin'
import * as TH from '../test-helpers'

function passphraseRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    wayinkind:              'passphrase',
    wayinlabel:             'main',
    key_deriver_label:      'test_digest_v0',
    salt_b64:               Crypto.toB64(Crypto.randomBytes(16)),
    device_tok:             TH.DeviceTok,
    registered_at:          TH.T0,
    bank_key_wayin_wrapped: TH.fakeCiphered('wayin-pp'),
    ...overrides,
  }
}

function passkeyRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    wayinkind:              'passkey',
    wayinlabel:             'passkey0',
    credential_id:          'cred-test-1',
    prf_salt_b64:           Crypto.toB64(Crypto.randomBytes(Consts.PasskeySaltSize)),
    device_tok:             TH.DeviceTok,
    registered_at:          TH.T0,
    bank_key_wayin_wrapped: TH.fakeCiphered('wayin-pk'),
    ...overrides,
  }
}

describe("Wayin.make(record)", () => {
  it("takes a wayin record of either kind", () => {
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
    [() => passphraseRecord({ device_tok: undefined }),                                                  'refuses a record with no device_tok'],
    [() => passphraseRecord({ device_tok: 'device_one' }),                                               'refuses a record whose device_tok is a label'],
    [() => passphraseRecord({ wayinkind: 'password' }),                                                  'refuses a wayinkind of no known kind'],
    [() => passphraseRecord({ wayinlabel: undefined }),                                                  'refuses a record with no wayinlabel'],
    [() => passphraseRecord({ wayinlabel: 'passkey0' }),                                                 "refuses a passphrase record under the passkey's wayinlabel"],
    [() => passkeyRecord({ wayinlabel: 'main' }),                                                        "refuses a passkey record under the passphrase's wayinlabel"],
    [() => passphraseRecord({ registered_at: '2023-11-14T22:13:20.000Z' }),                              'refuses a time written as an ISO string'],
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

  it("is a copy: the record handed in is neither frozen nor kept", () => {
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
    expect(() => { (wayin as { device_tok: string }).device_tok = 'device_other' }).to.throw(TypeError)
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("wayin.toJSON()", () => {
  const HeaderCases = [
    [passphraseRecord, ['wayinkind', 'wayinlabel', 'key_deriver_label', 'salt_b64', 'device_tok', 'registered_at'], 'a passphrase wayin'],
    [passkeyRecord,    ['wayinkind', 'wayinlabel', 'credential_id', 'prf_salt_b64', 'device_tok', 'registered_at'], 'a passkey wayin'],
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

describe("wayinCtxOf(bank, gate, header)", () => {
  const BadHeaderCases = [
    [{ wayinkind: 'telepathy' }, 'of an unknown kind'],
    [{ wayinlabel: 'passkey0' }, "under the other kind's wayinlabel"],
    [{ wayinlabel: undefined },  'with no wayinlabel'],
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

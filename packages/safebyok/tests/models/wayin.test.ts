import { describe, expect, it } from 'vitest'
import { PasskeySaltBytes } from '../../src/consts'
import { randomBytes, toB64 } from '../../src/crypto'
import { Wayin } from '../../src/models/wayin'
import * as TH from '../test-helpers'
import { DeviceId, T0 } from '../test-helpers/proving-world'

const passphraseRecord = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  wayinkind:               'passphrase',
  key_deriver_label:       'test_digest_v0',
  salt_b64:                toB64(randomBytes(16)),
  device_id:               DeviceId,
  registered_at:           T0,
  vault_key_wayin_wrapped: TH.fakeCiphered('wayin-pp'),
  ...overrides,
})

const passkeyRecord = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  wayinkind:               'passkey',
  credential_id:           'cred-test-1',
  prf_salt_b64:            toB64(randomBytes(PasskeySaltBytes)),
  device_id:               DeviceId,
  registered_at:           T0,
  vault_key_wayin_wrapped: TH.fakeCiphered('wayin-pk'),
  ...overrides,
})

describe("new Wayin(record): the record check", () => {
  it("takes a wayin record of either kind", () => {
    expect(new Wayin(passphraseRecord()).wayinkind).to.eq('passphrase')
    expect(new Wayin(passkeyRecord()).wayinkind).to.eq('passkey')
  })

  const RecordRefusalCases = [
    // the passkey's salt:
    [() => passkeyRecord({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes - 1)) }), 'refuses a passkey salt one byte short'],
    [() => passkeyRecord({ prf_salt_b64: toB64(randomBytes(PasskeySaltBytes + 1)) }), 'refuses a passkey salt one byte long'],
    [() => passkeyRecord({ prf_salt_b64: 'not base64url!' }),                   'refuses a passkey salt that is not base64url'],
    // fields of the wrong kind, missing or extra:
    [() => passphraseRecord({ credential_id: 'cred-test-1' }),                  "refuses a passphrase record carrying a passkey's field"],
    [() => passkeyRecord({ key_deriver_label: 'test_digest_v0' }),              "refuses a passkey record carrying a passphrase's field"],
    [() => passphraseRecord({ vault_key_wayin_wrapped: undefined }),            'refuses a record with no wrapped vaultKey'],
    [() => passphraseRecord({ salt_b64: '' }),                                  'refuses an empty passphrase salt'],
    [() => passphraseRecord({ device_id: undefined }),                          'refuses a record with no device_id'],
    [() => passphraseRecord({ wayinkind: 'password' }),                         'refuses a wayinkind of no known kind'],
    [() => passphraseRecord({ registered_at: '2023-11-14T22:13:20.000Z' }),     'refuses a time written as an ISO string'],
    [() => passphraseRecord({ vault_key_wayin_wrapped: { ciphertext_b64: 'ct' } }), 'refuses a wrap with no cipherIv'],
    // absurd:
    [() => null,                                                                'refuses null'],
    [() => 42,                                                                  'refuses a number'],
  ] as const

  for (const [recordOf, blurb] of RecordRefusalCases) {
    it(`${blurb} as 'bad_record'`, () => {
      TH.expectSyncRefusal(() => new Wayin(recordOf()), 'bad_record')
    })
  }

  it("quotes none of a refused record in its refusal: neither its ciphertext nor its salt", () => {
    const record = passkeyRecord({ prf_salt_b64: 'c2hvcnQ', vault_key_wayin_wrapped: TH.fakeCiphered('SECRETWRAP') })
    const err = TH.expectSyncRefusal(() => new Wayin(record), 'bad_record')
    expect(TH.thrownText(err)).to.not.include('SECRETWRAP')
    expect(TH.thrownText(err)).to.not.include('c2hvcnQ')
  })
})

describe("wayin.pickle(): the stored record", () => {
  it("is the record as given, every field, frozen with its wrap", () => {
    const record = passphraseRecord()
    const pickle = new Wayin(record).pickle()
    expect(pickle).to.deep.equal(record)
    expect(Object.isFrozen(pickle)).to.be.true
    expect(Object.isFrozen(pickle.vault_key_wayin_wrapped)).to.be.true
  })

  it("is a copy: the record handed in is neither frozen nor kept", () => {
    const record = passkeyRecord()
    const pickle = new Wayin(record).pickle()
    expect(pickle).to.not.equal(record)
    expect(Object.isFrozen(record)).to.be.false
    expect(Object.isFrozen(record['vault_key_wayin_wrapped'])).to.be.false
  })

  it("makes the same wayin again: new Wayin(wayin.pickle()) pickles equal", () => {
    const wayin = new Wayin(passkeyRecord())
    expect(new Wayin(wayin.pickle()).pickle()).to.deep.equal(wayin.pickle())
  })

  it("shows the record's fields as the wayin's own, read-only", () => {
    const record = passphraseRecord()
    const wayin = new Wayin(record)
    expect(Object.keys(wayin)).to.have.members(Object.keys(record))
    expect(wayin.salt_b64).to.eq(record['salt_b64'])
    expect(() => { (wayin as { device_id: string }).device_id = 'device-other' }).to.throw(TypeError)
    expect(Object.isFrozen(wayin)).to.be.true
  })
})

describe("wayin.toJSON(): the header", () => {
  const HeaderCases = [
    [passphraseRecord, ['wayinkind', 'key_deriver_label', 'salt_b64', 'device_id', 'registered_at'], 'a passphrase wayin'],
    [passkeyRecord,    ['wayinkind', 'credential_id', 'prf_salt_b64', 'device_id', 'registered_at'],  'a passkey wayin'],
  ] as const

  for (const [recordOf, fieldnames, blurb] of HeaderCases) {
    it(`is every field of ${blurb} but its wrapped vaultKey`, () => {
      const wayin = new Wayin(recordOf())
      expect(Object.keys(wayin.toJSON())).to.have.members([...fieldnames])
      expect(JSON.stringify(wayin)).to.not.include('ciphertext_b64')
      expect(TH.jsonOf(wayin)).to.deep.equal(wayin.toJSON())
    })
  }

  it("leaves the pickle whole", () => {
    const wayin = new Wayin(passphraseRecord())
    wayin.toJSON()
    expect(wayin.pickle()).to.have.property('vault_key_wayin_wrapped')
  })
})

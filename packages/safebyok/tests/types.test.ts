import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { Lockbox } from '../src/box'
import { DeviceMark, EpochMillis, FarFuture, FarPast, ForeverMillis, Lease, LockboxSummary, MaxUnlocks, Sidecar, VaultProps, VaultScope, Whisper } from '../src/types'
import * as TH from './test-helpers'

const WhisperCases = [
  // every JSON shape a whisper may take:
  ["sk-ant-api03-fake-fake",          true,   'a string, the common case'],
  ["",                                true,   'even an empty string'],
  [42,                                true,   'a number'],
  [true,                              true,   'a boolean'],
  [["a", "b"],                        true,   'an array'],
  [{ apiKey: "fake", tier: 2 },      true,   'a plain object'],
  [{ orgId: null },                   true,   'null inside a structure: real JSON carries it'],
  [{ deep: { list: [1, null] } },     true,   'nesting, arbitrarily'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
  [null,                              false,  'a bare null: emptying a lockbox is retireBox\'s job'],
  [() => 'nope',                      false,  'a function is not data'],
  [new Date(),                        false,  'a Date would silently flatten to {}'],
  [new Map([["a", 1]]),               false,  'a Map would silently flatten to {}'],
  [{ when: new Date() },              false,  'a class instance hiding inside an object'],
] as const

describe("Whisper", () => {
  for (const [candidate, expected, blurb] of WhisperCases) {
    it(blurb, () => { expect(Whisper.safeParse(candidate).success).to.eq(expected) })
  }

  it("hands back the value unchanged when it passes", () => {
    const bag = { apiKey: 'fake', scopes: ['read', 'write'] }
    expect(Whisper.parse(bag)).to.deep.equal(bag)
  })
})

const ScopeCases = [
  // regular usage:
  [TH.scopeOf('u1'),                                  true,   'an applabel, a user_id and a vaultlabel'],
  [TH.scopeOf('user|2fJ8:google'),                    true,   'a user_id in whatever form the host app issues'],
  [TH.scopeOf('u'.repeat(101)),                       true,   'a user_id longer than the default check admits: past the floor, what a name may be is the validators\' to say'],
  [{ ...TH.scopeOf('u1'), applabel: 'Acme: Ünïcode' },  true,   'an applabel of any script'],
  // refused, below the floor every name is held to:
  [{ ...TH.scopeOf('u1'), user_id: '' },              false,  'an empty user_id'],
  [{ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' },  false,  'a vaultlabel holding a control character'],
  [{ ...TH.scopeOf('u1'), applabel: 'cafe\u{301}' },  false,  'an applabel not in NFC'],
  [TH.scopeOf('u'.repeat(1025)),                      false,  'a user_id over a kibibyte'],
  // refused:
  [{ ...TH.scopeOf('u1'), applabel: 42 },             false,  'an applabel that is not text'],
  [{ applabel: 'acme', user_id: 'u1' },              false,  'a scope missing its vaultlabel'],
] as const

describe("VaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(VaultScope.safeParse(candidate).success).to.eq(expected) })
  }
})

/** An ISO time, as records stored them before every time became epoch milliseconds. */
const OldIso = '2026-10-14T00:00:00.000Z'
const { registered_at: _vaultPropsTime, ...vaultPropsWithoutTime } = TH.vaultPropsOf('u1')
const { wayins: _wayins, ...vaultPropsWithoutWayins } = TH.vaultPropsOf('u1')
const { unlock_epoch: _epoch, ...vaultPropsWithoutEpoch } = TH.vaultPropsOf('u1')
const { vault_key_epoch: _keyEpoch, ...vaultPropsWithoutKeyEpoch } = TH.vaultPropsOf('u1')
/** The three fields the vault props held their one passphrase in, before `wayins`. */
const WayinFieldsOfOld = {
  key_deriver_label:            'test_digest_v0',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- base64 of the literal text 'saltsaltsaltsalt': a fake salt (which is public material anyway), not a credential
  passphrase_salt_b64:          'c2FsdHNhbHRzYWx0c2FsdA',
  vault_key_passphrase_wrapped: TH.fakeCiphered('old'),
}


const VaultPropsCases = [
  // regular usage:
  [TH.vaultPropsOf('u1'),                                   true,   'whole vault props'],
  // refused, as a damaged or foreign record:
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v5' }, false,  'a format this version does not know'],
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v3' }, false,  'vault props from before the prior vaultKey went'],
  [{ ...TH.vaultPropsOf('u1'), unlock_epoch: 0 },            false,  'an epoch starts at one'],
  [{ ...TH.vaultPropsOf('u1'), unlock_epoch: 1.5 },          false,  'an epoch is a whole number'],
  [{ ...TH.vaultPropsOf('u1'), vault_id: '' },               false,  'an empty vault_id'],
  [TH.vaultPropsOf('u'.repeat(101)),                        true,   'a user_id of any length: the validators check names, not the record'],
  [{ ...TH.vaultPropsOf('u1'), vaultlabel: null },           false,  'a vaultlabel that is not text'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv' } as never })] }, false, 'a wayin missing its ciphertext'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: 1_792_022_400 }, false,  'a registered_at in epoch seconds'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: Infinity },    false,  'a registered_at that never comes'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: OldIso },      false,  'a registered_at as an ISO string'],
  [vaultPropsWithoutTime,                                   false,  'vault props missing their registered_at'],
  [{ ...vaultPropsWithoutTime, created_at: OldIso, updated_at: OldIso }, false, 'vault props from before their time was named registered_at'],
  [{ ...vaultPropsWithoutWayins, ...WayinFieldsOfOld },      false,  'vault props from before their wayins were a list'],
  [{ ...vaultPropsWithoutEpoch, passphrase_epoch: 1 },       false,  'vault props from before their epoch was named unlock_epoch'],
  [{ ...vaultPropsWithoutKeyEpoch, format: 'safebyok-vault-v1' }, false, 'vault props from before vaultKey epochs'],
  [vaultPropsWithoutKeyEpoch,                               false,  'vault props missing their vault_key_epoch'],
  [{ ...TH.vaultPropsOf('u1'), vault_key_epoch: 0 },         false,  'a vaultKey epoch starts at one'],
  // the vaultKey epoch is reserved at 1, but the schema leaves binding it to the wayins
  [TH.vaultPropsAtEpochOf('u1', 2),                         true,   'vault props at a vaultKey epoch other than 1'],
] as const

const manyWayins = (count: number) => Array.from({ length: count }, (_unused, ii) => TH.wayinOf(`phrase${String(ii)}`))
const WayinListCases = [
  // regular usage:
  [[TH.wayinOf('passphrase')],                                             true,   'one way in'],
  [[TH.wayinOf('passphrase'), TH.wayinOf('home_phrase')],                  true,   'two passphrases, each with its own id and label'],
  [manyWayins(MaxUnlocks),                                                 true,   'as many ways in as MaxUnlocks allows'],
  // refused, as a damaged or foreign record:
  [[],                                                                     false,  'no way in at all'],
  [manyWayins(MaxUnlocks + 1),                                             false,  'one wayin past MaxUnlocks, which would make an unlock run long'],
  [[TH.wayinOf('passphrase'), TH.wayinOf('home_phrase', { wayin_id: 'wayin-passphrase' })], false, 'two wayins sharing a wayin_id'],
  [[TH.wayinOf('passphrase'), TH.wayinOf('passphrase', { wayin_id: 'wayin-other' })],              false, 'two wayins sharing a wayinlabel'],
  [[TH.wayinOf('passphrase'), TH.passkeyWayinOf('laptop')],               true,   'a passphrase and a passkey'],
  [[TH.passkeyWayinOf('laptop'), TH.passkeyWayinOf('phone')],              true,   'two passkeys, each its own credential'],
  [[TH.wayinOf('passphrase', { wayinkind: 'fingerprint' as never })],      false,  'a wayinkind this version does not know'],
  [[TH.wayinOf('passphrase', { wayinkind: 'passkey' as never })],          false,  "a passphrase's fields under the passkey wayinkind"],
  [[TH.passkeyWayinOf('laptop'), TH.passkeyWayinOf('phone', { credential_id: 'cred-laptop' })], false, 'two passkey wayins for the same credential'],
  [[TH.passkeyWayinOf('laptop', { credential_id: '' })],                  false,  'a passkey with an empty credential_id'],
  [[TH.passkeyWayinOf('laptop', { prf_salt_b64: '' })],                   false,  'a passkey with an empty salt'],
  [[TH.wayinOf('Not_a_label')],                                            true,   'a wayinlabel outside the label grammar: the vault checks the grammar when it adds a way in, and a stored record only needs text'],
  [[TH.wayinOf('passphrase', { salt_b64: '' })],                           false,  'an empty salt'],
  [[TH.wayinOf('passphrase', { wayin_id: '' })],                           false,  'an empty wayin_id'],
  [[TH.wayinOf('passphrase', { device_id: '' })],                          false,  'an empty device_id'],
  [[TH.passkeyWayinOf('laptop', { registered_at: 1_792_022_400 })],       false,  'a registered_at in epoch seconds'],
  [[TH.wayinOf('passphrase', { vault_key_epoch: 0 })],                     false,  'a vaultKey epoch of zero'],
  [[TH.wayinOf('passphrase', { vault_key_epoch: 2 })],                     true,   "a wayin at another vaultKey epoch than the vault props': a damaged way in, which an unlock passes over"],
] as const

describe("VaultProps.wayins", () => {
  for (const [wayins, expected, blurb] of WayinListCases) {
    it(blurb, () => { expect(VaultProps.safeParse({ ...TH.vaultPropsOf('u1'), wayins }).success).to.eq(expected) })
  }
})

describe("VaultProps", () => {
  for (const [candidate, expected, blurb] of VaultPropsCases) {
    it(blurb, () => { expect(VaultProps.safeParse(candidate).success).to.eq(expected) })
  }
})

const SidecarCases = [
  // any JSON value:
  [{ note: "work account" },          true,   'a plain object, the common case'],
  [{},                                true,   'an empty sidecar'],
  ["work account",                    true,   'a string'],
  [null,                              true,   'null, a JSON value'],
  [[1, "two", { three: 3 }],          true,   'an array, nested as deep as it likes'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
  [{ when: new Date() },              false,  'a Date would silently flatten to {}'],
  [{ count: NaN },             false,  'NaN would silently become null'],
  [() => 'nope',                      false,  'a function is not data'],
] as const

describe("Sidecar", () => {
  for (const [candidate, expected, blurb] of SidecarCases) {
    it(blurb, () => { expect(Sidecar.safeParse(candidate).success).to.eq(expected) })
  }

  it("passes the examples its doc block shows", () => {
    expect(Sidecar.parse({ note: 'work account', project: 'atlas' })).to.deep.equal({ note: 'work account', project: 'atlas' })
    expect(Sidecar.safeParse({ when: new Date() }).success).to.be.false
    expect(Sidecar.safeParse(undefined).success).to.be.false
  })
})

const wholeSummary = { boxlabel: 'anthropic', revision_tok: 'r1', vault_key_epoch: 1, sidecar: {}, registered_at: Date.UTC(2026, 9, 14), written_at: Date.UTC(2026, 9, 14) }

describe("LockboxSummary", () => {
  it("marks a summary undamaged, as its example shows", () => {
    expect(LockboxSummary.parse(wholeSummary).damaged).to.be.false
  })

  it("takes a sidecar of any JSON, and refuses a summary without one", () => {
    expect(LockboxSummary.safeParse({ ...wholeSummary, sidecar: { note: 'work account' } }).success).to.be.true
    expect(LockboxSummary.safeParse({ ...wholeSummary, sidecar: [1, 2] }).success).to.be.true
    expect(LockboxSummary.safeParse(TH.omitting(wholeSummary, 'sidecar')).success).to.be.false
  })

  it("holds neither ciphered field, the format nor the codec: a whole lockbox is not a summary", () => {
    const summary = LockboxSummary.parse({ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar: {} })
    expect(Object.keys(summary)).to.have.members(['boxlabel', 'revision_tok', 'vault_key_epoch', 'sidecar', 'registered_at', 'written_at', 'damaged'])
  })
})

describe("FarFuture", () => {
  it("is the microsecond epochalypse: the last millisecond whose epoch microseconds are a safe integer", () => {
    expect(FarFuture).to.eq(Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    expect(Number.isSafeInteger(FarFuture * 1000)).to.be.true
    expect(Number.isSafeInteger((FarFuture + 1) * 1000)).to.be.false
  })

  it("falls in 2255, a valid Date", () => {
    expect(new Date(FarFuture).toISOString()).to.eq('2255-06-05T23:47:34.740Z')
  })

  it("lets a host show 'until locked' for a deadline equal to it, and a date for any other", () => {
    const shown = (askPassphraseAt: number): string => (askPassphraseAt === FarFuture ? 'until locked' : new Date(askPassphraseAt).toISOString())
    expect(shown(FarFuture)).to.eq('until locked')
    expect(shown(Date.UTC(2026, 9, 22))).to.eq('2026-10-22T00:00:00.000Z')
  })
})

describe("ForeverMillis", () => {
  it("runs from FarPast to FarFuture, as its examples show", () => {
    expect(ForeverMillis).to.eq(FarFuture - FarPast)
    expect(FarPast + ForeverMillis).to.eq(FarFuture)
  })
})

describe("Lease", () => {
  it("takes a user_id of any length, and refuses one that is not text", async () => {
    const lease = await TH.leaseOf('u'.repeat(1000))
    expect(Lease.safeParse(lease).success).to.be.true
    expect(Lease.safeParse({ ...lease, user_id: 42 }).success).to.be.false
  })
})

describe("FarPast", () => {
  it("is the first instant of 1981", () => {
    expect(FarPast).to.eq(Date.UTC(1981, 0, 1))
    expect(new Date(FarPast).toISOString()).to.eq('1981-01-01T00:00:00.000Z')
  })
})

const NowMillis = Date.UTC(2026, 9, 15)

const EpochMillisCases = [
  // regular usage:
  [NowMillis,                     true,   'today, in epoch milliseconds'],
  [FarPast,                   true,   'the floor itself'],
  [FarFuture,                 true,   'the ceiling itself'],
  // unit mistakes:
  [NowMillis / 1000,              false,  'epoch seconds, which land in January 1970'],
  [NowMillis * 1000,              false,  'epoch microseconds, which land tens of thousands of years out'],
  // edge cases:
  [FarPast - 1,               false,  'one millisecond before 1981'],
  [FarFuture + 1,             false,  'one millisecond past the ceiling'],
  [8.64e15,                   false,  'the last instant a Date holds, far past the ceiling'],
  [0,                         false,  'the epoch itself'],
  [NowMillis + 0.5,               false,  'a fraction of a millisecond'],
  [Infinity,                  false,  'a time that never comes'],
  [NaN,                       false,  'not a number'],
  ["1792022400000",           false,  'a time written as text'],
  [null,                      false,  'null'],
] as const

describe("EpochMillis", () => {
  for (const [candidate, expected, blurb] of EpochMillisCases) {
    it(`${expected ? 'accepts' : 'refuses'} ${blurb}`, () => {
      expect(EpochMillis.safeParse(candidate).success).to.eq(expected)
    })
  }

  it("says which unit a refused number likely was", () => {
    const tooSmall = EpochMillis.safeParse(NowMillis / 1000)
    const tooLarge = EpochMillis.safeParse(NowMillis * 1000)
    expect(tooSmall.error?.issues[0]?.message).to.match(/epoch seconds/)
    expect(tooLarge.error?.issues[0]?.message).to.match(/epoch microseconds/)
    expect(EpochMillis.safeParse(1e300).error?.issues[0]?.message).to.match(/epoch microseconds/)
    expect(EpochMillis.safeParse(NowMillis + 0.5).error?.issues[0]?.message).to.match(/whole epoch milliseconds/)
  })

  it("passes a time through unchanged, as its examples show", () => {
    expect(EpochMillis.parse(Date.UTC(2026, 9, 15))).to.eq(1_792_022_400_000)
    expect(EpochMillis.safeParse(1_792_022_400).success).to.be.false
    expect(EpochMillis.safeParse(1_792_022_400_000_000).success).to.be.false
    expect(EpochMillis.safeParse(1_792_022_400_000.5).success).to.be.false
    expect(EpochMillis.safeParse(Infinity).success).to.be.false
  })
})

const MarkCases = [
  // regular usage:
  [TH.markOf('u1'),                                               true,   'a whole mark'],
  [TH.markOf('u1', { seen: { unlock_epoch: 40 } }),               true,   'a mark of a vault seen at a later epoch'],
  // refused, as a damaged or foreign record:
  [TH.markOf('u1', { format: 'safebyok-mark-v5' as never }),      false,  'a format this version does not know'],
  [{ ...TH.markOf('u1', { format: 'safebyok-mark-v3' as never }), lock_generation: 0 }, false, 'a mark from before the lock generation went, which reads as none'],
  [TH.markOf('u1', { format: 'safebyok-mark-v2' as never }),      false,  'a mark from before a mark could see no vault, which reads as none'],
  [TH.omitting(TH.markOf('u1'), 'seen'),                          false,  'a mark missing what it has seen'],
  [{ ...TH.markOf('u1'), seen: null },                            false,  'a mark that has seen no vault: the device keeps none'],
  [TH.markOf('u1', { seen: { device_id: '' } }),                  false,  'an empty device_id'],
  [TH.markOf('u1', { seen: { vault_id: '' } }),                   false,  'an empty vault_id'],
  [TH.markOf('u1', { seen: { unlock_epoch: 0 } }),                false,  'an epoch starts at one'],
  [TH.markOf('u1', { seen: { vault_key_epoch: 0 } }),             false,  'a vaultKey epoch starts at one'],
  [{ ...TH.markOf('u1'), seen: { device_id: 'device-one', vault_id: 'vault-id-u1', unlock_epoch: 1 } }, false, 'a mark missing the vaultKey epoch it has seen'],
] as const

describe("DeviceMark", () => {
  for (const [candidate, expected, blurb] of MarkCases) {
    it(blurb, () => { expect(DeviceMark.safeParse(candidate).success).to.eq(expected) })
  }
})

// Every record the package writes to storage, by the schema that checks it. A record whose shape
// changes moves its `format` on (VOCABULARY.md, *format*): each schema is rendered as JSON Schema
// and kept as a snapshot under its own format literal, so a change made without a bump fails here.
// After a bump, the new format's snapshot is written once (`vitest -u`), and the old one goes as
// obsolete: never update the snapshot of a format that stands. A refinement (a `Z.refine`, such
// as the floor's character rules) renders as nothing, so this sees fields, types, optionality and
// the ranges a check states, not every rule.
const StoredRecords = [VaultProps, Lockbox, Lease, DeviceMark] as const

describe("Stored record formats", () => {
  for (const schema of StoredRecords) {
    const format = schema.shape.format.def.values.join(' | ')
    it(format, () => {
      const rendered = Z.toJSONSchema(schema, { unrepresentable: 'any' })
      expect(rendered, `The ${format} record's schema is not the one on record: if its shape changed, bump format, then write the new format's snapshot (vitest -u)`).toMatchSnapshot()
    })
  }
})

import { omit } from 'es-toolkit'
import { describe, expect, it } from 'vitest'
import * as Z from 'zod/mini'
import { BoxRecord } from '../src/box'
import { DeviceMark, Tombstone, EpochMillis, FarFuture, FarPast, ForeverMillis, LeaseRecord, BoxSummary, Sidecar, GatedVaultProps, GatelessVaultProps, VaultProps, VaultScope, Whisper, isGated } from '../src/types'
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
  [null,                              false,  'a bare null: emptying a box is delBox\'s job'],
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
const { passphrase: _passphrase, passkey: _passkey, ...vaultPropsWithoutSlots } = TH.vaultPropsOf('u1')
const { passkey: _noPasskey, ...vaultPropsWithoutPasskey } = TH.vaultPropsOf('u1')
const { gate_epoch: _epoch, ...vaultPropsWithoutEpoch } = TH.vaultPropsOf('u1')
/** The three fields the vault props held their one passphrase in, before it was a way in. */
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
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v7' }, false,  'a format this version does not know'],
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v5', vault_key_epoch: 1, passphrase: { ...TH.wayinOf('passphrase'), vault_key_epoch: 1 } }, false, 'v5 vault props, which carried a vaultKey epoch'],
  [{ ...vaultPropsWithoutSlots, format: 'safebyok-vault-v4', wayins: [{ ...TH.wayinOf('passphrase'), wayin_id: 'wayin-passphrase', wayinlabel: 'passphrase' }] }, false, 'v4 vault props, their ways in a list'],
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v3' }, false,  'vault props from before the prior vaultKey went'],
  [{ ...TH.vaultPropsOf('u1'), gate_epoch: 0 },              false,  'an epoch starts at one'],
  [{ ...TH.vaultPropsOf('u1'), gate_epoch: 1.5 },            false,  'an epoch is a whole number'],
  [{ ...TH.vaultPropsOf('u1'), vault_tok: '' },              false,  'an empty vault_tok'],
  [TH.vaultPropsOf('u'.repeat(101)),                        true,   'a user_id of any length: the validators check names, not the record'],
  [{ ...TH.vaultPropsOf('u1'), vaultlabel: null },           false,  'a vaultlabel that is not text'],
  [{ ...TH.vaultPropsOf('u1'), passphrase: TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv' } as never }) }, false, 'a passphrase missing its ciphertext'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: 1_792_022_400 }, false,  'a registered_at in epoch seconds'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: Infinity },    false,  'a registered_at that never comes'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: OldIso },      false,  'a registered_at as an ISO string'],
  [vaultPropsWithoutTime,                                   false,  'vault props missing their registered_at'],
  [{ ...vaultPropsWithoutTime, created_at: OldIso, updated_at: OldIso }, false, 'vault props from before their time was named registered_at'],
  [{ ...vaultPropsWithoutSlots, ...WayinFieldsOfOld },       false,  'vault props from before their passphrase was a way in'],
  [{ ...vaultPropsWithoutEpoch, passphrase_epoch: 1 },       false,  'vault props from before their epoch was named gate_epoch'],
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v1' }, false, 'vault props from before vaultKey epochs'],
] as const

const SlotCases = [
  // regular usage:
  [{ passkey: null },                                                      true,   'a passphrase and no passkey'],
  [{ passkey: TH.passkeyWayinOf('laptop') },                               true,   'a passphrase and a passkey'],
  // refused, as a damaged or foreign record:
  [{ passphrase: null },                                                   false,  'no passphrase at all'],
  [{ passkey: [TH.passkeyWayinOf('laptop'), TH.passkeyWayinOf('phone')] }, false,  'a list of passkeys where there is room for one'],
  [{ passphrase: TH.passkeyWayinOf('laptop') },                            false,  'a passkey in the passphrase slot'],
  [{ passkey: TH.wayinOf('passphrase') },                                  false,  'a passphrase in the passkey slot'],
  [{ passphrase: TH.wayinOf('passphrase', { wayinkind: 'fingerprint' as never }) }, false, 'a wayinkind this version does not know'],
  [{ passphrase: TH.wayinOf('passphrase', { wayinkind: 'passkey' as never }) },     false, "a passphrase's fields under the passkey wayinkind"],
  [{ passkey: TH.passkeyWayinOf('laptop', { credential_id: '' }) },        false,  'a passkey with an empty credential_id'],
  [{ passkey: TH.passkeyWayinOf('laptop', { prf_salt_b64: '' }) },         false,  'a passkey with an empty salt'],
  [{ passphrase: TH.wayinOf('passphrase', { salt_b64: '' }) },             false,  'an empty salt'],
  [{ passphrase: TH.wayinOf('passphrase', { device_id: '' }) },            false,  'an empty device_id'],
  [{ passkey: TH.passkeyWayinOf('laptop', { registered_at: 1_792_022_400 }) }, false, 'a registered_at in epoch seconds'],
] as const

describe("VaultProps.passphrase and VaultProps.passkey", () => {
  for (const [slots, expected, blurb] of SlotCases) {
    it(blurb, () => { expect(VaultProps.safeParse({ ...TH.vaultPropsOf('u1'), ...slots }).success).to.eq(expected) })
  }

  it("refuses vault props with no passkey field: a vault without one says so with null", () => {
    expect(VaultProps.safeParse(vaultPropsWithoutPasskey).success).to.be.false
  })
})

describe("VaultProps", () => {
  for (const [candidate, expected, blurb] of VaultPropsCases) {
    it(blurb, () => { expect(VaultProps.safeParse(candidate).success).to.eq(expected) })
  }
})

const GatelessCases = [
  // regular usage:
  [TH.gatelessOf('u1'),                                                     true,   "gateless vault props: gate_epoch 0, and no way in, as GatelessVaultProps' example shows"],
  [TH.vaultPropsOf('u1'),                                                   true,   'gated vault props: gate_epoch 1, and a passphrase'],
  // refused, as a damaged record:
  [{ ...TH.gatelessOf('u1'), gate_epoch: 1 },                               false,  'a gated epoch with no passphrase: a gate that lost its way in'],
  [{ ...TH.vaultPropsOf('u1'), gate_epoch: 0 },                             false,  'a passphrase at gate_epoch 0'],
  [{ ...TH.gatelessOf('u1'), passkey: TH.passkeyWayinOf('laptop') },        false,  'a passkey with no gate'],
  [{ ...TH.gatelessOf('u1'), gate_epoch: -1 },                              false,  'a gate_epoch below 0'],
  [omit(TH.gatelessOf('u1'), ['passphrase']),                               false,  'gateless vault props that leave out the passphrase slot, rather than saying null'],
] as const

describe("VaultProps, gated or gateless", () => {
  for (const [candidate, expected, blurb] of GatelessCases) {
    it(blurb, () => { expect(VaultProps.safeParse(candidate).success).to.eq(expected) })
  }

  it("tells the two shapes apart: gateless props are no GatedVaultProps, and gated ones no GatelessVaultProps", () => {
    expect(GatedVaultProps.safeParse(TH.gatelessOf('u1')).success).to.be.false
    expect(GatelessVaultProps.safeParse(TH.vaultPropsOf('u1')).success).to.be.false
  })
})

describe("isGated", () => {
  it("is true for gated vault props and false for gateless ones, as its example tells them apart", () => {
    expect(isGated(TH.vaultPropsOf('u1'))).to.be.true
    expect(isGated(TH.gatelessOf('u1'))).to.be.false
  })
})

const SidecarCases = [
  // a JSON object of any JSON values:
  [{ note: "work account" },          true,   'a plain object, the common case'],
  [{},                                true,   'an empty sidecar'],
  [{ list: [1, "two", { three: 3 }], gone: null }, true, 'an object of any JSON values, nested as deep as it likes'],
  // JSON that is no object is refused:
  ["work account",                    false,  'a string'],
  [null,                              false,  'null'],
  [[1, "two", { three: 3 }],          false,  'an array'],
  [42,                                false,  'a number'],
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
    expect(Sidecar.safeParse('work account').success).to.be.false
  })
})

const wholeSummary = { boxlabel: 'anthropic', revision_tok: 'r1', sidecar: {}, registered_at: Date.UTC(2026, 9, 14), written_at: Date.UTC(2026, 9, 14), vault_tok: 'vault-tok-u1' }

describe("BoxSummary", () => {
  it("marks a summary undamaged, as its example shows", () => {
    expect(BoxSummary.parse(wholeSummary).damaged).to.be.false
  })

  it("takes a sidecar that is a JSON object, and refuses a summary without one, or with one that is no object", () => {
    expect(BoxSummary.safeParse({ ...wholeSummary, sidecar: { note: 'work account' } }).success).to.be.true
    expect(BoxSummary.safeParse({ ...wholeSummary, sidecar: [1, 2] }).success).to.be.false
    expect(BoxSummary.safeParse(TH.omitting(wholeSummary, 'sidecar')).success).to.be.false
  })

  it("holds neither ciphered field, the format nor the codec: a whole box is not a summary", () => {
    const summary = BoxSummary.parse({ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar: {}, vault_tok: 'vault-tok-u1' })
    expect(Object.keys(summary)).to.have.members(['boxlabel', 'revision_tok', 'sidecar', 'registered_at', 'written_at', 'vault_tok', 'damaged'])
  })

  it("refuses a summary with no vault_tok: it names the vault props the box lies under", () => {
    expect(BoxSummary.safeParse(TH.omitting(wholeSummary, 'vault_tok')).success).to.be.false
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

describe("LeaseRecord", () => {
  it("takes a user_id of any length, and refuses one that is not text", async () => {
    const lease = await TH.leaseOf('u'.repeat(1000))
    expect(LeaseRecord.safeParse(lease).success).to.be.true
    expect(LeaseRecord.safeParse({ ...lease, user_id: 42 }).success).to.be.false
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
  [TH.markOf('u1', { seen: { gate_epoch: 40 } }),                 true,   'a mark of a vault seen at a later epoch'],
  // refused, as a damaged or foreign record:
  [TH.markOf('u1', { format: 'safebyok-mark-v6' as never }),      false,  'a format this version does not know'],
  [TH.markOf('u1', { format: 'safebyok-mark-v4' as never }),      false,  'a mark from before the vaultKey epoch went, which reads as none'],
  [{ ...TH.markOf('u1', { format: 'safebyok-mark-v3' as never }), lock_generation: 0 }, false, 'a mark from before the lock generation went, which reads as none'],
  [TH.markOf('u1', { format: 'safebyok-mark-v2' as never }),      false,  'a mark from before a mark could see no vault, which reads as none'],
  [TH.omitting(TH.markOf('u1'), 'seen'),                          false,  'a mark missing what it has seen'],
  [{ ...TH.markOf('u1'), seen: null },                            false,  'a mark that has seen no vault: the device keeps none'],
  [TH.markOf('u1', { seen: { device_id: '' } }),                  false,  'an empty device_id'],
  [TH.markOf('u1', { seen: { vault_tok: '' } }),                  false,  'an empty vault_tok'],
  [TH.markOf('u1', { seen: { gate_epoch: 0 } }),                  false,  'an epoch starts at one'],
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
// Each schema beside its format: the vault props are a union of two shapes under one format.
const StoredRecords = [
  [GatedVaultProps.shape.format, VaultProps],
  [BoxRecord.shape.format, BoxRecord],
  [LeaseRecord.shape.format, LeaseRecord],
  [DeviceMark.shape.format, DeviceMark],
  [Tombstone.shape.format, Tombstone],
] as const

describe("Stored record formats", () => {
  for (const [formatSchema, schema] of StoredRecords) {
    const format = formatSchema.def.values.join(' | ')
    it(format, () => {
      const rendered = Z.toJSONSchema(schema, { unrepresentable: 'any' })
      expect(rendered, `The ${format} record's schema is not the one on record: if its shape changed, bump format, then write the new format's snapshot (vitest -u)`).toMatchSnapshot()
    })
  }
})

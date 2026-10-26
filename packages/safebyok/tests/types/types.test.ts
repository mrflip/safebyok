import { describe, expect, it } from 'vitest'
import * as Zod from 'zod'
import { BoxRecord } from '../../src/box'
import { DeviceRecord, LeaseRecord, BoxSummary, Sidecar, VaultScope, Whisper } from '../../src/types/types'
import { VaultRecord, VaultTombstone } from '../../src/vault-record'
import * as TH from '../test-helpers'

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
  [TH.scopeOf('u'.repeat(100)),                       true,   'a user_id of a hundred characters, the most it holds'],
  // refused, a name failing its check:
  [TH.scopeOf('u'.repeat(101)),                       false,  'a user_id over a hundred characters'],
  [{ ...TH.scopeOf('u1'), applabel: 'Acme: Ünïcode' },  false,  'an applabel that is no label'],
  [{ ...TH.scopeOf('u1'), user_id: '' },              false,  'an empty user_id'],
  [{ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' },  false,  'a vaultlabel holding a control character'],
  [{ ...TH.scopeOf('u1'), applabel: 'cafe\u{301}' },  false,  'an applabel outside ASCII'],
  // refused:
  [{ ...TH.scopeOf('u1'), applabel: 42 },             false,  'an applabel that is not text'],
  [{ applabel: 'acme', user_id: 'u1' },              false,  'a scope missing its vaultlabel'],
] as const

describe("VaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(VaultScope.safeParse(candidate).success).to.eq(expected) })
  }
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

  it("refuses a summary with no vault_tok: it names the vault record the box lies under", () => {
    expect(BoxSummary.safeParse(TH.omitting(wholeSummary, 'vault_tok')).success).to.be.false
  })
})

describe("LeaseRecord", () => {
  it("takes a user_id up to a hundred characters, and refuses a longer one or one that is not text", async () => {
    const lease = await TH.leaseOf('u'.repeat(100))
    expect(LeaseRecord.safeParse(lease).success).to.be.true
    expect(LeaseRecord.safeParse({ ...lease, user_id: 'u'.repeat(101) }).success).to.be.false
    expect(LeaseRecord.safeParse({ ...lease, user_id: 42 }).success).to.be.false
  })
})

const DeviceRecordCases = [
  // regular usage:
  [TH.deviceRecordOf('u1'),                                                 true,   'a whole device record'],
  [TH.deviceRecordOf('u1', { highest_vault_epoch: 40 }),                    true,   'a record of a vault seen at a later epoch'],
  [TH.deviceRecordOf('u1', { highest_vault_epoch: 0 }),                     true,   'a record of a vault seen only at epoch zero'],
  // refused, as a damaged or foreign record:
  [TH.deviceRecordOf('u1', { format: 'safebyok-device-v2' as never }),      false,  'a format this version does not know'],
  [{ format: 'safebyok-mark-v5', ...TH.scopeOf('u1'), seen: { device_id: 'device-one', vault_tok: 'vault-tok-u1', gate_epoch: 1 } }, false, 'a device mark from before the device record, which reads as none'],
  [TH.omitting(TH.deviceRecordOf('u1'), 'device_id'),                       false,  'a record missing its device_id'],
  [TH.deviceRecordOf('u1', { device_id: '' }),                              false,  'an empty device_id'],
  [TH.omitting(TH.deviceRecordOf('u1'), 'highest_vault_epoch'),             false,  'a record missing the epoch it has seen'],
  [TH.deviceRecordOf('u1', { highest_vault_epoch: -1 }),                    false,  'an epoch below zero'],
  [TH.deviceRecordOf('u1', { highest_vault_epoch: 1.5 }),                   false,  'an epoch that is no whole number'],
  [TH.omitting(TH.deviceRecordOf('u1'), 'user_id'),                         false,  'a record that names no user'],
] as const

describe("DeviceRecord", () => {
  for (const [candidate, expected, blurb] of DeviceRecordCases) {
    it(blurb, () => { expect(DeviceRecord.safeParse(candidate).success).to.eq(expected) })
  }
})

// Every record the package writes to storage, by the schema that checks it. A record whose shape
// changes moves its `format` on (VOCABULARY.md, *format*): each schema is rendered as JSON Schema
// and kept as a snapshot under its own format literal, so a change made without a bump fails here.
// After a bump, the new format's snapshot is written once (`vitest -u`), and the old one goes as
// obsolete: never update the snapshot of a format that stands. A refinement (a `.refine`, such
// as the floor's character rules) renders as nothing, so this sees fields, types, optionality and
// the ranges a check states, not every rule. Each is rendered twice. As output, it shows every
// field's shape, a sidecar's JSON among them. As input, a strict record shows
// `additionalProperties: false` and a stripping one does not, which output renders alike: so
// strictness is guarded too.
const StoredRecords = [
  [VaultRecord.shape.format, VaultRecord],
  [BoxRecord.shape.format, BoxRecord],
  [LeaseRecord.shape.format, LeaseRecord],
  [DeviceRecord.unwrap().shape.format, DeviceRecord],
  [VaultTombstone.shape.format, VaultTombstone],
] as const

describe("Stored record formats", () => {
  for (const [formatSchema, schema] of StoredRecords) {
    const format = formatSchema.def.values.join(' | ')
    it(format, () => {
      const rendered = {
        output: Zod.toJSONSchema(schema, { unrepresentable: 'any' }),
        input:  Zod.toJSONSchema(schema, { unrepresentable: 'any', io: 'input' }),
      }
      expect(rendered, `The ${format} record's schema is not the one on record: if its shape changed, bump format, then write the new format's snapshot (vitest -u)`).toMatchSnapshot()
    })
  }

  it("renders a stripping schema apart from a strict one as input, where output renders them alike, so strictness shows in the guard", () => {
    const strict = Zod.object({ field: Zod.string() }).strict()
    const stripping = Zod.object({ field: Zod.string() })
    expect(Zod.toJSONSchema(strict, { io: 'input' })).to.include({ additionalProperties: false })
    expect(Zod.toJSONSchema(stripping, { io: 'input' })).to.not.have.property('additionalProperties')
    expect(Zod.toJSONSchema(stripping)).to.include({ additionalProperties: false })
  })
})

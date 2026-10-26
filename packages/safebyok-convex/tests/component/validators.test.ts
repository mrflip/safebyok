import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import * as Zod from 'zod'
import type { GenericValidator, Infer } from 'convex/values'
import * as Records from 'safebyok'
import type {
  VaultRecordExpectation as CoreVaultRecordExpectation, VaultDelExpectation as CoreVaultDelExpectation, BoxGetExpectation as CoreBoxGetExpectation, BoxExpectation as CoreBoxExpectation,
  BoxDelExpectation as CoreBoxDelExpectation, BoxDeletion as CoreBoxDeletion,
} from 'safebyok'
import {
  VaultRecordExpectation, Ciphered, VaultDelExpectation, ListedBox, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, BoxDeletion, Gate, NovelVaultRecord, VaultRecord, VaultScope,
} from '../../src/component/validators'
import * as TH from '../test-helpers'

/**
 * A record's shape, as both validator libraries can be read: which fields, which optional, and
 * each field's base type. The literal a `format` field allows is part of its shape; so is whether
 * a field may be null, as a vault record's `gate` may.
 */
type Shape =
  | { kind: 'string' | 'number' | 'null' }
  | { kind: 'literal', values: string[] }
  | { kind: 'object', fields: Record<string, { optional: boolean, shape: Shape }> }
  | { kind: 'array', element: Shape }
  | { kind: 'nullable', inner: Shape }
  | { kind: 'record', value: Shape }
  | { kind: 'any' }

/** Zod's half: read from its public `def`, refinements (min, regex, int) set aside. */
type ZodLike = { def: { type: string, values?: unknown[], innerType?: ZodLike, shape?: Record<string, ZodLike>, element?: ZodLike, out?: ZodLike, valueType?: ZodLike } }

const zodShape = (schema: ZodLike): Shape => {
  const { def } = schema
  if (def.type === 'string' || def.type === 'number') { return { kind: def.type } }
  // Null, as Zod's null or as the literal null the core's kit makes it.
  if (def.type === 'null' || (def.type === 'literal' && def.values?.length === 1 && def.values[0] === null)) { return { kind: 'null' } }
  if (def.type === 'literal') { return { kind: 'literal', values: (def.values ?? []).map(String).toSorted((one, two) => one.localeCompare(two)) } }
  if (def.type === 'object') {
    const fields = Object.entries(def.shape ?? {}).map(([ckey, field]) => {
      const optional = field.def.type === 'optional'
      return [ckey, { optional, shape: zodShape(optional && field.def.innerType ? field.def.innerType : field) }] as const
    })
    return { kind: 'object', fields: Object.fromEntries(fields) }
  }
  if (def.type === 'array' && def.element) { return { kind: 'array', element: zodShape(def.element) } }
  if (def.type === 'nullable' && def.innerType) { return { kind: 'nullable', inner: zodShape(def.innerType) } }
  // A box's sidecar: a check the core alone runs, piped into an object of JSON values.
  if (def.type === 'pipe' && def.out) { return zodShape(def.out) }
  if (def.type === 'record' && def.valueType) { return { kind: 'record', value: zodShape(def.valueType) } }
  // A JSON value, which Convex holds as any value: the core alone checks it.
  if (def.type === 'lazy') { return { kind: 'any' } }
  throw new Error(`no shape for a Zod ${def.type}`)
}

/**
 * Convex's half: a union of literals is the set of its values, as a `format` field widens; a
 * union of one validator and null is that validator, nullable.
 */
const convexShape = (validator: GenericValidator): Shape => {
  switch (validator.kind) {
  case 'string':  { return { kind: 'string' } }
  case 'float64': { return { kind: 'number' } }
  case 'null':    { return { kind: 'null' } }
  case 'literal': { return { kind: 'literal', values: [String(validator.value)] } }
  case 'union': {
    const nonNulls = validator.members.filter((member) => member.kind !== 'null')
    if (nonNulls.length === 1 && validator.members.length === 2) { return { kind: 'nullable', inner: convexShape(nonNulls[0]!) } }
    const shapes = validator.members.map((member) => convexShape(member))
    const literals = shapes.filter((shape) => shape.kind === 'literal')
    if (literals.length < shapes.length) { throw new Error('no shape for a union of literals and others') }
    return { kind: 'literal', values: literals.flatMap((shape) => shape.values).toSorted((one, two) => one.localeCompare(two)) }
  }
  case 'array': { return { kind: 'array', element: convexShape(validator.element) } }
  case 'record': { return { kind: 'record', value: convexShape(validator.value) } }
  case 'any':   { return { kind: 'any' } }
  case 'object': {
    const fields = Object.entries(validator.fields).map(([ckey, field]) => (
      [ckey, { optional: field.isOptional === 'optional', shape: convexShape(field) }] as const
    ))
    return { kind: 'object', fields: Object.fromEntries(fields) }
  }
  default: { throw new Error(`no shape for a Convex ${validator.kind}`) }
  }
}

const listedZod = Records.BoxRecord.omit({ box_key_wrapped: true, whisper_ciphered: true })

// A novel vault's record, as `ensureVault` takes it: the core writes it out as a VaultRecord whose
// gate is null, and checks its gate_epoch is 0.
const novelVaultRecordZod = Records.VaultSparse.extend({ gate_epoch: Zod.literal(0), gate: Zod.null() })

const ShapeCases = [
  [Records.Ciphered,     Ciphered,   'Ciphered: the shared encrypted-value shape'],
  [Records.VaultScope.unwrap(), VaultScope, 'VaultScope: what names one vault, which the core hands out frozen'],
  [Records.VaultRecord,  VaultRecord, 'VaultRecord: every field, its gate nested and nullable, the wayins\' ciphered wraps nested in it'],
  [Records.GateRecord,   Gate,       'Gate: the passphrase, and the passkey or null'],
  [novelVaultRecordZod,  NovelVaultRecord, 'NovelVaultRecord: every field, gate_epoch 0 and no gate'],
  [Records.BoxRecord,    BoxRecord,  'BoxRecord: every field, the sidecar as an object of any JSON values, both ciphered fields nested'],
  [listedZod,            ListedBox,  'a listed box: the record without its ciphered fields, format kept'],
] as const

describe("the Convex validators, field for field with the core's Zod records", () => {
  for (const [zodRecord, convexRecord, blurb] of ShapeCases) {
    it(blurb, () => {
      expect(convexShape(convexRecord)).to.deep.equal(zodShape(zodRecord))
    })
  }

  it("type the same records, expectations and summaries as the core", () => {
    expectTypeOf<Records.VaultRecord>().toExtend<Infer<typeof VaultRecord>>()
    expectTypeOf<Infer<typeof NovelVaultRecord>>().toEqualTypeOf<Zod.infer<typeof novelVaultRecordZod>>()
    // The core hands out a scope frozen; Convex's is the same fields, not marked readonly.
    expectTypeOf<Readonly<Infer<typeof VaultScope>>>().toEqualTypeOf<Records.VaultScope>()
    // A box's sidecar is an object of any values to Convex, which the core holds to JSON values on every read.
    // Convex holds what storage holds, a record as it goes into the core's check, before its ciphered fields are branded.
    expectTypeOf<Omit<Infer<typeof BoxRecord>, 'sidecar'>>().toEqualTypeOf<Omit<Zod.input<typeof Records.BoxRecord>, 'sidecar'>>()
    // A listing is the stored record less its ciphered fields, so it is the stored record's shape
    // a listing must meet.
    expectTypeOf<Omit<Infer<typeof ListedBox>, 'sidecar'>>().toEqualTypeOf<Omit<Records.BoxRecord, 'box_key_wrapped' | 'whisper_ciphered' | 'sidecar'>>()
    expectTypeOf<Infer<typeof VaultRecordExpectation>>().toEqualTypeOf<CoreVaultRecordExpectation>()
    expectTypeOf<Infer<typeof BoxGetExpectation>>().toEqualTypeOf<CoreBoxGetExpectation>()
    expectTypeOf<Infer<typeof BoxExpectation>>().toEqualTypeOf<CoreBoxExpectation>()
    expectTypeOf<Infer<typeof VaultDelExpectation>>().toEqualTypeOf<CoreVaultDelExpectation>()
    expectTypeOf<Infer<typeof BoxDelExpectation>>().toEqualTypeOf<CoreBoxDelExpectation>()
    expectTypeOf<Infer<typeof BoxDeletion>>().toEqualTypeOf<CoreBoxDeletion>()
  })
})

// A probe app whose only functions take a record and do nothing: whether a call is refused is
// whether Convex's validator refuses the record.
const probeApp = defineTestApp({ schema: defineSchema({}) })
const { api: probeApi, createTest } = probeApp.defineModules({
  probe: {
    takeVaultRecord: probeApp.mutation({ args: { vaultRecord: VaultRecord }, returns: v.null(), handler: () => null }),
    takeBox: probeApp.mutation({ args: { box: BoxRecord }, returns: v.null(), handler: () => null }),
  },
})

const convexAccepts = async (call: Promise<unknown>): Promise<boolean> => {
  try {
    await call
    return true
  } catch {
    return false
  }
}

const { vault_tok: _vaultTok, ...vaultRecordWithoutVaultTok } = TH.vaultRecordOf('u1')
const { sidecar: _sidecar, ...boxWithoutSidecar } = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _vaultPropsTime, ...vaultRecordWithoutTime } = TH.vaultRecordOf('u1')
const { gate: _gate, ...vaultRecordWithoutWayins } = TH.vaultRecordOf('u1')
const { passkey: _noPasskey, ...gateWithoutPasskey } = TH.gateOf('u1')
const vaultRecordWithoutPasskey = { ...TH.vaultRecordOf('u1'), gate: gateWithoutPasskey }
/** A vault record as this format held it before its gate was nested: the two ways in flat beside its fields. */
const flatVaultRecord = { ...vaultRecordWithoutWayins, ...TH.gateOf('u1') }
/** The three fields the vault record held their one passphrase in, before they held ways in. */
const OldWayinFields = {
  key_deriver_label:            'test_digest_v0',
  // base64 of the literal text 'salt': a fake salt, public material anyway
  passphrase_salt_b64:          'c2FsdA',
  vault_key_passphrase_wrapped: TH.fakeCiphered('old'),
}
const { registered_at: _boxRegistered, written_at: _boxWritten, ...boxWithoutTimes } = TH.boxOf('anthropic_api_key', 'a1')
const boxV3 = { ...boxWithoutTimes, format: 'safebyok-box-v3', registered_at: Date.UTC(2026, 9, 14), changed_at: Date.UTC(2026, 9, 14) }
/** An ISO time, as records stored them before every time became epoch milliseconds. */
const OldIso = '2026-10-14T00:00:00.000Z'

const VaultRecordCases = [
  // both accept:
  [TH.vaultRecordOf('u1'),                                                    true,   true,   'whole vault record'],
  // names are any text to Convex: the client's VaultDB checks them
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop') }) },     true,   true,   'vault record with a passphrase and a passkey'],
  // both refuse -- what Convex can see:
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-vault-v7' },              false,  false,  'a format this package does not know'],
  [{ ...TH.vaultRecordOf('u1'), format: 'safebyok-box-v1' },                false,  false,  "another record's format"],
  [vaultRecordWithoutVaultTok,                                              false,  false,  'vault record missing its vault_tok'],
  [{ ...TH.vaultRecordOf('u1'), gate_epoch: '1' },                          false,  false,  'an epoch written as text'],
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passphrase: TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv' } as never }) }) }, false, false, 'a ciphered wayin missing its ciphertext'],
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passphrase: TH.wayinOf('passphrase', { wayinkind: 'fingerprint' as never }) }) }, false, false, 'a wayinkind this package does not know'],
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passkey: TH.wayinOf('laptop', { wayinkind: 'passkey' as never }) as never }) }, false, false, "a passphrase's fields in the passkey slot"],
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passphrase: TH.passkeyWayinOf('laptop') as never }) },  false,  false,  'a passkey in the passphrase slot'],
  [vaultRecordWithoutPasskey,                                               false,  false,  'a gate with no passkey field: null is written when there is none'],
  [vaultRecordWithoutWayins,                                                false,  false,  'a record with no gate field: null is written while the vault is novel'],
  [flatVaultRecord,                                                         false,  false,  'a record from before its gate was nested, its ways in flat beside its fields'],
  [{ ...vaultRecordWithoutWayins, wayins: [TH.wayinOf('passphrase')] },     false,  false,  'vault record holding a list of wayins, as v4 did'],
  [{ ...vaultRecordWithoutWayins, ...OldWayinFields },                        false,  false,  'vault record from before its wayins were a list'],
  [{ ...TH.vaultRecordOf('u1'), registered_at: null },                        false,  false,  'a null registered_at'],
  [{ ...TH.vaultRecordOf('u1'), registered_at: '2026-10-14T00:00:00.000Z' },  false,  false,  'a registered_at as an ISO string'],
  [{ ...vaultRecordWithoutTime, created_at: OldIso, updated_at: OldIso },     false,  false,  'vault record from before its time was named registered_at'],
  // Both refuse: a stored record is strict, so a field neither record has never reaches storage.
  [{ ...TH.vaultRecordOf('u1'), passphrase_text: 'not-a-real-passphrase' },   false,  false,  'a field the record does not have'],
  // Zod refuses, Convex accepts -- the finer rules are the client's:
  [{ ...TH.vaultRecordOf('u1'), vault_tok: '' },                              false,  true,   'an empty vault_tok'],
  [{ ...TH.vaultRecordOf('u1'), gate_epoch: 0 },                              false,  true,   'a gate at gate_epoch 0: the rule across the two is the client\'s'],
  [{ ...TH.gatelessOf('u1'), gate_epoch: 1 },                                false,  true,   'no gate at gate_epoch 1'],
  [{ ...TH.vaultRecordOf('u1'), gate_epoch: 1.5 },                            false,  true,   'a fractional epoch'],
  [{ ...TH.vaultRecordOf('u1'), registered_at: 1_792_022_400 },               false,  true,   'a registered_at in epoch seconds, before 1981'],
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passphrase: TH.wayinOf('passphrase', { salt_b64: '' as never }) }) }, false, true, 'a passphrase with an empty salt'],
  [{ ...TH.vaultRecordOf('u1'), gate: TH.gateOf('u1', { passkey: TH.passkeyWayinOf('laptop', { credential_id: '' }) }) }, false, true, 'a passkey with an empty credential_id'],
] as const

const BoxCases = [
  // both accept:
  [TH.boxOf('anthropic_api_key', 'a1'),                                      true,   true,   'a whole box'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar: {} },                 true,   true,   'a box with an empty sidecar'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar: { list: ['a', 1, { beta: true }], gone: null } }, true, true, 'a box with a sidecar of any JSON values'],
  // both refuse:
  [boxWithoutSidecar,                                                        false,  false,  'a box with no sidecar: one is always written'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_codec: 'json_v2' },     false,  false,  'a whisper codec neither knows'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_schema_version: 2 },    false,  false,  'a whisper schema version neither knows'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-box-v2' },    false,  false,  'a box from before the sidecar'],
  [boxV3,                                                                    false,  false,  'a box from before written_at, holding changed_at'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-vault-v1' },  false,  false,  "another record's format"],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_ciphered: 'ct-flat' },  false,  false,  'a whisper ciphered as bare text, not a wayin'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), written_at: '1792022400000' },  false,  false,  'a written_at written as text'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso },           false,  false,  'a box from before its times were named registered_at and changed_at'],
  // Zod refuses, Convex accepts:
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar: { note: undefined } }, false, true,   'a sidecar holding what JSON cannot carry'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), revision_tok: '' },             false,  true,   'an empty revision_tok'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), written_at: Infinity },         false,  true,   'a written_at that never comes'],
  [{ ...TH.boxOf('مفتاح العمل', 'a1') },                                    false,  true,   'a boxlabel that is no label: the name rules are the client\'s'],
] as const

describe("the Convex validators, against the core's Zod records, record by record", () => {
  for (const [vaultRecord, zodOk, convexOk, blurb] of VaultRecordCases) {
    it(`vault record: ${blurb}`, async () => {
      expect(Records.VaultRecord.safeParse(vaultRecord).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeVaultRecord, { vaultRecord: vaultRecord as never }))).to.eq(convexOk)
    })
  }

  for (const [box, zodOk, convexOk, blurb] of BoxCases) {
    it(`box: ${blurb}`, async () => {
      expect(Records.BoxRecord.safeParse(box).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeBox, { box: box as never }))).to.eq(convexOk)
    })
  }

  it("box: a sidecar that is no object -- null, an array, text -- is refused by both: by Zod, and by Convex's record validator, which a deployment runs and convex-test does not", () => {
    for (const sidecar of [null, ['a', 1], 'work account']) {
      expect(Records.BoxRecord.safeParse({ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar }).success).to.be.false
    }
    expect(BoxRecord.fields.sidecar.kind).to.eq('record')
  })
})

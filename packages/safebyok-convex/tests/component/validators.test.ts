import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import * as Z from 'zod/mini'
import type { GenericValidator, Infer } from 'convex/values'
import * as Records from 'safebyok'
import type {
  VaultPropsExpectation as CoreVaultPropsExpectation, VaultDelExpectation as CoreVaultDelExpectation, BoxExpectation as CoreBoxExpectation,
  BoxDelExpectation as CoreBoxDelExpectation, BoxDeletion as CoreBoxDeletion,
} from 'safebyok'
import {
  VaultPropsExpectation, Ciphered, VaultDelExpectation, ListedBox, BoxRecord, BoxExpectation, BoxDelExpectation, BoxDeletion, VaultProps, VaultScope,
} from '../../src/component/validators'
import * as TH from '../test-helpers'

/**
 * A record's shape, as both validator libraries can be read: which fields, which optional, and
 * each field's base type. The literal a `format` field allows is part of its shape; so is each
 * member of a union of records, such as the wayins the vault props list.
 */
type Shape =
  | { kind: 'string' | 'number' }
  | { kind: 'literal', values: string[] }
  | { kind: 'object', fields: Record<string, { optional: boolean, shape: Shape }> }
  | { kind: 'array', element: Shape }
  | { kind: 'union', members: Shape[] }

/** Zod's half: read from its public `def`, refinements (min, regex, int) set aside. */
type ZodLike = { def: { type: string, values?: unknown[], innerType?: ZodLike, shape?: Record<string, ZodLike>, element?: ZodLike, options?: ZodLike[] } }

const zodShape = (schema: ZodLike): Shape => {
  const { def } = schema
  if (def.type === 'string' || def.type === 'number') { return { kind: def.type } }
  if (def.type === 'literal') { return { kind: 'literal', values: (def.values ?? []).map(String).toSorted((one, two) => one.localeCompare(two)) } }
  if (def.type === 'object') {
    const fields = Object.entries(def.shape ?? {}).map(([ckey, field]) => {
      const optional = field.def.type === 'optional'
      return [ckey, { optional, shape: zodShape(optional && field.def.innerType ? field.def.innerType : field) }] as const
    })
    return { kind: 'object', fields: Object.fromEntries(fields) }
  }
  if (def.type === 'array' && def.element) { return { kind: 'array', element: zodShape(def.element) } }
  if (def.type === 'union' && def.options) { return { kind: 'union', members: def.options.map((option) => zodShape(option)) } }
  throw new Error(`no shape for a Zod ${def.type}`)
}

/** Convex's half: a union of literals is the set of its values, as a `format` field widens. */
const convexShape = (validator: GenericValidator): Shape => {
  switch (validator.kind) {
  case 'string':  { return { kind: 'string' } }
  case 'float64': { return { kind: 'number' } }
  case 'literal': { return { kind: 'literal', values: [String(validator.value)] } }
  case 'union': {
    const shapes = validator.members.map((member) => convexShape(member))
    const literals = shapes.filter((shape) => shape.kind === 'literal')
    if (literals.length === 0) { return { kind: 'union', members: shapes } }
    if (literals.length < shapes.length) { throw new Error('no shape for a union of literals and others') }
    return { kind: 'literal', values: literals.flatMap((shape) => shape.values).toSorted((one, two) => one.localeCompare(two)) }
  }
  case 'array': { return { kind: 'array', element: convexShape(validator.element) } }
  case 'object': {
    const fields = Object.entries(validator.fields).map(([ckey, field]) => (
      [ckey, { optional: field.isOptional === 'optional', shape: convexShape(field) }] as const
    ))
    return { kind: 'object', fields: Object.fromEntries(fields) }
  }
  default: { throw new Error(`no shape for a Convex ${validator.kind}`) }
  }
}

const listedZod = Z.omit(Records.BoxRecord, { box_key_wrapped: true, whisper_ciphered: true })

const ShapeCases = [
  [Records.Ciphered,     Ciphered,   'Ciphered: the shared encrypted-value shape'],
  [Records.VaultScope,   VaultScope, 'VaultScope: what names one vault'],
  [Records.VaultProps,   VaultProps,   'VaultProps: every field, each wayin and its ciphered wrap nested'],
  [Records.BoxRecord,    BoxRecord,  'BoxRecord: every field, the sidecar as JSON text, both ciphered fields nested'],
  [listedZod,            ListedBox,  'a listed box: the record without its ciphered fields, format kept'],
] as const

describe("the Convex validators, field for field with the core's Zod records", () => {
  for (const [zodRecord, convexRecord, blurb] of ShapeCases) {
    it(blurb, () => {
      expect(convexShape(convexRecord)).to.deep.equal(zodShape(zodRecord))
    })
  }

  it("type the same records, expectations and summaries as the core", () => {
    expectTypeOf<Infer<typeof VaultProps>>().toEqualTypeOf<Records.VaultProps>()
    expectTypeOf<Infer<typeof VaultScope>>().toEqualTypeOf<Records.VaultScope>()
    expectTypeOf<Infer<typeof BoxRecord>>().toEqualTypeOf<Records.BoxRecord>()
    // A listing is the stored record less its ciphered fields; the core's summary of it parses
    // the sidecar's JSON, so it is the stored record's shape a listing must meet.
    expectTypeOf<Infer<typeof ListedBox>>().toEqualTypeOf<Omit<Records.BoxRecord, 'box_key_wrapped' | 'whisper_ciphered'>>()
    expectTypeOf<Infer<typeof VaultPropsExpectation>>().toEqualTypeOf<CoreVaultPropsExpectation>()
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
    takeVaultProps: probeApp.mutation({ args: { vaultProps: VaultProps }, returns: v.null(), handler: () => null }),
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

const { vault_id: _vaultId, ...vaultPropsWithoutVaultId } = TH.vaultPropsOf('u1')
const { sidecar_json: _sidecarJson, ...boxWithoutSidecar } = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _vaultPropsTime, ...vaultPropsWithoutTime } = TH.vaultPropsOf('u1')
const { wayins: _wayins, ...vaultPropsWithoutWayins } = TH.vaultPropsOf('u1')
/** The three fields the vault props held their one passphrase in, before `wayins`. */
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

const VaultPropsCases = [
  // both accept:
  [TH.vaultPropsOf('u1'),                                                    true,   true,   'whole vault props'],
  // names are any text to both: the vault's validators check them, client side
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.wayinOf('passphrase'), TH.passkeyWayinOf('laptop')] }, true, true, 'vault props with a passphrase and a passkey'],
  // both refuse -- what Convex can see:
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-vault-v5' },              false,  false,  'a format this package does not know'],
  [{ ...TH.vaultPropsOf('u1'), format: 'safebyok-box-v1' },                false,  false,  "another record's format"],
  [vaultPropsWithoutVaultId,                                               false,  false,  'vault props missing their vault_id'],
  [{ ...TH.vaultPropsOf('u1'), unlock_epoch: '1' },                        false,  false,  'an epoch written as text'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.wayinOf('passphrase', { vault_key_wayin_wrapped: { cipher_iv_b64: 'iv' } as never })] }, false, false, 'a ciphered wayin missing its ciphertext'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.wayinOf('passphrase', { wayinkind: 'fingerprint' as never })] }, false, false, 'a wayinkind this package does not know'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.wayinOf('passphrase', { wayinkind: 'passkey' as never })] }, false, false, "a passphrase's fields under the passkey wayinkind"],
  [{ ...vaultPropsWithoutWayins, ...OldWayinFields },                        false,  false,  'vault props from before their wayins were a list'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: null },                        false,  false,  'a null registered_at'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: '2026-10-14T00:00:00.000Z' },  false,  false,  'a registered_at as an ISO string'],
  [{ ...vaultPropsWithoutTime, created_at: OldIso, updated_at: OldIso },     false,  false,  'vault props from before their time was named registered_at'],
  // Convex refuses, Zod strips: a field neither record has never reaches storage.
  [{ ...TH.vaultPropsOf('u1'), passphrase: 'not-a-real-passphrase' },        true,   false,  'a field the record does not have'],
  // Zod refuses, Convex accepts -- the finer rules are the client's:
  [{ ...TH.vaultPropsOf('u1'), vault_id: '' },                               false,  true,   'an empty vault_id'],
  [{ ...TH.vaultPropsOf('u1'), unlock_epoch: 0 },                            false,  true,   'an epoch of zero'],
  [{ ...TH.vaultPropsOf('u1'), unlock_epoch: 1.5 },                          false,  true,   'a fractional epoch'],
  [{ ...TH.vaultPropsOf('u1'), registered_at: 1_792_022_400 },               false,  true,   'a registered_at in epoch seconds, before 1981'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [] },                                 false,  true,   'a vault with no way in'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.wayinOf('one'), TH.wayinOf('one', { wayin_id: 'wayin-two' })] }, false, true, 'two ways in sharing a wayinlabel'],
  [{ ...TH.vaultPropsOf('u1'), wayins: [TH.passkeyWayinOf('one'), TH.passkeyWayinOf('two', { credential_id: 'cred-one' })] }, false, true, 'two passkeys for the same credential'],
] as const

const BoxCases = [
  // both accept:
  [TH.boxOf('anthropic_api_key', 'a1'),                                      true,   true,   'a whole box'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar_json: '{}' },          true,   true,   'a box with an empty sidecar'],
  [{ ...TH.boxOf('مفتاح العمل', 'a1') },                                    true,   true,   'a boxlabel of any text'],
  // both refuse:
  [boxWithoutSidecar,                                                        false,  false,  'a box with no sidecar: one is always written'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar_json: { note: 'x' } },  false,  false,  'a sidecar stored as an object, not its JSON'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_codec: 'json_v2' },     false,  false,  'a whisper codec neither knows'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_schema_version: 2 },    false,  false,  'a whisper schema version neither knows'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-box-v2' },    false,  false,  'a box from before the sidecar'],
  [boxV3,                                                                    false,  false,  'a box from before written_at, holding changed_at'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-vault-v1' },  false,  false,  "another record's format"],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_ciphered: 'ct-flat' },  false,  false,  'a whisper ciphered as bare text, not a wayin'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), written_at: '1792022400000' },  false,  false,  'a written_at written as text'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso },           false,  false,  'a box from before its times were named registered_at and changed_at'],
  // Zod refuses, Convex accepts:
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), sidecar_json: '{"note":' },     false,  true,   'a sidecar that is not JSON'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), revision_tok: '' },             false,  true,   'an empty revision_tok'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), written_at: Infinity },         false,  true,   'a written_at that never comes'],
] as const

describe("the Convex validators, against the core's Zod records, record by record", () => {
  for (const [vaultProps, zodOk, convexOk, blurb] of VaultPropsCases) {
    it(`vaultProps: ${blurb}`, async () => {
      expect(Records.VaultProps.safeParse(vaultProps).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeVaultProps, { vaultProps: vaultProps as never }))).to.eq(convexOk)
    })
  }

  for (const [box, zodOk, convexOk, blurb] of BoxCases) {
    it(`box: ${blurb}`, async () => {
      expect(Records.BoxRecord.safeParse(box).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeBox, { box: box as never }))).to.eq(convexOk)
    })
  }
})

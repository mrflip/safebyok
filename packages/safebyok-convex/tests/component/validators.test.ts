import { describe, expect, expectTypeOf, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
import * as Z from 'zod/mini'
import type { GenericValidator, Infer } from 'convex/values'
import * as Records from 'safebyok'
import type {
  BundleExpectation as CoreBundleExpectation, EraseExpectation as CoreEraseExpectation, LockboxExpectation as CoreLockboxExpectation,
} from 'safebyok'
import {
  BundleExpectation, Ciphered, EraseExpectation, ListedLockbox, Lockbox, LockboxExpectation, VaultBundle, VaultScope,
} from '../../src/component/validators'
import * as TH from '../test-helpers'

/**
 * A record's shape, as both validator libraries can be read: which fields, which optional, and
 * each field's base type. The literal a `format` field allows is part of its shape; so is each
 * member of a union of records, such as the unlock envelopes a bundle lists.
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

const listedZod = Z.omit(Records.Lockbox, { lockbox_key_wrapped: true, whisper_ciphered: true })

const ShapeCases = [
  [Records.Ciphered,     Ciphered,      'Ciphered: the shared encrypted-value shape'],
  [Records.VaultScope,   VaultScope,    'VaultScope: what names one vault'],
  [Records.VaultBundle,  VaultBundle,   'VaultBundle: every field, each unlock envelope and its ciphered wrap nested'],
  [Records.Lockbox,      Lockbox,       'Lockbox: every field, the public bag as JSON text, both ciphered fields nested'],
  [listedZod,            ListedLockbox, 'a listed lockbox: the record without its ciphered fields, format kept'],
] as const

describe("the Convex validators, field for field with the core's Zod records", () => {
  for (const [zodRecord, convexRecord, blurb] of ShapeCases) {
    it(blurb, () => {
      expect(convexShape(convexRecord)).to.deep.equal(zodShape(zodRecord))
    })
  }

  it("type the same records, expectations and summaries as the core", () => {
    expectTypeOf<Infer<typeof VaultBundle>>().toEqualTypeOf<Records.VaultBundle>()
    expectTypeOf<Infer<typeof VaultScope>>().toEqualTypeOf<Records.VaultScope>()
    expectTypeOf<Infer<typeof Lockbox>>().toEqualTypeOf<Records.Lockbox>()
    // A listing is the stored record less its ciphered fields; the core's summary of it parses
    // the public bag's JSON, so it is the stored record's shape a listing must meet.
    expectTypeOf<Infer<typeof ListedLockbox>>().toEqualTypeOf<Omit<Records.Lockbox, 'lockbox_key_wrapped' | 'whisper_ciphered'>>()
    expectTypeOf<Infer<typeof BundleExpectation>>().toEqualTypeOf<CoreBundleExpectation>()
    expectTypeOf<Infer<typeof LockboxExpectation>>().toEqualTypeOf<CoreLockboxExpectation>()
    expectTypeOf<Infer<typeof EraseExpectation>>().toEqualTypeOf<CoreEraseExpectation>()
  })
})

// A probe app whose only functions take a record and do nothing: whether a call is refused is
// whether Convex's validator refuses the record.
const probeApp = defineTestApp({ schema: defineSchema({}) })
const { api: probeApi, createTest } = probeApp.defineModules({
  probe: {
    takeBundle:  probeApp.mutation({ args: { bundle: VaultBundle }, returns: v.null(), handler: () => null }),
    takeLockbox: probeApp.mutation({ args: { lockbox: Lockbox }, returns: v.null(), handler: () => null }),
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

const { vault_id: _vaultId, ...bundleWithoutVaultId } = TH.bundleOf('u1')
const { public_json: _publicJson, ...boxWithoutBag } = TH.boxOf('anthropic_api_key', 'a1')
const { registered_at: _bundleTime, ...bundleWithoutTime } = TH.bundleOf('u1')
const { unlocks: _unlocks, ...bundleWithoutUnlocks } = TH.bundleOf('u1')
/** The three fields a bundle held its one passphrase in, before `unlocks`. */
const OldEnvelopeFields = {
  key_deriver_label:            'test_digest_v0',
  // base64 of the literal text 'salt': a fake salt, public material anyway
  passphrase_salt_b64:          'c2FsdA',
  vault_key_passphrase_wrapped: TH.fakeCiphered('old'),
}
const { registered_at: _boxRegistered, changed_at: _boxChanged, ...boxWithoutTimes } = TH.boxOf('anthropic_api_key', 'a1')
/** An ISO time, as records stored them before every time became epoch milliseconds. */
const OldIso = '2026-10-14T00:00:00.000Z'

const BundleCases = [
  // both accept:
  [TH.bundleOf('u1'),                                                        true,   true,   'a whole bundle'],
  // names are any text to both: the vault's validators check them, client side
  [{ ...TH.bundleOf('u1'), unlocks: [TH.envelopeOf('passphrase'), TH.passkeyEnvelopeOf('laptop')] }, true, true, 'a bundle with a passphrase and a passkey'],
  // both refuse -- what Convex can see:
  [{ ...TH.bundleOf('u1'), format: 'safebyok-vault-v3' },                    false,  false,  'a format this package does not know'],
  [{ ...TH.bundleOf('u1'), format: 'safebyok-lockbox-v1' },                  false,  false,  "another record's format"],
  [bundleWithoutVaultId,                                                     false,  false,  'a bundle missing its vault_id'],
  [{ ...TH.bundleOf('u1'), unlock_epoch: '1' },                              false,  false,  'an epoch written as text'],
  [{ ...TH.bundleOf('u1'), unlocks: [TH.envelopeOf('passphrase', { vault_key_wrapped: { cipher_iv_b64: 'iv' } as never })] }, false, false, 'a ciphered envelope missing its ciphertext'],
  [{ ...TH.bundleOf('u1'), unlocks: [TH.envelopeOf('passphrase', { method: 'fingerprint' as never })] }, false, false, 'an unlock method this package does not know'],
  [{ ...TH.bundleOf('u1'), unlocks: [TH.envelopeOf('passphrase', { method: 'passkey' as never })] }, false, false, "a passphrase's fields under the passkey method"],
  [{ ...bundleWithoutUnlocks, ...OldEnvelopeFields },                     false,  false,  'a bundle from before its unlocks were a list of envelopes'],
  [{ ...TH.bundleOf('u1'), registered_at: null },                            false,  false,  'a null registered_at'],
  [{ ...TH.bundleOf('u1'), registered_at: '2026-10-14T00:00:00.000Z' },      false,  false,  'a registered_at as an ISO string'],
  [{ ...bundleWithoutTime, created_at: OldIso, updated_at: OldIso },         false,  false,  'a bundle from before its time was named registered_at'],
  // Convex refuses, Zod strips: a field neither record has never reaches storage.
  [{ ...TH.bundleOf('u1'), passphrase: 'not-a-real-passphrase' },            true,   false,  'a field the record does not have'],
  // Zod refuses, Convex accepts -- the finer rules are the client's:
  [{ ...TH.bundleOf('u1'), vault_id: '' },                                   false,  true,   'an empty vault_id'],
  [{ ...TH.bundleOf('u1'), unlock_epoch: 0 },                                false,  true,   'an epoch of zero'],
  [{ ...TH.bundleOf('u1'), unlock_epoch: 1.5 },                              false,  true,   'a fractional epoch'],
  [{ ...TH.bundleOf('u1'), registered_at: 1_792_022_400 },                   false,  true,   'a registered_at in epoch seconds, before 1981'],
  [{ ...TH.bundleOf('u1'), unlocks: [] },                                    false,  true,   'a vault with no way in'],
  [{ ...TH.bundleOf('u1'), unlocks: [TH.envelopeOf('one'), TH.envelopeOf('one', { unlock_id: 'unlock-two' })] }, false, true, 'two ways in sharing an unlocklabel'],
  [{ ...TH.bundleOf('u1'), unlocks: [TH.passkeyEnvelopeOf('one'), TH.passkeyEnvelopeOf('two', { credential_id: 'cred-one' })] }, false, true, 'two passkeys for the same credential'],
] as const

const LockboxCases = [
  // both accept:
  [TH.boxOf('anthropic_api_key', 'a1'),                                      true,   true,   'a whole lockbox'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), public_json: '{}' },           true,   true,   'a lockbox with an empty public bag'],
  [{ ...TH.boxOf('مفتاح العمل', 'a1') },                                    true,   true,   'a boxlabel of any text'],
  // both refuse:
  [boxWithoutBag,                                                            false,  false,  'a lockbox with no public bag: one is always written'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), public_json: { note: 'x' } },   false,  false,  'a public bag stored as an object, not its JSON'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_codec: 'json_v2' },     false,  false,  'a whisper codec neither knows'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_schema_version: 2 },    false,  false,  'a whisper schema version neither knows'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-lockbox-v2' }, false, false,  'a lockbox from before the public bag'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), format: 'safebyok-vault-v1' },  false,  false,  "another record's format"],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), whisper_ciphered: 'ct-flat' },  false,  false,  'a whisper ciphered as bare text, not an envelope'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), changed_at: '1792022400000' },  false,  false,  'a changed_at written as text'],
  [{ ...boxWithoutTimes, created_at: OldIso, updated_at: OldIso },           false,  false,  'a lockbox from before its times were named registered_at and changed_at'],
  // Zod refuses, Convex accepts:
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), public_json: '{"note":' },      false,  true,   'a public bag that is not JSON'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), revision_id: '' },              false,  true,   'an empty revision_id'],
  [{ ...TH.boxOf('anthropic_api_key', 'a1'), changed_at: Infinity },         false,  true,   'a changed_at that never comes'],
] as const

describe("the Convex validators, against the core's Zod records, record by record", () => {
  for (const [bundle, zodOk, convexOk, blurb] of BundleCases) {
    it(`bundle: ${blurb}`, async () => {
      expect(Records.VaultBundle.safeParse(bundle).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeBundle, { bundle: bundle as never }))).to.eq(convexOk)
    })
  }

  for (const [lockbox, zodOk, convexOk, blurb] of LockboxCases) {
    it(`lockbox: ${blurb}`, async () => {
      expect(Records.Lockbox.safeParse(lockbox).success).to.eq(zodOk)
      expect(await convexAccepts(createTest().mutation(probeApi.probe.takeLockbox, { lockbox: lockbox as never }))).to.eq(convexOk)
    })
  }
})

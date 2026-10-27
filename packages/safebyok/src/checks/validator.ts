/** `Validator`, where every validator is made: it hands a builder Zod's makers under short names and the shared names, and makes each schema it gets back refuse with a VaultError. */

import * as Zod from 'zod'
import type * as Z from 'zod'
import { VaultError, type RefusalKind } from '../errors'
import * as Phrases from '../phrases'
import { EpochMillis, label, user_id } from './primitives'

// == [Kit]: Kit, KitWith

/** What a `Validator` builder is handed: Zod's makers under short names, its scalars ready made, the names every scope is made of, and `epochMillis`, the instant every time is.
 * An object is strict or loose by its methods, `obj({ ... }).strict()`, and null is `lit(null)`.
 * Bring a maker the kit lacks in by a named import from `zod` beside the call, never the whole of
 * Zod, which would carry every locale it ships into each host's bundle. Judge an object keyed by
 * its input whole, with `custom`: the kit has no record maker, as a record's keys would stand in
 * a refusal's paths.
 */
export const Kit = {
  obj:     Zod.object,
  arr:     Zod.array,
  tuple:   Zod.tuple,
  oneof:   Zod.enum,
  union:   Zod.union,
  discrim: Zod.discriminatedUnion,
  lit:     Zod.literal,
  lazy:    Zod.lazy,
  /** A check Zod has no maker for, as a predicate: a function, a CryptoKey, bytes of one length. */
  custom:  Zod.custom,
  /** A duck of `fields`: an object holding each of them, any of `kin`'s, and nothing else, every field it holds checked whether used or not; parsed to `fields` alone, frozen.
   * So a caller hands in whatever it has that carries them, a Vault object or a record, and the
   * callee takes the fields it asked for. A getter is read for a field it names, and never counts
   * as a field of its own.
   */
  duck:    <FieldsT extends Z.core.$ZodShape>(fields: Z.ZodObject<FieldsT>, kin: Z.ZodObject) => {
    const carrier: Z.ZodType = kin.partial().extend(fields.shape).strict()
    return carrier.pipe(fields.strip().readonly())
  },
  unk:     Zod.unknown(),
  str:     Zod.string(),
  num:     Zod.number(),
  int:     Zod.int(),
  /** A safe integer, 0 or more: an epoch or a count. */
  uint:    Zod.int().nonnegative(),
  bool:    Zod.boolean(),
  label, applabel: label, vaultlabel: label, boxlabel: label, user_id,
  epochMillis: EpochMillis,
} as const

/** The kit a builder gets: {@link Kit}, with the given modules' exports spread in beneath it. */
export type KitWith<SourcesT extends readonly object[]> = Omit<Merged<SourcesT>, keyof typeof Kit> & typeof Kit

/** Every module in `SourcesT` merged into one, a later one's name over an earlier one's. */
type Merged<SourcesT extends readonly object[]> =
  SourcesT extends readonly [infer HeadT extends object, ...infer RestT extends readonly object[]] ? Omit<HeadT, keyof Merged<RestT>> & Merged<RestT> : unknown
// --

// == [Validator]: Validator

/** Make validators: `build` gets the kit and returns its schemas by name, and each comes back refusing `kind` from `parse`.
 * A failed `parse` throws a VaultError of `kind`. Its message names every failing field by its
 * path, up to eight, counting the rest, each with its check's own sentence or Zod's English; its
 * `meta.fieldnames` lists the same fields. For fields an object does not take it says how many,
 * never which, and lists the fields the object takes. It quotes no input, and carries no `cause`.
 *
 * Only `parse` changes. `safeParse` and `parseAsync` are Zod's own, and so is any schema made
 * from a validator outside a `Validator` call (`VaultSparse.pick(...)`): its `parse` throws a
 * ZodError. Make such a slice in a call of its own where it should refuse. A validator nested in
 * another refuses with the outer one's kind.
 *
 * A schema keyed by its input repeats those keys in a refusal: Zod's `record`, or an object's
 * `.catchall()`, puts each key that fails in the path the message and `meta.fieldnames` name.
 * Judge such an object whole with `custom`, as safebyok's own whisper check does.
 *
 * Modules of validators in `sources` (each a star import) are spread into the kit beneath it, so
 * a name the kit gives wins. A bundler keeps or drops a call whole.
 *
 * @example
 *   export const { bankScope, vaultScope } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => {
 *     const bankScope  = obj({ applabel, user_id })
 *     const vaultScope = bankScope.extend({ vaultlabel })
 *     return { bankScope, vaultScope }
 *   })
 *   vaultScope.parse({ applabel: 'acme', user_id: 'u1', vaultlabel: 'Main' })  // throws 'bad_scope', "vaultlabel: A label is ..."
 * @example
 *   export const { BoxRecord, BoxSparse } = Validator('bad_record', ({ obj, str, uint, applabel, user_id, vaultlabel, boxlabel }) => {
 *     const BoxRecord = obj({ applabel, user_id, vaultlabel, boxlabel, written_at: uint, whisper_ciphered: str }).strict()
 *     const BoxSparse = BoxRecord.omit({ whisper_ciphered: true })
 *     return { BoxRecord, BoxSparse }
 *   })
 *   BoxSparse.parse({ ...sparse, note: 'hi' })  // throws 'bad_record', "There is a field it does not take ..."
 * @example
 *   export const { VaultRecord } = Validator('bad_record', ({ obj, uint, applabel, user_id, vaultlabel, GateRecord }) => {
 *     const VaultRecord = obj({ applabel, user_id, vaultlabel, gate_epoch: uint, gate: GateRecord.nullable() }).strict()
 *     return { VaultRecord }
 *   }, [GateChecks])
 */
export const Validator = <ValsT extends Record<string, Z.ZodType>, const SourcesT extends readonly object[] = readonly []>(
  kind: RefusalKind, build: (kit: KitWith<SourcesT>) => ValsT, sources?: SourcesT,
): ValsT => {
  const kit = Object.assign({}, ...(sources ?? []), Kit) as KitWith<SourcesT>
  return Object.fromEntries(Object.entries(build(kit)).map(([valname, schema]) => [valname, refusing(kind, schema)])) as ValsT
}
// --

// == [Refusals]: refusing, InEnglish, English, fieldnamesOf, MaxFailuresSaid, fieldnameOf, sentenceOf, refusalOf

/** `schema`, but for a `parse` that throws a VaultError of `kind` where Zod's would throw its own.
 * It is a clone, a schema of its own over the same definition: Zod binds each schema's own methods
 * to it, so a schema that only inherited them (`Object.create`) would render to JSON Schema as the
 * schema it came from, losing a pipe's or a lazy's place.
 */
const refusing = <SchemaT extends Z.ZodType>(kind: RefusalKind, schema: SchemaT): SchemaT => {
  const wrapped = schema.clone()
  wrapped.parse = (val: unknown): Z.output<SchemaT> => {
    const result = schema.safeParse(val, InEnglish)
    if (result.success) { return result.data }
    throw refusalOf(kind, result.error)
  }
  return wrapped
}

/** Zod's own English for each failure, whatever error map the host set with `z.config`, which could quote the input; and for fields an object does not take, how many, and the fields it does. A sentence a check carries still wins. */
const InEnglish = {
  error: (issue: Z.core.$ZodRawIssue) => (issue.code === 'unrecognized_keys' ? Phrases.unknownFields(issue.keys.length, fieldnamesOf(issue.inst)) : English(issue)),
}

/** Zod's English error map. */
const English = Zod.locales.en().localeError

/** The fields an object schema takes, by its shape: none for any other schema. */
const fieldnamesOf = (schema: unknown): string[] => (schema instanceof Zod.ZodObject ? Object.keys(schema.shape) : [])

/** The most failures a refusal's message names; it counts the rest. */
const MaxFailuresSaid = 8

/** Where one failure is, as a refusal says it: its path's steps joined on `.`, and '' for the input as a whole. */
const fieldnameOf = (issue: Z.core.$ZodIssue): string => issue.path.map(String).join('.')

/** One failure as a refusal says it: where, then Zod's sentence, which names a type, a limit or the values we allow, never the value refused. */
const sentenceOf = (issue: Z.core.$ZodIssue): string => {
  const fieldname = fieldnameOf(issue)
  return fieldname ? `${fieldname}: ${issue.message}` : issue.message
}

/** The refusal for a failed parse: the first {@link MaxFailuresSaid} failures, each where and what, joined, the rest counted, and the fields named in `meta.fieldnames`. */
const refusalOf = (kind: RefusalKind, err: Z.ZodError): VaultError => {
  const issues     = err.issues.slice(0, MaxFailuresSaid)
  const unsaid     = err.issues.length - issues.length
  const sentences  = [...issues.map((issue) => sentenceOf(issue)), ...(unsaid > 0 ? [Phrases.moreFailures(unsaid)] : [])]
  const fieldnames = Object.freeze([...new Set(issues.map((issue) => fieldnameOf(issue)).filter((fieldname) => fieldname !== ''))])
  return new VaultError(kind, sentences.join('; '), { meta: { fieldnames } })
}
// --

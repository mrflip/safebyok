/** `Validator`, where every validator is made: it hands a builder Zod's makers under short names and the shared names, and makes each schema it gets back refuse with a VaultError. */

import * as Zod from 'zod'
import type * as Z from 'zod'
import { VaultError, type RefusalKind } from '../errors'
import * as Phrases from '../phrases'
import { label, user_id } from './primitives'

// == [Kit]: Kit, KitWith

/** What a `Validator` builder is handed: Zod's makers under short names, its scalars ready made, and the names every scope is made of.
 * An object is strict or loose by its methods, `obj({ ... }).strict()`, and null is `lit(null)`.
 * A maker the kit lacks comes in by a named import from `zod` beside the call: the whole of Zod
 * would carry every locale it ships into each host's bundle.
 */
export const Kit = {
  obj:     Zod.object,
  arr:     Zod.array,
  tuple:   Zod.tuple,
  rec:     Zod.record,
  oneof:   Zod.enum,
  union:   Zod.union,
  discrim: Zod.discriminatedUnion,
  lit:     Zod.literal,
  lazy:    Zod.lazy,
  /** A check Zod has no maker for, as a predicate: a function, a CryptoKey, bytes of one length. */
  custom:  Zod.custom,
  unk:     Zod.unknown(),
  str:     Zod.string(),
  num:     Zod.number(),
  int:     Zod.int(),
  /** A safe integer, 0 or more: an epoch or a count. */
  uint:    Zod.int().nonnegative(),
  bool:    Zod.boolean(),
  label, applabel: label, vaultlabel: label, boxlabel: label, user_id,
} as const

/** The kit a builder gets: {@link Kit}, with the given modules' exports spread in beneath it. */
export type KitWith<SourcesT extends readonly object[]> = Omit<Merged<SourcesT>, keyof typeof Kit> & typeof Kit

/** Every module in `SourcesT` merged into one, a later one's name over an earlier one's. */
type Merged<SourcesT extends readonly object[]> =
  SourcesT extends readonly [infer HeadT extends object, ...infer RestT extends readonly object[]] ? Omit<HeadT, keyof Merged<RestT>> & Merged<RestT> : unknown
// --

// == [Validator]: Validator

/** Make validators: `build` gets the kit and returns its schemas by name, and each comes back refusing `kind` from `parse`.
 * A failed `parse` throws a VaultError of `kind`. Its message names every failing field, up to
 * eight, counting the rest, each with its check's own sentence; its `meta.fieldnames` lists the
 * same fields. It quotes no input, and repeats a key only when it is shaped as one of our field
 * names. It carries no `cause`.
 *
 * Only `parse` changes. `safeParse` and `parseAsync` are Zod's own, and so is any schema made
 * from a validator outside a `Validator` call (`vaultRecord.pick(...)`): its `parse` throws a
 * ZodError. Make such a slice in a call of its own where it should refuse. A validator nested in
 * another refuses with the outer one's kind.
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
 *   export const { boxRecord, boxSparse } = Validator('bad_record', ({ obj, str, uint, applabel, user_id, vaultlabel, boxlabel }) => {
 *     const boxRecord = obj({ applabel, user_id, vaultlabel, boxlabel, written_at: uint, whisper_ciphered: str }).strict()
 *     const boxSparse = boxRecord.omit({ whisper_ciphered: true })
 *     return { boxRecord, boxSparse }
 *   })
 *   boxSparse.parse({ ...sparse, note: 'hi' })  // throws 'bad_record', "There is no field note: ..."
 * @example
 *   export const { vaultRecord } = Validator('bad_record', ({ obj, uint, applabel, user_id, vaultlabel, gateRecord }) => {
 *     const vaultRecord = obj({ applabel, user_id, vaultlabel, gate_epoch: uint, gate: gateRecord.nullable() }).strict()
 *     return { vaultRecord }
 *   }, [GateChecks])
 */
export const Validator = <ValsT extends Record<string, Z.ZodType>, const SourcesT extends readonly object[] = readonly []>(
  kind: RefusalKind, build: (kit: KitWith<SourcesT>) => ValsT, sources?: SourcesT,
): ValsT => {
  const kit = Object.assign({}, ...(sources ?? []), Kit) as KitWith<SourcesT>
  return Object.fromEntries(Object.entries(build(kit)).map(([valname, schema]) => [valname, refusing(kind, schema)])) as ValsT
}
// --

// == [Refusals]: refusing, InEnglish, MaxFailuresSaid, MaxSayableChars, SnakeFieldname, CamelFieldname, isSayable, sayable, fieldnameOf, sentenceOf, refusalOf

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

/** Zod's own English for each failure, whatever error map the host set with `z.config`, which could quote the input. A sentence a check carries still wins. */
const InEnglish = { error: Zod.locales.en().localeError }

/** The most failures a refusal's message names; it counts the rest. */
const MaxFailuresSaid = 8

/** The longest name a refusal repeats: longer than any of our field names, shorter than most credentials. */
const MaxSayableChars = 32

/** A field name of ours in snake_case: lowercase words joined by single underscores, each word letters ending in at most three digits (`salt_b64`). */
const SnakeFieldname = /^[a-z]+\d{0,3}(?:_[a-z]+\d{0,3})*$/

/** A field name of ours in camelCase: a lowercase word, then words each opening on a capital, each ending in at most three digits (`maxWhisperBytes`, `vaultDB`). */
const CamelFieldname = /^[a-z]+\d{0,3}(?:[A-Z][a-z]*\d{0,3})*$/

/** True for a key a refusal may repeat: shaped as one of our field names, {@link SnakeFieldname} or {@link CamelFieldname}, and no longer than {@link MaxSayableChars}.
 * A credential (`ghp_` and 36 mixed characters, `sk_live_0Fake...`, `AKIA...`) mixes digits and
 * cases within a word, so it is never repeated: any key not shaped as ours could be the caller's data.
 */
const isSayable = (ckey: string): boolean => ckey.length <= MaxSayableChars && (SnakeFieldname.test(ckey) || CamelFieldname.test(ckey))

/** One step of a failing field's path as a refusal says it: an index, a field name, or a stand-in for a key that may be the caller's data.
 * A check that names a key itself, outside a refusal, says it through this.
 *
 * @example sayable('staleMinute')                        // 'staleMinute'
 * @example sayable('sk_live_0FakeKey9')                  // '(a name not repeated here)'
 */
export const sayable = (step: PropertyKey): string => (
  typeof step === 'number' || (typeof step === 'string' && isSayable(step)) ? String(step) : Phrases.UnsaidName
)

/** Where one failure is, as a refusal says it: its path's steps joined on `.`, and '' for the input as a whole. */
const fieldnameOf = (issue: Z.ZodError['issues'][number]): string => issue.path.map((step) => sayable(step)).join('.')

/** One failure as a refusal says it: where, then what. Zod's own sentences name a type, a limit or the values we allow, never the value refused; an unknown field's name is repeated only when it is shaped as one of ours. */
const sentenceOf = (issue: Z.ZodError['issues'][number]): string => {
  const fieldname = fieldnameOf(issue)
  const sentence  = issue.code === 'unrecognized_keys' ? Phrases.unknownFields(issue.keys.map((fieldname) => sayable(fieldname))) : issue.message
  return fieldname ? `${fieldname}: ${sentence}` : sentence
}

/** The refusal for a failed parse: every failure, up to {@link MaxFailuresSaid}, each where and what, and the fields named in `meta.fieldnames`, quoting no input. */
const refusalOf = (kind: RefusalKind, err: Z.ZodError): VaultError => {
  const issues     = err.issues.slice(0, MaxFailuresSaid)
  const said       = issues.map((issue) => sentenceOf(issue))
  const unsaid     = err.issues.length - said.length
  const sentences  = unsaid > 0 ? [...said, Phrases.moreFailures(unsaid)] : said
  const fieldnames = Object.freeze([...new Set(issues.map((issue) => fieldnameOf(issue)).filter((fieldname) => fieldname !== ''))])
  return new VaultError(kind, sentences.length > 0 ? sentences.join('; ') : Phrases.FailedItsCheck, { meta: { fieldnames } })
}
// --

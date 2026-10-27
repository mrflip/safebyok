/** `Validator`, where every validator is made: it hands a builder Zod's makers under short names and the shared names, and makes each schema it gets back refuse with a VaultError. */

// eslint-disable-next-line no-restricted-imports -- this exercise is written against classic zod; src/ keeps to zod/mini
import * as Zod from 'zod'
import type * as Z from 'zod'
import { VaultError, type RefusalKind } from '../../../../packages/safebyok/src/errors'
import * as Phrases from '../utils/phrases'
import { label, user_id } from './primitives'

/** A refusal's kind: today's, and `bad_scope`, which Phase 1 makes of `bad_label` for a scope's check. */
export type Kind = RefusalKind | 'bad_scope'

/** What a `Validator` builder is handed: Zod's makers under short names, its scalars ready made, and the names every scope is made of. */
export const Kit = {
  /** The whole of Zod, for the rare thing the kit does not alias. */
  zod:     Zod,
  obj:     Zod.object,
  arr:     Zod.array,
  tuple:   Zod.tuple,
  rec:     Zod.record,
  oneof:   Zod.enum,
  union:   Zod.union,
  discrim: Zod.discriminatedUnion,
  lit:     Zod.literal,
  unk:     Zod.unknown(),
  str:     Zod.string(),
  num:     Zod.number(),
  int:     Zod.int(),
  /** A safe integer, 0 or more: an epoch or a count. */
  uint:    Zod.int().nonnegative(),
  bool:    Zod.boolean(),
  label, applabel: label, vaultlabel: label, boxlabel: label, user_id,
} as const

/** The kit a builder gets: {@link Kit}, with the given modules' exports spread in, beneath it. */
export type KitWith<SourcesT extends readonly object[]> = Omit<Merged<SourcesT>, keyof typeof Kit> & typeof Kit

/** Every module in `SourcesT` merged into one, a later one's name over an earlier one's. */
type Merged<SourcesT extends readonly object[]> =
  SourcesT extends readonly [infer HeadT extends object, ...infer RestT extends readonly object[]] ? Omit<HeadT, keyof Merged<RestT>> & Merged<RestT> : unknown

/** Make validators: `build` gets the kit and returns its schemas by name, and each comes back refusing `kind` from `parse`.
 * A failed `parse` throws a VaultError of `kind` whose message names every failing field (up to
 * eight, counting the rest) and each check's own sentence, quoting no input; `safeParse` is Zod's,
 * untouched. Modules of validators in
 * `sources` (each a star import) are spread into the kit beneath it, so a name the kit gives wins.
 * A bundler keeps or drops a call whole.
 *
 * @example
 * export const { vaultScope, boxscope } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel, boxlabel }) => {
 *   const vaultScope = obj({ applabel, user_id, vaultlabel })
 *   const boxscope   = vaultScope.extend({ boxlabel })
 *   return { vaultScope, boxscope }
 * })
 * vaultScope.parse({ applabel: 'acme', user_id: 'u1', vaultlabel: 'Main' })  // throws 'bad_scope', "vaultlabel: A label is ..."
 * @example
 * export const { boxRecord } = Validator('bad_record', ({ obj, boxscope, uint }) => {
 *   const boxRecord = boxscope.extend({ written_at: uint }).strict()
 *   return { boxRecord }
 * }, [CoreChecks])
 */
export const Validator = <ValsT extends Record<string, Z.ZodType>, const SourcesT extends readonly object[] = readonly []>(
  kind: Kind, build: (kit: KitWith<SourcesT>) => ValsT, sources?: SourcesT,
): ValsT => {
  const kit = Object.assign({}, ...(sources ?? []), Kit) as KitWith<SourcesT>
  return Object.fromEntries(Object.entries(build(kit)).map(([name, schema]) => [name, refusing(kind, schema)])) as ValsT
}

/** `schema`, but for a `parse` that throws a VaultError of `kind` where Zod's would throw its own. */
const refusing = <SchemaT extends Z.ZodType>(kind: Kind, schema: SchemaT): SchemaT => {
  const wrapped = Object.create(schema) as SchemaT
  wrapped.parse = (val: unknown): Z.output<SchemaT> => {
    const result = schema.safeParse(val)
    if (result.success) { return result.data }
    throw refusalOf(kind, result.error)
  }
  return wrapped
}

/** The most failures a refusal's message names; it counts the rest. */
const MaxFailuresSaid = 8

/** A name a refusal may repeat: shaped as one of our field names. Any other key could be the caller's data. */
const SayableName = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/

/** One step of a failing field's path as a refusal says it: an index, a field name, or a stand-in for a key that may be the caller's data. */
const sayable = (step: PropertyKey): string => (
  typeof step === 'number' || (typeof step === 'string' && SayableName.test(step)) ? String(step) : Phrases.UnsaidName
)

/** One failure as a refusal says it: where, then what. Zod's own sentences name a type, a limit or the values we allow, never the value refused; an unknown field's name is repeated only when it is shaped as one of ours. */
const sentenceOf = (issue: Z.ZodError['issues'][number]): string => {
  const fieldname = issue.path.map(sayable).join('.')
  const sentence  = issue.code === 'unrecognized_keys' ? Phrases.unknownFields(issue.keys.map(sayable)) : issue.message
  return fieldname ? `${fieldname}: ${sentence}` : sentence
}

/** The refusal for a failed parse: every failure, up to {@link MaxFailuresSaid}, each where and what, quoting no input. */
const refusalOf = (kind: Kind, error: Z.ZodError): VaultError => {
  const said   = error.issues.slice(0, MaxFailuresSaid).map(sentenceOf)
  const unsaid = error.issues.length - said.length
  const sentences = unsaid > 0 ? [...said, Phrases.moreFailures(unsaid)] : said
  return new VaultError(kind as RefusalKind, sentences.length > 0 ? sentences.join('; ') : Phrases.FailedItsCheck)
}

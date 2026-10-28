/** `Validator`, where every validator is made, and the {@link Kit} its builders are handed; and `consistent`, `demandConsistent` and `verifyConsistent`, which hold one bag to another, as a validator's `parseConsistent` does. */

import * as Zod from 'zod'
import type * as Z from 'zod'
import { RefusalKindVals, VaultError, type RefusalKind } from '../errors'
import * as Phrases from '../phrases'
import * as PX from '../shapes/primitives'

// == [Kit]: isBytes, Kit, KitWith, Merged

/** True for a Uint8Array from any realm: judged by its tag, as `instanceof` refuses one made in an iframe or a test's jsdom. */
const isBytes = (candidate: unknown): candidate is Uint8Array => ArrayBuffer.isView(candidate) && Object.prototype.toString.call(candidate) === '[object Uint8Array]'

/** The makers a `Validator` builder is handed: Zod's under short names, its scalars ready made, the scope names, and `epochMillis`.
 * An object is strict or loose by its methods, `obj({ ... }).strict()`, and null is `lit(null)`.
 * Import a maker the kit lacks by name from `zod`, never the whole of Zod: that would carry every
 * locale it ships into the host's bundle. The kit has no record maker, as a record's keys would
 * stand in a refusal's paths; judge an object keyed by its input whole, with `custom`.
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
  /** A check Zod has no maker for, as a predicate: a CryptoKey, bytes of one length. */
  custom:  Zod.custom,
  /** A function, as a host's verb or callback is checked, typed as the one meant: `fn<Clock['now']>()`. Nothing past its being one is judged. */
  fn:      <FnT = (...args: never[]) => unknown>() => Zod.custom<FnT>((candidate) => typeof candidate === 'function', Phrases.FunctionExpected),
  /** Bytes, a Uint8Array, judged by its tag, so bytes from another realm (an iframe, jsdom) pass where `instanceof` would refuse them; `bytes(32)` for exactly that many. */
  bytes:   (count?: number) => Zod.custom<Uint8Array>((candidate) => isBytes(candidate) && (count === undefined || candidate.length === count), Phrases.bytesExpected(count)),
  unk:     Zod.unknown(),
  str:     Zod.string(),
  num:     Zod.number(),
  int:     Zod.int(),
  /** A safe integer, 0 or more: an epoch or a count. */
  uint:    Zod.int().nonnegative(),
  bool:    Zod.boolean(),
  label: PX.label, applabel: PX.label, vaultlabel: PX.label, boxlabel: PX.label, user_id: PX.user_id,
  epochMillis: PX.epochMillis,
} as const

/** The kit a builder gets: {@link Kit}, with the given modules' exports spread in beneath it. */
export type KitWith<SourcesT extends readonly object[]> = Omit<Merged<SourcesT>, keyof typeof Kit> & typeof Kit

/** Every module in `SourcesT` merged into one, a later one's name over an earlier one's: {@link KitWith} is this with the kit laid over it. */
export type Merged<SourcesT extends readonly object[]> =
  SourcesT extends readonly [infer HeadT extends object, ...infer RestT extends readonly object[]] ? Omit<HeadT, keyof Merged<RestT>> & Merged<RestT> : unknown
// --

// == [Validator]: Validator, Refusing

/** Make validators: `build` gets the kit and returns its schemas by name, and each comes back with a `parse` that throws a VaultError of `kind`.
 * The message names each failing field by its path, up to eight, and counts the rest, each with
 * its check's own sentence or Zod's English. `meta.fieldnames` lists the same fields. For fields
 * an object does not take, it says how many, never which, and lists the fields it takes. It quotes
 * no input and carries no `cause`.
 *
 * `parse(val, story?)` frames the message as the {@link Story} asks: `where` the input was
 * judged, before the failures, and `advice`, what to do, after them. With either, the failures
 * end in a period; with neither, the message is the failures alone. A story that is none
 * refuses 'bad_option', whatever the input.
 *
 * Only `parse` changes: `safeParse` and `parseAsync` are Zod's own. A schema sliced from a
 * validator outside a `Validator` call (`vaultSparse.pick(...)`) throws a ZodError; make the slice
 * in a call of its own where it should refuse. A validator nested in another refuses with the
 * outer one's kind.
 *
 * A schema keyed by its input repeats those keys in a refusal: Zod's `record`, or an object's
 * `.catchall()`, puts each failing key in the path. Judge such an object whole with `custom`.
 *
 * A validator of an object also has `parseConsistent(val, other, refusal?)`: it parses `val`,
 * holds the result to `other` as {@link verifyConsistent} does, and returns the result. Where they
 * disagree it refuses `kind`, or the `refusal` given: its `kind`, its `message`, or both.
 *
 * @param sources - Modules of validators, each a star import, spread into the kit beneath it: a
 *   name the kit gives wins. A bundler keeps or drops a call whole.
 *
 * @example
 *   export const { bankScope, vaultScope } = Validator('bad_scope', ({ obj, applabel, user_id, vaultlabel }) => {
 *     const bankScope  = obj({ applabel, user_id })
 *     const vaultScope = bankScope.extend({ vaultlabel })
 *     return { bankScope, vaultScope }
 *   })
 *   vaultScope.parse({ applabel: 'acme', user_id: 'u1', vaultlabel: 'Main' })  // throws 'bad_scope', "vaultlabel: A label is ..."
 *   vaultScope.parse(bag, { where: 'In the bag naming the vault', advice: 'Name it by its vaultlabel.' })  // throws 'bad_scope', "In the bag naming the vault: vaultlabel: A label is <...>. Name it by its vaultlabel."
 *   vaultScope.parseConsistent(box, bank.scope)  // box's scope, once it is the bank's app and user: 'bad_scope' otherwise
 * @example
 *   export const { boxRecord, boxSparse } = Validator('bad_record', ({ obj, str, uint, applabel, user_id, vaultlabel, boxlabel }) => {
 *     const boxRecord = obj({ applabel, user_id, vaultlabel, boxlabel, written_at: uint, whisper_ciphered: str }).strict()
 *     const boxSparse = boxRecord.omit({ whisper_ciphered: true })
 *     return { boxRecord, boxSparse }
 *   })
 *   boxSparse.parse({ ...sparse, note: 'hi' })  // throws 'bad_record', "There is a field it does not take ..."
 * @example
 *   export const { vaultRecord } = Validator('bad_record', ({ obj, uint, applabel, user_id, vaultlabel, gateRecord }) => {
 *     const vaultRecord = obj({ applabel, user_id, vaultlabel, gate_epoch: uint, gate: gateRecord.nullable() }).strict()
 *     return { vaultRecord }
 *   }, [GX])
 */
export const Validator = <ValsT extends Record<string, Z.ZodType>, const SourcesT extends readonly object[] = readonly []>(
  kind: RefusalKind, build: (kit: KitWith<SourcesT>) => ValsT, sources?: SourcesT,
): { [ValnameT in keyof ValsT]: Refusing<ValsT[ValnameT]> } => {
  const kit = Object.assign({}, ...(sources ?? []), Kit) as KitWith<SourcesT>
  return Object.fromEntries(Object.entries(build(kit)).map(([valname, schema]) => [valname, refusing(kind, schema)])) as { [ValnameT in keyof ValsT]: Refusing<ValsT[ValnameT]> }
}

/** A validator a {@link Validator} call makes, what the call returns under each name: its schema, its `parse` also taking a {@link Story}, and for an object, `parseConsistent`. */
export type Refusing<SchemaT extends Z.ZodType> = SchemaT & {
  /** `val`, parsed: the call's kind otherwise, its message framed as `story` asks; 'bad_option' for a story that is none, whatever `val`. */
  parse: (val: unknown, story?: Story) => Z.output<SchemaT>
} & (Z.output<SchemaT> extends object ? {
  /** `val`, parsed, once each field it holds that `other` holds too is `===` to `other`'s: the call's kind otherwise, or `refusal`'s, naming the fields that disagree. A failed parse refuses as `parse` does. */
  parseConsistent: (val: unknown, other: object, refusal?: Partial<ConsistencyRefusal>) => Z.output<SchemaT>
} : unknown)
// --

// == [Refusals]: refusing, InEnglish, English, fieldnamesOf, MaxFailuresSaid, fieldnameOf, sentenceOf, refusalOf, framed

/** A clone of `schema` whose `parse` throws a VaultError of `kind` where Zod's would throw its own, and whose `parseConsistent` parses, then holds the result to another bag. Every schema gets `parseConsistent`; {@link Refusing} types it only on an object's. */
const refusing = <SchemaT extends Z.ZodType>(kind: RefusalKind, schema: SchemaT): Refusing<SchemaT> => {
  const parse = (val: unknown, story?: Story): Z.output<SchemaT> => {
    const framing = story === undefined ? {} : Checks.storyShape.parse(story)
    const result = schema.safeParse(val, InEnglish)
    if (result.success) { return result.data }
    throw refusalOf(kind, result.error, framing)
  }
  const parseConsistent = (val: unknown, other: object, refusal?: Partial<ConsistencyRefusal>): Z.output<SchemaT> => (
    verifyConsistent(parse(val) as Z.output<SchemaT> & object, other, { kind, ...refusal })
  )
  // A clone, not `Object.create`: Zod binds each schema's own methods to it, so a schema that only
  // inherited them would render to JSON Schema as the one it came from, losing a pipe's or a lazy's place.
  return Object.assign(schema.clone(), { parse, parseConsistent }) as Refusing<SchemaT>
}

/** The error map every `parse` runs under: Zod's own English, whatever map the host set with `z.config`, which could quote the input.
 * For fields an object does not take, it says how many and lists the fields it takes. A sentence
 * a check carries still wins.
 */
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

/** The VaultError of `kind` for a failed parse, its message and `meta.fieldnames` as {@link Validator} says, framed as `story` asks. */
const refusalOf = (kind: RefusalKind, err: Z.ZodError, story: Story): VaultError => {
  const issues     = err.issues.slice(0, MaxFailuresSaid)
  const unsaid     = err.issues.length - issues.length
  const sentences  = [...issues.map((issue) => sentenceOf(issue)), ...(unsaid > 0 ? [Phrases.moreFailures(unsaid)] : [])]
  const fieldnames = Object.freeze([...new Set(issues.map((issue) => fieldnameOf(issue)).filter((fieldname) => fieldname !== ''))])
  return new VaultError(kind, framed(sentences.join('; '), story), { meta: { fieldnames } })
}

/** The failures `said`, with `story`'s `where` before them and its `advice` after: with either, the failures end in a period; with neither, they stand alone. */
const framed = (said: string, { where, advice }: Story): string => {
  if (where === undefined && advice === undefined) { return said }
  const led    = where  === undefined ? said : `${where}: ${said}`
  return advice === undefined ? `${led}.` : `${led}. ${advice}`
}
// --

// == [Consistency]: consistent, demandConsistent, verifyConsistent, disagreeing

/** True when `bag` agrees with `other` wherever both make an assertion: each field defined in both (present, and not undefined) is `===`.
 * A field only one of them holds, or holds as undefined, is passed by. The fields compared are
 * `bag`'s own enumerable ones, so `bag` is plain data, a parse's output; `other` may be anything
 * holding fields, a Vault object's getters included, each read by its name. So `other` says what
 * is held to: hand it only the fields meant. An absent field passes, so a value an absent field
 * must fail is parsed first. Either bag not an object refuses 'bad_option'.
 *
 * @example consistent(deviceRecord, scope)   // true when its applabel, user_id and vaultlabel are the scope's
 * @example consistent({ user_id: 'u1', boxlabel: undefined }, { boxlabel: 'openai' })   // true: no field is defined in both
 */
export const consistent = (bag: object, other: object): boolean => disagreeing(bag, other).length === 0

/** True once `bag` is {@link consistent} with `other`: a VaultError of `refusal.kind` otherwise, naming the fields that disagree in `meta.fieldnames`, and in its message unless `refusal.message` says its own.
 * The kind is the caller's to choose, as the caller knows what a disagreement means: a scope of
 * another user, a record of another vault. A `refusal` that is none refuses 'bad_option'.
 *
 * @example demandConsistent(stored, scope, { kind: 'damaged_vault' })   // true, when its applabel, user_id and vaultlabel are the scope's
 * @example demandConsistent({ user_id: 'u2' }, { user_id: 'u1' }, { kind: 'bad_scope', message: (fieldnames) => `This names another ${fieldnames.join(' and ')}` })   // throws 'bad_scope', naming user_id
 */
export const demandConsistent = (bag: object, other: object, refusal: ConsistencyRefusal): true => {
  const { kind, message } = Checks.consistencyRefusalShape.parse(refusal)
  const fieldnames = disagreeing(bag, other)
  if (fieldnames.length === 0) { return true }
  const said = typeof message === 'function' ? message(fieldnames) : message
  throw new VaultError(kind, said ?? Phrases.fieldsDisagree(fieldnames), { meta: { fieldnames } })
}

/** `bag`, once it is {@link consistent} with `other`: refuses as {@link demandConsistent} does. For a bag already parsed; a {@link Refusing}'s `parseConsistent` is this over its `parse`.
 *
 * @example const tombstone = verifyConsistent(answered, scope, { kind: 'corrupt_record' })   // the tombstone, when it is of the scope
 */
export const verifyConsistent = <BagT extends object>(bag: BagT, other: object, refusal: ConsistencyRefusal): BagT => {
  demandConsistent(bag, other, refusal)
  return bag
}

/** The names of the fields `bag` and `other` both define and hold apart, frozen: each bag checked to be an object first. */
const disagreeing = (bag: object, other: object): readonly string[] => {
  const ours = Checks.bag.parse(bag)
  const theirs: Partial<Record<string, unknown>> = Checks.bag.parse(other)
  return Object.freeze(Object.entries(ours)
    .filter(([ckey, val]) => val !== undefined && theirs[ckey] !== undefined && theirs[ckey] !== val)
    .map(([ckey]) => ckey))
}
// --

// == [Checks]: Checks, ConsistencyRefusal, Story

/** The checks this module makes for itself, under one name: `bag`, any object, taken as it is, so a getter still reads; `consistencyRefusalShape`, what a disagreement refuses with; and `storyShape`, the words around a parse's refusal. Made below {@link Validator} and its refusals, which the call needs. */
const Checks = Validator('bad_option', ({ custom, obj, oneof, str, union }) => ({
  bag:                     custom<object>((val) => typeof val === 'object' && val !== null, Phrases.BagNotObject),
  consistencyRefusalShape: obj({
    kind:    oneof(RefusalKindVals),
    message: union([str, custom<(fieldnames: readonly string[]) => string>((val) => typeof val === 'function')]).optional(),
  }).strict(),
  storyShape:              obj({ where: str.optional(), advice: str.optional() }).strict(),
}))

// Each is an interface extending its Z.infer, not a type alias of it: Refusing names both, and
// each is read off a Refusing, a loop TypeScript follows only through an interface's deferred members.
/** What a disagreement refuses with: its `kind`, and its `message`, a sentence or one made from the names of the fields that disagree, never their values. */
export interface ConsistencyRefusal extends Z.infer<typeof Checks.consistencyRefusalShape> {}

/** The words a refusal puts around the failures it names: `where` the input was judged, a lead-in before them (`In Bank.make's options`), and `advice`, what to do, a sentence after them (`Leave it out for the bank's own.`). Neither quotes the input. */
export interface Story extends Z.infer<typeof Checks.storyShape> {}
// --

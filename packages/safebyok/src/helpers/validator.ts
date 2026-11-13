/** The makers of every validator (`Checkers`, `Checker`, `objCheck`, `objStrict`, `objStrip`) and the {@link Kit} they give a builder.
 * `isConsistent`, `demandConsistent` and `checkedConsistent` compare one bag to another.
 */

import * as Zod from 'zod'
import type * as Z from 'zod'
import { refusalkindVals, VaultError, type Refusalkind } from '../refusals/errors'
import * as Phrases from './phrases'
import * as PX from '../shapes/primitives'

// == [Kit]: isBytes, Kit, KitWith, Merged

// Judged by its tag: `instanceof` refuses one made in an iframe or a test's jsdom.
/** True for a Uint8Array from any realm. */
function isBytes(candidate: unknown): candidate is Uint8Array { return ArrayBuffer.isView(candidate) && Object.prototype.toString.call(candidate) === '[object Uint8Array]' }

/** The makers a `Checkers` builder is given: Zod's under short names, its scalars ready made, the label checks and `epochMillis`.
 * Make an object strict with `obj({ ... }).strict()`, and null with `lit(null)`. Import a maker the kit
 * lacks by name from `zod`, never the whole of Zod, which would carry every locale it ships into the
 * host's bundle. The kit has no record maker, as a record's keys would appear in a refusal: judge an
 * object keyed by its input whole, with `custom`.
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
  /** `check`, with null or a value left out read as `fallback`. */
  orDefault: <CheckT extends Zod.ZodType>(check: CheckT, fallback: Zod.output<CheckT>) => check.nullish().transform((given) => given ?? fallback),
  /** A check Zod has no maker for, as a predicate, such as one for a CryptoKey. */
  custom:  Zod.custom,
  /** Any function, typed as the one meant: `fn<KeyDeriver['deriveKeyBytes']>()`. Only that it is a function is checked. */
  fn:      <FnT = (...args: never[]) => unknown>() => Zod.custom<FnT>((candidate) => typeof candidate === 'function', Phrases.FunctionExpected),
  /** A Uint8Array from any realm, an iframe's or jsdom's included. `bytes(32)` checks for exactly that many. */
  bytes:   (count?: number) => Zod.custom<Uint8Array>((candidate) => isBytes(candidate) && (count === undefined || candidate.length === count), Phrases.bytesExpected(count)),
  unk:     Zod.unknown(),
  str:     Zod.string(),
  num:     Zod.number(),
  int:     Zod.int(),
  /** A safe integer, 0 or more: an epoch or a count. */
  uint:    Zod.int().nonnegative(),
  bool:    Zod.boolean(),
  label: PX.label, banklabel: PX.label, vaultlabel: PX.label, boxlabel: PX.label, user_id: PX.user_id,
  epochMillis: PX.epochMillis,
} as const

/** The kit a builder is given: {@link Kit} and the exports of the given modules, the kit's name winning a clash. */
export type KitWith<SourcesT extends readonly object[]> = Omit<Merged<SourcesT>, keyof typeof Kit> & typeof Kit

/** Every module in `SourcesT` merged into one, a later module's name winning a clash. */
export type Merged<SourcesT extends readonly object[]> =
  SourcesT extends readonly [infer HeadT extends object, ...infer RestT extends readonly object[]] ? Omit<HeadT, keyof Merged<RestT>> & Merged<RestT> : unknown
// --

// == [Checkers]: Checkers, Checker, objCheck, objStrict, objStrip, refusalkindOf, kitWith, Refusing

/** Make validators: `build` is given the kit and returns schemas by name, each returned with a `parse` that throws a VaultError of `kind`.
 * The message names each failing field by its path, up to eight, with its check's own sentence or
 * Zod's English, and counts the rest. `meta.fieldnames` lists the same fields. Fields an object does
 * not accept are counted, never named, and the fields it accepts are listed. The refusal quotes no
 * input and carries no `cause`.
 *
 * `parse(val, story?)` puts the {@link Story}'s `where` before the failures and its `advice` after them.
 * Only `parse` changes: `safeParse` and `parseAsync` are Zod's own. A schema sliced from a validator
 * outside a `Checkers` call (`vaultSparse.pick(...)`) throws a ZodError: slice it in a call of its own
 * where it should refuse. A validator nested in another refuses with the outer one's kind.
 *
 * A schema keyed by its input repeats those keys in a refusal: Zod's `record`, or an object's
 * `.catchall()`, puts each failing key in the path. Judge such an object whole, with `custom`.
 *
 * Each validator also has `refusingAs(kind)`, the same validator refusing `kind` instead, so that one
 * tier can take another's validator rather than list its fields twice (`SX.vaultRow.refusingAs('record_conflict')`).
 * A validator of an object also has `parseConsistent(val, other, refusal?)`, which parses `val` and then
 * checks it as {@link checkedConsistent} does, refusing with `kind` or with the `refusal` given.
 *
 * @param sources - Modules of validators, each a star import, added to the kit. A name the kit has wins.
 *
 * @example
 *   export const { bankScope, vaultScope } = Checkers('bad_scope', ({ obj, user_id, banklabel, vaultlabel }) => {
 *     const bankScope  = obj({ user_id, banklabel })
 *     const vaultScope = bankScope.extend({ vaultlabel })
 *     return { bankScope, vaultScope }
 *   })
 *   vaultScope.parse({ user_id: 'u1', banklabel: 'acme', vaultlabel: 'Main' })  // throws 'bad_scope', "vaultlabel: A label is ..."
 *   vaultScope.parse(scope, { where: 'In the scope naming the vault', advice: 'Name it by its vaultlabel.' })  // throws 'bad_scope', "In the scope naming the vault: vaultlabel: A label is <...>. Name it by its vaultlabel."
 *   vaultScope.parseConsistent(box, bank.scope)  // box's scope, once it is the bank's app and user: 'bad_scope' otherwise
 * @example
 *   export const { vaultRecord } = Checkers('bad_record', ({ obj, uint, user_id, banklabel, vaultlabel, gateRecord }) => {
 *     const vaultRecord = obj({ user_id, banklabel, vaultlabel, gate_epoch: uint, gate: gateRecord.nullable() }).strict()
 *     return { vaultRecord }
 *   }, [GateChecks])
 */
export function Checkers<ValsT extends Record<string, Z.ZodType>, const SourcesT extends readonly object[] = readonly []>(
  kind: Refusalkind, build: (kit: KitWith<SourcesT>) => ValsT, sources?: SourcesT,
): { [ValnameT in keyof ValsT]: Refusing<ValsT[ValnameT]> } {
  const vals = build(kitWith(sources))
  return Object.fromEntries(Object.entries(vals).map(([valname, schema]) => [valname, refusing(kind, schema)])) as { [ValnameT in keyof ValsT]: Refusing<ValsT[ValnameT]> }
}

/** Make one validator: `build` is given the kit and returns a schema, returned with a `parse` that throws a VaultError of `kind`.
 * `kind` defaults to `'bad_record'`. It refuses, and takes `sources`, as a {@link Checkers} call does.
 *
 * @example
 *   export const prfSalt = Checker(() => prf_salt_b64.refine((salt) => fromB64OrNull(salt)?.length === PasskeySaltSize, Phrases.prfSaltShape(PasskeySaltSize)), 'bad_record')
 * @example export const callback = Checker(({ fn }) => fn(), 'bad_option')
 */
export function Checker<SchemaT extends Z.ZodType, const SourcesT extends readonly object[] = readonly []>(
  build: (kit: KitWith<SourcesT>) => SchemaT, kind: Refusalkind = 'bad_record', sources?: SourcesT,
): Refusing<SchemaT> { return refusing(kind, build(kitWith(sources))) }

/** Make one validator of an object: `build` is given the kit and returns the object's fields.
 * `opts` is the kind it refuses, or an {@link ObjCheckOpts}. A check of the whole object (`.refine()`,
 * `.readonly()`, a sentence of its own) goes in a {@link Checker} call instead: chained onto this
 * validator, it would throw Zod's own error.
 *
 * @example
 *   export const boxDamaged = objCheck(({ oneof, boxlabel, revision_tok }) => ({
 *     boxlabel,
 *     revision_tok: revision_tok.nullable(),
 *     damage:       oneof(boxDamageVals),
 *   }), 'bad_record', [CX])
 *   boxDamaged.parse({ ...damaged, note: 'hi' })  // throws 'bad_record', "There is a field it does not accept ..."
 * @example
 *   export const boxCiphered = objCheck(({ box_key_wrapped, whisper_ciphered }) => ({
 *     box_key_wrapped,
 *     whisper_ciphered,
 *   }), { refusalkind: 'bad_record', extras: 'strip' }, [CX])
 *   boxCiphered.parse(boxRecord)  // its two ciphered fields, the rest dropped
 */
export function objCheck<ShapeT extends Z.ZodRawShape, const SourcesT extends readonly object[] = readonly []>(
  build: (kit: KitWith<SourcesT>) => ShapeT, opts: Refusalkind | ObjCheckOpts = 'bad_record', sources?: SourcesT,
): Refusing<Z.ZodObject<ShapeT>> {
  const { refusalkind: kind, extras } = Checks.objCheckOpts.parse(typeof opts === 'string' ? { refusalkind: opts } : opts)
  const fields = build(kitWith(sources))
  return refusing(kind, extras === 'strip' ? Kit.obj(fields) : Kit.obj(fields).strict())
}

/** Make one validator of an object that refuses any field `build` does not return.
 * `opts` is the kind it refuses (default `'bad_record'`), or a {@link RefusalOpts}.
 *
 * @example
 *   export const deviceRow = objStrict(({ user_id, banklabel, device_tok }) => ({ user_id, banklabel, device_tok }), 'bad_record', [CX])
 *   deviceRow.parse({ ...row, note: 'hi' })  // throws 'bad_record', "There is a field it does not accept ..."
 */
export const objStrict = <ShapeT extends Z.ZodRawShape, const SourcesT extends readonly object[] = readonly []>(
  build: (kit: KitWith<SourcesT>) => ShapeT, opts: Refusalkind | RefusalOpts = 'bad_record', sources?: SourcesT,
): Refusing<Z.ZodObject<ShapeT>> => objCheck(build, { refusalkind: refusalkindOf(opts), extras: 'strict' }, sources)

/** Make one validator of an object that drops, unread, any field `build` does not return.
 * Use it to take a shape out of whatever carries it. `opts` is the kind it refuses (default
 * `'bad_record'`), or a {@link RefusalOpts}.
 *
 * @example
 *   export const boxCiphered = objStrip(({ box_key_wrapped, whisper_ciphered }) => ({ box_key_wrapped, whisper_ciphered }), 'bad_record', [CX])
 *   boxCiphered.parse(boxRecord)  // its two ciphered fields, the rest dropped
 */
export const objStrip = <ShapeT extends Z.ZodRawShape, const SourcesT extends readonly object[] = readonly []>(
  build: (kit: KitWith<SourcesT>) => ShapeT, opts: Refusalkind | RefusalOpts = 'bad_record', sources?: SourcesT,
): Refusing<Z.ZodObject<ShapeT>> => objCheck(build, { refusalkind: refusalkindOf(opts), extras: 'strip' }, sources)

/** The kind an {@link objStrict} or {@link objStrip} call's `opts` names. */
function refusalkindOf(opts: Refusalkind | RefusalOpts): Refusalkind { return Checks.refusalOpts.parse(typeof opts === 'string' ? { refusalkind: opts } : opts).refusalkind }

/** The kit a builder is given: {@link Kit} over `sources`. */
function kitWith<SourcesT extends readonly object[]>(sources?: SourcesT): KitWith<SourcesT> { return Object.assign({}, ...(sources ?? []), Kit) as KitWith<SourcesT> }

/** True exactly when `A` and `B` are the same type.
 * Hold a hand-written shape to its checker with `true satisfies AssertEqual<Shape, CheckerInput<typeof check>>`.
 */
export type AssertEqual<A, B> = Z.core.util.AssertEqual<A, B>

/** What a checker accepts: the input type of its schema. */
export type CheckerInput<SchemaT extends Z.ZodType> = Z.input<SchemaT>

/** A validator, as {@link Checkers}, {@link Checker} and {@link objCheck} return it.
 * It is its schema, with a `parse` that takes a {@link Story}, `refusingAs`, and for an object, `parseConsistent`.
 */
export type Refusing<SchemaT extends Z.ZodType> = SchemaT & {
  /** Parse `val`, or throw the call's kind with a message framed by `story`. */
  parse: (val: unknown, story?: Story) => Z.output<SchemaT>
  /** The same validator, refusing `kind` instead. */
  refusingAs: (kind: Refusalkind) => Refusing<SchemaT>
} & (Z.output<SchemaT> extends object ? {
  /** Parse `val`, then demand that every field both it and `other` define is `===`.
   * A disagreement refuses with the call's kind, or `refusal`'s, naming the fields that disagree.
   */
  parseConsistent: (val: unknown, other: object, refusal?: Partial<ConsistencyRefusal> & Story) => Z.output<SchemaT>
} : unknown)
// --

// == [Refusals]: refusing, InEnglish, English, fieldnamesOf, MaxFailuresSaid, fieldnameOf, sentenceOf, refusalOf, framed

// Every schema gets `parseConsistent`, though Refusing types it only on an object's.
/** A clone of `schema` whose `parse` throws a VaultError of `kind`, with `parseConsistent` and `refusingAs` added. */
function refusing<SchemaT extends Z.ZodType>(kind: Refusalkind, schema: SchemaT): Refusing<SchemaT> {
  const parse = (val: unknown, story?: Story): Z.output<SchemaT> => {
    const framing = story === undefined ? {} : Checks.story.parse(story)
    const result = schema.safeParse(val, InEnglish)
    if (result.success) { return result.data }
    throw refusalOf(kind, result.error, framing)
  }
  const parseConsistent = (val: unknown, other: object, { where, advice, ...refusal }: Partial<ConsistencyRefusal> & Story = {}): Z.output<SchemaT> => (
    checkedConsistent(parse(val, { where, advice }) as Z.output<SchemaT> & object, other, { kind, ...refusal })
  )
  // A clone, not `Object.create`: Zod binds each schema's own methods to it, so a schema that only
  // inherited them would render to JSON Schema as the one it came from, losing a pipe's or a lazy's place.
  return Object.assign(schema.clone(), { parse, parseConsistent, refusingAs: (asKind: Refusalkind) => refusing(asKind, schema) }) as Refusing<SchemaT>
}

/** The error map every `parse` runs under: Zod's English, whatever map the host set with `z.config`, which could quote the input.
 * Fields an object does not accept are counted, never named. A sentence a check carries still wins.
 */
const InEnglish = {
  error: (issue: Z.core.$ZodRawIssue) => (issue.code === 'unrecognized_keys' ? Phrases.unknownFields(issue.keys.length, fieldnamesOf(issue.inst)) : English(issue)),
}

/** Zod's English error map. */
const English = Zod.locales.en().localeError

/** The fields an object schema accepts, or none for any other schema. */
function fieldnamesOf(schema: unknown): string[] { return (schema instanceof Zod.ZodObject ? Object.keys(schema.shape) : []) }

/** The most failures a refusal's message names. It counts the rest. */
const MaxFailuresSaid = 8

/** A failure's path, its steps joined on `.`, or '' for the input as a whole. */
function fieldnameOf(issue: Z.core.$ZodIssue): string { return issue.path.map(String).join('.') }

/** One failure as a refusal says it: its path, then its sentence.
 * Zod's sentence names a type, a limit or the values allowed, never the value refused.
 */
function sentenceOf(issue: Z.core.$ZodIssue): string {
  const fieldname = fieldnameOf(issue)
  return fieldname ? `${fieldname}: ${issue.message}` : issue.message
}

/** The VaultError of `kind` for a failed parse, its message framed by `story`. */
function refusalOf(kind: Refusalkind, err: Z.ZodError, story: Story): VaultError {
  const issues     = err.issues.slice(0, MaxFailuresSaid)
  const unsaid     = err.issues.length - issues.length
  const sentences  = [...issues.map((issue) => sentenceOf(issue)), ...(unsaid > 0 ? [Phrases.moreFailures(unsaid)] : [])]
  const fieldnames = Object.freeze([...new Set(issues.map((issue) => fieldnameOf(issue)).filter((fieldname) => fieldname !== ''))])
  return new VaultError(kind, framed(sentences.join('; '), story), { meta: { fieldnames } })
}

/** The failures `said`, with `story`'s `where` before them and its `advice` after. */
function framed(said: string, { where, advice }: Story): string {
  if (where === undefined && advice === undefined) { return said }
  const led    = where  === undefined ? said : `${where}: ${said}`
  return advice === undefined ? `${led}.` : `${led}. ${advice}`
}
// --

// == [Consistency]: isConsistent, demandConsistent, checkedConsistent, disagreeing

/** True when every field defined in both `bag` and `other` (present, and not undefined) is `===`.
 * Only `bag`'s own enumerable fields are compared, so pass plain data, such as a parse's output, as
 * `bag`. `other` may be anything with fields, getters included. A field one of them lacks passes, so
 * parse first where a missing field must fail.
 *
 * @example isConsistent({ user_id: 'u1', boxlabel: undefined }, { boxlabel: 'openai' })   // true: no field is defined in both
 */
export function isConsistent(bag: object, other: object): boolean { return disagreeing(bag, other).length === 0 }

/** The names of the fields `bag` and `other` both define, at different values. */
export function disagreeingFieldnames(bag: object, other: object): readonly string[] { return disagreeing(bag, other) }

/** Demand that `bag` is {@link isConsistent} with `other`, else throw a VaultError of `refusal.kind`.
 * The refusal names the fields that disagree in `meta.fieldnames`, and in its message unless
 * `refusal.message` gives its own. Choose the kind for what a disagreement means at the call: a scope
 * of another user, a record of another vault.
 *
 * @example demandConsistent({ user_id: 'u2' }, { user_id: 'u1' }, { kind: 'bad_scope', message: (fieldnames) => `This names another ${fieldnames.join(' and ')}` })   // throws 'bad_scope', naming user_id
 */
export function demandConsistent(bag: object, other: object, refusal: ConsistencyRefusal): true {
  const { kind, message } = Checks.consistencyRefusal.parse(refusal)
  const fieldnames = disagreeing(bag, other)
  if (fieldnames.length === 0) { return true }
  const said = typeof message === 'function' ? message(fieldnames) : message
  throw new VaultError(kind, said ?? Phrases.fieldsDisagree(fieldnames), { meta: { fieldnames } })
}

/** `bag`, once it is {@link isConsistent} with `other`, refusing as {@link demandConsistent} does.
 * It is for a bag already parsed: a validator's `parseConsistent` parses first.
 */
export function checkedConsistent<BagT extends object>(bag: BagT, other: object, refusal: ConsistencyRefusal): BagT {
  demandConsistent(bag, other, refusal)
  return bag
}

/** The names of the fields `bag` and `other` both define, at different values, frozen. */
function disagreeing(bag: object, other: object): readonly string[] {
  const ours = Checks.bag.parse(bag)
  const theirs: Partial<Record<string, unknown>> = Checks.bag.parse(other)
  return Object.freeze(Object.entries(ours)
    .filter(([ckey, val]) => val !== undefined && theirs[ckey] !== undefined && theirs[ckey] !== val)
    .map(([ckey]) => ckey))
}
// --

// == [Checks]: Checks, ConsistencyRefusal, Story, ObjCheckOpts, RefusalOpts

// Made below Checkers and its refusals, which the call needs.
/** This module's own checks: a bag, a {@link ConsistencyRefusal}, a {@link Story}, and the options of {@link objCheck}, {@link objStrict} and {@link objStrip}. */
const Checks = Checkers('bad_option', ({ custom, obj, oneof, str, union }) => ({
  /** Any object, kept as it is, so a getter still reads. */
  bag:                custom<object>((val) => typeof val === 'object' && val !== null, Phrases.BagNotObject),
  consistencyRefusal: obj({
    /** The kind a disagreement refuses with. */
    kind:    oneof(refusalkindVals),
    /** A sentence, or one made from the names of the fields that disagree, never their values. */
    message: union([str, custom<(fieldnames: readonly string[]) => string>((val) => typeof val === 'function')]).optional(),
  }).strict(),
  story:              obj({
    /** Where the input was judged, a lead-in before the failures: `In Device.make's options`. */
    where:  str.optional(),
    /** What to do, a sentence after the failures: `Leave it out for the bank's own.` */
    advice: str.optional(),
  }).strict(),
  objCheckOpts:       obj({
    /** The kind thrown (default `'bad_record'`). */
    refusalkind: oneof(refusalkindVals).default('bad_record'),
    /** `'strict'` (default) refuses a field the object does not accept, and `'strip'` drops it unread. */
    extras:      oneof(['strict', 'strip']).default('strict'),
  }).strict(),
  refusalOpts:        obj({
    /** The kind thrown (default `'bad_record'`). */
    refusalkind: oneof(refusalkindVals).default('bad_record'),
  }).strict(),
}))

// Each is an interface extending its Z.infer, not a type alias of it: Refusing names both, and
// each is read off a Refusing, a loop TypeScript follows only through an interface's deferred members.
/** What a disagreement refuses with. */
export interface ConsistencyRefusal extends Z.infer<typeof Checks.consistencyRefusal> {}

/** The words a refusal puts around the failures it names. Neither may quote the input. */
export interface Story extends Z.infer<typeof Checks.story> {}

/** {@link objCheck} options:
 * - `refusalkind`      -- the kind thrown (default: `'bad_record'`)
 * - `extras: 'strict'` -- refuse a field the object does not take (default)
 * - `extras: 'strip'`  -- drop it unread
 */
export interface ObjCheckOpts extends Z.input<typeof Checks.objCheckOpts> {}

/** {@link objStrict} and {@link objStrip} options:
 * - `refusalkind` -- the kind thrown (default: `'bad_record'`)
 */
export interface RefusalOpts extends Z.input<typeof Checks.refusalOpts> {}
// --

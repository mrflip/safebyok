/** `Checkers`, `Checker`, `objCheck`, `objStrict` and `objStrip`, where every validator is made, and the {@link Kit} its builders are handed; and `isConsistent`, `demandConsistent` and `checkedConsistent`, which compare one bag to another, as a validator's `parseConsistent` does. */

import * as Zod from 'zod'
import type * as Z from 'zod'
import { refusalkindVals, VaultError, type Refusalkind } from '../refusals/errors'
import * as Phrases from './phrases'
import * as PX from '../shapes/primitives'

// == [Kit]: isBytes, Kit, KitWith, Merged

/** True for a Uint8Array from any realm: judged by its tag, as `instanceof` refuses one made in an iframe or a test's jsdom. */
function isBytes(candidate: unknown): candidate is Uint8Array { return ArrayBuffer.isView(candidate) && Object.prototype.toString.call(candidate) === '[object Uint8Array]' }

/** The makers a `Checkers` builder is handed: Zod's under short names, its scalars ready made, the scope names, and `epochMillis`.
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
  /** `check`, reading null or a value left out as `fallback`: an option's default, filled whether the caller omits it or sends null. */
  orDefault: <CheckT extends Zod.ZodType>(check: CheckT, fallback: Zod.output<CheckT>) => check.nullish().transform((given) => given ?? fallback),
  /** A check Zod has no maker for, as a predicate: a CryptoKey, bytes of one length. */
  custom:  Zod.custom,
  /** A function, as a host's verb or callback is checked, typed as the one meant: `fn<KeyDeriver['deriveKeyBytes']>()`. Nothing past its being one is judged. */
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
  label: PX.label, banklabel: PX.label, vaultlabel: PX.label, boxlabel: PX.label, user_id: PX.user_id,
  epochMillis: PX.epochMillis,
} as const

/** The kit a builder gets: {@link Kit}, with the given modules' exports spread in beneath it. */
export type KitWith<SourcesT extends readonly object[]> = Omit<Merged<SourcesT>, keyof typeof Kit> & typeof Kit

/** Every module in `SourcesT` merged into one, a later one's name over an earlier one's: {@link KitWith} is this with the kit laid over it. */
export type Merged<SourcesT extends readonly object[]> =
  SourcesT extends readonly [infer HeadT extends object, ...infer RestT extends readonly object[]] ? Omit<HeadT, keyof Merged<RestT>> & Merged<RestT> : unknown
// --

// == [Checkers]: Checkers, Checker, objCheck, objStrict, objStrip, refusalkindOf, kitWith, Refusing

/** Make validators: `build` gets the kit and returns its schemas by name, and each comes back with a `parse` that throws a VaultError of `kind`.
 * The message names each failing field by its path, up to eight, and counts the rest, each with
 * its check's own sentence or Zod's English. `meta.fieldnames` lists the same fields. For fields
 * an object does not accept, it says how many, never which, and lists the fields it accepts. It quotes
 * no input and carries no `cause`.
 *
 * `parse(val, story?)` frames the message as the {@link Story} asks: `where` the input was
 * judged, before the failures, and `advice`, what to do, after them. With either, the failures
 * end in a period; with neither, the message is the failures alone. A story that is none
 * refuses, whatever the input.
 *
 * Only `parse` changes: `safeParse` and `parseAsync` are Zod's own. A schema sliced from a
 * validator outside a `Checkers` call (`vaultSparse.pick(...)`) throws a ZodError; make the slice
 * in a call of its own where it should refuse. A validator nested in another refuses with the
 * outer one's kind.
 *
 * A schema keyed by its input repeats those keys in a refusal: Zod's `record`, or an object's
 * `.catchall()`, puts each failing key in the path. Judge such an object whole with `custom`.
 *
 * A validator also has `refusingAs(kind)`: the same schema again, its `parse` refusing `kind`. Where
 * one tier checks what another does and refuses in its own kind, it accepts the other's validator
 * and makes it so (`SX.vaultRow.refusingAs('record_conflict')`), rather than listing its fields twice.
 *
 * A validator of an object also has `parseConsistent(val, other, refusal?)`: it parses `val`,
 * checks the result against `other` as {@link checkedConsistent} does, and returns the result. Where they
 * disagree it refuses `kind`, or the `refusal` given: its `kind`, its `message`, or both. A
 * `refusal` can also carry a `where` and `advice`, which frame a failed parse as `parse`'s do.
 *
 * @param sources - Modules of validators, each a star import, spread into the kit beneath it: a
 *   name the kit gives wins. A bundler keeps or drops a call whole.
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

/** Make one validator: `build` gets the kit and returns its schema, which comes back with a `parse` that throws a VaultError of `kind`, 'bad_record' unless given.
 * It refuses as a {@link Checkers} call's validators do, and accepts `sources` as one does.
 *
 * @example
 *   export const prfSalt = Checker(() => prf_salt_b64.refine((salt) => fromB64OrNull(salt)?.length === PasskeySaltSize, Phrases.prfSaltShape(PasskeySaltSize)), 'bad_record')
 * @example export const callback = Checker(({ fn }) => fn(), 'bad_option')
 */
export function Checker<SchemaT extends Z.ZodType, const SourcesT extends readonly object[] = readonly []>(
  build: (kit: KitWith<SourcesT>) => SchemaT, kind: Refusalkind = 'bad_record', sources?: SourcesT,
): Refusing<SchemaT> { return refusing(kind, build(kitWith(sources))) }

/** Make one validator of an object: `build` gets the kit and returns the object's fields, and the object, strict unless `opts` says otherwise, comes back as a {@link Checker} hands one back.
 * `opts` is the kind it refuses, or an {@link ObjCheckOpts}: `refusalkind`, the kind, 'bad_record'
 * unless given, and `extras`, what it does with a field it does not accept: 'strict', the default,
 * refuses it, and 'strip' drops it unread, as Zod's object does. Any other `opts` refuses.
 * A check of the object whole (`.refine()`, `.readonly()`, a sentence of its own)
 * is made in a {@link Checker} call instead: one chained onto this one's validator would refuse
 * as Zod does.
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
 * `opts` is the kind it refuses, or a {@link RefusalOpts}; 'bad_record' unless given. It is an
 * {@link objCheck} under `extras: 'strict'`, and takes `build` and `sources` as one does.
 *
 * @example
 *   export const deviceRow = objStrict(({ user_id, banklabel, device_tok }) => ({ user_id, banklabel, device_tok }), 'bad_record', [CX])
 *   deviceRow.parse({ ...row, note: 'hi' })  // throws 'bad_record', "There is a field it does not accept ..."
 */
export const objStrict = <ShapeT extends Z.ZodRawShape, const SourcesT extends readonly object[] = readonly []>(
  build: (kit: KitWith<SourcesT>) => ShapeT, opts: Refusalkind | RefusalOpts = 'bad_record', sources?: SourcesT,
): Refusing<Z.ZodObject<ShapeT>> => objCheck(build, { refusalkind: refusalkindOf(opts), extras: 'strict' }, sources)

/** Make one validator of an object that drops, unread, any field `build` does not return: a shape taken out of whatever carries it.
 * `opts` is the kind it refuses, or a {@link RefusalOpts}; 'bad_record' unless given. It is an
 * {@link objCheck} under `extras: 'strip'`, and takes `build` and `sources` as one does.
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

/** The kit a builder is handed: `sources` spread in beneath {@link Kit}. */
function kitWith<SourcesT extends readonly object[]>(sources?: SourcesT): KitWith<SourcesT> { return Object.assign({}, ...(sources ?? []), Kit) as KitWith<SourcesT> }

/** True exactly when `A` and `B` are the same type: match a hand-written shape to its checker with `true satisfies AssertEqual<Shape, CheckerInput<typeof check>>`. */
export type AssertEqual<A, B> = Z.core.util.AssertEqual<A, B>

/** What a checker accepts: the input type of its schema. */
export type CheckerInput<SchemaT extends Z.ZodType> = Z.input<SchemaT>

/** A validator a {@link Checkers} call makes, what the call returns under each name, and what a {@link Checker} or {@link objCheck} call returns: its schema, its `parse` also taking a {@link Story}, and for an object, `parseConsistent`. */
export type Refusing<SchemaT extends Z.ZodType> = SchemaT & {
  /** `val`, parsed: the call's kind otherwise, its message framed as `story` asks; a story that is none refuses, whatever `val`. */
  parse: (val: unknown, story?: Story) => Z.output<SchemaT>
  /** This validator's schema again, its `parse` and `parseConsistent` refusing `kind`. */
  refusingAs: (kind: Refusalkind) => Refusing<SchemaT>
} & (Z.output<SchemaT> extends object ? {
  /** `val`, parsed, once each field it has that `other` has too is `===` to `other`'s: the call's kind otherwise, or `refusal`'s, naming the fields that disagree. A failed parse refuses as `parse` does. */
  parseConsistent: (val: unknown, other: object, refusal?: Partial<ConsistencyRefusal> & Story) => Z.output<SchemaT>
} : unknown)
// --

// == [Refusals]: refusing, InEnglish, English, fieldnamesOf, MaxFailuresSaid, fieldnameOf, sentenceOf, refusalOf, framed

/** A clone of `schema` whose `parse` throws a VaultError of `kind` where Zod's would throw its own, and whose `parseConsistent` parses, then compares the result to another bag. Every schema gets `parseConsistent`; {@link Refusing} types it only on an object's. */
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

/** The error map every `parse` runs under: Zod's own English, whatever map the host set with `z.config`, which could quote the input.
 * For fields an object does not accept, it says how many and lists the fields it accepts. A sentence
 * a check carries still wins.
 */
const InEnglish = {
  error: (issue: Z.core.$ZodRawIssue) => (issue.code === 'unrecognized_keys' ? Phrases.unknownFields(issue.keys.length, fieldnamesOf(issue.inst)) : English(issue)),
}

/** Zod's English error map. */
const English = Zod.locales.en().localeError

/** The fields an object schema accepts, by its shape: none for any other schema. */
function fieldnamesOf(schema: unknown): string[] { return (schema instanceof Zod.ZodObject ? Object.keys(schema.shape) : []) }

/** The most failures a refusal's message names; it counts the rest. */
const MaxFailuresSaid = 8

/** Where one failure is, as a refusal says it: its path's steps joined on `.`, and '' for the input as a whole. */
function fieldnameOf(issue: Z.core.$ZodIssue): string { return issue.path.map(String).join('.') }

/** One failure as a refusal says it: where, then Zod's sentence, which names a type, a limit or the values we allow, never the value refused. */
function sentenceOf(issue: Z.core.$ZodIssue): string {
  const fieldname = fieldnameOf(issue)
  return fieldname ? `${fieldname}: ${issue.message}` : issue.message
}

/** The VaultError of `kind` for a failed parse, its message and `meta.fieldnames` as {@link Checkers} says, framed as `story` asks. */
function refusalOf(kind: Refusalkind, err: Z.ZodError, story: Story): VaultError {
  const issues     = err.issues.slice(0, MaxFailuresSaid)
  const unsaid     = err.issues.length - issues.length
  const sentences  = [...issues.map((issue) => sentenceOf(issue)), ...(unsaid > 0 ? [Phrases.moreFailures(unsaid)] : [])]
  const fieldnames = Object.freeze([...new Set(issues.map((issue) => fieldnameOf(issue)).filter((fieldname) => fieldname !== ''))])
  return new VaultError(kind, framed(sentences.join('; '), story), { meta: { fieldnames } })
}

/** The failures `said`, with `story`'s `where` before them and its `advice` after: with either, the failures end in a period; with neither, they stand alone. */
function framed(said: string, { where, advice }: Story): string {
  if (where === undefined && advice === undefined) { return said }
  const led    = where  === undefined ? said : `${where}: ${said}`
  return advice === undefined ? `${led}.` : `${led}. ${advice}`
}
// --

// == [Consistency]: isConsistent, demandConsistent, checkedConsistent, disagreeing

/** True when `bag` agrees with `other` wherever both make an assertion: each field defined in both (present, and not undefined) is `===`.
 * A field only one of them has, or has as undefined, is passed by. The fields compared are
 * `bag`'s own enumerable ones, so `bag` is plain data, a parse's output; `other` may be anything
 * with fields, a Vault object's getters included, each read by its name. So `other` says what
 * is compared: hand it only the fields meant. An absent field passes, so a value an absent field
 * must fail is parsed first. Either bag not an object refuses.
 *
 * @example isConsistent({ user_id: 'u1', boxlabel: undefined }, { boxlabel: 'openai' })   // true: no field is defined in both
 */
export function isConsistent(bag: object, other: object): boolean { return disagreeing(bag, other).length === 0 }

/** The names of the fields `bag` and `other` both define at different values: what {@link demandConsistent} names when it refuses. */
export function disagreeingFieldnames(bag: object, other: object): readonly string[] { return disagreeing(bag, other) }

/** True once `bag` is {@link isConsistent} with `other`: a VaultError of `refusal.kind` otherwise, naming the fields that disagree in `meta.fieldnames`, and in its message unless `refusal.message` says its own.
 * The kind is the caller's to choose, as the caller knows what a disagreement means: a scope of
 * another user, a record of another vault. A `refusal` that is none refuses.
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

/** `bag`, once it is {@link isConsistent} with `other`: refuses as {@link demandConsistent} does. For a bag already parsed; a {@link Refusing}'s `parseConsistent` is this over its `parse`. */
export function checkedConsistent<BagT extends object>(bag: BagT, other: object, refusal: ConsistencyRefusal): BagT {
  demandConsistent(bag, other, refusal)
  return bag
}

/** The names of the fields `bag` and `other` both define and have at different values, frozen: each bag checked to be an object first. */
function disagreeing(bag: object, other: object): readonly string[] {
  const ours = Checks.bag.parse(bag)
  const theirs: Partial<Record<string, unknown>> = Checks.bag.parse(other)
  return Object.freeze(Object.entries(ours)
    .filter(([ckey, val]) => val !== undefined && theirs[ckey] !== undefined && theirs[ckey] !== val)
    .map(([ckey]) => ckey))
}
// --

// == [Checks]: Checks, ConsistencyRefusal, Story, ObjCheckOpts, RefusalOpts

/** The checks this module makes for itself, under one name: `bag`, any object, accepted as it is, so a getter still reads; `consistencyRefusal`, what a disagreement refuses with; `story`, the words around a parse's refusal; `objCheckOpts`, how an {@link objCheck} validator refuses; and `refusalOpts`, how an {@link objStrict} or {@link objStrip} one does. Made below {@link Checkers} and its refusals, which the call needs. */
const Checks = Checkers('bad_option', ({ custom, obj, oneof, str, union }) => ({
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
    /** The kind thrown; 'bad_record' by default. */
    refusalkind: oneof(refusalkindVals).default('bad_record'),
    /** `strict`, the default, refuses a field the object does not accept; `strip` drops it unread. */
    extras:      oneof(['strict', 'strip']).default('strict'),
  }).strict(),
  refusalOpts:        obj({
    /** The kind thrown; 'bad_record' by default. */
    refusalkind: oneof(refusalkindVals).default('bad_record'),
  }).strict(),
}))

// Each is an interface extending its Z.infer, not a type alias of it: Refusing names both, and
// each is read off a Refusing, a loop TypeScript follows only through an interface's deferred members.
/** What a disagreement refuses with. */
export interface ConsistencyRefusal extends Z.infer<typeof Checks.consistencyRefusal> {}

/** The words a refusal puts around the failures it names, neither quoting the input. */
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

/** What crosses the wire between `GraphQLVaultDB` and `vaultResolvers`: a verb's answer and a watch's notice, and the checks the client reads them through.
 * Each check refuses `storage_issue`: to the client, the server is its storage, and an answer that fails its check is out of step or broken.
 */

import type * as Z from 'zod'
import * as DB from 'safebyok/storage'
import * as Throwers from '../refusals/throwers'

// == [Wire forms]: CrossedErrExtension, AnyAnswer, WireAnswer, WireNotice

/** The key of a GraphQL error's `extensions` under which a refusal crosses, as `crossedErrOf` gives it, where the server could not serve the request. */
export const CrossedErrExtension = 'safebyokErr'

/** Any vaultDB verb's answer. */
export type AnyAnswer = DB.GetThingAnswer | DB.WriteThingAnswer | DB.ListThingsAnswer | DB.BirthBankAnswer | DB.GetBankAnswer | DB.StatsAnswer

/** A vaultDB verb's answer as it crosses: the answer less its ask, its refusal reduced to what may cross, and null for each field the schema has and it lacks. */
export type WireAnswer = Readonly<{
  ok:      boolean
  act:     DB.GoodAct | DB.BadAct
  banktok: DB.Banktok
  tracked: DB.Tracked | 'unread'
  read_tc: DB.ReadTc
  val:     unknown
  dbhas:   unknown
  err:     DB.CrossedErr | null
}> & Partial<DB.ListedBeside>

/** One notice of a watch as it crosses: a changed Thing, its kind, its bank's banktok and when it was read; or, with those null, the trouble the watch met.
 * `isEnded` is true on the last notice of a watch that ended itself, which carries why.
 */
export type WireNotice = Readonly<{
  record:    DB.VaultItemEvent['val'] | null
  modelkind: DB.Thingkind | null
  banktok:   DB.Banktok | null
  read_tc:   DB.ReadTc | null
  err:       DB.CrossedErr | null
  isEnded:   boolean
}>
// --

// == [Checks]: WireChecks, CheckedAnswer, CheckedNotice

// Each record an answer carries is checked for its scope and citation alone, as a Thing or a shell of any kind: whoever
// reads it checks the rest where a Thing takes it, as for an answer from any vaultDB.
/** The checks of what crosses the wire, each refusing `storage_issue`.
 * An answer's check passes a good answer of its verb's acts, or any refusal:
 * - `getAnswer`, `writeAnswer`, `listAnswer`, `birthAnswer`, `getBankAnswer`, `statsAnswer`
 * - `notice` -- a watch's notice: a Thing with its modelkind, banktok and read_tc, or a refusal
 */
export const WireChecks = DB.Checkers('storage_issue', ({ obj, arr, lit, oneof, union, bool }) => {
  const { banktok } = DB.GateChecks
  const { read_tc } = DB.ManifestChecks
  const thing   = DB.SeenChecks.seenCited
  const tracked = obj({ gate: union([lit('same'), thing]), root: union([lit('same'), thing]) }).strict()
  const roots   = obj({ gate: thing, root: thing }).strict()
  const listed  = { parentage: arr(thing), deltas: arr(thing), incompatible_rows: arr(DB.CrossedChecks.incompatibleThing) }
  const goodOf  = <ActT extends Z.ZodType, ValT extends Z.ZodType, DbhasT extends Z.ZodType>(act: ActT, val: ValT, dbhas: DbhasT) => (
    obj({ ok: lit(true), act, banktok, tracked, read_tc, val, dbhas, err: lit(null) }).strict()
  )
  const refused = obj({
    ok: lit(false), act: oneof([...DB.badActVals, 'policied']), banktok, tracked: union([lit('unread'), tracked]), read_tc, val: lit(null), dbhas: thing.nullable(), err: DB.CrossedChecks.err,
  }).strict()
  // A birth's or a bank's refusal carries both roots as its `dbhas`, as its good answer does as its `val`; null where the verb threw.
  const refusedOfRoots = refused.extend({ dbhas: roots.nullable() })
  return {
    getAnswer: union([
      goodOf(lit('gotlive'), thing, lit(null)),
      goodOf(lit('gotgone'), lit(null), thing),
      goodOf(lit('gotvoid'), lit(null), thing),
      refused,
    ]),
    writeAnswer: union([goodOf(oneof([...DB.putActVals, ...DB.delActVals]), thing, lit(null)), refused]),
    listAnswer:  union([goodOf(lit('gotlive'), DB.CrossedChecks.kids, lit(null)).extend({ ...listed, parentage: arr(thing).length(1) }), refused.extend(listed)]),
    birthAnswer: union([goodOf(oneof(['born', 'passed']), roots, lit(null)), refusedOfRoots]),
    getBankAnswer: union([goodOf(lit('got'), roots, lit(null)), refusedOfRoots]),
    statsAnswer: union([goodOf(lit('got'), DB.VaultStatsChecks.vaultStats, lit(null)), refused]),
    notice:      union([
      obj({ record: thing, modelkind: DB.ThingChecks.modelkind, banktok, read_tc, err: lit(null), isEnded: lit(false) }).strict(),
      obj({ record: lit(null), modelkind: lit(null), banktok: lit(null), read_tc: lit(null), err: DB.CrossedChecks.err, isEnded: bool }).strict(),
    ]),
  }
})

/** Each verb's answer as {@link WireChecks} read it. */
type GetChecked   = Z.output<typeof WireChecks.getAnswer>
type WriteChecked = Z.output<typeof WireChecks.writeAnswer>
type ListChecked  = Z.output<typeof WireChecks.listAnswer>
type RootsChecked = Z.output<typeof WireChecks.birthAnswer | typeof WireChecks.getBankAnswer>
type StatsChecked = Z.output<typeof WireChecks.statsAnswer>

/** Any verb's answer as {@link WireChecks} read it. */
export type CheckedAnswer = GetChecked | WriteChecked | ListChecked | RootsChecked | StatsChecked

/** A watch's notice as {@link WireChecks} read it. */
export type CheckedNotice = Z.output<typeof WireChecks.notice>
// --

// == [Scopes]: checkGotAt, checkListedAt, checkRootsAt, checkStatsAt, checkWatchedAt, checkParentageAt, checkKidsPathAt, checkKidsLifeOf, checkChildUnder, checkChildOfKind, checkThingAt, checkRootAt, checkTrackedAt
// The light checks of an answer against its ask: each record it carries sits where the ask reaches. They read nothing of the
// act, whose sense is the server's vaultDB's, which made it.

/** The checks of a record's scope, each refusing `storage_issue` where a scope field is not the one it is checked against. */
const ScopeChecks = DB.Checkers('storage_issue', () => ({
  thingScope: DB.ThingChecks.thingScope,
  tableScope: DB.ThingChecks.tableScope,
}))

/** A record's scope, as {@link WireChecks} read it. */
type Scoped = Readonly<{ modelkind: DB.Thingkind, userid: DB.Userid, banklabel: DB.Banklabel, labelpath: string }>

/** Refuse a get's or a write's answer whose Thing, its `val` or else its `dbhas`, does not sit at the ask's scope. */
export function checkGotAt(ask: DB.GetAsk | DB.WriteAsk, answer: GetChecked | WriteChecked): void {
  checkTrackedAt(ask, answer)
  checkThingAt(ask, answer.val ?? answer.dbhas)
}

/** Refuse a listing's answer where a Thing does not sit where the ask reaches, or the kids it names are not the ask's parent's. */
export function checkListedAt(ask: DB.ListAsk, answer: ListChecked): void {
  checkTrackedAt(ask, answer)
  if (! answer.ok) { checkThingAt(ask, answer.dbhas) }
  checkParentageAt(ask, answer)
  if (answer.ok) {
    checkKidsPathAt(ask, answer)
    checkKidsLifeOf(answer)
  }
  for (const child of [...answer.deltas, ...answer.incompatible_rows]) {
    checkChildUnder(ask, child)
    checkChildOfKind(ask, child)
  }
}

/** Refuse a birth's or a bank's answer whose roots, its `val` or else its `dbhas`, do not each sit at their own scope in the ask's bank. */
export function checkRootsAt(ask: DB.BirthBankAsk | DB.GetBankAsk, answer: RootsChecked): void {
  checkTrackedAt(ask, answer)
  const roots = answer.val ?? answer.dbhas
  if (roots === null) { return }
  const scopes = DB.rootScopesOf(ask)
  checkThingAt(scopes.gate, roots.gate)
  checkThingAt(scopes.root, roots.root)
}

/** Refuse a stats' answer whose refusal names a Thing that is no root of the ask's bank. */
export function checkStatsAt(ask: DB.StatsAsk, answer: StatsChecked): void {
  checkTrackedAt(ask, answer)
  if (! answer.ok) { checkRootAt(ask, answer.dbhas) }
}

/** Refuse a watch's notice of a Thing in another bank than the watch's `scope`, or of another kind than the notice names. */
export function checkWatchedAt(scope: DB.ThingWatchScope, { record, modelkind }: CheckedNotice): void {
  if (record !== null) { ScopeChecks.tableScope.parseConsistent(record, { ...scope, modelkind }) }
}

/** Refuse a listing whose parentage, good or refused, holds a Thing that does not sit at the ask's scope. */
function checkParentageAt(ask: DB.ListAsk, answer: ListChecked): void {
  for (const parent of answer.parentage) { checkThingAt(ask, parent) }
}

/** Refuse a good listing whose kids name a parentpath other than the ask's. */
function checkKidsPathAt(ask: DB.ListAsk, answer: Extract<ListChecked, { ok: true }>): void {
  if (answer.val.parentpath !== ask.labelpath) { throw Throwers.kidsOfOtherParent(answer.val.parentpath) }
}

/** Refuse a good listing whose kids name a parentlife other than the lifepath of the parent in its `parentage`. */
function checkKidsLifeOf(answer: Extract<ListChecked, { ok: true }>): void {
  if (answer.parentage[0]?.lifepath !== answer.val.parentlife) { throw Throwers.kidsOfOtherParent(answer.val.parentpath) }
}

/** Refuse a listed child, delta or incompatible row, that is not in the ask's table, of its kind and bank, or not one label under its parent. */
function checkChildUnder(ask: DB.ListAsk, child: Scoped): void {
  ScopeChecks.tableScope.parseConsistent(child, ask)
  if (DB.Labelpath.parentOf(child.labelpath) !== ask.labelpath) { throw Throwers.thingOutOfReach(child.labelpath) }
}

/** Refuse a listed child, delta or incompatible row, whose labelpath breaks the labelpath rule of the ask's modelkind. */
function checkChildOfKind(ask: DB.ListAsk, child: Scoped): void {
  if (! DB.isLabelpathOfKind({ ...ask, labelpath: child.labelpath })) { throw Throwers.thingOutOfReach(child.labelpath) }
}

/** Refuse a record that is not null and does not sit at `scope`: its kind, its bank and its labelpath. */
function checkThingAt(scope: DB.ThingScope, record: Scoped | null): void {
  if (record !== null) { ScopeChecks.thingScope.parseConsistent(record, scope) }
}

/** Refuse a record that is not null and is no root of `ask`'s bank: it must sit at the scope of the root of its kind. */
function checkRootAt(ask: DB.AnyAsk, record: Scoped | null): void {
  if (record === null) { return }
  const { gate, root } = DB.rootScopesOf(ask)
  checkThingAt((record.modelkind === gate.modelkind) ? gate : root, record)
}

/** Refuse an answer's `tracked` where a root it carries does not sit at that root's scope in `ask`'s bank. */
function checkTrackedAt(ask: DB.AnyAsk, { tracked }: CheckedAnswer): void {
  if (tracked === 'unread') { return }
  const scopes = DB.rootScopesOf(ask)
  if (tracked.gate !== 'same') { checkThingAt(scopes.gate, tracked.gate) }
  if (tracked.root !== 'same') { checkThingAt(scopes.root, tracked.root) }
}
// --

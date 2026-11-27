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
export type AnyAnswer = DB.GetThingAnswer | DB.WriteThingAnswer | DB.ListThingsAnswer | DB.BirthBankAnswer | DB.GetWorldAnswer | DB.StatsAnswer

/** A vaultDB verb's answer as it crosses: the answer less its ask, its refusal reduced to what may cross, and null for each field the schema has and it lacks. */
export type WireAnswer = Readonly<{
  ok:      boolean
  act:     DB.GoodAct | DB.BadAct
  banktok: DB.Lifetok
  tracked: DB.Tracked | 'unread'
  read_tc: DB.ReadTc
  val:     unknown
  dbhas:   unknown
  err:     DB.CrossedErr | null
}> & Partial<DB.ListedBeside>

/** One notice of a watch as it crosses: a changed Thing, its bank's banktok and when it was read; or, with those null, the trouble the watch met.
 * `isEnded` is true on the last notice of a watch that ended itself, which carries why.
 */
export type WireNotice = Readonly<{
  record:  DB.VaultItemEvent['val'] | null
  banktok: DB.Lifetok | null
  read_tc: DB.ReadTc | null
  err:     DB.CrossedErr | null
  isEnded: boolean
}>
// --

// == [Checks]: WireChecks, CheckedAnswer, CheckedNotice

// Each record an answer carries is checked for its scope and citation alone, as a Thing or a shell of any kind: whoever
// reads it checks the rest where a Thing takes it, as for an answer from any vaultDB.
/** The checks of what crosses, each refusing `storage_issue`, by the verb whose answer it reads.
 * Each answer is a good one of its verb's acts, with its `val` and `dbhas` as that act has them and null where it has none, or any refused one:
 * - `getAnswer`, `writeAnswer`, `listAnswer`, `birthAnswer`, `worldAnswer`, `statsAnswer`
 * - `notice` -- a watch's notice: a Thing with its banktok and read_tc, or a refusal
 */
export const WireChecks = DB.Checkers('storage_issue', ({ obj, arr, lit, oneof, union, bool }) => {
  const banktok = DB.BankChecks.record.shape.lifetok
  const { read_tc } = DB.ManifestChecks
  const thing   = DB.SeenChecks.seenCited
  const tracked = obj({
    bank:                    union([lit('same'), thing]),
    [DB.Labelpath.MainGate]: union([lit('same'), thing]),
    [DB.Labelpath.RootBox]:  union([lit('same'), thing]),
  }).strict()
  const roots   = obj({ bank: thing, gate: thing, root: thing }).strict()
  const listed  = { parentage: arr(thing), deltas: arr(thing), incompatible_rows: arr(DB.CrossedChecks.incompatibleThing) }
  const goodOf  = <ActT extends Z.ZodType, ValT extends Z.ZodType, DbhasT extends Z.ZodType>(act: ActT, val: ValT, dbhas: DbhasT) => (
    obj({ ok: lit(true), act, banktok, tracked, read_tc, val, dbhas, err: lit(null) }).strict()
  )
  const refused = obj({
    ok: lit(false), act: oneof([...DB.badActVals, 'policied']), banktok, tracked: union([lit('unread'), tracked]), read_tc, val: lit(null), dbhas: thing.nullable(), err: DB.CrossedChecks.err,
  }).strict()
  return {
    getAnswer: union([
      goodOf(lit('gotlive'), thing, lit(null)),
      goodOf(lit('gotgone'), lit(null), thing),
      goodOf(lit('gotvoid'), lit(null), thing),
      refused,
    ]),
    writeAnswer: union([goodOf(oneof([...DB.putActVals, ...DB.delActVals]), thing, lit(null)), refused]),
    listAnswer:  union([goodOf(lit('gotlive'), DB.CrossedChecks.kids, lit(null)).extend({ ...listed, parentage: arr(thing).length(1) }), refused.extend(listed)]),
    birthAnswer: union([goodOf(oneof(['born', 'passed']), roots, lit(null)), refused]),
    worldAnswer: union([goodOf(lit('got'), roots, lit(null)), refused]),
    statsAnswer: union([goodOf(lit('got'), DB.VaultStatsChecks.vaultStats, lit(null)), refused]),
    notice:      union([
      obj({ record: thing, banktok, read_tc, err: lit(null), isEnded: lit(false) }).strict(),
      obj({ record: lit(null), banktok: lit(null), read_tc: lit(null), err: DB.CrossedChecks.err, isEnded: bool }).strict(),
    ]),
  }
})

/** Each verb's answer as {@link WireChecks} read it. */
type GetChecked   = Z.output<typeof WireChecks.getAnswer>
type WriteChecked = Z.output<typeof WireChecks.writeAnswer>
type ListChecked  = Z.output<typeof WireChecks.listAnswer>
type RootsChecked = Z.output<typeof WireChecks.birthAnswer | typeof WireChecks.worldAnswer>
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
  bankScope:  DB.ThingChecks.bankScope,
}))

/** A record's scope, as {@link WireChecks} read it. */
type Scoped = Readonly<{ userid: DB.Userid, banklabel: DB.Banklabel, labelpath: string }>

/** The labelpaths of a bank's three roots. */
const RootLabelpathList: readonly string[] = Object.values(DB.RootLabelpaths)

/** Refuse a get's or a write's answer whose Thing, its `val` or else its `dbhas`, does not sit at the ask's scope. */
export function checkGotAt(ask: DB.GetAsk | DB.WriteAsk, answer: GetChecked | WriteChecked): void {
  checkTrackedAt(ask, answer)
  checkThingAt(ask, ask.labelpath, answer.val ?? answer.dbhas)
}

/** Refuse a listing's answer where a Thing does not sit where the ask reaches, or the kids it names are not the ask's parent's. */
export function checkListedAt(ask: DB.ListAsk, answer: ListChecked): void {
  checkTrackedAt(ask, answer)
  if (! answer.ok) { checkThingAt(ask, ask.labelpath, answer.dbhas) }
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

/** Refuse a birth's or a world's answer whose roots do not each sit at their own labelpath in the ask's bank, or whose refusal names a Thing that is no root of it. */
export function checkRootsAt(ask: DB.BirthBankAsk | DB.GetWorldAsk, answer: RootsChecked): void {
  checkTrackedAt(ask, answer)
  if (! answer.ok) {
    checkRootAt(ask, answer.dbhas)
    return
  }
  checkThingAt(ask, DB.RootLabelpaths.bank, answer.val.bank)
  checkThingAt(ask, DB.RootLabelpaths.gate, answer.val.gate)
  checkThingAt(ask, DB.RootLabelpaths.root, answer.val.root)
}

/** Refuse a stats' answer whose refusal names a Thing that is no root of the ask's bank. */
export function checkStatsAt(ask: DB.StatsAsk, answer: StatsChecked): void {
  checkTrackedAt(ask, answer)
  if (! answer.ok) { checkRootAt(ask, answer.dbhas) }
}

/** Refuse a watch's notice of a Thing in another bank than the watch's `scope`. */
export function checkWatchedAt(scope: DB.ThingWatchScope, { record }: CheckedNotice): void {
  if (record !== null) { ScopeChecks.bankScope.parseConsistent(record, scope) }
}

/** Refuse a listing whose parentage, good or refused, holds a Thing that does not sit at the ask's scope. */
function checkParentageAt(ask: DB.ListAsk, answer: ListChecked): void {
  for (const parent of answer.parentage) { checkThingAt(ask, ask.labelpath, parent) }
}

/** Refuse a good listing whose kids name a parentpath other than the ask's. */
function checkKidsPathAt(ask: DB.ListAsk, answer: Extract<ListChecked, { ok: true }>): void {
  if (answer.val.parentpath !== ask.labelpath) { throw Throwers.kidsOfOtherParent(answer.val.parentpath) }
}

/** Refuse a good listing whose kids name a parentlife other than the lifepath of the parent in its `parentage`. */
function checkKidsLifeOf(answer: Extract<ListChecked, { ok: true }>): void {
  if (answer.parentage[0]?.lifepath !== answer.val.parentlife) { throw Throwers.kidsOfOtherParent(answer.val.parentpath) }
}

/** Refuse a listed child, delta or incompatible row, that is not in the ask's bank or not one label under its parent. */
function checkChildUnder(ask: DB.ListAsk, child: Scoped): void {
  ScopeChecks.bankScope.parseConsistent(child, ask)
  if (DB.Labelpath.parentOf(child.labelpath) !== ask.labelpath) { throw Throwers.thingOutOfReach(child.labelpath) }
}

/** Refuse a listed child, delta or incompatible row, that is not of the ask's modelkind. */
function checkChildOfKind(ask: DB.ListAsk, child: Scoped): void {
  if (! DB.Labelpath.isOfModelkind(child.labelpath, ask.modelkind)) { throw Throwers.thingOutOfReach(child.labelpath) }
}

/** Refuse a record that is not null and does not sit at `labelpath` in `ask`'s bank. */
function checkThingAt(ask: DB.AnyAsk, labelpath: string, record: Scoped | null): void {
  if (record !== null) { ScopeChecks.thingScope.parseConsistent(record, { userid: ask.userid, banklabel: ask.banklabel, labelpath }) }
}

/** Refuse a record that is not null and is no root of `ask`'s bank. */
function checkRootAt(ask: DB.AnyAsk, record: Scoped | null): void {
  if (record === null) { return }
  ScopeChecks.bankScope.parseConsistent(record, ask)
  if (! RootLabelpathList.includes(record.labelpath)) { throw Throwers.thingOutOfReach(record.labelpath) }
}

/** Refuse an answer's `tracked` where a root it carries does not sit at that root's labelpath in `ask`'s bank. */
function checkTrackedAt(ask: DB.AnyAsk, { tracked }: CheckedAnswer): void {
  if (tracked === 'unread') { return }
  // A tracked root is keyed by its labelpath.
  for (const labelpath of Object.values(DB.RootLabelpaths)) {
    const root = tracked[labelpath]
    if (root !== 'same') { checkThingAt(ask, labelpath, root) }
  }
}
// --

/** The `VaultDB` interface the models call, the answers its verbs resolve, and what a concrete adapter reports to `AdapterVaultDB`. */

import type { EX, Errors } from 'safebyok-big/internals'
import type { Labelpath, Lifepath, Lifeseq } from '../shapes/primitives'
import type { Absent, Sparse, ThingRecord, ThingScope } from '../shapes/shapes-thing'
import type { TombstoneOf } from '../shapes/shapes-sealers'
import type { BankRoots, BirthBankAsk, GetAsk, ListAsk, LoggableAsk, ThingWatchScope, Tracked, WorldRecord, WriteAsk } from '../shapes/shapes-asks'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, DamagedThing, ReadTc, KidEntry, Kids, ListedBeside, ListThingsAnswer, BirthBankAnswer, ThingNotice

/** A vaultDB verb's good answer: its `val`, the `act` that says what the datastore did, its bank's `world`, and the loggable part of its `ask`.
 * `world` is the bank and its main gate as the step left them, read in that step. It is null if either is missing or fails its checks.
 * `tracked`, only for an ask that tracks, says for each of the bank, its main gate and its root box whether it is still at the revision the ask tracks ({@link Tracked}).
 */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: WorldRecord | null, tracked?: Tracked, val: ValT }

/** A refused answer's act: big's, or `policied` for a replacement that a storage policy or a changed born_at refuses. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err` and `act`, the Thing found stored (`dbhas`), its bank's `world`, and the loggable part of its `ask`.
 * `world` is null if the verb threw.
 */
export type BadAnswer<DbhasT = ThingRecord | null> = { ok: false, ask: LoggableAsk, act: BadAct, world: WorldRecord | null, tracked?: Tracked, dbhas: DbhasT, err: Errors.VaultError }

/** A vaultDB verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. Never thrown. */
export type Answer<ValT, ActT extends EX.GoodAct> = GoodAnswer<ValT, ActT> | BadAnswer

/** The answer to `tryGetThing`: the live Thing (`gotlive`), or {@link Absent} for a tombstone (`gotgone`) or none (`gotvoid`).
 * Under `gotgone` the tombstone is its `dbhas`, which the vaultDB's watch notifies before the answer.
 */
export type GetThingAnswer   =
  | GoodAnswer<ThingRecord, 'gotlive'>
  | (GoodAnswer<Absent, 'gotgone'> & { dbhas: TombstoneOf<ThingRecord> })
  | GoodAnswer<Absent, 'gotvoid'>
  | BadAnswer
/** The answer to `tryWriteThing`: the Thing the concrete adapter reports writing, or under `passed` the live Thing it found. */
export type WriteThingAnswer = Answer<ThingRecord, EX.PutAct | EX.DelAct>

/** A child Thing that fails its kind's checks: its scope, and `am: 'd'`. */
export type DamagedThing = Readonly<ThingScope & { am: 'd' }>

/** When the datastore read a list's children, as a UUID version 7: lowercase hex of a fixed width, so that two compare as text in the order of their reads.
 * Compare two of them as strings, never with the device's clock.
 */
export type ReadTc = string

/** One child in a {@link Kids} value: the lifeseq of its life stored. */
export type KidEntry = Readonly<{ lifeseq: Lifeseq }>

// Keyed by label, not labelpath. JavaScript orders an object's keys that look like whole numbers first, so a reader that
// needs labelpath order sorts the labels.
/** The children of one life of a Thing, by label, as the datastore read them at `read_tc`: the live ones in `items`, the tombstones in `gones`.
 * `parentpath` is the parent's labelpath, and `parentlife` the lifepath of the parent's life stored, live or a tombstone, or
 * the shell's lifeseq alone where nothing is stored there. Only a live parent has children.
 */
export type Kids = Readonly<{
  modelkind:  'kids'
  parentpath: Labelpath
  parentlife: Lifepath
  items:      Readonly<Record<string, KidEntry>>
  gones:      Readonly<Record<string, KidEntry>>
  read_tc:    ReadTc
}>

/** What a listing answer carries beside its `val` or `dbhas`, good or refused: the `parentage`, the `deltas` and the `damaged_rows`.
 * `parentage` is the parent, sparse, where one is stored, and `deltas` each child the `val` names, sparse, in labelpath order. The vaultDB's watch notifies of both before the answer.
 */
export type ListedBeside<RecordT extends ThingRecord = ThingRecord> = {
  parentage:    readonly Sparse<RecordT>[]
  deltas:       readonly Sparse<RecordT>[]
  damaged_rows: readonly DamagedThing[]
}

/** The answer to `tryListThings`: the parent's children as a {@link Kids} value, and when the datastore read them as its `read_tc`. Its act is the parent's get act.
 * Refused under `void` or `gone`, its `dbhas` is `[]`, and its `read_tc` says when the datastore read the parent. Under any other refusal `dbhas` is null and there is no `read_tc`.
 */
export type ListThingsAnswer<RecordT extends ThingRecord = ThingRecord> =
  | (GoodAnswer<Kids, EX.GotAct> & ListedBeside<RecordT> & { read_tc: ReadTc })
  | (BadAnswer<Sparse<RecordT>[] | null> & ListedBeside<RecordT> & { read_tc?: ReadTc })

/** The answer to `tryBirthBank`: the three roots written (`born`), or found already stored (`passed`). */
export type BirthBankAnswer = Answer<BankRoots, 'born' | 'passed'>

/** A Thing that a watch reports, live or a tombstone, as its `val`, with the act a get of it would answer. A Thing a list answers is reported sparse, as listed. */
export type ThingNotice = Pick<GoodAnswer<ThingRecord | Sparse<ThingRecord>, 'gotlive' | 'gotgone'>, 'ok' | 'act' | 'val'>
// --

// == [What a concrete adapter reports]: Actual, ListThingsActual, BirthBankActual

/** A concrete adapter's report of one atomic step: its act, the bank's `world` as the step left it with its `tracked`, and a `record`.
 * `record` is the Thing found at the scope or, after a write, the Thing it reports writing. `AdapterVaultDB` turns it into the answer's `val` when good, its `dbhas` when refused.
 * A refused report has no error: `AdapterVaultDB` makes it from the act.
 */
export type Actual<ActT extends EX.GoodAct> =
  | { ok: true,  act: ActT,           world: WorldRecord | null, tracked?: Tracked, record: ThingRecord | null }
  | { ok: false, act: EX.RefusedAct,  world: WorldRecord | null, tracked?: Tracked, record: ThingRecord | null }

/** A concrete adapter's report of a listing: the parent's act, its children as a {@link Kids} value, and what the answer carries beside it.
 * Refused, it has no children, and its `read_tc` says when the datastore read the parent.
 */
export type ListThingsActual = Readonly<{ world: WorldRecord | null, tracked?: Tracked } & ListedBeside & (
  | { ok: true,  act: EX.GotAct, kids: Kids }
  | { ok: false, act: EX.RefusedAct, read_tc: ReadTc }
)>

/** A concrete adapter's report of a bank's birth: the three roots, written or already stored, or the first refused act with the Thing stored at that root. */
export type BirthBankActual =
  | { ok: true,  act: 'born' | 'passed', world: WorldRecord | null, tracked?: Tracked, things: BankRoots }
  | { ok: false, act: EX.RefusedAct,     world: WorldRecord | null, tracked?: Tracked, record: ThingRecord | null }
// --

// == [The interface]: VaultDB, VaultDBMembernames, isVaultDB

/** Storage for the Things of a user's banks. Each `try` verb is one atomic step, and resolves an answer instead of throwing.
 * Each `*Ask` builder fills in an ask's defaults and checks nothing: the verb it is passed to refuses a bad ask.
 */
export interface VaultDB {
  /** The Thing at `ask`'s scope. */
  tryGetThing(ask: GetAsk): Promise<GetThingAnswer>
  /** Write `ask.record` over the Thing stored, if it matches `ask.cited`.
   * - The write is stored when its preconditions hold: the exact revision cited and, for a put that replaces a live Thing, the
   *   born_at left unchanged and the storage policies it names. Nothing else of the Thing stored is checked.
   * - Where several refusals apply at once, the answer is one of them, but which is unspecified, and may differ between concrete adapters
   *   and between versions. A Thing stored too damaged to check the preconditions against may refuse `damaged_row`,
   *   `storage_issue`, or the failed precondition's own refusal.
   * - The record carries every field, so a concrete adapter may write it by replacing the Thing stored whole.
   */
  tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer>
  /** The children of the Thing at `ask`'s scope, read in one step. */
  tryListThings(ask: ListAsk): Promise<ListThingsAnswer>
  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored. */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer>
  /** Watch a bank's Things, returning a function that stops the watch.
   * `onBadNews` gets any trouble the watch meets, including a Thing that fails its checks.
   * - A Thing notified for two reasons in one verb (a write refused on a Thing it also tracks) is notified twice, and nothing
   *   looks for or avoids the repeat.
   * - Every notice a verb causes reaches each watch before the verb's answer reaches its caller, so a handler's synchronous
   *   work is complete by then. Rely on nothing stronger.
   * - A verb's notices come "out to in": the bank, the main gate, the root box, then the `dbhas`; or for a list, its
   *   `parentage` and then its `deltas`, in labelpath order.
   * - A notice goes to every watch of the bank, whoever sent the ask.
   * - A watch may be notified of a Thing again at a revision it has notified, or at an older one.
   * - A change the datastore itself reports arrives when the datastore delivers it, in no promised order against a verb's answer.
   */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews: (news: Errors.VaultError) => void): () => void
}

/** The members of {@link VaultDB} that are functions. */
const VaultDBMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'watch',
] as const satisfies readonly (keyof VaultDB)[]

/** True for an object with a function for each member of {@link VaultDB}. */
export function isVaultDB(val: unknown): val is VaultDB {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return VaultDBMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

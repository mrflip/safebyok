/** The `VaultDB` interface the models call, the answers its verbs resolve, and what a concrete adapter reports to `AdapterVaultDB`. */

import type { EX, Errors } from 'safebyok-big/internals'
import type { Labelpath, Lifepath, Lifeseq, Lifetok } from '../shapes/primitives'
import type { Sparse, ThingRecord, ThingScope, VoidSentinel } from '../shapes/shapes-thing'
import type { TombstoneOf } from '../shapes/shapes-sealers'
import type { BankRoots, BirthBankAsk, GetAsk, ListAsk, LoggableAsk, ThingWatchScope, Tracked, WorldRecord, WriteAsk } from '../shapes/shapes-asks'
import type { VaultEvent } from '../shapes/shapes-vault-event'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, DamagedThing, ReadTc, KidEntry, Kids, ListedBeside, ListThingsAnswer, BirthBankAnswer

/** A vaultDB verb's good answer: its `val`, the `act` that says what the datastore did, its bank's `world`, the loggable part of its `ask`, and when its step read the datastore (`read_tc`).
 * `world` is the bank and its main gate as the step left them, read in that step. It is null if either is missing or fails its checks.
 * `banktok` is the lifetok of the bank in `world`, or null where `world` is null.
 * `tracked`, only for an ask that tracks, says for each of the bank, its main gate and its root box whether it is still at the revision the ask tracks ({@link Tracked}).
 */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: WorldRecord | null, banktok: Lifetok | null, tracked?: Tracked, read_tc: ReadTc, val: ValT }

/** A refused answer's act: big's, or `policied` for a replacement that a storage policy or a changed born_at refuses. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err` and `act`, the Thing found stored (`dbhas`), its bank's `world`, the loggable part of its `ask`, and when its step read the datastore (`read_tc`).
 * Where nothing is stored at the ask's scope, `dbhas` is the shell there, under the nearest Thing stored above it (see {@link GetThingAnswer}).
 * `banktok` is the lifetok of the bank in `world`, or null where `world` is null.
 * If the verb threw, `world` and `banktok` are null, `read_tc` is when it was refused, and `dbhas` is the Thing the refusal names, or null where it names none.
 */
export type BadAnswer<DbhasT = ThingRecord | VoidSentinel | null> = { ok: false, ask: LoggableAsk, act: BadAct, world: WorldRecord | null, banktok: Lifetok | null, tracked?: Tracked, read_tc: ReadTc, dbhas: DbhasT, err: Errors.VaultError }

/** A vaultDB verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. Never thrown. */
export type Answer<ValT, ActT extends EX.GoodAct> = GoodAnswer<ValT, ActT> | BadAnswer

// where are the checkers for these? it would be better if they were close
/** The answer to `tryGetThing`: the live Thing (`gotlive`), or a `val` of null for a tombstone (`gotgone`) or none (`gotvoid`).
 * Every answer but `gotlive` carries a `dbhas`: the tombstone under `gotgone`, and the shell under `gotvoid` or a `void` refusal.
 * The shell's lifepath is that of the nearest Thing stored above it, live or a tombstone, as the step read it, then the
 * shell's lifeseq for each level below that Thing: `<box's lifepath>/-000000001` for `box/zz` under a stored root box. Where
 * nothing is stored above it, every level's lifeseq is the shell's (`-000000001/-000000001`); a root's is the shell's lifeseq alone.
 */
export type GetThingAnswer   =
  | GoodAnswer<ThingRecord, 'gotlive'>
  | (GoodAnswer<null, 'gotgone'> & { dbhas: TombstoneOf<ThingRecord> })
  | (GoodAnswer<null, 'gotvoid'> & { dbhas: VoidSentinel })
  | BadAnswer
/** The answer to `tryWriteThing`: the Thing the concrete adapter reports writing, or under `passed` the live Thing it found.
 * Refused, its `dbhas` is the Thing stored, or where none is, the shell there, as for {@link GetThingAnswer}.
 */
export type WriteThingAnswer = Answer<ThingRecord, EX.PutAct | EX.DelAct>

/** A child Thing that fails its kind's checks: its scope, and `am: 'd'`. */
export type DamagedThing = Readonly<ThingScope & { am: 'd' }>

/** When the datastore was read, as a UUID version 7: lowercase hex of a fixed width, so that two compare as text in the order of their reads.
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

/** What a listing answer carries beside its `val` or `dbhas`, good or refused:
 * - `parentage`    -- the parent, sparse, if one is stored
 * - `deltas`       -- each child the `val` names, sparse, in labelpath order
 * - `damaged_rows` -- each child that fails its kind's checks
 */
export type ListedBeside<RecordT extends ThingRecord = ThingRecord> = {
  parentage:    readonly Sparse<RecordT>[]
  deltas:       readonly Sparse<RecordT>[]
  damaged_rows: readonly DamagedThing[]
}

/** The answer to `tryListThings`: the parent's children as a {@link Kids} value, whose `read_tc` is the answer's. Its act is the parent's get act.
 * Refused under `void` or `gone`, its `dbhas` is `[]`, its `read_tc` says when the datastore read the parent, and its `parentage`
 * holds the parent's tombstone under `gone`; under `void` it says nothing of the life above the parent. If the verb threw, `dbhas` is null.
 */
export type ListThingsAnswer<RecordT extends ThingRecord = ThingRecord> =
  | (GoodAnswer<Kids, EX.GotAct> & ListedBeside<RecordT>)
  | (BadAnswer<Sparse<RecordT>[] | null> & ListedBeside<RecordT>)

/** The answer to `tryBirthBank`: the three roots written (`born`), or found already stored (`passed`). Refused, its `dbhas` is the root stored that refused it. */
export type BirthBankAnswer = Answer<BankRoots, 'born' | 'passed'>
// --

// == [Pre-image of an answer, carrying the actual stored value]: Actual, GotActual, WroteActual, ListThingsActual, BirthBankActual

/** A concrete adapter's report of one atomic step: its act, the bank's `world` as the step left it with its `tracked`, and a `record`.
 * `record` is the Thing found at the scope or, after a write, the Thing it reports writing. `AdapterVaultDB` turns it into the answer's `val` when good, its `dbhas` when refused.
 * A refused report has no error: `AdapterVaultDB` makes it from the act.
 * `read_tc` is the datastore's own time for the step, where it has one: `AdapterVaultDB` makes one when the report reaches it otherwise.
 */
export type Actual<ActT extends EX.GoodAct, RecordT = ThingRecord | VoidSentinel> =
  | { ok: true,  act: ActT,           world: WorldRecord | null, tracked?: Tracked, read_tc?: ReadTc, record: RecordT }
  | { ok: false, act: EX.RefusedAct,  world: WorldRecord | null, tracked?: Tracked, read_tc?: ReadTc, record: RecordT }

/** A concrete adapter's report of a get: its `record` is the Thing stored at the scope, or the shell there where none is ({@link GetThingAnswer}). */
export type GotActual = Actual<EX.GotAct>

/** A concrete adapter's report of a write: its `record` is the Thing it reports writing, or unwritten, the Thing stored at the scope, or the shell there where none is. */
export type WroteActual = Actual<EX.PutAct | EX.DelAct>

/** A concrete adapter's report of a listing: the parent's act, its children as a {@link Kids} value, and what the answer carries beside it.
 * Refused, it has no children, and its `read_tc` says when the datastore read the parent.
 */
export type ListThingsActual = Readonly<{ world: WorldRecord | null, tracked?: Tracked } & ListedBeside & (
  // why would you want read_tc to be missing?
  | { ok: true,  act: EX.GotAct, kids: Kids }
  | { ok: false, act: EX.RefusedAct, read_tc: ReadTc }
)>

/** A concrete adapter's report of a bank's birth: the three roots, written or already stored, or the first refused act with the Thing stored at that root, or its shell where none is.
 * `read_tc` is as for {@link Actual}.
 */
export type BirthBankActual =
  // it is much better to have robust types without optional fields -- why are they sometimes missing?
  | { ok: true,  act: 'born' | 'passed', world: WorldRecord | null, tracked?: Tracked, read_tc?: ReadTc, things: BankRoots }
  | { ok: false, act: EX.RefusedAct,     world: WorldRecord | null, tracked?: Tracked, read_tc?: ReadTc, record: ThingRecord | VoidSentinel }
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
   * What a watcher is notified of is the vaultDB's own to say: an `AdapterVaultDB` notifies each change its datastore
   * reports, when the datastore delivers it.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void
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

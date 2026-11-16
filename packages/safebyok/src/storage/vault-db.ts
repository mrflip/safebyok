/** The `VaultDB` interface the models call, the answers its verbs resolve, and what a store reports to its adapter. */

import type { EX, Errors } from 'safebyok-big/internals'
import type {
  BankThing, BirthBankAsk, BoxThing, GateThing, GetAsk, ListAsk, LoggableAsk, Sparse, Thing, ThingScope, ThingWatchScope, Tracked, WorldRecord, WriteAsk,
} from './shapes-thing'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, DamagedThing, ListedBeside, ListThingsAnswer, SlotAnswer, BirthSlotAnswers, BirthBankAnswer, ThingNotice

/** A vaultDB verb's good answer: its `val`, the `act` that says what the store did, its bank's `world`, and the loggable part of its `ask`.
 * `world` is the bank and its main gate as the step left them, read in that step. It is null if either is missing or fails its checks.
 * `tracked`, only for an ask that tracks, says for each of the bank, its main gate and its root box whether it is still at the revision the ask tracks ({@link Tracked}).
 */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: WorldRecord | null, tracked?: Tracked, val: ValT }

/** A refused answer's act: big's, or `policied` for a replacement that a storage policy or a changed born_at refuses. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err` and `act`, the Thing found stored (`dbhas`), its bank's `world`, and the loggable part of its `ask`.
 * `world` is null if the verb threw.
 */
export type BadAnswer<DbhasT = Thing | null> = { ok: false, ask: LoggableAsk, act: BadAct, world: WorldRecord | null, tracked?: Tracked, dbhas: DbhasT, err: Errors.VaultError }

/** A vaultDB verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. Never thrown. */
export type Answer<ValT, ActT extends EX.GoodAct> = GoodAnswer<ValT, ActT> | BadAnswer

/** The answer to `tryGetThing`: a live Thing (`gotlive`), a tombstone (`gotgone`), or null (`gotvoid`). */
export type GetThingAnswer   = GoodAnswer<Thing, 'gotlive' | 'gotgone'> | GoodAnswer<null, 'gotvoid'> | BadAnswer
/** The answer to `tryWriteThing`: the Thing the store reports writing, or under `passed` the live Thing it found. */
export type WriteThingAnswer = Answer<Thing, EX.PutAct | EX.DelAct>

/** A child Thing that fails its kind's checks: its scope, and `am: 'd'`. */
export type DamagedThing = Readonly<ThingScope & { am: 'd' }>

/** The `parent` and `damaged_rows` of a listing answer, good or refused. */
export type ListedBeside<RecordT extends Thing = Thing> = { parent: Sparse<RecordT> | null, damaged_rows: readonly DamagedThing[] }

/** The answer to `tryListThings`: the parent's children, sparse and in labelpath order, tombstones included. Its act is the parent's get act.
 * Refused under `void` or `gone`, its `dbhas` is `[]`. Under any other refusal it is null.
 */
export type ListThingsAnswer<RecordT extends Thing = Thing> =
  | (GoodAnswer<Sparse<RecordT>[], EX.GotAct> & ListedBeside<RecordT>)
  | (BadAnswer<Sparse<RecordT>[] | null>      & ListedBeside<RecordT>)

/** A slot's answer in a birth: the answer its put would give as a lone ask, less the `world` and `tracked` the birth answers once. */
export type SlotAnswer<RecordT extends Thing = Thing> =
  | Omit<GoodAnswer<RecordT, EX.PutAct>, 'world' | 'tracked'>
  | Omit<BadAnswer<RecordT | null>, 'world' | 'tracked'>

/** The slots of a birth's answer, one for each root's put, under the root's labelpath. */
export type BirthSlotAnswers = Readonly<{ bank: SlotAnswer<BankThing>, gate: SlotAnswer<GateThing>, box: SlotAnswer<BoxThing> }>

/** The answer to `tryBirthBank`: `born` where every root was written, `noop` where a slot refused, and nothing was written. Each slot answers as its lone put would.
 * Refused only where the step itself failed: then no slot answers, and `ask` is the whole birth ask, loggable.
 */
export type BirthBankAnswer =
  | Omit<BadAnswer, 'dbhas'>
  | { ok: true, ask: Readonly<{ op: 'birth' }>, act: 'born' | 'noop', world: WorldRecord | null, tracked?: Tracked, val: BirthSlotAnswers }

/** A changed Thing that a watch reports, shaped like a get's answer, with its bank's world as the store last read it. */
export type ThingNotice = Pick<GoodAnswer<Thing, 'gotlive' | 'gotgone'>, 'ok' | 'act' | 'val' | 'world'>
// --

// == [What a store reports]: Actual, ListThingsActual, SlotActual, BirthSlotActuals, BirthBankActual

/** A store's report of one atomic step: its act, the bank's `world` as the step left it with its `tracked`, and a `record`.
 * `record` is the Thing found at the scope or, after a write, the Thing the store reports writing. The adapter turns it into the answer's `val` when good, its `dbhas` when refused.
 * A refused report has no error: the adapter makes it from the act.
 */
export type Actual<ActT extends EX.GoodAct> =
  | { ok: true,  act: ActT,           world: WorldRecord | null, tracked?: Tracked, record: Thing | null }
  | { ok: false, act: EX.RefusedAct,  world: WorldRecord | null, tracked?: Tracked, record: Thing | null }

/** A store's report of a listing: the parent's act, the children `listed`, the parent, and the children that failed their checks. */
export type ListThingsActual = Readonly<{ world: WorldRecord | null, tracked?: Tracked, listed: Sparse<Thing>[] } & ListedBeside & (
  | { ok: true,  act: EX.GotAct }
  | { ok: false, act: EX.RefusedAct }
)>

/** A store's report of one slot of a birth: its put's act, and the Thing stored at its root or, under a write act, the record written. */
export type SlotActual<RecordT extends Thing = Thing> =
  | { ok: true,  act: EX.PutAct,      record: RecordT }
  | { ok: false, act: EX.RefusedAct,  record: RecordT | null }

/** A store's report of each slot of a birth, under its root's labelpath. */
export type BirthSlotActuals = Readonly<{ bank: SlotActual<BankThing>, gate: SlotActual<GateThing>, box: SlotActual<BoxThing> }>

/** A store's report of a bank's birth: `born` with the three roots as written, or `noop` with each slot's report over the roots stored. */
export type BirthBankActual = { act: 'born' | 'noop', world: WorldRecord | null, tracked?: Tracked, slots: BirthSlotActuals }
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
   *   born_at kept and the storage policies it names. Nothing else of the Thing stored is checked.
   * - Where several refusals apply at once, the answer is one of them, but which is unspecified, and may differ between stores
   *   and between versions. A Thing stored too damaged to check the preconditions against may refuse `damaged_row`,
   *   `storage_issue`, or the failed precondition's own refusal.
   * - The record carries every field, so a store may write it by replacing the Thing stored whole.
   */
  tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer>
  /** The children of the Thing at `ask`'s scope. */
  tryListThings(ask: ListAsk): Promise<ListThingsAnswer>
  /** Ensure a bank's three roots (bank, main gate, root box): write all three in one step where none is stored, or answer the roots stored.
   * A repeated birth over a complete bank writes nothing and is not refused. Where only some roots are stored, it refuses `storage_issue`.
   * Each root answers as its lone put would.
   */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer>
  /** Watch a bank's Things, returning a function that stops the watch.
   * `onNotice` gets each changed Thing, and each Thing in a verb's answer's `tracked` that is not `'same'`.
   * `onBadNews` gets any trouble the watch meets, including a Thing that fails its checks.
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

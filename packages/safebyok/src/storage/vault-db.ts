/** The `VaultDB` interface the models call, the answers its verbs resolve, and what a store reports to its adapter. */

import type { EX, Errors } from 'safebyok-big/internals'
import type {
  BankRoots, BirthBankAsk, GetAskArgs, GetThingAsk, ListAskArgs, ListThingsAsk, LoggableAsk, PutAskArgs, DelAskArgs, Sparse, Thing,
  ThingScope, ThingWatchScope, Tracked, WorldRecord, WriteAskOf, WriteThingAsk,
} from './shapes-thing'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, DamagedThing, ListedBeside, ListThingsAnswer, BirthBankAnswer, ThingNotice

/** A vaultDB verb's good answer: its `val`, the `act` that says what the store did, its bank's `world`, and the loggable part of its `ask`.
 * `world` is the bank and its main gate as the step left them, read in that step: null where no bank is stored, where either fails its checks, or where the step threw.
 * `tracked`, only for an ask that tracks, compares the same two with what the ask tracks.
 */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: WorldRecord | null, tracked?: Tracked, val: ValT }

/** A refused answer's act: big's, or `policied` for a replacement that a storage policy or a changed born_at refuses. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err`, its `act`, what is stored as `dbhas`, its bank's `world`, and the loggable part of its `ask`. */
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

/** The answer to `tryBirthBank`: the three roots the store wrote (`born`), or found already stored (`passed`). */
export type BirthBankAnswer = Answer<BankRoots, 'born' | 'passed'>

/** A Thing a watch saw change, as a get would answer it, with its bank's world as the store last read it. */
export type ThingNotice = Pick<GoodAnswer<Thing, 'gotlive' | 'gotgone'>, 'ok' | 'act' | 'val' | 'world'>
// --

// == [What a store reports]: Actual, ListThingsActual, BirthBankActual

/** A store's report of one atomic step: the act, the bank's world as the step left it and its `tracked`, and the Thing stored as `record`, which the adapter
 * places on the answer as `val` when good, as `dbhas` when refused. After a write, `record` is the Thing as the store reports writing it.
 * Refused, it carries the refused act and no error: the adapter makes the error from the act.
 */
export type Actual<ActT extends EX.GoodAct> =
  | { ok: true,  act: ActT,           world: WorldRecord | null, tracked?: Tracked, record: Thing | null }
  | { ok: false, act: EX.RefusedAct,  world: WorldRecord | null, tracked?: Tracked, record: Thing | null }

/** A store's report of a listing: the parent's act, the children `listed`, the parent, and the children that failed their checks. */
export type ListThingsActual = Readonly<{ world: WorldRecord | null, tracked?: Tracked, listed: Sparse<Thing>[] } & ListedBeside & (
  | { ok: true,  act: EX.GotAct }
  | { ok: false, act: EX.RefusedAct }
)>

/** A store's report of a bank's birth: the three roots, written or already stored, or the first refused act with the Thing stored at that root. */
export type BirthBankActual =
  | { ok: true,  act: 'born' | 'passed', world: WorldRecord | null, tracked?: Tracked, things: BankRoots }
  | { ok: false, act: EX.RefusedAct,     world: WorldRecord | null, tracked?: Tracked, record: Thing | null }
// --

// == [The interface]: VaultDB, VaultDBMembernames, isVaultDB

/** Storage for the Things of a user's banks. Each `try` verb is one atomic step, and resolves an answer instead of throwing.
 * Each `*Ask` builder fills in an ask's defaults and checks nothing: the verb it is passed to refuses a bad ask.
 */
export interface VaultDB {
  /** The Thing at `ask`'s scope. */
  tryGetThing(ask: GetThingAsk): Promise<GetThingAnswer>
  /** Write `ask.record` over the Thing `ask.cited`, if that is the Thing stored.
   * - A write whose preconditions hold (the exact revision cited, the storage policies it names, the born_at of a live Thing kept)
   *   carries its record forward. Nothing else of the Thing stored is checked.
   * - Where several refusals apply at once, the answer is one of them, but which is unspecified, and may differ between stores
   *   and between versions. A Thing stored too damaged to check the preconditions against may refuse `damaged_row`,
   *   `storage_issue`, or the failed precondition's own refusal.
   * - The record carries every field, so a store may write it by replacing the Thing stored whole.
   */
  tryWriteThing(ask: WriteThingAsk): Promise<WriteThingAnswer>
  /** The children of the Thing at `ask`'s scope. */
  tryListThings(ask: ListThingsAsk): Promise<ListThingsAnswer>
  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored. */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer>
  /** The get ask for the Thing at `args`'s scope. */
  getAsk(args: GetAskArgs): GetThingAsk
  /** The list ask for the children of the Thing at `args`'s scope. */
  listAsk(args: ListAskArgs): ListThingsAsk
  /** The put ask writing `args.record` over `args.cited`. */
  putAsk<RecordT extends Thing>(args: PutAskArgs<RecordT>): WriteAskOf<RecordT>
  /** The del ask writing the tombstone `args.record` over `args.cited`. */
  delAsk<RecordT extends Thing>(args: DelAskArgs<RecordT>): WriteAskOf<RecordT>
  /** Watch the Things of a bank, and return a function that stops the watch. `onBadNews` gets any trouble the watch meets, including a Thing that fails its checks.
   * `onNotice` also gets each Thing in a verb's answer's `tracked` that is not `'same'`.
   */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews: (news: Errors.VaultError) => void): () => void
}

/** The members of {@link VaultDB} that are functions. */
const VaultDBMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'getAsk', 'listAsk', 'putAsk', 'delAsk', 'watch',
] as const satisfies readonly (keyof VaultDB)[]

/** True for an object with a function for each member of {@link VaultDB}. */
export function isVaultDB(val: unknown): val is VaultDB {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return VaultDBMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

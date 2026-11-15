/** The `VaultDB` interface the models call, the answers its verbs resolve, and what a store reports to its adapter. */

import type { EX, Errors } from 'safebyok-big/internals'
import type {
  BankRoots, BirthBankAsk, GetAskArgs, GetThingAsk, ListAskArgs, ListThingsAsk, LoggableAsk, PutAskArgs, DelAskArgs, Sparse, Thing,
  ThingScope, ThingWatchScope, WriteAskOf, WriteThingAsk,
} from './shapes-thing'

// == [Answers]: GoodAnswer, BadAct, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, DamagedThing, ListedBeside, ListThingsAnswer, BirthBankAnswer, ThingNotice

// `world` will be the bank's Thing, read in the same step as the Thing asked for, once the Bank is a Thing. Other
// fields earn their own place on the answer.
/** A vaultDB verb's good answer: its `val`, the `act` that says what the store did, and the loggable part of its `ask`. */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: null, val: ValT }

/** Every act a refused answer carries: big's, and `policied` for a write that a storage policy, or the kept born_at, refuses where the put table would replace. */
export type BadAct = EX.BadAct | 'policied'

/** A vaultDB verb's refused answer: its `err`, its `act`, what is stored as `dbhas`, and the loggable part of its `ask`. */
export type BadAnswer<DbhasT = Thing | null> = { ok: false, ask: LoggableAsk, act: BadAct, world: null, dbhas: DbhasT, err: Errors.VaultError }

/** A vaultDB verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. Never thrown. */
export type Answer<ValT, ActT extends EX.GoodAct> = GoodAnswer<ValT, ActT> | BadAnswer

/** The answer to `tryGetThing`: the Thing stored, live or a tombstone, under `gotlive` or `gotgone`, or null under `gotvoid`. */
export type GetThingAnswer   = GoodAnswer<Thing, 'gotlive' | 'gotgone'> | GoodAnswer<null, 'gotvoid'> | BadAnswer
/** The answer to `tryWriteThing`: the Thing as the store reports writing it, or under `passed` the live one found. */
export type WriteThingAnswer = Answer<Thing, EX.PutAct | EX.DelAct>

/** A stored child that fails its kind's checks, named by where it is stored. */
export type DamagedThing = Readonly<ThingScope & { am: 'd' }>

/** What every listing answer carries, refused or not: the parent, and the children that failed their checks. */
export type ListedBeside<RecordT extends Thing = Thing> = { parent: Sparse<RecordT> | null, damaged_rows: readonly DamagedThing[] }

/** The answer to `tryListThings`: the parent's children, sparse, in labelpath order, tombstones included. Its act is a get's of the parent.
 * Refused under `void` or `gone`, its `dbhas` is `[]`, as the parent has no live life for a child to hang off; under any other refusal, null.
 */
export type ListThingsAnswer<RecordT extends Thing = Thing> =
  | (GoodAnswer<Sparse<RecordT>[], EX.GotAct> & ListedBeside<RecordT>)
  | (BadAnswer<Sparse<RecordT>[] | null>      & ListedBeside<RecordT>)

/** The answer to `tryBirthBank`: the bank's three roots, as written under `born`, or as stored under `passed`. */
export type BirthBankAnswer = Answer<BankRoots, 'born' | 'passed'>

/** A Thing a watch saw change, as a get would answer it. */
export type ThingNotice = Pick<GoodAnswer<Thing, 'gotlive' | 'gotgone'>, 'ok' | 'act' | 'val' | 'world'>
// --

// == [What a store reports]: Actual, ListThingsActual, BirthBankActual

/** What a store reports of one atomic step: the act, and the Thing stored as `record`, which the adapter places on the
 * answer as `val` when good, as `dbhas` when refused. After a write, `record` is the Thing as the store reports writing it.
 * Refused, it carries the refused act and no error: the adapter makes the error from the act.
 */
export type Actual<ActT extends EX.GoodAct> =
  | { ok: true,  act: ActT,           world: null, record: Thing | null }
  | { ok: false, act: EX.RefusedAct,  world: null, record: Thing | null }

/** What a store reports of a listing: the parent's act, the children `listed`, the parent, and the children that failed their checks. */
export type ListThingsActual = Readonly<{ world: null, listed: Sparse<Thing>[] } & ListedBeside & (
  | { ok: true,  act: EX.GotAct }
  | { ok: false, act: EX.RefusedAct }
)>

/** What a store reports of a bank's birth: the three roots, written or found, or the refusal of the first that refuses with the Thing it found. */
export type BirthBankActual =
  | { ok: true,  act: 'born' | 'passed', world: null, things: BankRoots }
  | { ok: false, act: EX.RefusedAct,     world: null, record: Thing | null }
// --

// == [The interface]: VaultDB, VaultDBMembernames, isVaultDB

/** Storage for the Things of a user's banks. Each verb is one atomic step, and never throws. Each builder fills in an ask's defaults and never throws: the verb it is handed to refuses what is wrong. */
export interface VaultDB {
  /** The Thing at `ask`'s scope. */
  tryGetThing(ask: GetThingAsk): Promise<GetThingAnswer>
  /** Write `ask.record` over the Thing `ask.cited`, if that is the Thing stored. */
  tryWriteThing(ask: WriteThingAsk): Promise<WriteThingAnswer>
  /** The children of the Thing at `ask`'s scope. */
  tryListThings(ask: ListThingsAsk): Promise<ListThingsAnswer>
  /** Write a new bank's bank, main gate and root box, where no bank is stored. */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer>
  /** The get ask for the Thing at `args`'s scope. */
  getAsk(args: GetAskArgs): GetThingAsk
  /** The list ask for the children of the Thing at `args`'s scope. */
  listAsk(args: ListAskArgs): ListThingsAsk
  /** The put ask writing `args.record` over `args.cited`. */
  putAsk<RecordT extends Thing>(args: PutAskArgs<RecordT>): WriteAskOf<RecordT>
  /** The del ask writing the tombstone `args.record` over `args.cited`. */
  delAsk<RecordT extends Thing>(args: DelAskArgs<RecordT>): WriteAskOf<RecordT>
  /** Watch the Things of a bank, and return a function that stops the watch. `onBadNews` hears the trouble the watch meets, a Thing heard that fails its checks among it. */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews: (news: Errors.VaultError) => void): () => void
}

/** The members a vaultDB answers with a function. */
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

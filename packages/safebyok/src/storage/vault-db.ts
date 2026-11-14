/** The `VaultDB` interface the models call, the answers its verbs resolve, and what a store reports to its adapter. */

import type { EX, Errors } from 'safebyok-big/internals'
import type { GetThingAsk, LoggableAsk, Thing, ThingWatchScope, WriteThingAsk } from './shapes-thing'

// == [Answers]: GoodAnswer, BadAnswer, Answer, GetThingAnswer, WriteThingAnswer, ThingNotice

// `world` will hold the bank's Thing, read in the same step as the Thing asked for, once the Bank is a Thing. Other
// fields earn their own place on the answer.
/** A vaultDB verb's good answer: its `val`, the `act` that says what the store did, and the loggable part of its `ask`. */
export type GoodAnswer<ValT, ActT extends EX.GoodAct> = { ok: true, ask: LoggableAsk, act: ActT, world: null, val: ValT }

/** A vaultDB verb's refused answer: its `err`, its `act`, the Thing the store holds as `dbhas`, and the loggable part of its `ask`. */
export type BadAnswer = { ok: false, ask: LoggableAsk, act: EX.BadAct, world: null, dbhas: Thing | null, err: Errors.VaultError }

/** A vaultDB verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. Never thrown. */
export type Answer<ValT, ActT extends EX.GoodAct> = GoodAnswer<ValT, ActT> | BadAnswer

/** The answer to `tryGetThing`: the Thing stored, live or a tombstone, or null for none. */
export type GetThingAnswer   = Answer<Thing | null, EX.GotAct>
/** The answer to `tryWriteThing`: the Thing as the store reports writing it, or under `passed` the live one found. */
export type WriteThingAnswer = Answer<Thing, EX.PutAct | EX.DelAct>

/** A Thing a watch saw change, as a get would answer it. */
export type ThingNotice = Pick<GoodAnswer<Thing, 'gotlive' | 'gotgone'>, 'act' | 'val' | 'world'>
// --

// == [What a store reports]: Actual

/** What a store reports of one atomic step: the act, and the Thing it holds as `record`, which the adapter places on the
 * answer as `val` when good, as `dbhas` when refused. After a write, `record` is the Thing as the store reports writing it.
 */
export type Actual<ActT extends EX.GoodAct> =
  | { ok: true,  act: ActT,           world: null, record: Thing | null }
  | { ok: false, act: EX.RefusedAct,  world: null, record: Thing | null }
// --

// == [The interface]: VaultDB

/** Storage for the Things of a user's banks: the main gate, for now. Each verb is one atomic step, and never throws. */
export interface VaultDB {
  /** The Thing at `ask`'s scope. */
  tryGetThing(ask: GetThingAsk): Promise<GetThingAnswer>
  /** Write `ask.record` over the Thing `ask.expected`, if that is the Thing stored. */
  tryWriteThing(ask: WriteThingAsk): Promise<WriteThingAnswer>
  /** Watch the Things of a bank, and return a function that stops the watch. */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews?: (news: Errors.VaultError) => void): () => void
}
// --

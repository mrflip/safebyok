/** The `AdapterVaultDB` base class: a store extends it by writing the `do*` calls. */

import { noop } from 'es-toolkit'
import type * as Z from 'zod'
import { EX, Errors, Outcome, Throwers, Validator, type Helpers } from 'safebyok-big/internals'
import { AnswerNotMade } from '../phrases'
import {
  type BirthBankAsk, type BirthPuts, type DelAskArgs, type GetAskArgs, type GetThingAsk, type ListAskArgs, type ListThingsAsk, type LoggableAsk, type PutAskArgs,
  type Thing, type ThingWatchScope, type Tracked, type WorldRecord, type WriteAskOf, type WriteThingAsk,
  birthPutsOf, checkedBirthBankAsk, checkedGetThingAsk, checkedListThingsAsk, checkedWriteThingAsk, delAskOf, getAskOf, listAskOf, loggableAskOf, putAskOf, watchArgs,
} from './shapes-thing'
import { type BankRootsFetched, type ThingsFetched, type WorldFetched, classifyBirthBank, classifyGetThing, classifyListThings, classifyWriteThing, watchedThingOf } from './thing-classifier'
import type {
  Actual, Answer, BadAnswer, BirthBankActual, BirthBankAnswer, GetThingAnswer, ListThingsActual, ListThingsAnswer, ThingNotice, VaultDB, WriteThingAnswer,
} from './vault-db'

// == [Answers]: Received, AdapterVaultDBOpts, answerOf

/** What a store's watch hands `receive`: a changed Thing, raw, and its bank's world as the store last read it. */
export type Received = Pick<Actual<EX.GoodAct>, 'world'> & { record: unknown }

/** The check of what a vaultDB that extends {@link AdapterVaultDB} is made with. */
const adapterVaultDBOpts = Validator.Checker(({ obj, bool }) => obj({
  /** False to tell no watch of what an answer's `tracked` reports: see {@link AdapterVaultDB.notifyTrackedRecords}. Default true. */
  doNotifyTracked: bool.optional(),
}).strict(), 'bad_option')

/** What a vaultDB that extends {@link AdapterVaultDB} is made with. */
export type AdapterVaultDBOpts = Readonly<Z.infer<typeof adapterVaultDBOpts>>

/** A watch, as the adapter keeps it: its bank, and what it does with each Thing received. */
type Feed = { scope: ThingWatchScope, receive: (received: Received) => void }

/** The answer a verb gives for its store's report: `record` becomes `val` when good, `dbhas` when refused.
 * Throws `storage_issue` if a good report other than `gotvoid` has no Thing.
 */
function answerOf(actual: Actual<EX.GotAct>, oplabel: string, loggableAsk: LoggableAsk): GetThingAnswer
function answerOf(actual: Actual<EX.PutAct | EX.DelAct>, oplabel: string, loggableAsk: LoggableAsk): WriteThingAnswer
function answerOf(actual: Actual<EX.GoodAct>, oplabel: string, loggableAsk: LoggableAsk): Answer<Thing | null, EX.GoodAct> {
  const { world, record } = actual
  const beside = trackedFieldOf(actual)
  if (! actual.ok) {
    const err = Throwers.actRefused('vault', actual.act, { oplabel, ask: loggableAsk })
    return { ok: false, ask: loggableAsk, act: actual.act, world, ...beside, dbhas: record, err }
  }
  // Every good act but gotvoid finds or writes a Thing: a store that reports none is broken.
  if ((record === null) && (actual.act !== 'gotvoid')) { throw Throwers.storageIssue() }
  return { ok: true, ask: loggableAsk, act: actual.act, world, ...beside, val: record }
}

/** The `tracked` a store reports, as a field to spread into an answer: none where it reports none. */
function trackedFieldOf({ tracked }: { tracked?: Tracked }): { tracked?: Tracked } { return (tracked === undefined) ? {} : { tracked } }
// --

/** The base class of a vaultDB that keeps its Things in a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies what a `do*` call fetches by the act tables in notes/answer-contract.md. It tells its watches of each
 * Thing in an answer's `tracked` that is not `'same'`, unless made with `doNotifyTracked: false`.
 */
export abstract class AdapterVaultDB implements VaultDB {
  // == [Props]: #doNotifyTracked, #feeds

  readonly #doNotifyTracked: boolean
  readonly #feeds = new Set<Feed>()

  /** Throws `bad_option` for opts it does not know. */
  constructor(opts: AdapterVaultDBOpts = {}) {
    const { doNotifyTracked = true } = adapterVaultDBOpts.parse(opts)
    this.#doNotifyTracked = doNotifyTracked
  }
  // --

  // == [Classifying]: classifyGetThing, classifyWriteThing, classifyListThings, classifyBirthBank
  // A subclass's `do*` calls these. A store that reaches some of the verdict itself overrides them to read it. Each
  // takes the raw bank and main gate of the ask's bank, fetched in the same step, as its world.

  /** Classify a get against the raw Thing fetched at its scope, null for none. */
  protected classifyGetThing(ask: GetThingAsk, raw: unknown, world: WorldFetched): Actual<EX.GotAct> { return classifyGetThing(ask, raw, world) }

  /** Classify a write against the raw Thing fetched at its scope, null for none, applying its storage policies. */
  protected classifyWriteThing(ask: WriteThingAsk, raw: unknown, world: WorldFetched): Actual<EX.PutAct | EX.DelAct> { return classifyWriteThing(ask, raw, world) }

  /** Classify a listing against the raw parent and the raw Things one label under it. */
  protected classifyListThings(ask: ListThingsAsk, fetched: ThingsFetched, world: WorldFetched): ListThingsActual { return classifyListThings(ask, fetched, world) }

  /** Classify a bank's birth, by its three puts, against its raw bank, main gate and root box, each null for none. */
  protected classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual { return classifyBirthBank(puts, fetched) }
  // --

  // == [Ask builders]: getAsk, listAsk, putAsk, delAsk

  /** The get ask for the Thing at `args`'s scope ({@link VaultDB.getAsk}). */
  getAsk(args: GetAskArgs): GetThingAsk { return getAskOf(args) }

  /** The list ask for the children of the Thing at `args`'s scope ({@link VaultDB.listAsk}). */
  listAsk(args: ListAskArgs): ListThingsAsk { return listAskOf(args) }

  /** The put ask writing `args.record` over `args.cited` ({@link VaultDB.putAsk}). */
  putAsk<RecordT extends Thing>(args: PutAskArgs<RecordT>): WriteAskOf<RecordT> { return putAskOf(args) }

  /** The del ask writing the tombstone `args.record` over `args.cited` ({@link VaultDB.delAsk}). */
  delAsk<RecordT extends Thing>(args: DelAskArgs<RecordT>): WriteAskOf<RecordT> { return delAskOf(args) }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, watch
  // Each verb's body is the plain path. Every throw in it lands in `answerForThrown`.

  /** The Thing at `ask`'s scope ({@link VaultDB.tryGetThing}). */
  async tryGetThing(ask: GetThingAsk): Promise<GetThingAnswer> {
    try {
      const checked     = checkedGetThingAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doGetThing(checked) // has act and ok, but no err yet
      const answer      = answerOf(actual, 'getThing', loggableAsk)
      this.notifyTrackedRecords(checked, answer)
      return answer
    } catch (err) { return this.answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteThingAsk): Promise<WriteThingAnswer> {
    try {
      const checked     = checkedWriteThingAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doWriteThing(checked) // has act and ok, but no err yet
      const answer      = answerOf(actual, 'writeThing', loggableAsk)
      this.notifyTrackedRecords(checked, answer)
      return answer
    } catch (err) { return this.answerForThrown(err, 'writeThing', ask) }
  }

  /** The children of the Thing at `ask`'s scope ({@link VaultDB.tryListThings}). */
  async tryListThings(ask: ListThingsAsk): Promise<ListThingsAnswer> {
    try {
      const checked     = checkedListThingsAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doListThings(checked)
      const beside      = { world: actual.world, ...trackedFieldOf(actual), parent: actual.parent, damaged_rows: actual.damaged_rows }
      const answer: ListThingsAnswer = actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, val: actual.listed }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: actual.listed, err: Throwers.actRefused('vault', actual.act, { oplabel: 'listThings', ask: loggableAsk }) }
      this.notifyTrackedRecords(checked, answer)
      return answer
    } catch (err) { return { ...this.answerForThrown(err, 'listThings', ask), dbhas: null, parent: null, damaged_rows: [] } }
  }

  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try {
      const checked     = checkedBirthBankAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doBirthBank(checked, birthPutsOf(checked))
      const beside      = { world: actual.world, ...trackedFieldOf(actual) }
      const answer: BirthBankAnswer = actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, val: actual.things }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: actual.record, err: Throwers.actRefused('vault', actual.act, { oplabel: 'birthBank', ask: loggableAsk }) }
      this.notifyTrackedRecords(checked, answer)
      return answer
    } catch (err) { return this.answerForThrown(err, 'birthBank', ask) }
  }

  /** Watch the Things of a bank, and return a function that stops the watch ({@link VaultDB.watch}).
   * A Thing received that fails its checks, or is not of the bank, goes to `onBadNews` and not to `onNotice`; so does what `onNotice` throws.
   */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const { scope: bankScope } = watchArgs.parse({ scope, onNotice, onBadNews })
    const feed: Feed = { scope: bankScope, receive: ({ record, world }) => {
      let val: Thing
      try { val = watchedThingOf(bankScope, record) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)); return }
      // A notice handler that throws is a bug in the host's code, not trouble in storage.
      try { onNotice({ ok: true, act: (val.am === 'a') ? 'gotlive' : 'gotgone', val, world }) } catch (err) { onBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)) }
    } }
    this.#feeds.add(feed)
    const stop = this.doWatch(bankScope, feed.receive, onBadNews)
    return () => { this.#feeds.delete(feed); stop() }
  }
  // --

  // == [Tracked]: notifyTrackedRecords

  // Each verb calls it last, on the answer it returns. Each watch hears on a later microtask, so nothing it does runs inside the verb.
  /** Tell each watch of the bank at `bankScope` of each Thing `answer.tracked` reports other than as `'same'`, with `answer.world`.
   * Does nothing for a vaultDB made with `doNotifyTracked: false`.
   */
  protected notifyTrackedRecords(bankScope: ThingWatchScope, { world, tracked }: { world: WorldRecord | null, tracked?: Tracked }): void {
    if ((tracked === undefined) || (! this.#doNotifyTracked)) { return }
    // Unspecified for a missing or damaged row: notes/wontfix.md.
    for (const record of Object.values(tracked)) {
      if (record === 'same') { continue }
      for (const { scope, receive } of this.#feeds) {
        if ((scope.userid === bankScope.userid) && (scope.banklabel === bankScope.banklabel)) {
          queueMicrotask(() => { receive({ record: structuredClone(record), world: structuredClone(world) }) })
        }
      }
    }
  }
  // --

  // == [Failures]: answerForThrown

  // All the error treatment of the verbs is here, and it has its own try/catch, so a verb never throws.
  /** The refused answer for a verb that threw. A refusal is kept, and anything else becomes `storage_unavailable`.
   * Its act is the one in the refusal's meta, else `unclassified_storing`.
   * Override it to tell one of your datastore's errors from another.
   */
  protected answerForThrown(thrown: unknown, oplabel: string, ask: unknown): BadAnswer {
    try {
      const err         = Outcome.storageRefusalOf(thrown)
      const loggableAsk = loggableAskOf(ask)
      Object.assign(err, { meta: { ...err.meta, oplabel, ask: loggableAsk } })
      // Only the classifier sets rows.dbhas, to a Thing it has checked.
      const dbhas = (Errors.rowsOfRefusal(err).dbhas ?? null) as Thing | null
      return { ok: false, ask: loggableAsk, act: err.meta?.act ?? 'unclassified_storing', world: null, dbhas, err }
    } catch {
      return { ok: false, ask: {}, act: 'unclassified_storing', world: null, dbhas: null, err: new Errors.VaultError('unexpected_error', AnswerNotMade) }
    }
  }
  // --

  // == [Protected, for a subclass to write]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch
  // Each is one atomic step: fetch the Thing at the ask's scope, classify it, and when `isWriteAct(act)` is true, write
  // `ask.record` and report the Thing the datastore reports writing, checked by `writtenThingOf`, in place of the one
  // fetched. A store that can run code of its own may run the whole step there. For an ask that carries `track`, the step
  // also compares it with the bank and main gate the world is read from, and reports that as the world's `tracked`
  // (`trackedFetchedOf` makes the comparison in TypeScript), read again after a write.
  //
  // A write checks only its preconditions of the Thing stored: the revision cited, the born_at a live Thing keeps, and the
  // storage policies it names (`classifyWriteThing` reads no more). Where several refusals apply at once, any one of them
  // may be the answer: all else equal the likelier is preferred, and `damaged_row` is the least likely, but no code is
  // written to rank them. The record carries every field, so a store may write it by replacing the Thing stored whole.
  //
  // A store that makes the checks in the statement that writes reports, beside a refusal, the Thing as it now stands and a
  // verdict for each check of the Thing stored that the act tables cannot name. It then answers in this order: the act
  // tables over the Thing read back (`storedCitedOf`, `writeActOf`), answering any act but a write with `unwrittenWriteOf`;
  // under a write act, each failed verdict's own refusal (`demandBornAtKept`, `demandPolicies`); and `storage_issue` where
  // no verdict explains the refusal. A birth answers with `unwrittenBirthOf`, or `storage_issue` where it finds a write.

  /** In one step: fetch the Thing at `ask`'s scope and its bank's raw world, and return `this.classifyGetThing(ask, raw, world)`. */
  protected abstract doGetThing(ask: GetThingAsk): Helpers.Awaitable<Actual<EX.GotAct>>
  /** In one step: fetch the Thing at `ask`'s scope, classify, and if the act is a write, write `ask.record` and report the Thing written,
   * with its bank's world after the write.
   */
  protected abstract doWriteThing(ask: WriteThingAsk): Helpers.Awaitable<Actual<EX.PutAct | EX.DelAct>>
  /** In one step: fetch the raw parent at `ask`'s scope, each raw Thing one label under it, and its bank's raw world, and return `this.classifyListThings(ask, fetched, world)`. */
  protected abstract doListThings(ask: ListThingsAsk): Helpers.Awaitable<ListThingsActual>
  /** In one step: fetch the raw bank, main gate and root box, return `this.classifyBirthBank(puts, fetched)`, and under `born` first
   * write each put's record and report the three as written, checked by `writtenRootsOf`, and the world the bank and main gate make.
   */
  protected abstract doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Helpers.Awaitable<BirthBankActual>
  /** Start a watch: call `receive` with each changed Thing, raw, and its bank's world as the store last read it, and `onBadNews` with
   * trouble, whether or not it ends the watch. Returns a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   */
  protected doWatch(_scope: ThingWatchScope, _receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void): () => void { return noop }
  // --
}

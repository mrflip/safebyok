/** The `AdapterVaultDB` base class: a concrete adapter extends it by writing the `do*` calls. */

import { deepFreeze, noop } from 'es-toolkit'
import { type EX, Errors, Outcome, SX, type Helpers } from 'safebyok-big/internals'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { Lifetok } from '../shapes/primitives'
import type { ThingRecord, VoidSentinel } from '../shapes/shapes-thing'
import type { TombstoneOf } from '../shapes/shapes-sealers'
import { type VaultEvent, type VaultItemEvent, VaultDBSourcelabel } from '../shapes/shapes-vault-event'
import {
  type BirthBankAsk, type BirthPuts, type GetAsk, type GetWorldAsk, type ListAsk, type LoggableAsk, type StatsAsk, type ThingWatchScope, type WriteAsk, AskChecks, birthPutsOf, checkedBirthBankAsk, checkedWriteAsk, loggableAskOf,
} from '../shapes/shapes-asks'
import {
  type Actual, type ActualBeside, type Answer, type BadAnswer, type BirthBankActual, type BirthBankAnswer, type GetThingAnswer, type GetWorldActual, type GetWorldAnswer, type GotActual, type ListThingsActual, type ListThingsAnswer,
  type Received, type StatsActual, type StatsAnswer, type WriteThingAnswer, type WroteActual, ActualChecks,
} from '../shapes/shapes-answers'
import { type VaultStats, VaultStatsChecks } from '../shapes/shapes-vault-stats'
import { itemEventOf, readTcNow } from './agerank'
import type { AboveFetched, BankFetched, BankRootsFetched, ThingsFetched } from './thing-classifier'
import * as Classifier from './thing-classifier'
import type { VaultDB } from './vault-db'
import * as Throwers from '../refusals/throwers'

// == [Answers]: besideOf, answerOf, frozenAnswerOf, noticeOf

// A concrete adapter's report is the module's entry: what the answer carries of it beside the record is read through its check.
/** What the answer to `actual` carries beside its `val` or `dbhas`: its `banktok`, its `tracked` and its `read_tc`.
 * Throws `storage_issue` for a report whose banktok is no UUID, whose `tracked` is no object, or whose `read_tc` is no UUID version 7.
 */
function besideOf(actual: ActualBeside): ActualBeside {
  const { banktok, tracked, read_tc } = ActualChecks.beside.parse(actual)
  return { banktok, tracked, read_tc }
}

/** The answer a verb gives for its concrete adapter's report: `record` becomes `val` when good, `dbhas` when refused.
 * A get that finds no live Thing answers a `val` of null, with the tombstone or the shell as its `dbhas`.
 * Throws `storage_issue` if a good report has no record.
 */
function answerOf(actual: GotActual, oplabel: string, loggableAsk: LoggableAsk): GetThingAnswer
function answerOf(actual: WroteActual, oplabel: string, loggableAsk: LoggableAsk): WriteThingAnswer
// A concrete adapter's report is the module's entry, so the null its types exclude is still checked for.
function answerOf(actual: Actual<EX.GoodAct, ThingRecord | VoidSentinel | null>, oplabel: string, loggableAsk: LoggableAsk): Answer<ThingRecord | null, EX.GoodAct> | GetThingAnswer {
  const { record } = actual
  const beside = besideOf(actual)
  if (! actual.ok) {
    const err = Throwers.actRefused('vault', actual.act, { oplabel, ask: loggableAsk })
    return { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: record, err }
  }
  // Every good act finds or writes a Thing, or for nothing stored the shell: a concrete adapter that reports none is broken.
  if (record === null) { throw Throwers.storageIssue() }
  const good = { ok: true, ask: loggableAsk, ...beside } as const
  if (actual.act === 'gotvoid') { return { ...good, act: actual.act, val: null, dbhas: record as VoidSentinel } }
  if (actual.act === 'gotgone') { return { ...good, act: actual.act, val: null, dbhas: record as TombstoneOf<ThingRecord> } }
  return { ...good, act: actual.act, val: record as ThingRecord }
}

// Frozen once, here, so that a Thing or a cache may hold the very records an answer carries.
/** `answer`, with every record it carries deeply frozen, and neither its ask nor its refusal. */
function frozenAnswerOf<AnswerT extends { ask: unknown, err?: unknown }>(answer: AnswerT): AnswerT {
  const { ask: _ask, err: _err, ...carried } = answer
  for (const val of Object.values(carried)) { deepFreeze(val) }
  return answer
}

/** The `item` notice for `record`, read now, from this vaultDB, with the vacant agerank, and the lifetok of `record` where it is the bank, else `received` */
function noticeOf(record: ThingRecord, received: Lifetok): VaultItemEvent {
  const banktok = ('lifetok' in record) ? record.lifetok : received
  return itemEventOf(record, { sourcelabel: VaultDBSourcelabel, read_tc: readTcNow(), banktok })
}
// --

/** The base class of a vaultDB over a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies what a `do*` call fetches per the act tables in `notes/answer-contract.md`.
 * Its watch notifies only what the datastore reports changing: nothing an answer carries.
 * Every record an answer or a notice carries is deeply frozen; an ask, and a record a caller hands it, never are.
 */
export abstract class AdapterVaultDB implements VaultDB {

  // == [Classifying]: classifyGetThing, classifyWriteThing, classifyListThings, classifyBirthBank, classifyGetWorld
  // A subclass's `do*` calls these. A concrete adapter that reaches some of the verdict itself overrides them to read it. Each
  // is given the raw bank of the ask's bank, fetched in the same step, which its banktok is read from; a get and a write, also
  // the nearest Thing stored above the ask's scope ({@link AboveFetched}).

  /** Classify a get against the raw Thing fetched at its scope, null for none, and the raw bank and nearest Thing stored above it, which gives the shell's lifepath where none is stored. */
  protected classifyGetThing(ask: GetAsk, raw: unknown, above: AboveFetched): GotActual { return Classifier.classifyGetThing(ask, raw, above) }

  /** Classify a write against the raw Thing fetched at its scope, null for none, and the raw bank and nearest Thing stored above it, checking the born_at and storage policies of a replace, and a bank write's lifetok. */
  protected classifyWriteThing(ask: WriteAsk, raw: unknown, above: AboveFetched): WroteActual { return Classifier.classifyWriteThing(ask, raw, above) }

  /** Classify a listing against the raw parent and the raw Things one label under it. */
  protected classifyListThings(ask: ListAsk, fetched: ThingsFetched, bankFetched: BankFetched): ListThingsActual { return Classifier.classifyListThings(ask, fetched, bankFetched) }

  /** Classify a bank's birth, by its three puts, against its raw bank, main gate and root box, each null for none. */
  protected classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual { return Classifier.classifyBirthBank(puts, fetched) }

  /** Classify a get of the world against its raw bank, main gate and root box, each null for none. */
  protected classifyGetWorld(ask: GetWorldAsk, fetched: BankRootsFetched): GetWorldActual { return Classifier.classifyGetWorld(ask, fetched) }

  /** Report a bank's storage stats beside its raw bank, fetched in the same step. */
  protected classifyStats(ask: StatsAsk, fetched: BankFetched, stats: VaultStats): StatsActual { return Classifier.classifyStats(ask, fetched, stats) }
  // --


  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, tryGetWorld, tryStats, watch
  // Each verb's body is the plain path. Every throw in it lands in `answerForThrown`.

  /** The Thing at `ask`'s scope ({@link VaultDB.tryGetThing}). */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    try {
      const thingGetAsk = AskChecks.getAsk.parse(ask)
      const loggableAsk = loggableAskOf(thingGetAsk)
      const actual      = await this.doGetThing(thingGetAsk) // has act and ok, but no err yet
      return frozenAnswerOf(answerOf(actual, 'getThing', loggableAsk))
    } catch (err) { return this.answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      const writeAsk    = checkedWriteAsk(ask)
      const loggableAsk = loggableAskOf(writeAsk)
      const actual      = await this.doWriteThing(writeAsk) // has act and ok, but no err yet
      return frozenAnswerOf(answerOf(actual, 'writeThing', loggableAsk))
    } catch (err) { return this.answerForThrown(err, 'writeThing', ask) }
  }

  /** The children of the Thing at `ask`'s scope ({@link VaultDB.tryListThings}). */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> {
    try {
      const listAsk     = AskChecks.listAsk.parse(ask)
      const loggableAsk = loggableAskOf(listAsk)
      const actual      = await this.doListThings(listAsk)
      const beside      = { ...besideOf(actual), ...ActualChecks.listed.parse(actual) }
      return frozenAnswerOf<ListThingsAnswer>(actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, val: { ...actual.kids, read_tc: beside.read_tc } }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: actual.record, err: Throwers.listParentNotLive({ oplabel: 'listThings', ask: loggableAsk, act: actual.act }) })
    } catch (err) { return { ...this.answerForThrown(err, 'listThings', ask), dbhas: null, parentage: [], deltas: [], damaged_rows: [] } }
  }

  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try {
      const birthBankAsk = checkedBirthBankAsk(ask)
      const loggableAsk  = loggableAskOf(birthBankAsk)
      const actual       = await this.doBirthBank(birthBankAsk, birthPutsOf(birthBankAsk))
      const beside       = besideOf(actual)
      return frozenAnswerOf<BirthBankAnswer>(actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, val: actual.things }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: actual.record, err: Throwers.actRefused('vault', actual.act, { oplabel: 'birthBank', ask: loggableAsk }) })
    } catch (err) { return this.answerForThrown(err, 'birthBank', ask) }
  }

  /** The bank's three roots, read in one step ({@link VaultDB.tryGetWorld}). */
  async tryGetWorld(ask: GetWorldAsk): Promise<GetWorldAnswer> {
    try {
      const worldAsk    = AskChecks.getWorldAsk.parse(ask)
      const loggableAsk = loggableAskOf(worldAsk)
      const actual      = await this.doGetWorld(worldAsk)
      return frozenAnswerOf<GetWorldAnswer>({ ok: true, ask: loggableAsk, act: actual.act, ...besideOf(actual), val: actual.things })
    } catch (err) { return this.answerForThrown(err, 'getWorld', ask) }
  }

  /** A bank's storage stats, read in one step ({@link VaultDB.tryStats}). */
  async tryStats(ask: StatsAsk): Promise<StatsAnswer> {
    try {
      const statsAsk    = AskChecks.statsAsk.parse(ask)
      const loggableAsk = loggableAskOf(statsAsk)
      const actual      = await this.doStats(statsAsk)
      return frozenAnswerOf<StatsAnswer>({ ok: true, ask: loggableAsk, act: actual.act, ...besideOf(actual), val: VaultStatsChecks.vaultStats.parse(actual.stats) })
    } catch (err) { return this.answerForThrown(err, 'stats', ask) }
  }

  /** Watch a bank's Things ({@link VaultDB.watch}): each notice is of a Thing the datastore reports changing, read when it arrives.
   * Records a datastore pushes together are notified one at a time.
   * A Thing that fails its checks or belongs to another bank goes to `onBadNews` instead of `onNotice`, as does an error `onNotice` throws.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const { scope: bankScope } = AskChecks.watchArgs.parse({ scope, onNotice, onBadNews })
    // A notice handler that throws is a bug in the host's code, not trouble in storage.
    const notify = bulletproofHandlerOf(onNotice, { ifError: 'tell', transformer: Throwers.refusalOfThrown, onBadNews })
    return this.doWatch(bankScope, ({ record, banktok }) => {
      let event: VaultItemEvent
      try {
        event = noticeOf(deepFreeze(Classifier.watchedThingOf(bankScope, record)), banktok)
      } catch (err) {
        onBadNews(Outcome.storageRefusalOf(err))
        return
      }
      notify(event)
    }, onBadNews)
  }
  // --

  // == [Failures]: answerForThrown

  // All the error treatment of the verbs is here, and it has its own try/catch, so a verb never throws.
  /** The refused answer for a verb that threw. A refusal passes through unchanged, and anything else becomes `storage_unavailable`.
   * Its act is the one in the refusal's meta, else `unclassified_storing`.
   * Override it to tell one of your datastore's errors from another.
   */
  protected answerForThrown(thrown: unknown, oplabel: string, ask: unknown): BadAnswer {
    try {
      const err         = Outcome.storageRefusalOf(thrown)
      const loggableAsk = loggableAskOf(ask)
      Object.assign(err, { meta: { ...err.meta, oplabel, ask: loggableAsk } })
      // Only the classifier sets rows.dbhas, to a Thing it has checked.
      const dbhas = (Errors.rowsOfRefusal(err).dbhas ?? null) as ThingRecord | null
      return frozenAnswerOf({ ok: false, ask: loggableAsk, act: err.meta?.act ?? 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', read_tc: readTcNow(), dbhas, err })
    } catch {
      return { ok: false, ask: {}, act: 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', read_tc: readTcNow(), dbhas: null, err: Throwers.answerNotMade() }
    }
  }
  // --

  // == [Protected, for a subclass to write]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doStats, doWatch
  // Each is one atomic step: fetch the Thing at the ask's scope, classify it, and when `isWriteAct(act)` is true, write
  // `ask.record` and report the Thing the datastore reports writing, checked by `writtenThingOf`, in place of the one
  // fetched. A datastore that can run code of its own may run the whole step there. The step also fetches the bank, main
  // gate and root box, compares the ask's `track` with them, and reports that as the answer's `tracked` (`trackedFetchedOf`
  // makes the comparison in TypeScript). The bank it fetches gives the answer's `banktok`, and carries when the step read
  // it, its `read_tc`: `readTcNow()` in the step, or the datastore's own UUID version 7. After a write, the report's
  // banktok, `tracked` and `read_tc` are those read after the write.
  //
  // A write checks only its preconditions of the Thing stored: the revision cited, the born_at a live Thing leaves unchanged,
  // the lifetok a write of the bank over a live bank keeps, and the storage policies it names (`classifyWriteThing` reads no
  // more). Where several refusals apply at once, any one of them may be the answer: all else equal the likelier is
  // preferred, and `damaged_row` is the least likely, but no code is written to rank them. The record carries every field,
  // so a concrete adapter may write it by replacing the Thing stored whole.
  //
  // A concrete adapter that makes the checks in the statement that writes reports, beside a refusal, the Thing as it now stands and a
  // verdict for each check of the Thing stored that the act tables cannot name. It then answers in this order: the act
  // tables over the Thing read back (`storedCitedOf`, `writeActOf`), answering any act but a write with `unwrittenWriteOf`;
  // under a write act, each failed verdict's own refusal (`demandBornAtKept`, `demandLifetokKept`, `demandPolicies`); and
  // `storage_issue` where no verdict explains the refusal. A birth answers with `unwrittenBirthOf`, or `storage_issue`
  // where it finds a write.

  /** In one step: fetch the Thing at `ask`'s scope, its bank's raw roots and the nearest Thing stored above it, and return `this.classifyGetThing(ask, raw, above)`. */
  protected abstract doGetThing(ask: GetAsk): Helpers.Awaitable<GotActual>
  /** In one step: fetch the Thing at `ask`'s scope, its bank's raw roots and the nearest Thing stored above it, classify, and if the act
   * is a write, write `ask.record` and report the Thing written, with its banktok and `tracked` after the write.
   */
  protected abstract doWriteThing(ask: WriteAsk): Helpers.Awaitable<WroteActual>
  /** In one step: fetch the raw parent at `ask`'s scope, each raw Thing one label under it, and its bank's raw roots, and return
   * `this.classifyListThings(ask, fetched, bankFetched)`.
   */
  protected abstract doListThings(ask: ListAsk): Helpers.Awaitable<ListThingsActual>
  /** In one step: fetch the raw bank, main gate and root box, return `this.classifyBirthBank(puts, fetched)`, and under `born` first
   * write each put's record and report the three as written, checked by `writtenRootsOf`, with the banktok and `tracked` after the write.
   */
  protected abstract doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Helpers.Awaitable<BirthBankActual>
  /** In one step, the same atomic unit as a get's: fetch the raw bank, main gate and root box, and return `this.classifyGetWorld(ask, fetched)`. */
  protected abstract doGetWorld(ask: GetWorldAsk): Helpers.Awaitable<GetWorldActual>
  /** In one step: fetch the raw bank, measure the bank's boxes and gates (`vaultStatsOf` measures raw rows), and return `this.classifyStats(ask, fetched, stats)`.
   * Report the store's limits where it has them; `storeLimitsOf` caps each, and gives the cap for one it lacks.
   */
  protected abstract doStats(ask: StatsAsk): Helpers.Awaitable<StatsActual>
  /** Start watching the datastore: call `receive` with each changed Thing, one at a time ({@link Received}), and `onBadNews` with any trouble,
   * whether or not it ends the watch. Return a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   */
  protected doWatch(_scope: ThingWatchScope, _receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void): () => void { return noop }
  // --
}

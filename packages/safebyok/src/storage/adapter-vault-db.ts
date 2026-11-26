/** The `AdapterVaultDB` base class: a concrete adapter extends it by writing the `do*` calls. */

import { deepFreeze, noop } from 'es-toolkit'
import { Errors, Outcome, SX, type Helpers } from 'safebyok-big/internals'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { Lifetok } from '../shapes/primitives'
import type { ThingRecord } from '../shapes/shapes-thing'
import { type ReadTc, type VaultEvent, type VaultItemEvent, VaultDBSourcelabel } from '../shapes/shapes-vault-event'
import {
  type BirthBankAsk, type BirthPuts, type GetAsk, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type WriteAsk, AskChecks, birthPutsOf, checkedBirthBankAsk, checkedWriteAsk, loggableAskOf,
} from '../shapes/shapes-asks'
import {
  type ActualBeside, type BadAnswer, type BirthBankActual, type BirthBankAnswer, type GetThingAnswer, type GetWorldActual, type GetWorldAnswer, type ListThingsActual, type ListThingsAnswer,
  type Received, type StatsActual, type StatsAnswer, type WriteThingAnswer, ActualChecks,
} from '../shapes/shapes-answers'
import type { GetManifest, WriteManifest } from '../shapes/shapes-manifest'
import { type VaultStats, VaultStatsChecks } from '../shapes/shapes-vault-stats'
import { itemEventOf, readTcNow } from './agerank'
import * as ManifestActs from './manifest-acts'
import * as ThreeWay from './three-way'
import type { BankFetched, BankRootsFetched, ThingsFetched } from './thing-classifier'
import * as Classifier from './thing-classifier'
import type { VaultDB } from './vault-db'
import * as Throwers from '../refusals/throwers'

// == [Answers]: besideOf, frozenAnswerOf, noticeOf

// A concrete adapter's report is the module's entry: what the answer carries of it beside the record is read through its check.
/** What the answer to `actual` carries beside its `val` or `dbhas`: its `banktok`, its `tracked` and its `read_tc`.
 * Throws `storage_issue` for a report whose banktok is no UUID, whose `tracked` is no object, or whose `read_tc` is no UUID version 7.
 */
function besideOf(actual: ActualBeside): ActualBeside {
  const { banktok, tracked, read_tc } = ActualChecks.beside.parse(actual)
  return { banktok, tracked, read_tc }
}

// Frozen once, here, so that a Thing or a cache may hold the very records an answer carries.
/** `answer`, with every record it carries deeply frozen, and neither its ask nor its refusal. */
function frozenAnswerOf<AnswerT extends { ask: unknown, err?: unknown }>(answer: AnswerT): AnswerT {
  const { ask: _ask, err: _err, ...carried } = answer
  for (const val of Object.values(carried)) { deepFreeze(val) }
  return answer
}

/** The `item` notice for `record`, read at `read_tc`, from this vaultDB, with the vacant agerank, and the lifetok of `record` where it is the bank, else `received` */
function noticeOf(record: ThingRecord, received: Lifetok, read_tc: ReadTc): VaultItemEvent {
  const banktok = ('lifetok' in record) ? record.lifetok : received
  return itemEventOf(record, { sourcelabel: VaultDBSourcelabel, read_tc, banktok })
}
// --

// The datastore decides whether to write by its own predicate, this class finds the act from the datastore's tags, and
// `demandWriteConsistency` requires the two to agree. The work done twice is what that check costs: never optimize it away.
/** The base class of a vaultDB over a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and answers from what a `do*` call observes, per the act tables in `notes/answer-contract.md`.
 * Its watch notifies only what the datastore reports changing: nothing an answer carries.
 * Every record an answer or a notice carries is deeply frozen; an ask, and a record a caller hands it, never are.
 */
export abstract class AdapterVaultDB implements VaultDB {

  // == [Classifying]: classifyListThings, classifyBirthBank, classifyGetWorld, classifyStats
  // Scaffolding: until thread 2 (manifest_rest), which gives these verbs manifests as get and write have.
  // A subclass's `do*` calls these. Each is given the raw bank of the ask's bank, fetched in the same step, which its banktok is read from.

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
      const manifest    = await this.doGetThing(thingGetAsk)
      ManifestActs.checkGetObservations(thingGetAsk, manifest)
      ManifestActs.scribeGetAct(thingGetAsk, manifest)
      const answer      = ManifestActs.getAnswerOf(thingGetAsk, manifest)
      ThreeWay.demandGetConsistency(thingGetAsk, manifest, answer)
      return frozenAnswerOf(answer)
    } catch (err) { return this.answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      const writeAsk = checkedWriteAsk(ask)
      const manifest = await this.doWriteThing(writeAsk)
      ManifestActs.checkWriteObservations(writeAsk, manifest)
      ManifestActs.scribeWriteAct(writeAsk, manifest)
      const answer   = ManifestActs.writeAnswerOf(writeAsk, manifest)
      ThreeWay.demandWriteConsistency(writeAsk, manifest, answer)
      return frozenAnswerOf(answer)
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

  /** Watch a bank's Things ({@link VaultDB.watch}): each notice is of a Thing the datastore reports changing, read when the datastore says, else when it arrives.
   * Records a datastore pushes together are notified one at a time.
   * A Thing that fails its checks or belongs to another bank goes to `onBadNews` instead of `onNotice`, as does an error `onNotice` throws.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void, onEnded: () => void = noop): () => void {
    const { scope: bankScope } = AskChecks.watchArgs.parse({ scope, onNotice, onBadNews, onEnded })
    // A notice handler that throws is a bug in the host's code, not trouble in storage.
    const notify = bulletproofHandlerOf(onNotice, { ifError: 'tell', transformer: Throwers.refusalOfThrown, onBadNews })
    return this.doWatch(bankScope, (received) => {
      const { record, banktok } = received
      let event: VaultItemEvent
      try {
        const { read_tc = readTcNow() } = ActualChecks.received.parse(received)
        event = noticeOf(deepFreeze(Classifier.watchedThingOf(bankScope, record)), ManifestActs.checkedBanktokOf(banktok), read_tc)
      } catch (err) {
        onBadNews(Outcome.storageRefusalOf(err))
        return
      }
      notify(event)
    }, onBadNews, onEnded)
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
  // Each is one atomic step. A get and a write observe, and hand back a manifest: the datastore's tags and each row exactly
  // as it stands at the step's last read (GetManifest, WriteManifest). A datastore that runs TypeScript makes its tags with
  // `ManifestTags`; one that cannot makes the same comparisons in its own language. It reads no check and no act table: this
  // class checks each row once, finds the act from the tags, and requires the datastore's write to agree with it.
  //
  // A write writes `ask.record` exactly where the datastore's own predicate allows: the ante row is the one cited, in the
  // record's format and with the cited lifepath's lifeseq, the ask's flag lets it write over that row (`ifPresent` 'repl' over a live Thing, `ifAbsent` 'add' over a tombstone or
  // none), a live record over a live Thing leaves its born_at the same, a write of the bank over a live bank its lifetok,
  // and the gate it replaces meets each storage policy the ask names. The record carries every field, so a datastore may
  // write it by replacing the row whole.
  //
  // The other verbs fetch, and hand what they fetched to the `classify*` call named in their doc block. Each also fetches
  // the bank, main gate and root box, compares the ask's `track` with them (`ManifestTags.trackedOf` makes the comparison in
  // TypeScript), and reads when it read them, its `read_tc`: `readTcNow()` in the step, or the datastore's own UUID version 7.
  // A birth answers with `unwrittenBirthOf`, or where `born`, writes the three roots and reports them checked by
  // `writtenRootsOf`, with the banktok, `tracked` and `read_tc` read after the write.

  /** In one step, read the Thing at `ask`'s scope, and hand back what was observed ({@link GetManifest}). */
  protected abstract doGetThing(ask: GetAsk): Helpers.Awaitable<GetManifest>
  /** In one step, write `ask.record` where the datastore's own predicate allows, and hand back what was observed ({@link WriteManifest}). */
  protected abstract doWriteThing(ask: WriteAsk): Helpers.Awaitable<WriteManifest>
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
   * Where the watch ends before its stop is called, call `onEnded` once, then `onBadNews` with why ({@link VaultDB.watch}).
   */
  protected doWatch(_scope: ThingWatchScope, _receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void, _onEnded: () => void): () => void { return noop }
  // --
}

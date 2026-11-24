/** The `AdapterVaultDB` base class: a concrete adapter extends it by writing the `do*` calls. */

import { noop } from 'es-toolkit'
import { EX, Errors, Outcome, type Helpers } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import type { Sparse, ThingRecord } from '../shapes/shapes-thing'
import type { TombstoneOf } from '../shapes/shapes-sealers'
import type { Recordkind, VaultEvent, VaultItemEvent } from '../shapes/shapes-vault-event'
import { Thing } from '../models/thing'
import {
  type AnyAsk, type BirthBankAsk, type BirthPuts, type GetAsk, type ListAsk, type LoggableAsk, type ThingWatchScope, type Tracked, type WriteAsk, AskChecks, birthPutsOf, checkedBirthBankAsk, checkedWriteAsk, loggableAskOf,
} from '../shapes/shapes-asks'
import type { BankRootsFetched, ThingsFetched, WorldFetched } from './thing-classifier'
import * as Classifier from './thing-classifier'
import type {
  Actual, Answer, BadAnswer, BirthBankActual, BirthBankAnswer, GetThingAnswer, ListThingsActual, ListThingsAnswer, VaultDB, WriteThingAnswer,
} from './vault-db'
import * as Throwers from '../refusals/throwers'

// == [Answers]: Received, answerOf, itemEventOf, recordkindOf

/** A change a concrete adapter's `doWatch` passes to `receive`: the changed Thing, raw, and its bank's world as the datastore last read it.
 * Watchers are notified of the Thing alone: a bank or main gate that changed is a change of its own.
 */
export type Received = Pick<Actual<EX.GoodAct>, 'world'> & { record: unknown }

/** One watcher of a bank: its scope, its `notify` for a Thing already checked, and its `onBadNews` */
type ThingWatcher = { scope: ThingWatchScope, notify: (val: ThingRecord | Sparse<ThingRecord>) => void, onBadNews: (news: Errors.VaultError) => void }

/** The answer a verb gives for its concrete adapter's report: `record` becomes `val` when good, `dbhas` when refused.
 * A get that finds no live Thing answers a `val` of null, with a tombstone or null as its `dbhas`.
 * Throws `storage_issue` if a good report other than `gotvoid` has no Thing.
 */
function answerOf(actual: Actual<EX.GotAct>, oplabel: string, loggableAsk: LoggableAsk): GetThingAnswer
function answerOf(actual: Actual<EX.PutAct | EX.DelAct>, oplabel: string, loggableAsk: LoggableAsk): WriteThingAnswer
function answerOf(actual: Actual<EX.GoodAct>, oplabel: string, loggableAsk: LoggableAsk): Answer<ThingRecord | null, EX.GoodAct> | GetThingAnswer {
  const { world, record } = actual
  const beside = trackedFieldOf(actual)
  if (! actual.ok) {
    const err = Throwers.actRefused('vault', actual.act, { oplabel, ask: loggableAsk })
    return { ok: false, ask: loggableAsk, act: actual.act, world, ...beside, dbhas: record, err }
  }
  const good = { ok: true, ask: loggableAsk, world, ...beside } as const
  if (actual.act === 'gotvoid') { return { ...good, act: actual.act, val: null, dbhas: null } }
  // Every good act but gotvoid finds or writes a Thing: a concrete adapter that reports none is broken.
  if (record === null) { throw Throwers.storageIssue() }
  if (actual.act === 'gotgone') { return { ...good, act: actual.act, val: null, dbhas: record as TombstoneOf<ThingRecord> } }
  return { ...good, act: actual.act, val: record }
}

/** The `tracked` a concrete adapter reports, as a field to spread into an answer: none where it reports none. */
function trackedFieldOf({ tracked }: { tracked?: Tracked }): { tracked?: Tracked } { return (tracked === undefined) ? {} : { tracked } }

/** The `item` notice for `record`, with no agerank */
function itemEventOf(record: ThingRecord | Sparse<ThingRecord>): VaultItemEvent {
  const { userid, banklabel, labelpath } = record
  return Object.freeze({ eventkind: 'item', userid, banklabel, labelpath, modelkind: Labelpath.modelkindOf(labelpath), agerank: undefined, agerankWas: undefined, recordkind: recordkindOf(record), record })
}

/** The recordkind of `record` */
function recordkindOf(record: ThingRecord | Sparse<ThingRecord>): Exclude<Recordkind, 'void'> {
  if (Thing.isGone(record)) { return 'gone' }
  return Thing.isSparse(record) ? 'soon' : 'full'
}
// --

/** The base class of a vaultDB over a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies what a `do*` call fetches per the act tables in `notes/answer-contract.md`.
 * It notifies each watcher of the bank of each Thing `tracked` reports other than `'same'`, of a `dbhas` that is a Thing,
 * and of a list's parentage and deltas.
 */
export abstract class AdapterVaultDB implements VaultDB {
  // == [Props]: #watchers

  readonly #watchers = new Set<ThingWatcher>()
  // --

  // == [Classifying]: classifyGetThing, classifyWriteThing, classifyListThings, classifyBirthBank
  // A subclass's `do*` calls these. A concrete adapter that reaches some of the verdict itself overrides them to read it. Each
  // is given the raw bank and main gate of the ask's bank, fetched in the same step, as its world.

  /** Classify a get against the raw Thing fetched at its scope, null for none. */
  protected classifyGetThing(ask: GetAsk, raw: unknown, world: WorldFetched): Actual<EX.GotAct> { return Classifier.classifyGetThing(ask, raw, world) }

  /** Classify a write against the raw Thing fetched at its scope, null for none, checking the born_at and storage policies of a replace, and a bank write's lifetok. */
  protected classifyWriteThing(ask: WriteAsk, raw: unknown, world: WorldFetched): Actual<EX.PutAct | EX.DelAct> { return Classifier.classifyWriteThing(ask, raw, world) }

  /** Classify a listing against the raw parent, the raw Things one label under it, and the `read_tc` of the step that read them. */
  protected classifyListThings(ask: ListAsk, fetched: ThingsFetched, world: WorldFetched): ListThingsActual { return Classifier.classifyListThings(ask, fetched, world) }

  /** Classify a bank's birth, by its three puts, against its raw bank, main gate and root box, each null for none. */
  protected classifyBirthBank(puts: BirthPuts, fetched: BankRootsFetched): BirthBankActual { return Classifier.classifyBirthBank(puts, fetched) }
  // --


  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, watch
  // Each verb's body is the plain path. Every throw in it lands in `answerForThrown`.

  /** The Thing at `ask`'s scope ({@link VaultDB.tryGetThing}). */
  async tryGetThing(ask: GetAsk): Promise<GetThingAnswer> {
    try {
      const thingGetAsk = AskChecks.getAsk.parse(ask)
      const loggableAsk = loggableAskOf(thingGetAsk)
      const actual      = await this.doGetThing(thingGetAsk) // has act and ok, but no err yet
      const answer      = answerOf(actual, 'getThing', loggableAsk)
      this.notifyTrackedRecords(thingGetAsk, answer)
      this.notifyDbhas(answer)
      return answer
    } catch (err) {
      const answer = this.answerForThrown(err, 'getThing', ask)
      this.notifyDbhas(answer)
      return answer
    }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      const writeAsk    = checkedWriteAsk(ask)
      const loggableAsk = loggableAskOf(writeAsk)
      const actual      = await this.doWriteThing(writeAsk) // has act and ok, but no err yet
      const answer      = answerOf(actual, 'writeThing', loggableAsk)
      // Out to in: the bank, the main gate, the root box, then the dbhas. Of the synthetic notifications this operation dispatches, by the time a watcher is notified of the subject Thing, it has already been notified of the bank and main gate.
      this.notifyTrackedRecords(writeAsk, answer)
      this.notifyDbhas(answer)
      return answer
    } catch (err) {
      const answer = this.answerForThrown(err, 'writeThing', ask)
      this.notifyDbhas(answer)
      return answer
    }
  }

  /** The children of the Thing at `ask`'s scope ({@link VaultDB.tryListThings}). */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> {
    try {
      const listAsk     = AskChecks.listAsk.parse(ask)
      const loggableAsk = loggableAskOf(listAsk)
      const actual      = await this.doListThings(listAsk)
      const beside      = { world: actual.world, ...trackedFieldOf(actual), parentage: actual.parentage, deltas: actual.deltas, damaged_rows: actual.damaged_rows }
      const answer: ListThingsAnswer = actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, read_tc: actual.kids.read_tc, val: actual.kids }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, read_tc: actual.read_tc, dbhas: [], err: Throwers.actRefused('vault', actual.act, { oplabel: 'listThings', ask: loggableAsk }) }
      this.notifyTrackedRecords(listAsk, answer)
      this.notifyListed(answer)
      return answer
    } catch (err) { return { ...this.answerForThrown(err, 'listThings', ask), dbhas: null, parentage: [], deltas: [], damaged_rows: [] } }
  }

  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try {
      const birthBankAsk = checkedBirthBankAsk(ask)
      const loggableAsk  = loggableAskOf(birthBankAsk)
      const actual       = await this.doBirthBank(birthBankAsk, birthPutsOf(birthBankAsk))
      const beside       = { world: actual.world, ...trackedFieldOf(actual) }
      const answer: BirthBankAnswer = actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, val: actual.things }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: actual.record, err: Throwers.actRefused('vault', actual.act, { oplabel: 'birthBank', ask: loggableAsk }) }
      this.notifyTrackedRecords(birthBankAsk, answer)
      this.notifyDbhas(answer)
      return answer
    } catch (err) {
      const answer = this.answerForThrown(err, 'birthBank', ask)
      this.notifyDbhas(answer)
      return answer
    }
  }

  /** Watch a bank's Things ({@link VaultDB.watch}).
   * Each notice carries one Thing: records a datastore pushes together are notified one at a time.
   * A Thing that fails its checks or belongs to another bank goes to `onBadNews` instead of `onNotice`, as does an error `onNotice` throws.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const { scope: bankScope } = AskChecks.watchArgs.parse({ scope, onNotice, onBadNews })
    const watcher: ThingWatcher = { scope: bankScope, onBadNews, notify: (val) => {
      // A notice handler that throws is a bug in the host's code, not trouble in storage.
      try { onNotice(itemEventOf(val)) } catch (err) { onBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)) }
    } }
    this.#watchers.add(watcher)
    const stop = this.doWatch(bankScope, ({ record }) => {
      let val: ThingRecord
      try { val = Classifier.watchedThingOf(bankScope, record) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)); return }
      watcher.notify(val)
    }, onBadNews)
    return () => { this.#watchers.delete(watcher); stop() }
  }
  // --

  // == [Notifying]: notifyTrackedRecords, notifyDbhas, notifyListed, #queueNotices, #queueListedNotices, #watchersOfBank

  // Queued before the verb returns. That means each watcher's synchronous work is done before the verb's caller resumes -- no handler runs inside the operation verb.
  /** Notify the watchers of `ask`'s bank of each root `tracked` reports other than `'same'`: the bank, then the main gate, then the root box. */
  protected notifyTrackedRecords(ask: AnyAsk, { tracked }: { tracked?: Tracked }): void {
    if (tracked === undefined) { return }
    // Unspecified for a missing or damaged row: notes/wontfix.md.
    for (const record of [tracked.bank, tracked[Labelpath.MainGate], tracked[Labelpath.RootBox]]) {
      if (record !== 'same') { this.#queueNotices(ask, record) }
    }
  }

  // The verb's caller lands only a good answer's val, so the watchers are notified of the dbhas: a refusal's, or a gone get's tombstone.
  /** Notify the watchers of the answer's bank of its `dbhas`, where that is a Thing. */
  protected notifyDbhas(answer: { ask: LoggableAsk, dbhas?: ThingRecord | null }): void {
    if ((answer.dbhas === undefined) || (answer.dbhas === null)) { return }
    this.#queueNotices(answer.ask, answer.dbhas)
  }

  // A list's caller keeps only its `val`, so the watchers are notified of its parentage and its deltas, after the tracked roots, just as for a dbhas.
  /** Notify the watchers of the answer's bank of its `parentage`, then its `deltas` in labelpath order. */
  protected notifyListed(answer: ListThingsAnswer): void {
    for (const record of [...answer.parentage, ...answer.deltas]) { this.#queueListedNotices(answer.ask, record) }
  }

  // Every watcher of one bank checks a Thing alike, so the first one's scope checks it for all.
  /** Queue a notice of `record` to each watcher of `scoped`'s bank, or bad news if it fails its checks. */
  #queueNotices(scoped: Pick<LoggableAsk, 'userid' | 'banklabel'>, record: ThingRecord): void {
    const watchers = this.#watchersOfBank(scoped)
    const [first] = watchers
    if (first === undefined) { return }
    queueMicrotask(() => {
      let val: ThingRecord
      try { val = Classifier.watchedThingOf(first.scope, record) } catch (err) {
        for (const { onBadNews } of watchers) { onBadNews(Outcome.storageRefusalOf(err)) }
        return
      }
      for (const { notify } of watchers) { notify(structuredClone(val)) }
    })
  }

  // A listed Thing is sparse, which the watch's check of a whole Thing refuses: the classifier checked it before making it sparse.
  /** Queue a notice of the listed `record`, unchecked, to each watcher of `scoped`'s bank. */
  #queueListedNotices(scoped: Pick<LoggableAsk, 'userid' | 'banklabel'>, record: Sparse<ThingRecord>): void {
    for (const { notify } of this.#watchersOfBank(scoped)) {
      queueMicrotask(() => { notify(structuredClone(record)) })
    }
  }

  /** The watchers of `scoped`'s bank, as of now. */
  #watchersOfBank(scoped: Pick<LoggableAsk, 'userid' | 'banklabel'>): ThingWatcher[] {
    return [...this.#watchers].filter(({ scope }) => (scope.userid === scoped.userid) && (scope.banklabel === scoped.banklabel))
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
      return { ok: false, ask: loggableAsk, act: err.meta?.act ?? 'unclassified_storing', world: null, dbhas, err }
    } catch {
      return { ok: false, ask: {}, act: 'unclassified_storing', world: null, dbhas: null, err: Throwers.answerNotMade() }
    }
  }
  // --

  // == [Protected, for a subclass to write]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch
  // Each is one atomic step: fetch the Thing at the ask's scope, classify it, and when `isWriteAct(act)` is true, write
  // `ask.record` and report the Thing the datastore reports writing, checked by `writtenThingOf`, in place of the one
  // fetched. A datastore that can run code of its own may run the whole step there. For an ask that carries `track`, the step
  // also compares it with the bank and main gate the world is read from, and with the root box read beside them, and reports
  // that as the answer's `tracked` (`trackedFetchedOf` makes the comparison in TypeScript), read again after a write.
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

  /** In one step: fetch the Thing at `ask`'s scope and its bank's raw world, and return `this.classifyGetThing(ask, raw, world)`. */
  protected abstract doGetThing(ask: GetAsk): Helpers.Awaitable<Actual<EX.GotAct>>
  /** In one step: fetch the Thing at `ask`'s scope, classify, and if the act is a write, write `ask.record` and report the Thing written,
   * with its bank's world after the write.
   */
  protected abstract doWriteThing(ask: WriteAsk): Helpers.Awaitable<Actual<EX.PutAct | EX.DelAct>>
  /** In one step: fetch the raw parent at `ask`'s scope, each raw Thing one label under it, and its bank's raw world, and return
   * `this.classifyListThings(ask, fetched, world)`, the fetched rows' `read_tc` made in that step (`readTcNow`, or the datastore's own UUID version 7).
   */
  protected abstract doListThings(ask: ListAsk): Helpers.Awaitable<ListThingsActual>
  /** In one step: fetch the raw bank, main gate and root box, return `this.classifyBirthBank(puts, fetched)`, and under `born` first
   * write each put's record and report the three as written, checked by `writtenRootsOf`, and the world the bank and main gate make.
   */
  protected abstract doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Helpers.Awaitable<BirthBankActual>
  /** Start watching the datastore: call `receive` with each changed Thing, one at a time ({@link Received}), and `onBadNews` with any trouble,
   * whether or not it ends the watch. Return a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   */
  protected doWatch(_scope: ThingWatchScope, _receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void): () => void { return noop }
  // --
}

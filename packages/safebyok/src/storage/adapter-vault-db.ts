/** The `AdapterVaultDB` base class: a concrete adapter extends it by writing the `do*` calls. */

import { noop } from 'es-toolkit'
import { type EX, Errors, Outcome, type Helpers } from 'safebyok-big/internals'
import { Labelpath, type Lifetok } from '../shapes/primitives'
import type { ThingRecord, VoidSentinel } from '../shapes/shapes-thing'
import type { TombstoneOf } from '../shapes/shapes-sealers'
import type { VaultEvent, VaultItemEvent } from '../shapes/shapes-vault-event'
import {
  type BirthBankAsk, type BirthPuts, type GetAsk, type ListAsk, type LoggableAsk, type ThingWatchScope, type Tracked, type WorldRecord, type WriteAsk, AskChecks, birthPutsOf, checkedBirthBankAsk, checkedWriteAsk, loggableAskOf,
} from '../shapes/shapes-asks'
import { itemSeenOf } from './agerank'
import type { AboveFetched, BankRootsFetched, ThingsFetched, WorldFetched } from './thing-classifier'
import * as Classifier from './thing-classifier'
import type {
  Actual, Answer, BadAnswer, BirthBankActual, BirthBankAnswer, GetThingAnswer, GotActual, ListThingsActual, ListThingsAnswer, VaultDB, WriteThingAnswer, WroteActual,
} from './vault-db'
import * as Throwers from '../refusals/throwers'

// == [Answers]: Received, answerOf, trackedFieldOf, banktokOf, itemEventOf

/** A change a concrete adapter's `doWatch` passes to `receive`: the changed Thing, raw, and its bank's world as the datastore last read it.
 * Watchers are notified of the Thing alone, with the world's lifetok: a bank or main gate that changed is a change of its own.
 */
export type Received = Pick<Actual<EX.GoodAct>, 'world'> & { record: unknown }

/** The answer a verb gives for its concrete adapter's report: `record` becomes `val` when good, `dbhas` when refused.
 * A get that finds no live Thing answers a `val` of null, with the tombstone or the shell as its `dbhas`.
 * Throws `storage_issue` if a good report has no record.
 */
function answerOf(actual: GotActual, oplabel: string, loggableAsk: LoggableAsk): GetThingAnswer
function answerOf(actual: WroteActual, oplabel: string, loggableAsk: LoggableAsk): WriteThingAnswer
// A concrete adapter's report is the module's entry, so the null its types exclude is still checked for.
function answerOf(actual: Actual<EX.GoodAct, ThingRecord | VoidSentinel | null>, oplabel: string, loggableAsk: LoggableAsk): Answer<ThingRecord | null, EX.GoodAct> | GetThingAnswer {
  const { world, record } = actual
  const beside = { banktok: banktokOf(world), ...trackedFieldOf(actual), read_tc: Classifier.readTcOfStep(actual.read_tc) }
  if (! actual.ok) {
    const err = Throwers.actRefused('vault', actual.act, { oplabel, ask: loggableAsk })
    return { ok: false, ask: loggableAsk, act: actual.act, world, ...beside, dbhas: record, err }
  }
  // Every good act finds or writes a Thing, or for nothing stored the shell: a concrete adapter that reports none is broken.
  if (record === null) { throw Throwers.storageIssue() }
  const good = { ok: true, ask: loggableAsk, world, ...beside } as const
  if (actual.act === 'gotvoid') { return { ...good, act: actual.act, val: null, dbhas: record as VoidSentinel } }
  if (actual.act === 'gotgone') { return { ...good, act: actual.act, val: null, dbhas: record as TombstoneOf<ThingRecord> } }
  return { ...good, act: actual.act, val: record as ThingRecord }
}

/** The `tracked` a concrete adapter reports, as a field to spread into an answer: none where it reports none. */
function trackedFieldOf({ tracked }: { tracked?: Tracked }): { tracked?: Tracked } { return (tracked === undefined) ? {} : { tracked } }

/** The lifetok of the bank in `world`, or null for no world: an answer's `banktok`. */
function banktokOf(world: WorldRecord | null): Lifetok | null { return world?.lifetok ?? null }

/** The `item` notice for `record`, read now, with no agerank and no source, and its bank's lifetok where `record` or `world` is the bank */
function itemEventOf(record: ThingRecord, world: WorldRecord | null): VaultItemEvent {
  const { userid, banklabel, labelpath } = record
  const banktok = ('lifetok' in record) ? record.lifetok : world?.lifetok
  const unsorted = { agerank: undefined, agerankWas: undefined, banktok, sourcelabel: undefined, read_tc: Classifier.readTcNow() }
  return Object.freeze({ eventkind: 'item', userid, banklabel, labelpath, modelkind: Labelpath.modelkindOf(labelpath), ...unsorted, ...itemSeenOf(record) })
}
// --

/** The base class of a vaultDB over a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies what a `do*` call fetches per the act tables in `notes/answer-contract.md`.
 * Its watch notifies only what the datastore reports changing: nothing an answer carries.
 */
export abstract class AdapterVaultDB implements VaultDB {

  // == [Classifying]: classifyGetThing, classifyWriteThing, classifyListThings, classifyBirthBank
  // A subclass's `do*` calls these. A concrete adapter that reaches some of the verdict itself overrides them to read it. Each
  // is given the raw bank and main gate of the ask's bank, fetched in the same step, as its world; a get and a write, also
  // the nearest Thing stored above the ask's scope ({@link AboveFetched}).

  /** Classify a get against the raw Thing fetched at its scope, null for none, and the raw world and nearest Thing stored above it, which gives the shell's lifepath where none is stored. */
  protected classifyGetThing(ask: GetAsk, raw: unknown, above: AboveFetched): GotActual { return Classifier.classifyGetThing(ask, raw, above) }

  /** Classify a write against the raw Thing fetched at its scope, null for none, and the raw world and nearest Thing stored above it, checking the born_at and storage policies of a replace, and a bank write's lifetok. */
  protected classifyWriteThing(ask: WriteAsk, raw: unknown, above: AboveFetched): WroteActual { return Classifier.classifyWriteThing(ask, raw, above) }

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
      return answerOf(actual, 'getThing', loggableAsk)
    } catch (err) { return this.answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> {
    try {
      const writeAsk    = checkedWriteAsk(ask)
      const loggableAsk = loggableAskOf(writeAsk)
      const actual      = await this.doWriteThing(writeAsk) // has act and ok, but no err yet
      return answerOf(actual, 'writeThing', loggableAsk)
    } catch (err) { return this.answerForThrown(err, 'writeThing', ask) }
  }

  /** The children of the Thing at `ask`'s scope ({@link VaultDB.tryListThings}). */
  async tryListThings(ask: ListAsk): Promise<ListThingsAnswer> {
    try {
      const listAsk     = AskChecks.listAsk.parse(ask)
      const loggableAsk = loggableAskOf(listAsk)
      const actual      = await this.doListThings(listAsk)
      const beside      = { world: actual.world, banktok: banktokOf(actual.world), ...trackedFieldOf(actual), parentage: actual.parentage, deltas: actual.deltas, damaged_rows: actual.damaged_rows }
      return actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, read_tc: actual.kids.read_tc, val: actual.kids }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, read_tc: actual.read_tc, dbhas: [], err: Throwers.actRefused('vault', actual.act, { oplabel: 'listThings', ask: loggableAsk }) }
    } catch (err) { return { ...this.answerForThrown(err, 'listThings', ask), dbhas: null, parentage: [], deltas: [], damaged_rows: [] } }
  }

  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try {
      const birthBankAsk = checkedBirthBankAsk(ask)
      const loggableAsk  = loggableAskOf(birthBankAsk)
      const actual       = await this.doBirthBank(birthBankAsk, birthPutsOf(birthBankAsk))
      const beside       = { world: actual.world, banktok: banktokOf(actual.world), ...trackedFieldOf(actual), read_tc: Classifier.readTcOfStep(actual.read_tc) }
      return actual.ok
        ? { ok: true,  ask: loggableAsk, act: actual.act, ...beside, val: actual.things }
        : { ok: false, ask: loggableAsk, act: actual.act, ...beside, dbhas: actual.record, err: Throwers.actRefused('vault', actual.act, { oplabel: 'birthBank', ask: loggableAsk }) }
    } catch (err) { return this.answerForThrown(err, 'birthBank', ask) }
  }

  /** Watch a bank's Things ({@link VaultDB.watch}): each notice is of a Thing the datastore reports changing, read when it arrives.
   * Records a datastore pushes together are notified one at a time.
   * A Thing that fails its checks or belongs to another bank goes to `onBadNews` instead of `onNotice`, as does an error `onNotice` throws.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const { scope: bankScope } = AskChecks.watchArgs.parse({ scope, onNotice, onBadNews })
    return this.doWatch(bankScope, ({ record, world }) => {
      let event: VaultItemEvent
      try { event = itemEventOf(Classifier.watchedThingOf(bankScope, record), world) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)); return }
      // A notice handler that throws is a bug in the host's code, not trouble in storage.
      try { onNotice(event) } catch (err) { onBadNews(Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)) }
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
      return { ok: false, ask: loggableAsk, act: err.meta?.act ?? 'unclassified_storing', world: null, banktok: null, read_tc: Classifier.readTcNow(), dbhas, err }
    } catch {
      return { ok: false, ask: {}, act: 'unclassified_storing', world: null, banktok: null, read_tc: Classifier.readTcNow(), dbhas: null, err: Throwers.answerNotMade() }
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

  /** In one step: fetch the Thing at `ask`'s scope, its bank's raw world and the nearest Thing stored above it, and return `this.classifyGetThing(ask, raw, above)`. */
  protected abstract doGetThing(ask: GetAsk): Helpers.Awaitable<GotActual>
  /** In one step: fetch the Thing at `ask`'s scope, its bank's raw world and the nearest Thing stored above it, classify, and if the act
   * is a write, write `ask.record` and report the Thing written, with its bank's world after the write.
   */
  protected abstract doWriteThing(ask: WriteAsk): Helpers.Awaitable<WroteActual>
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

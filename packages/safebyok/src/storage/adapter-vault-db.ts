/** `AdapterVaultDB`, the base class a store extends by writing its `do*` calls. */

import { noop } from 'es-toolkit'
import { EX, Errors, Outcome, Throwers, type Helpers } from 'safebyok-big/internals'
import { AnswerNotMade } from '../phrases'
import {
  type BirthBankAsk, type BirthPuts, type DelAskArgs, type GetAskArgs, type GetThingAsk, type ListAskArgs, type ListThingsAsk, type LoggableAsk, type PutAskArgs,
  type Thing, type ThingWatchScope, type WriteAskOf, type WriteThingAsk,
  birthPutsOf, checkedBirthBankAsk, checkedGetThingAsk, checkedListThingsAsk, checkedWriteThingAsk, delAskOf, getAskOf, listAskOf, loggableAskOf, putAskOf, watchArgs,
} from './shapes-thing'
import { type BankRootsFetched, type ThingsFetched, classifyBirthBank, classifyGetThing, classifyListThings, classifyWriteThing, watchedThingOf } from './thing-classifier'
import type {
  Actual, Answer, BadAnswer, BirthBankActual, BirthBankAnswer, GetThingAnswer, ListThingsActual, ListThingsAnswer, ThingNotice, VaultDB, WriteThingAnswer,
} from './vault-db'

// == [Answers]: answerOf

/** A verb's answer from what its store reports: `record` as `val` when good, as `dbhas` when refused.
 * Throws `storage_issue` for a good act, other than `gotvoid`, that reports no Thing.
 */
function answerOf(actual: Actual<EX.GotAct>, oplabel: string, loggableAsk: LoggableAsk): GetThingAnswer
function answerOf(actual: Actual<EX.PutAct | EX.DelAct>, oplabel: string, loggableAsk: LoggableAsk): WriteThingAnswer
function answerOf(actual: Actual<EX.GoodAct>, oplabel: string, loggableAsk: LoggableAsk): Answer<Thing | null, EX.GoodAct> {
  const { world, record } = actual
  if (! actual.ok) {
    const err = Throwers.actRefused('vault', actual.act, { oplabel, ask: loggableAsk })
    return { ok: false, ask: loggableAsk, act: actual.act, world, dbhas: record, err }
  }
  // Every good act but gotvoid finds or writes a Thing: a store that reports none is broken.
  if ((record === null) && (actual.act !== 'gotvoid')) { throw Throwers.storageIssue() }
  return { ok: true, ask: loggableAsk, act: actual.act, world, val: record }
}
// --

/** The base class of a vaultDB that keeps its Things in a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies what a `do*` call fetches by the act tables in notes/answer-contract.md.
 */
export abstract class AdapterVaultDB implements VaultDB {
  // == [Classifying]: classifyGetThing, classifyWriteThing, classifyListThings, classifyBirthBank
  // A subclass's `do*` calls these. A store that reaches some of the verdict itself overrides them to read it.

  /** Classify a get against the raw Thing fetched at its scope, null for none. */
  protected classifyGetThing(ask: GetThingAsk, raw: unknown): Actual<EX.GotAct> { return classifyGetThing(ask, raw) }

  /** Classify a write against the raw Thing fetched at its scope, null for none, applying its storage policies. */
  protected classifyWriteThing(ask: WriteThingAsk, raw: unknown): Actual<EX.PutAct | EX.DelAct> { return classifyWriteThing(ask, raw) }

  /** Classify a listing against the raw parent and the raw Things one label under it. */
  protected classifyListThings(ask: ListThingsAsk, fetched: ThingsFetched): ListThingsActual { return classifyListThings(ask, fetched) }

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
      return answerOf(actual, 'getThing', loggableAsk)
    } catch (err) { return this.answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.cited` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteThingAsk): Promise<WriteThingAnswer> {
    try {
      const checked     = checkedWriteThingAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doWriteThing(checked) // has act and ok, but no err yet
      return answerOf(actual, 'writeThing', loggableAsk)
    } catch (err) { return this.answerForThrown(err, 'writeThing', ask) }
  }

  /** The children of the Thing at `ask`'s scope ({@link VaultDB.tryListThings}). */
  async tryListThings(ask: ListThingsAsk): Promise<ListThingsAnswer> {
    try {
      const checked     = checkedListThingsAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doListThings(checked)
      const beside      = { parent: actual.parent, damaged_rows: actual.damaged_rows }
      if (actual.ok) { return { ok: true, ask: loggableAsk, act: actual.act, world: actual.world, ...beside, val: actual.listed } }
      const err = Throwers.actRefused('vault', actual.act, { oplabel: 'listThings', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: actual.act, world: actual.world, ...beside, dbhas: actual.listed, err }
    } catch (err) { return { ...this.answerForThrown(err, 'listThings', ask), dbhas: null, parent: null, damaged_rows: [] } }
  }

  /** Write a new bank's bank, main gate and root box, where no bank is stored ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try {
      const checked     = checkedBirthBankAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doBirthBank(checked, birthPutsOf(checked))
      if (actual.ok) { return { ok: true, ask: loggableAsk, act: actual.act, world: actual.world, val: actual.things } }
      const err = Throwers.actRefused('vault', actual.act, { oplabel: 'birthBank', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: actual.act, world: actual.world, dbhas: actual.record, err }
    } catch (err) { return this.answerForThrown(err, 'birthBank', ask) }
  }

  /** Watch the Things of a bank, and return a function that stops the watch ({@link VaultDB.watch}).
   * A Thing heard that fails its checks, or is not of the bank, goes to `onBadNews` and not to `onNotice`.
   */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews: (news: Errors.VaultError) => void): () => void {
    const { scope: bankScope } = watchArgs.parse({ scope, onNotice, onBadNews })
    return this.doWatch(bankScope, ({ record, world }) => {
      let val: Thing
      try { val = watchedThingOf(bankScope, record) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)); return }
      onNotice({ ok: true, act: (val.am === 'a') ? 'gotlive' : 'gotgone', val, world })
    }, onBadNews)
  }
  // --

  // == [Failures]: answerForThrown

  // All the error treatment of the verbs is here, and it has its own try/catch, so a verb never throws.
  /** The refused answer for a verb that threw: a refusal as it is, anything else as `storage_unavailable`.
   * Its act is the one the refusal names in its meta, if any, else `unclassified_storing`.
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
  // fetched. A store that can run code of its own may run the whole step there.

  /** In one step: fetch the Thing at `ask`'s scope, and return `this.classifyGetThing(ask, raw)`. */
  protected abstract doGetThing(ask: GetThingAsk): Helpers.Awaitable<Actual<EX.GotAct>>
  /** In one step: fetch the Thing at `ask`'s scope, classify, and if the act is a write, write `ask.record` and report the Thing written. */
  protected abstract doWriteThing(ask: WriteThingAsk): Helpers.Awaitable<Actual<EX.PutAct | EX.DelAct>>
  /** In one step: fetch the raw parent at `ask`'s scope and each raw Thing one label under it, and return `this.classifyListThings(ask, fetched)`. */
  protected abstract doListThings(ask: ListThingsAsk): Helpers.Awaitable<ListThingsActual>
  /** In one step: fetch the raw bank, main gate and root box, return `this.classifyBirthBank(puts, fetched)`, and under `born` first
   * write each put's record and report the three as written, checked by `writtenRootsOf`.
   */
  protected abstract doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Helpers.Awaitable<BirthBankActual>
  /** Start a watch: call `hear` with each changed Thing, and `onBadNews` with trouble, whether or not it ends the watch.
   * Returns a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   */
  protected doWatch(_scope: ThingWatchScope, _hear: (heard: Pick<Actual<EX.GoodAct>, 'world'> & { record: unknown }) => void, _onBadNews: (news: Errors.VaultError) => void): () => void { return noop }
  // --
}

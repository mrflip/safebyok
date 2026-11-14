/** `AdapterVaultDB`, the base class a store extends by writing its `do*` calls. */

import { noop } from 'es-toolkit'
import { EX, Errors, Outcome, Throwers, type Helpers } from 'safebyok-big/internals'
import { AnswerNotMade } from '../phrases'
import { type GetThingAsk, type ThingWatchScope, type WriteThingAsk, checkedGetThingAsk, checkedWriteThingAsk, loggableAskOf, thingWatchScope } from './shapes-thing'
import { classifyGetThing, classifyWriteThing, noticedThingOf } from './thing-classifier'
import type { Actual, BadAnswer, GetThingAnswer, ThingNotice, VaultDB, WriteThingAnswer } from './vault-db'

/** Drop bad news unheard. */
function noBadNews(_news: Errors.VaultError): void { /* unheard */ }

/** The base class of a vaultDB that keeps its Things in a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies what a `do*` call fetches by the act tables in notes/answer-contract.md.
 */
export abstract class AdapterVaultDB implements VaultDB {
  // == [Classifying]: classifyGetThing, classifyWriteThing
  // A subclass's `do*` calls these. A store that reaches some of the verdict itself overrides them to read it.

  /** Classify a get against the raw Thing fetched at its scope, null for none. */
  protected classifyGetThing(ask: GetThingAsk, raw: unknown): Actual<EX.GotAct> { return classifyGetThing(ask, raw) }

  /** Classify a write against the raw Thing fetched at its scope, null for none, applying its storage policies. */
  protected classifyWriteThing(ask: WriteThingAsk, raw: unknown): Actual<EX.PutAct | EX.DelAct> { return classifyWriteThing(ask, raw) }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, watch
  // Each verb's body is the plain path. Every throw in it lands in `answerForThrown`.

  /** The Thing at `ask`'s scope ({@link VaultDB.tryGetThing}). */
  async tryGetThing(ask: GetThingAsk): Promise<GetThingAnswer> {
    try {
      const checked     = checkedGetThingAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doGetThing(checked)
      if (actual.ok) { return { ok: true, ask: loggableAsk, act: actual.act, world: actual.world, val: actual.record } }
      const err = Throwers.actRefused('vault', actual.act, { oplabel: 'getThing', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: actual.act, world: actual.world, dbhas: actual.record, err }
    } catch (err) { return this.answerForThrown(err, 'getThing', ask) }
  }

  /** Write `ask.record` over the Thing `ask.expected` ({@link VaultDB.tryWriteThing}). */
  async tryWriteThing(ask: WriteThingAsk): Promise<WriteThingAnswer> {
    try {
      const checked     = checkedWriteThingAsk(ask)
      const loggableAsk = loggableAskOf(checked)
      const actual      = await this.doWriteThing(checked)
      if (! actual.ok) {
        const err = Throwers.actRefused('vault', actual.act, { oplabel: 'writeThing', ask: loggableAsk })
        return { ok: false, ask: loggableAsk, act: actual.act, world: actual.world, dbhas: actual.record, err }
      }
      // A good write has a Thing: the one written, or under `passed` the live one found. A store that reports none is broken.
      if (actual.record === null) { throw Throwers.storageIssue() }
      return { ok: true, ask: loggableAsk, act: actual.act, world: actual.world, val: actual.record }
    } catch (err) { return this.answerForThrown(err, 'writeThing', ask) }
  }

  /** Watch the Things of a bank, and return a function that stops the watch ({@link VaultDB.watch}).
   * A Thing heard that fails its checks is dropped unheard.
   */
  watch(scope: ThingWatchScope, onNotice: (notice: ThingNotice) => void, onBadNews: (news: Errors.VaultError) => void = noBadNews): () => void {
    return this.doWatch(thingWatchScope.parse(scope), ({ record, world }) => {
      const val = noticedThingOf(record)
      if (val === null) { return }
      onNotice({ act: (val.am === 'a') ? 'gotlive' : 'gotgone', val, world })
    }, onBadNews)
  }
  // --

  // == [Failures]: answerForThrown

  // All the error treatment of the verbs is here, and it has its own try/catch, so a verb never throws.
  /** The refused answer for a verb that threw: a refusal as it is, anything else as `storage_unavailable`.
   * Override it to tell one of your datastore's errors from another.
   */
  protected answerForThrown(thrown: unknown, oplabel: string, ask: unknown): BadAnswer {
    try {
      const err         = Outcome.storageRefusalOf(thrown)
      const loggableAsk = loggableAskOf(ask)
      Object.assign(err, { meta: { ...err.meta, oplabel, ask: loggableAsk } })
      const dbhas = noticedThingOf(Errors.rowsOfRefusal(err).dbhas ?? null)
      return { ok: false, ask: loggableAsk, act: 'unclassified_storing', world: null, dbhas, err }
    } catch {
      return { ok: false, ask: {}, act: 'unclassified_storing', world: null, dbhas: null, err: new Errors.VaultError('unexpected_error', AnswerNotMade) }
    }
  }
  // --

  // == [Protected, for a subclass to write]: doGetThing, doWriteThing, doWatch
  // Each is one atomic step: fetch the Thing at the ask's scope, classify it, and when `isWriteAct(act)` is true, write
  // `ask.record` and report the Thing the datastore reports writing, checked by `writtenThingOf`, in place of the one
  // fetched. A store that can run code of its own may take the whole step there.

  /** In one step: fetch the Thing at `ask`'s scope, and return `this.classifyGetThing(ask, raw)`. */
  protected abstract doGetThing(ask: GetThingAsk): Helpers.Awaitable<Actual<EX.GotAct>>
  /** In one step: fetch the Thing at `ask`'s scope, classify, and if the act is a write, write `ask.record` and report the Thing written. */
  protected abstract doWriteThing(ask: WriteThingAsk): Helpers.Awaitable<Actual<EX.PutAct | EX.DelAct>>
  /** Start a watch: call `hear` with each changed Thing, and `onBadNews` with trouble, whether or not it ends the watch.
   * Returns a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   */
  protected doWatch(_scope: ThingWatchScope, _hear: (heard: Pick<Actual<EX.GoodAct>, 'world'> & { record: unknown }) => void, _onBadNews: (news: Errors.VaultError) => void): () => void { return noop }
  // --
}

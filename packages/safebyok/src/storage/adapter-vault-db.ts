/** The `AdapterVaultDB` base class: a concrete adapter extends it by writing the `do*` calls. */

import { deepFreeze, noop } from 'es-toolkit'
import { Errors, Outcome, SX, type Helpers } from 'safebyok-big/internals'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { Banktok } from '../shapes/primitives'
import type { ThingRecord } from '../shapes/shapes-thing'
import { type ReadTc, type VaultEvent, type VaultItemEvent, VaultDBSourcelabel } from '../shapes/shapes-vault-event'
import {
  type BirthBankAsk, type BirthPuts, type GetAsk, type GetBankAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type WriteAsk, AskChecks, birthPutsOf, checkedBirthBankAsk, checkedWriteAsk, loggableAskOf,
} from '../shapes/shapes-asks'
import type { BadAnswer, BirthBankAnswer, GetThingAnswer, GetBankAnswer, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import { type BirthManifest, type GetManifest, type ListManifest, type Received, type StatsManifest, type GetBankManifest, type WriteManifest, ManifestChecks } from '../shapes/shapes-manifest'
import { itemEventOf, readTcNow } from './agerank'
import * as ManifestActs from './manifest-acts'
import * as ThreeWay from './three-way'
import type { VaultDB } from './vault-db'
import * as Throwers from '../refusals/throwers'

// == [Answers]: frozenAnswerOf, noticeOf

// Frozen once, here, so that a Thing or a cache may have the very records an answer carries.
/** `answer`, with every record it carries deeply frozen, and neither its ask nor its refusal. */
export function frozenAnswerOf<AnswerT extends { ask: unknown, err?: unknown }>(answer: AnswerT): AnswerT {
  const { ask: _ask, err: _err, ...carried } = answer
  for (const val of Object.values(carried)) { deepFreeze(val) }
  return answer
}

/** The `item` notice of `record` from a vaultDB, deeply frozen and read at `read_tc`, with the vacant agerank.
 * Its banktok is that of `record` where it is the bank's gate, else `received`.
 */
export function noticeOf(record: ThingRecord, received: Banktok, read_tc: ReadTc): VaultItemEvent {
  // A box's own banktok is its gate's when it was sealed, which may not be the bank's now.
  const banktok = (record.modelkind === 'gate') ? record.banktok : received
  return itemEventOf(deepFreeze(record), { sourcelabel: VaultDBSourcelabel, read_tc, banktok })
}
// --

// The datastore decides whether to write by its own predicate, this class finds the act from the datastore's tags, and
// `ThreeWay.demandWriteConsistency` requires the two to agree. The work done twice is what that check costs: never optimize it away.
/** The base class of a vaultDB over a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and answers from what a `do*` call observes, per the act tables in `notes/answer-contract.md`.
 * Its watch notifies only what the datastore reports changing: nothing an answer carries.
 * Every record an answer or a notice carries is deeply frozen; an ask, and a record a caller hands it, never are.
 */
export abstract class AdapterVaultDB implements VaultDB {

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, tryGetBank, tryStats, watch
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
      const listAsk  = AskChecks.listAsk.parse(ask)
      const manifest = await this.doListThings(listAsk)
      ManifestActs.checkListObservations(listAsk, manifest)
      ManifestActs.scribeListAct(listAsk, manifest)
      const answer   = ManifestActs.listAnswerOf(listAsk, manifest)
      ThreeWay.demandListConsistency(listAsk, manifest, answer)
      return frozenAnswerOf(answer)
    } catch (err) { return { ...this.answerForThrown(err, 'listThings', ask), dbhas: null, parentage: [], deltas: [], incompatible_rows: [] } }
  }

  /** Write a new bank's two roots (its gate, at its banklabel, and its root box), or answer the actual roots of a bank already live ({@link VaultDB.tryBirthBank}). */
  async tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> {
    try {
      const birthBankAsk = checkedBirthBankAsk(ask)
      const manifest     = await this.doBirthBank(birthBankAsk, birthPutsOf(birthBankAsk))
      ManifestActs.checkBirthObservations(birthBankAsk, manifest)
      ManifestActs.scribeBirthAct(birthBankAsk, manifest)
      const answer       = ManifestActs.birthAnswerOf(birthBankAsk, manifest)
      ThreeWay.demandBirthConsistency(birthBankAsk, manifest, answer)
      return frozenAnswerOf(answer)
    } catch (err) { return { ...this.answerForThrown(err, 'birthBank', ask), dbhas: null } }
  }

  /** The bank's two roots, read in one step ({@link VaultDB.tryGetBank}). */
  async tryGetBank(ask: GetBankAsk): Promise<GetBankAnswer> {
    try {
      const bankAsk = AskChecks.getBankAsk.parse(ask)
      const manifest = await this.doGetBank(bankAsk)
      ManifestActs.checkGetBankObservations(bankAsk, manifest)
      const answer   = ManifestActs.getBankAnswerOf(bankAsk, manifest)
      ThreeWay.demandGetBankConsistency(bankAsk, manifest, answer)
      return frozenAnswerOf(answer)
    } catch (err) { return this.answerForThrown(err, 'getBank', ask) }
  }

  /** A bank's storage stats, read in one step ({@link VaultDB.tryStats}). */
  async tryStats(ask: StatsAsk): Promise<StatsAnswer> {
    try {
      const statsAsk = AskChecks.statsAsk.parse(ask)
      const manifest = await this.doStats(statsAsk)
      ManifestActs.checkStatsObservations(statsAsk, manifest)
      const answer   = ManifestActs.statsAnswerOf(statsAsk, manifest)
      ThreeWay.demandStatsConsistency(statsAsk, manifest, answer)
      return frozenAnswerOf(answer)
    } catch (err) { return this.answerForThrown(err, 'stats', ask) }
  }

  /** Watch a bank's Things ({@link VaultDB.watch}): each notice is of a Thing the datastore reports changing, dated by the datastore's `read_tc`, or else by when it arrives.
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
        const { modelkind, read_tc = readTcNow() } = ManifestChecks.received.parse(received)
        event = noticeOf(ManifestActs.checkedWatchedOf({ ...bankScope, modelkind }, record), ManifestActs.banktokOrVoidOf(banktok), read_tc)
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
      // Only a refusal made from a checked manifest sets rows.dbhas, to a Thing it has checked.
      const dbhas = (Errors.rowsOfRefusal(err).dbhas ?? null) as ThingRecord | null
      return frozenAnswerOf({ ok: false, ask: loggableAsk, act: err.meta?.act ?? 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', read_tc: readTcNow(), dbhas, err })
    } catch {
      return { ok: false, ask: {}, act: 'unclassified_storing', banktok: SX.VoidLifeTok, tracked: 'unread', read_tc: readTcNow(), dbhas: null, err: Throwers.answerNotMade() }
    }
  }
  // --

  // == [Protected, for a subclass to write]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetBank, doStats, doWatch
  // Each is one atomic step that observes, and hands back a manifest: the datastore's tags and each row exactly as it stands
  // at the step's last read, beside the bank's banktok, its `tracked` and its `read_tc`. `notes/vault-adapter-contract.md`
  // says what each manifest has, and when a write and a birth write. A datastore that runs TypeScript makes its tags with
  // `ManifestTags`; one that cannot makes the same comparisons in its own language. It reads no check and no act table:
  // this class checks each row once, finds the act from the tags, and requires the datastore's write to agree with it.

  /** In one step, read the Thing at `ask`'s scope, and hand back what was observed ({@link GetManifest}). */
  protected abstract doGetThing(ask: GetAsk): Helpers.Awaitable<GetManifest>
  /** In one step, write `ask.record` where the datastore's own predicate allows, and hand back what was observed ({@link WriteManifest}). */
  protected abstract doWriteThing(ask: WriteAsk): Helpers.Awaitable<WriteManifest>
  /** In one step, read the Thing at `ask`'s scope and each Thing one label under it, and hand back what was observed ({@link ListManifest}). */
  protected abstract doListThings(ask: ListAsk): Helpers.Awaitable<ListManifest>
  /** In one step, write the two `puts`' records where the prior roots are both null, and hand back what was observed ({@link BirthManifest}). */
  protected abstract doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Helpers.Awaitable<BirthManifest>
  /** In one step, read the bank's two roots, and hand back what was observed ({@link GetBankManifest}). */
  protected abstract doGetBank(ask: GetBankAsk): Helpers.Awaitable<GetBankManifest>
  /** In one step, measure the bank's boxes and gates, and hand back what was observed ({@link StatsManifest}).
   * Report the datastore's limits where it has them; `datastoreLimitsOf` caps each, and gives the cap for one it lacks.
   */
  protected abstract doStats(ask: StatsAsk): Helpers.Awaitable<StatsManifest>
  /** Start watching the datastore: call `receive` with each changed Thing, one at a time ({@link Received}), and `onBadNews` with any trouble,
   * whether or not it ends the watch. Return a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   * Where the watch ends before its stop is called, call `onEnded` once, then `onBadNews` with why ({@link VaultDB.watch}).
   */
  protected doWatch(_scope: ThingWatchScope, _receive: (received: Received) => void, _onBadNews: (news: Errors.VaultError) => void, _onEnded: () => void): () => void { return noop }
  // --
}

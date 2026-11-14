/** `AdapterBankDB`, the base class a storage adapter extends by writing its `do*` calls, and the rows those calls return. */

import { noop } from 'es-toolkit'
import { DefaultMaxRecordSizeEst, IsAdapterBankDB, IsBankDB } from '../helpers/consts'
import type { Awaitable } from '../helpers/helpers'
import type { VaultError } from '../refusals/errors'
import { storageRefusalOf } from '../refusals/outcome'
import * as BX from '../shapes/shapes-bankdb'
import * as SX from '../shapes/shapes-storage'
import type { BoxTidyAsk, WatchScope } from '../shapes/shapes-storage'
import type {
  AdapterBankDBOpts, BankBuildAsk, BankDelAsk, BankEnsureAsk, BoxAsk, BoxDelAsk, BoxGetAsk, BoxListAsk, BoxPutAsk, GatePutAsk,
  VaultAsk, VaultDelAsk, VaultGetAsk, VaultPutAsk,
} from '../shapes/shapes-bankdb'
import {
  type BankBuildStored, type BankDelStored, type BankEnsureFetched, type BankEnsureStored, type BankFetched, type BoxesFetched, type BoxesStored,
  type BoxFetched, type BoxStored, type GateFetched, type GateStored, type VaultFetched, type VaultStored,
  classifyBuildBank, classifyDelBank, classifyEnsureBank, classifyStoredBox, classifyStoredBoxes, classifyStoredGate, classifyStoredVault,
} from './bank-classifier'
import {
  type Answer, type BadAnswer, type BankDB, type BoxAnswer, type DelBankAnswer, type EnsureBankAnswer, type GateAnswer, type GoodAnswer,
  type ListBoxesAnswer, type Notice, type Tidied, type TidyGoneAnswer, type VaultAnswer, badAnswerOf,
} from './bank-db'
import * as Refuse from '../refusals/throwers'
import * as Policy from '../helpers/policies'
import type { StoredGateRows } from '../helpers/policies'

// == [Rows from storage]: Heard
// A row's notice may come without the row above it: that row changes rarely, and has notices of its own.
/** A change reported by storage's watch: a bank, gate, vault or box row, and the row above it if storage sent one. */
export type Heard = { row: unknown, parent?: unknown }
// --

const noBadNews = (_news: VaultError): void => undefined

/** The base class of a bankDB that keeps its rows in a datastore: a subclass writes the `do*` calls, each one atomic step.
 * It checks each ask, and classifies the rows a `do*` call fetches by the tables in notes/answer-contract.md.
 */
export abstract class AdapterBankDB implements BankDB {
  // == [Props]: #maxRecordSizeEst, IsBankDB, IsAdapterBankDB

  readonly #maxRecordSizeEst: number

  // Brands are implemented this way to avoid the flaws of branding by string props, private symbols, weak maps or instanceof.
  /** Always true: marks a bankDB for safe branding. */
  get [IsBankDB](): true { return true }

  /** Always true: marks a bankDB over a datastore, which a client bankDB such as GraphQL's lacks. */
  get [IsAdapterBankDB](): true { return true }
  // --

  // == [Construction]: constructor

  constructor(opts: AdapterBankDBOpts = {}) {
    const { maxRecordSizeEst = DefaultMaxRecordSizeEst } = BX.adapterBankDBOpts.parse(opts)
    this.#maxRecordSizeEst = maxRecordSizeEst
  }
  // --

  // == [Classifying and refusing]: classifyEnsureBank, classifyBuildBank, classifyStoredGate, demandPolicies, classifyDelBank, classifyStoredVault, classifyStoredBox, classifyStoredBoxes, answerForRefusal
  // A subclass's `do*` calls these. A cooperative store, one that reaches some of the classifier's verdict itself, overrides them to read it.

  /** Classify an `ensureBank` ask against the bank row, its `main` gate row and its vault rows, setting aside each vault row that fails its checks. */
  protected classifyEnsureBank(ask: BankEnsureAsk, fetched: BankEnsureFetched): BankEnsureStored { return classifyEnsureBank(ask, fetched) }

  /** Classify a `buildBank` ask against the bank and gate rows stored. */
  protected classifyBuildBank(ask: BankBuildAsk, fetched: GateFetched): BankBuildStored { return classifyBuildBank(ask, fetched) }

  // `replaced` means a live gate row was found, so `stored.gate` is set.
  /** Classify a `putGate` ask against the bank and gate rows stored, and apply its storage policy where the put would replace the gate row. */
  protected classifyStoredGate(ask: GatePutAsk, fetched: GateFetched): GateStored {
    const stored = classifyStoredGate(ask, fetched)
    if (stored.act === 'replaced') { this.demandPolicies(ask, { parent: stored.parent, gate: stored.gate! }) }
    return stored
  }

  /** Apply the storage policies `ask` names to the rows stored, throwing `gate_issue` where one refuses.
   * Override it to do nothing in a store that applies them itself, in the step that stores the record.
   */
  protected demandPolicies(ask: GatePutAsk, stored: StoredGateRows): void { Policy.demandStorage(ask, stored) }

  /** Classify a `delBank` ask against the bank row stored. */
  protected classifyDelBank(ask: BankDelAsk, fetched: BankFetched): BankDelStored { return classifyDelBank(ask, fetched) }

  /** Classify a vault ask against the bank and vault rows stored. */
  protected classifyStoredVault(ask: VaultAsk, fetched: VaultFetched): VaultStored { return classifyStoredVault(ask, fetched) }

  /** Classify a box ask against the vault and box rows stored. */
  protected classifyStoredBox(ask: BoxAsk, fetched: BoxFetched): BoxStored { return classifyStoredBox(ask, fetched) }

  /** Classify a `listBoxes` ask against the vault row and box rows stored, setting aside each box row that fails its checks. */
  protected classifyStoredBoxes(ask: BoxListAsk, fetched: BoxesFetched): BoxesStored { return classifyStoredBoxes(ask, fetched) }

  // Every throw in a verb ends up here: an ask that fails its checks, a stored row that fails its own, or storage that is down.
  /** Make a bad answer for a verb that threw: a refusal as it is, anything else as `storage_unavailable`.
   * Override it to tell one of your datastore's errors from another.
   */
  protected answerForRefusal(err: unknown, oplabel: string, ask: unknown): BadAnswer {
    return badAnswerOf(refusalOf(err, oplabel, ask))
  }
  // --

  // == [Bank verbs]: ensureBank, tryEnsureBank, buildBank, tryBuildBank, delBank, tryDelBank
  // Each verb parses its ask, has the subclass fetch, classify and store, and makes its answer from what the classifier returned.

  /** Get the bank row, and for a live bank its `main` gate row and its vault rows ({@link BankDB.ensureBank}). */
  async ensureBank(ask: BankEnsureAsk) { return goodOrThrow(await this.tryEnsureBank(ask)) }

  /** Non-throwing form of {@link ensureBank}. */
  async tryEnsureBank(ask: BankEnsureAsk): Promise<EnsureBankAnswer> {
    try {
      const checked     = BX.bankEnsure.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doEnsureBank(checked)
      return { ok: true, ask: loggableAsk, act: stored.act, val: stored.ensured, parent: stored.parent }
    } catch (err) { return this.answerForRefusal(err, 'ensureBank', ask) }
  }

  /** Store a new bank record and its `main` gate row together ({@link BankDB.buildBank}). */
  async buildBank(ask: BankBuildAsk) { return goodOrThrow(await this.tryBuildBank(ask)) }

  /** Non-throwing form of {@link buildBank}. */
  async tryBuildBank(ask: BankBuildAsk): Promise<GateAnswer> {
    try {
      const checked     = BX.bankBuild.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doBuildBank(checked)
      // A good answer has a gate row: the one stored, or the live bank's.
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.gate!, parent: stored.parent } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'buildBank', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.parent, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'buildBank', ask) }
  }

  /** Store the bank's tombstone, and delete every gate, vault and box row under it ({@link BankDB.delBank}). */
  async delBank(ask: BankDelAsk) { return goodOrThrow(await this.tryDelBank(ask)) }

  /** Non-throwing form of {@link delBank}. */
  async tryDelBank(ask: BankDelAsk): Promise<DelBankAnswer> {
    try {
      const checked     = BX.bankDel.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doDelBank(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.bank, parent: BX.BankTop } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'delBank', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: BX.BankTop, dbhas: stored.bank, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'delBank', ask) }
  }
  // --

  // == [Gate verbs]: putGate, tryPutGate

  /** Store `ask.record` over the gate row `ask.expected`, under its storage policy ({@link BankDB.putGate}). */
  async putGate(ask: GatePutAsk) { return goodOrThrow(await this.tryPutGate(ask)) }

  /** Non-throwing form of {@link putGate}. */
  async tryPutGate(ask: GatePutAsk): Promise<GateAnswer> {
    try {
      const checked     = BX.gatePut.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doPutGate(checked)
      // A good answer has a gate row: the one stored.
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.gate!, parent: stored.parent } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'putGate', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.gate, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'putGate', ask) }
  }
  // --

  // == [Vault verbs]: getVault, tryGetVault, putVault, tryPutVault, delVault, tryDelVault

  /** Get the vault row at a scope, whatever its life ({@link BankDB.getVault}). */
  async getVault(ask: VaultGetAsk) { return goodOrThrow(await this.tryGetVault(ask)) }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer> {
    try {
      const checked     = BX.vaultGet.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doGetVault(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.vault, parent: stored.parent } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'getVault', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.vault, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'getVault', ask) }
  }

  /** Store `ask.record` over the vault row `ask.expected` ({@link BankDB.putVault}). */
  async putVault(ask: VaultPutAsk) { return goodOrThrow(await this.tryPutVault(ask)) }

  /** Non-throwing form of {@link putVault}. */
  async tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer> {
    try {
      const checked     = BX.vaultPut.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doPutVault(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.vault, parent: stored.parent } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'putVault', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.vault, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'putVault', ask) }
  }

  /** Store the vault's tombstone, and delete the boxes of that vault life ({@link BankDB.delVault}). */
  async delVault(ask: VaultDelAsk) { return goodOrThrow(await this.tryDelVault(ask)) }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer> {
    try {
      const checked     = BX.vaultDel.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doDelVault(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.vault, parent: stored.parent } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'delVault', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.vault, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'delVault', ask) }
  }
  // --

  // == [Box verbs]: listBoxes, tryListBoxes, getBox, tryGetBox, putBox, tryPutBox, #demandEnoughVolume, delBox, tryDelBox

  /** List a vault's boxes, sparse ({@link BankDB.listBoxes}). */
  async listBoxes(ask: BoxListAsk) { return goodOrThrow(await this.tryListBoxes(ask)) }

  /** Non-throwing form of {@link listBoxes}. When the vault row refuses, `parent` is that stored row. */
  async tryListBoxes(ask: BoxListAsk): Promise<ListBoxesAnswer> {
    try {
      const checked     = BX.boxList.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doListBoxes(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.listed, parent: stored.parent } }
      const refusal = Refuse.actRefused('box', stored.act, { oplabel: 'listBoxes', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'listBoxes', ask) }
  }

  /** Get a box row, with its vault row as `parent` ({@link BankDB.getBox}). */
  async getBox(ask: BoxGetAsk) { return goodOrThrow(await this.tryGetBox(ask)) }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer> {
    try {
      const checked     = BX.boxGet.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doGetBox(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.box, parent: stored.parent } }
      const refusal = Refuse.actRefused('box', stored.act, { oplabel: 'getBox', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.box, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'getBox', ask) }
  }

  /** Throw `box_too_large` unless the record's JSON fits within `maxRecordSizeEst` bytes. */
  #demandEnoughVolume({ record }: BoxPutAsk): void {
    const recordSizeEst = jsonSize(record)
    if (recordSizeEst > this.#maxRecordSizeEst) { throw Refuse.boxTooLarge(recordSizeEst, this.#maxRecordSizeEst) }
  }

  /** Store `ask.record` over the box row `ask.expected` ({@link BankDB.putBox}).
   * Refuses `box_too_large` for a record over `maxRecordSizeEst` bytes of JSON, before the datastore is asked.
   */
  async putBox(ask: BoxPutAsk) { return goodOrThrow(await this.tryPutBox(ask)) }

  // Only a put can be `vault_full`: its refusal carries the capacity the adapter counted, when it counted one.
  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer> {
    try {
      const checked     = BX.boxPut.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      this.#demandEnoughVolume(checked)
      const stored      = await this.doPutBox(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.box, parent: stored.parent } }
      const capacity = ((stored.act === 'vault_full') && (stored.capacity !== null)) ? { capacity: stored.capacity } : {}
      const refusal  = Refuse.actRefused('box', stored.act, { oplabel: 'putBox', ask: loggableAsk, ...capacity })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.box, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'putBox', ask) }
  }

  /** Store the box's tombstone ({@link BankDB.delBox}). */
  async delBox(ask: BoxDelAsk) { return goodOrThrow(await this.tryDelBox(ask)) }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer> {
    try {
      const checked     = BX.boxDel.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const stored      = await this.doDelBox(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.box, parent: stored.parent } }
      const refusal = Refuse.actRefused('box', stored.act, { oplabel: 'delBox', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, parent: stored.parent, dbhas: stored.box, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'delBox', ask) }
  }
  // --

  // == [Housekeeping]: tidyGone, tryTidyGone

  /** Delete the vault and box rows of ended lives under the bank, and count the box rows left ({@link BankDB.tidyGone}). */
  async tidyGone(ask: BoxTidyAsk) { return goodOrThrow(await this.tryTidyGone(ask)) }

  /** Non-throwing form of {@link tidyGone}. */
  async tryTidyGone(ask: BoxTidyAsk): Promise<TidyGoneAnswer> {
    try {
      const checked     = SX.boxTidy.parse(ask)
      const loggableAsk = BX.loggableAsk.parse(checked)
      const val         = await this.doTidyGone(checked)
      const { user_id, banklabel } = checked
      return { ok: true, ask: loggableAsk, act: 'tidied', val, parent: { user_id, banklabel } }
    } catch (err) { return this.answerForRefusal(err, 'tidyGone', ask) }
  }
  // --

  // == [Watch]: watch

  /** Watch a bank or a vault, and return a function that stops the watch ({@link BankDB.watch}).
   * A changed row that fails its checks is dropped unheard.
   */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void = noBadNews): () => void {
    return this.doWatch(SX.watchScope.parse(scope), ({ row, parent }) => {
      const val   = BX.noticedRow.safeParse(row)
      const above = (parent === undefined) ? null : BX.noticedParent.safeParse(parent)
      if ((! val.success) || ((above !== null) && (! above.success))) { return }
      onNotice({ act: (val.data.am === 'x') ? 'gotgone' : 'gotlive', val: val.data, parent: BX.noticeParentOf(val.data, above?.data ?? null) })
    }, onBadNews)
  }
  // --

  // == [Protected, for a subclass to write]: doEnsureBank, doBuildBank, doPutGate, doDelBank, doGetVault, doPutVault, doDelVault, doListBoxes, doGetBox, doPutBox, doDelBox, doTidyGone, doWatch
  // Each is one atomic step: fetch the rows the classifier needs, classify them, and when `isWriteAct(act)` is true, store
  // the record sent and return the row the datastore reports storing in place of the one fetched, checked by the bank
  // classifier's `writtenBankOf`, `writtenGateOf`, `writtenVaultOf` or `writtenBoxOf`. A store that can run code of its own
  // may take the whole step there.

  /** In one step: fetch the bank row, its `main` gate row and every vault row of the bank, and return `this.classifyEnsureBank(ask, fetched)`. */
  protected abstract doEnsureBank(ask: BankEnsureAsk): Awaitable<BankEnsureStored>
  /** In one step: fetch the bank row and its `main` gate row, classify, and if the act is a write, store `ask.record` and `ask.gate` and return the rows stored. */
  protected abstract doBuildBank(ask: BankBuildAsk): Awaitable<BankBuildStored>
  /** In one step: fetch the bank row and the gate row, classify (applying the ask's storage policy), and if the act is a write, store `ask.record` and return the row stored. */
  protected abstract doPutGate(ask: GatePutAsk): Awaitable<GateStored>
  /** In one step: fetch the bank row, classify, and if the act is a write, store `ask.record`, delete every gate, vault and box row under the bank, and return the row stored. */
  protected abstract doDelBank(ask: BankDelAsk): Awaitable<BankDelStored>
  /** In one step: fetch the bank row and the vault row at `ask`'s scope, and return `this.classifyStoredVault(ask, fetched)`. */
  protected abstract doGetVault(ask: VaultGetAsk): Awaitable<VaultStored>
  /** In one step: fetch the bank row and the vault row at `ask`'s scope, classify, and if the act is a write, store `ask.record` and return the row stored. */
  protected abstract doPutVault(ask: VaultPutAsk): Awaitable<VaultStored>
  /** In one step: fetch the bank row and the vault row at `ask`'s scope, classify, and if the act is a write, store `ask.record`, delete that life's boxes, and return the row stored. */
  protected abstract doDelVault(ask: VaultDelAsk): Awaitable<VaultStored>
  /** In one step: fetch the vault row and every box row of the asked-for life, and return `this.classifyStoredBoxes(ask, fetched)`. */
  protected abstract doListBoxes(ask: BoxListAsk): Awaitable<BoxesStored>
  /** In one step: fetch the vault row and the box row `ask` names, and return `this.classifyStoredBox(ask, fetched)`. */
  protected abstract doGetBox(ask: BoxGetAsk): Awaitable<BoxStored>
  /** In one step: fetch the vault row, the box row and the vault's capacity at `ask`'s address, classify, and if the act is a write, store `ask.record` and return the row stored. */
  protected abstract doPutBox(ask: BoxPutAsk): Awaitable<BoxStored>
  /** In one step: fetch the vault row and the box row at `ask`'s address, classify, and if the act is a write, store `ask.record` and return the row stored. */
  protected abstract doDelBox(ask: BoxDelAsk): Awaitable<BoxStored>
  /** Delete the vault and box rows of an ended life under the bank, and count the box rows left in it. */
  protected abstract doTidyGone(ask: BoxTidyAsk): Awaitable<Tidied>
  /** Start a watch: call `hear` with each changed row, and `onBadNews` with trouble, whether or not it ends the watch.
   * Returns a function that stops it. Left unwritten, for a datastore with no watch, it calls neither.
   */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void, _onBadNews: (news: VaultError) => void): () => void { return noop }
  // --
}

// == [Helpers]: goodOrThrow, refusalOf, jsonSize

/** `answer` if it is good, else throw its refusal. */
function goodOrThrow<ValT, ActT extends string, ParentT>(answer: Answer<ValT, ActT, ParentT>): GoodAnswer<ValT, ActT, ParentT> {
  if (! answer.ok) { throw answer.err }
  return answer
}

/** The refusal for `thrown`: a refusal as it is, anything else as `storage_unavailable`.
 * Its meta gains `oplabel`, and the loggable part of `ask`.
 */
function refusalOf(thrown: unknown, oplabel: string, ask: unknown): VaultError {
  const refusal = storageRefusalOf(thrown)
  // An ask that failed its check has no metadata to trust: its refusal carries none.
  const loggableAsk = BX.loggableAsk.safeParse(ask)
  return Object.assign(refusal, { meta: { ...refusal.meta, oplabel, ask: loggableAsk.success ? loggableAsk.data : {} } })
}

/** The size of `val`'s JSON text, in UTF-8 bytes. */
function jsonSize(val: unknown): number { return new TextEncoder().encode(JSON.stringify(val)).length }
// --

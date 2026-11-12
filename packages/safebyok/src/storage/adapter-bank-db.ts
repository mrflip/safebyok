/** `AdapterVaultDB`, the base class a storage adapter extends by writing its `do*` calls, and the rows those calls return. */

import { DefaultMaxRecordSizeEst, IsAdapterVaultDB, IsVaultDB } from '../helpers/consts'
import type { Awaitable } from '../helpers/helpers'
import type { VaultError } from '../refusals/errors'
import { storageRefusalOf } from '../refusals/outcome'
import * as SX from '../shapes/shapes-storage'
import type { BankScope } from '../shapes/shapes-core'
import type { GateVerb, ListAct } from '../shapes/shapes-enums'
import {
  type BoxesFetched, type BoxesStored, type BoxFetched, type BoxStored, type RowOfVault, type VaultFetched, type VaultsStored, type VaultStored,
  classifyStoredBox, classifyStoredBoxes, classifyStoredVault, classifyStoredVaults,
} from './classifier'
import { type Answer, type BadAnswer, type BankListed, type BoxAnswer, type BoxesListed, type GoodAnswer, type Notice, type Tidied, type VaultAnswer, type VaultDB, badAnswerOf } from './vault-db'
import type {
  AdapterVaultDBOpts, BoxAsk, BoxDelAsk, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxTidyAsk, GateVerbOpts, VaultAsk, VaultDelAsk, VaultGetAsk, VaultListAsk, VaultPutAsk, VaultRecord, VaultRow, WatchScope,
} from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Rows from storage]: Heard
// A box's notice may come without its vault row: the vault changes rarely, and has notices of its own.
/** A change reported by storage's watch: a vault row, a box row, or both. */
export type Heard = { vault?: unknown, box?: unknown }
// --

const noUnwatching = (): void => undefined
const noBadNews = (_news: VaultError): void => undefined

/** The base of an adapter vaultDB (one that wraps a datastore rather than another vaultDB).
 * A subclass writes the generic `do*` calls: each base operation is one atomic step.
 * See notes/answer-contract.md for details.
 */
export abstract class AdapterVaultDB implements VaultDB {
  // == [Props]: #maxRecordSizeEst, IsVaultDB, IsAdapterVaultDB

  readonly #maxRecordSizeEst: number

  // Brands are implemented this way to avoid the flaws of branding by string props, private symbols, weak maps or instanceof.
  /** Always true: marks a vaultDB for safe branding. */
  get [IsVaultDB](): true { return true }

  /** Always true: marks an adapter vaultDB, which a client of one, such as `GraphQLVaultDB`, lacks. */
  get [IsAdapterVaultDB](): true { return true }
  // --

  // == [Construction]: constructor

  constructor(opts: AdapterVaultDBOpts = {}) {
    const { maxRecordSizeEst = DefaultMaxRecordSizeEst } = SX.adapterVaultDBOpts.parse(opts)
    this.#maxRecordSizeEst = maxRecordSizeEst
  }
  // --

  // == [Classifying and refusing]: classifyStoredVault, classifyStoredBox, classifyStoredVaults, classifyStoredBoxes, answerForRefusal
  // A subclass's `do*` calls these. A cooperative store, one that reaches some of the classifier's verdict itself, overrides them to read it.

  /** Classify a vault ask against the row stored -- `stale`, `deleted`, `replaced` and so on -- to route and shape its answer. */
  protected classifyStoredVault(ask: VaultAsk, fetched: VaultFetched): VaultStored { return classifyStoredVault(ask, fetched) }

  /** Classify a box ask against the vault and box rows stored -- `vault_gone`, `stale`, `born` and so on -- to route and shape its answer. */
  protected classifyStoredBox(ask: BoxAsk, fetched: BoxFetched): BoxStored { return classifyStoredBox(ask, fetched) }

  /** Classify a `listVaults` ask against the vault rows stored, setting aside each one that fails its checks. */
  protected classifyStoredVaults(ask: VaultListAsk, vaults: readonly RowOfVault[]): VaultsStored { return classifyStoredVaults(ask, vaults) }

  /** Classify a `listBoxes` ask against the vault row and box rows stored, setting aside each box row that fails its checks. */
  protected classifyStoredBoxes(ask: BoxListAsk, fetched: BoxesFetched): BoxesStored { return classifyStoredBoxes(ask, fetched) }

  // Every throw in a verb ends up here: an ask that fails its checks, a stored row that fails its own, or storage that is down.
  /** Make a bad answer for a verb that threw: a refusal unchanged, anything else as `storage_unavailable`.
   * A subclass may override it to distinguish one refusal from another.
   */
  protected answerForRefusal(err: unknown, oplabel: string, ask: unknown): BadAnswer {
    return badAnswerOf(refusalOf(err, oplabel, ask))
  }
  // --

  // == [Gets]: listVaults, tryListVaults, getVault, tryGetVault, listBoxes, tryListBoxes, getBox, tryGetBox
  // Each verb parses its ask, has the subclass fetch and classify, and makes its answer from what the classifier returned.

  /** List the bank's vaults and tombstones, without their boxes.
   * A row that fails its checks is listed in `damaged_rows`.
   */
  async listVaults(ask: VaultListAsk) { return goodOrThrow(await this.tryListVaults(ask)) }

  /** Non-throwing form of {@link listVaults}. */
  async tryListVaults(ask: VaultListAsk): Promise<Answer<BankListed, ListAct, BankScope>> {
    try {
      const checked     = SX.vaultList.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doListVaults(checked)
      return { ok: true, ask: loggableAsk, act: stored.act, val: stored.listed, world: stored.world }
    } catch (err) { return this.answerForRefusal(err, 'listVaults', ask) }
  }

  /** Get the vault row at a scope, whatever its life.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone; otherwise both refuse.
   */
  async getVault(ask: VaultGetAsk) { return goodOrThrow(await this.tryGetVault(ask)) }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer> {
    try {
      const checked     = SX.vaultGet.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doGetVault(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.vault, world: stored.world } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'getVault', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, dbhas: stored.vault, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'getVault', ask) }
  }

  /** List a vault's boxes, sparse, with its vault row as `world`.
   * Refuses when the vault is not live under `vault_tok`.
   */
  async listBoxes(ask: BoxListAsk) { return goodOrThrow(await this.tryListBoxes(ask)) }

  /** Non-throwing form of {@link listBoxes}. When the vault row refuses, `world` is that stored row. */
  async tryListBoxes(ask: BoxListAsk): Promise<Answer<BoxesListed, ListAct>> {
    try {
      const checked     = SX.boxList.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doListBoxes(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.listed, world: stored.world } }
      const refusal = Refuse.actRefused('box', stored.act, { oplabel: 'listBoxes', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'listBoxes', ask) }
  }

  /** Get a box row, with its vault row as `world`. Refuses when the vault is not live under `vault_tok`.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone; otherwise both refuse.
   */
  async getBox(ask: BoxGetAsk) { return goodOrThrow(await this.tryGetBox(ask)) }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer> {
    try {
      const checked     = SX.boxGet.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doGetBox(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.box, world: stored.world } }
      const refusal = Refuse.actRefused('box', stored.act, { oplabel: 'getBox', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, dbhas: stored.box, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'getBox', ask) }
  }
  // --

  // == [Puts]: putVault, tryPutVault, #demandEnoughVolume, putBox, tryPutBox

  /** Store `ask.record` over the vault row `ask.expected`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  async putVault(ask: VaultPutAsk) { return goodOrThrow(await this.tryPutVault(ask)) }

  /** Non-throwing form of {@link putVault}. */
  async tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer> {
    try {
      const checked     = SX.vaultPut.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doPutVault(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.vault, world: stored.world } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'putVault', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, dbhas: stored.vault, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'putVault', ask) }
  }

  /** Throw `box_too_large` for a record larger than this vaultDB's `maxRecordSizeEst`. */
  #demandEnoughVolume({ record }: BoxPutAsk): void {
    const recordSizeEst = jsonSize(record)
    if (recordSizeEst > this.#maxRecordSizeEst) { throw Refuse.boxTooLarge(recordSizeEst, this.#maxRecordSizeEst) }
  }

  /** Store `ask.record` over the box row `ask.expected`, in a vault live under its `vault_tok`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  async putBox(ask: BoxPutAsk) { return goodOrThrow(await this.tryPutBox(ask)) }

  // Only a put can be `vault_full`: its refusal carries the capacity the adapter counted, when it counted one.
  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer> {
    try {
      const checked     = SX.boxPut.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      this.#demandEnoughVolume(checked)
      const stored      = await this.doPutBox(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.box, world: stored.world } }
      const capacity = ((stored.act === 'vault_full') && (stored.capacity !== null)) ? { capacity: stored.capacity } : {}
      const refusal  = Refuse.actRefused('box', stored.act, { oplabel: 'putBox', ask: loggableAsk, ...capacity })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, dbhas: stored.box, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'putBox', ask) }
  }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey
  // A gate verb is a put of the vault record over its live row, tagged with the verb. The classifier runs that verb's checks
  // of the record against the stored gate, in the same step that stores it. Nothing is fetched here beforehand.

  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that its only change is to replace the passphrase wayin. */
  async replacePassphrase(record: VaultRecord, opts: GateVerbOpts) { return goodOrThrow(await this.tryReplacePassphrase(record, opts)) }

  /** Non-throwing form of {@link replacePassphrase}. */
  async tryReplacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'replaced'>> {
    try {
      const vaultRecord = SX.vaultRecord.parse(record)
      const answer = await this.tryPutVault(gateAskOf('replacePassphrase', vaultRecord, opts))
      return answer.ok ? { ...answer, act: 'replaced', val: vaultRecord, world: vaultRecord } : answer
    } catch (err) { return this.answerForRefusal(err, 'replacePassphrase', SX.gateVerbAskOf('replacePassphrase', record)) }
  }

  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that its only change is to add a passkey wayin.
   * Refuses `camped` when a passkey wayin is already stored.
   */
  async addPasskey(record: VaultRecord, opts: GateVerbOpts) { return goodOrThrow(await this.tryAddPasskey(record, opts)) }

  /** Non-throwing form of {@link addPasskey}. */
  async tryAddPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'added'>> {
    try {
      const vaultRecord = SX.passkeyAddRecord.parse(record)
      const answer = await this.tryPutVault(gateAskOf('addPasskey', vaultRecord, opts))
      return answer.ok ? { ...answer, act: 'added', val: vaultRecord, world: vaultRecord } : answer
    } catch (err) { return this.answerForRefusal(err, 'addPasskey', SX.gateVerbAskOf('addPasskey', record)) }
  }

  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that the passkey is absent.
   * @returns an answer with the stored row: @see {@link putVault}
   */
  async revokePasskey(record: VaultRecord, opts: GateVerbOpts) { return goodOrThrow(await this.tryRevokePasskey(record, opts)) }

  /** Non-throwing form of {@link revokePasskey}. */
  async tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'revoked' | 'passed'>> {
    try {
      const vaultRecord = SX.passkeyRevokeRecord.parse(record)
      const answer = await this.tryPutVault(gateAskOf('revokePasskey', vaultRecord, opts))
      if (! answer.ok) { return answer }
      // `passed`: the stored vault has no passkey wayin to revoke, so its row is returned as stored.
      if (answer.act === 'passed') { return { ...answer, act: 'passed', val: liveVaultOf(answer.world, vaultRecord) } }
      return { ...answer, act: 'revoked', val: vaultRecord, world: vaultRecord }
    } catch (err) { return this.answerForRefusal(err, 'revokePasskey', SX.gateVerbAskOf('revokePasskey', record)) }
  }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault, tidyGone, tryTidyGone

  /** Store the tombstone `ask.record` over the live box row `ask.expected`. */
  async delBox(ask: BoxDelAsk) { return goodOrThrow(await this.tryDelBox(ask)) }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer> {
    try {
      const checked     = SX.boxDel.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doDelBox(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.box, world: stored.world } }
      const refusal = Refuse.actRefused('box', stored.act, { oplabel: 'delBox', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, dbhas: stored.box, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'delBox', ask) }
  }

  /** Store the tombstone `ask.record` over the live vault row `ask.expected`, and delete the boxes of that vault life. */
  async delVault(ask: VaultDelAsk) { return goodOrThrow(await this.tryDelVault(ask)) }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer> {
    try {
      const checked     = SX.vaultDel.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const stored      = await this.doDelVault(checked)
      if (stored.ok) { return { ok: true, ask: loggableAsk, act: stored.act, val: stored.vault, world: stored.world } }
      const refusal = Refuse.actRefused('vault', stored.act, { oplabel: 'delVault', ask: loggableAsk })
      return { ok: false, ask: loggableAsk, act: stored.act, world: stored.world, dbhas: stored.vault, err: refusal }
    } catch (err) { return this.answerForRefusal(err, 'delVault', ask) }
  }

  /** Housekeeping for hosts: delete the box rows whose vault is missing, tombstoned or reborn, and count the box rows left. */
  async tidyGone(ask: BoxTidyAsk) { return goodOrThrow(await this.tryTidyGone(ask)) }

  /** Non-throwing form of {@link tidyGone}. */
  async tryTidyGone(ask: BoxTidyAsk): Promise<Answer<Tidied, 'tidied', BankScope>> {
    try {
      const checked     = SX.boxTidy.parse(ask)
      const loggableAsk = SX.loggableAsk.parse(checked)
      const val         = await this.doTidyGone(checked)
      const { user_id, banklabel } = checked
      return { ok: true, ask: loggableAsk, act: 'tidied', val, world: { user_id, banklabel } }
    } catch (err) { return this.answerForRefusal(err, 'tidyGone', ask) }
  }
  // --

  // == [Watch]: watch

  /** Watch a bank or a vault: call `onNotice` with each changed row, and `onBadNews` with trouble in the watch.
   * Returns a function that stops the watch.
   */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews: (news: VaultError) => void = noBadNews): () => void {
    return this.doWatch(SX.watchScope.parse(scope), ({ vault, box }) => {
      const world = (vault === undefined) ? null : SX.vaultRow.safeParse(vault)
      if ((world !== null) && (! world.success)) { return }
      if (box === undefined) {
        if (world !== null) { onNotice({ act: (world.data.am === 'x') ? 'gotgone' : 'gotlive', val: world.data, world: world.data }) }
        return
      }
      const val = SX.boxRow.safeParse(box)
      if (val.success) { onNotice({ act: (val.data.am === 'x') ? 'gotgone' : 'gotlive', val: val.data, world: world?.data ?? null }) }
    }, onBadNews)
  }
  // --

  // == [Protected, for a subclass to write]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch
  // Each get, list, put or del is one atomic step: fetch the rows the classifier needs, classify them, and store `ask.record`
  // when `isWriteAct(act)` is true.

  /** Fetch every vault row of the bank, tombstones included, and return `this.classifyStoredVaults(ask, rows)`. */
  protected abstract doListVaults(ask: VaultListAsk): Awaitable<VaultsStored>
  /** Fetch the vault row at `ask`'s scope, and return `this.classifyStoredVault(ask, fetched)`. */
  protected abstract doGetVault(ask: VaultGetAsk): Awaitable<VaultStored>
  /** Fetch the vault row and every box row under `vault_tok`, in one step, and return `this.classifyStoredBoxes(ask, fetched)`. */
  protected abstract doListBoxes(ask: BoxListAsk): Awaitable<BoxesStored>
  /** Fetch the vault row and the box row `ask` names, in one step, and return `this.classifyStoredBox(ask, fetched)`. */
  protected abstract doGetBox(ask: BoxGetAsk): Awaitable<BoxStored>
  /** In one step: fetch the vault row at `ask`'s scope, classify, and store `ask.record` if the act is a write. */
  protected abstract doPutVault(ask: VaultPutAsk): Awaitable<VaultStored>
  /** In one step: fetch the vault row, the box row and the vault's capacity at `ask`'s address, classify, and store `ask.record` if the act is a write. */
  protected abstract doPutBox(ask: BoxPutAsk): Awaitable<BoxStored>
  /** In one step: fetch the vault row at `ask`'s scope, classify, and if the act is a write, store `ask.record` and delete that life's boxes. */
  protected abstract doDelVault(ask: VaultDelAsk): Awaitable<VaultStored>
  /** In one step: fetch the vault row and the box row at `ask`'s address, classify, and store `ask.record` if the act is a write. */
  protected abstract doDelBox(ask: BoxDelAsk): Awaitable<BoxStored>
  /** Delete the box rows whose vault is missing, tombstoned or reborn, and count the box rows left in the bank. */
  protected abstract doTidyGone(ask: BoxTidyAsk): Awaitable<Tidied>
  /** Start a watch: call `hear` with each changed row, and `onBadNews` with trouble, whether or not it ends the watch.
   * Returns a function that stops it. This default, for storage with no watch, calls neither.
   */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void, _onBadNews: (news: VaultError) => void): () => void { return noUnwatching }
  // --
}

// == [Helpers]: goodOrThrow, refusalOf, gateAskOf, liveVaultOf, jsonSize

/** `answer` if it is good, else throw its refusal. */
function goodOrThrow<ValT, ActT extends string, WorldT>(answer: Answer<ValT, ActT, WorldT>): GoodAnswer<ValT, ActT, WorldT> {
  if (! answer.ok) { throw answer.err }
  return answer
}

/** Select the appropriate refusal for a thrown error. A VaultError is returned directly. Other errors become `storage_unavailable`.
 * Either way, its meta names the `oplabel`, with what it may carry of the ask as `ask`.
 */
function refusalOf(thrown: unknown, oplabel: string, ask: unknown): VaultError {
  const refusal = storageRefusalOf(thrown)
  // An ask that failed its check has no metadata to trust: its refusal carries none.
  const loggableAsk = SX.loggableAsk.safeParse(ask)
  return Object.assign(refusal, { meta: { ...refusal.meta, oplabel, ask: loggableAsk.success ? loggableAsk.data : {} } })
}

/** The put ask of a gate verb: `record` over the live vault row at `opts.prior`, in the same life, tagged with the verb. */
function gateAskOf(gateVerb: GateVerb, record: VaultRecord, opts: GateVerbOpts): VaultPutAsk {
  const { prior } = SX.gateVerbOpts.parse(opts)
  const { user_id, banklabel, vaultlabel, vault_tok } = record
  return { op: 'put', user_id, banklabel, vaultlabel, ifAbsent: 'fail', ifPresent: 'repl', gateVerb, expected: { ...prior, am: 'a', vault_tok }, record }
}

/** Return the given `stored` vault, if live at `record`'s `vault_tok`. Otherwise throw
 * the appropriate refusal: `absent_vault` for a void or tombstoned vault, `vault_reborn` for another life.
 */
function liveVaultOf(stored: VaultRow | null, record: VaultRecord): VaultRecord {
  if (stored === null)                       { throw Refuse.actRefused('box', 'vault_void') }
  if (stored.am === 'x')                     { throw Refuse.actRefused('box', 'vault_gone') }
  if (stored.vault_tok !== record.vault_tok) { throw Refuse.actRefused('box', 'vault_reborn') }
  return stored
}

function jsonSize(val: unknown): number { return new TextEncoder().encode(JSON.stringify(val)).length }
// --

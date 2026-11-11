/** `AdapterVaultDB`, the base class a storage adapter extends by writing its `do*` calls, and the rows those calls return. */

import type * as Z from 'zod'
import { DefaultMaxRecordSizeEst, IsAdapterVaultDB, IsVaultDB } from '../helpers/consts'
import type { Awaitable } from '../helpers/helpers'
import * as Phrases from '../helpers/phrases'
import { verifyConsistent } from '../helpers/validator'
import type { VaultError } from '../refusals/errors'
import { outcomeOf, storageTroubleOf } from '../refusals/outcome'
import * as SX from '../shapes/shapes-storage'
import * as CX from '../shapes/shapes-core'
import type { BankScope } from '../shapes/shapes-core'
import type { GateVerb, ListAct } from '../shapes/shapes-enums'
import { type BoxClassified, type BoxFetched, type VaultClassified, type VaultFetched, boxVaultActOf, boxWorldOf, classifyBox, classifyVault } from './classifier'
import { type Answer, type BadAnswer, type BankListed, type BoxAnswer, type BoxesListed, type GoodAnswer, type Notice, type Tidied, type VaultAnswer, type VaultDB, badAnswerOf } from './vault-db'
import type {
  AdapterVaultDBOpts, BoxAsk, BoxDelAsk, BoxGetAsk, BoxPutAsk, GateVerbOpts, VaultAsk, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRecord, VaultRow, WatchScope,
} from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Answers]: answerOf

const answerOf = async <ValT, ActT extends string, WorldT>(thunk: () => Promise<GoodAnswer<ValT, ActT, WorldT>>): Promise<Answer<ValT, ActT, WorldT>> => {
  const outcome = await outcomeOf(thunk)
  return outcome.ok ? outcome.val : badAnswerOf(outcome.err)
}
// --

// == [Rows from storage]: RowOfVault, RowOfBox, BoxesFetched, Heard

/** A vault row from storage, unchecked, with its vaultlabel. */
export type RowOfVault = { vaultlabel: string, vault: unknown }
/** A box row from storage, unchecked, with its boxlabel. */
export type RowOfBox   = { boxlabel: string, box: unknown }
/** A vault's rows from storage, unchecked: the vault row and its box rows. */
export type BoxesFetched = { vault: unknown, boxes: RowOfBox[] }
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

  // == [An ask and its answer]: classifyVault, classifyBox, vaultAnswerOf, boxAnswerOf, answerForRefusal

  /** Tag a vault operation's outcome -- stale_write, deleted, replaced, etc. -- to route and shape the answer. */
  protected classifyVault(ask: VaultAsk, fetched: VaultFetched): VaultClassified { return classifyVault(ask, fetched) }

  /** Tag a box operation's outcome -- stale_write, deleted, replaced, etc. -- to route and shape the answer. */
  protected classifyBox(ask: BoxAsk, fetched: BoxFetched): BoxClassified { return classifyBox(ask, fetched) }

  /** Convert the classified vault outcome into an answer  */
  protected vaultAnswerOf(call: string, ask: VaultAsk, stored: VaultClassified): VaultAnswer {
    const req_params = SX.reqParamsOf(ask)
    const { act, world, vault } = stored
    if (stored.ok) { return { ok: true, req_params, act: stored.act, val: vault, world } }
    return { ok: false, req_params, act, world, dbhas: vault, err: Refuse.actRefused('vault', stored.act, { call, req_params }) }
  }

  /** Convert the classified box outcome into an answer. */
  protected boxAnswerOf(call: string, ask: BoxAsk, stored: BoxClassified): BoxAnswer {
    const req_params = SX.reqParamsOf(ask)
    const { act, world, box, capacity } = stored
    if (stored.ok) { return { ok: true, req_params, act: stored.act, val: box, world } }
    const meta = { call, req_params, ...((act === 'vault_full') && (capacity !== null) && { capacity }) }
    return { ok: false, req_params, act, world, dbhas: box, err: Refuse.actRefused('box', stored.act, meta) }
  }

  // Every throw in a get, put or del ends up here: a request that fails its checks, a stored row that fails its own, or storage that is down.
  /** Make a bad answer for a verb that threw: a refusal unchanged, anything else as `storage_unavailable`.
   * A subclass may override it to distinguish one refusal from another.
   */
  protected answerForRefusal(err: unknown, callerlabel: string, ask: unknown): BadAnswer {
    return badAnswerOf(refusalOf(err, callerlabel, ask))
  }
  // --

  // == [Gets]: listVaults, tryListVaults, getVault, tryGetVault, listBoxes, tryListBoxes, getBox, tryGetBox

  /** List the bank's vaults and tombstones, without their boxes.
   * A row that fails its checks is listed in `damaged_rows`.
   */
  async listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, ListAct, BankScope>> {
    const bankScope = CX.bankScope.parse(scope)
    const req_params = SX.reqParams.parse(bankScope)
    try {
      const rows = await this.doListVaults(bankScope)
      const val: BankListed = { vaults: [], damaged_rows: [] }
      for (const { vaultlabel, vault } of rows) {
        const address = { ...bankScope, vaultlabel }
        const listed = listedRowOf(SX.vaultRow, vault, address)
        if (listed === null) { val.damaged_rows.push(SX.damagedVaultOf(address)) } else { val.vaults.push(listed) }
      }
      return { ok: true, req_params, act: (rows.length > 0) ? 'got' : 'gotvoid', val, world: bankScope }
    } catch (err) { throw refusalOf(err, 'listVaults', bankScope) }
  }

  /** Non-throwing form of {@link listVaults}. */
  async tryListVaults(scope: BankScope) { return answerOf(() => this.listVaults(scope)) }

  /** Get the vault row at a scope, whatever its life.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone; otherwise both refuse.
   */
  async getVault(ask: VaultGetAsk) { return goodOrThrow(await this.tryGetVault(ask)) }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer> {
    try {
      const checked = SX.vaultGet.parse(ask)
      const stored = await this.doGetVault(checked)
      return this.vaultAnswerOf('getVault', checked, stored)
    } catch (err) { return this.answerForRefusal(err, 'getVault', ask) }
  }

  /** List a vault's boxes, sparse, with its vault row as `world`.
   * Refuses when the vault is not live under `vault_tok`.
   */
  async listBoxes(asked: VaultQuery) { return goodOrThrow(await this.tryListBoxes(asked)) }

  /** Non-throwing form of {@link listBoxes}. When the vault row refuses, `world` is that stored row. */
  async tryListBoxes(asked: VaultQuery): Promise<Answer<BoxesListed, ListAct>> {
    try {
      const vaultQuery = SX.vaultQuery.parse(asked)
      const req_params = SX.reqParamsOf(vaultQuery)
      const { vault, boxes } = await this.doListBoxes(vaultQuery)
      const world = boxWorldOf(vaultQuery, vault)
      const act = boxVaultActOf(vaultQuery, world)
      if (act !== null) { return { ok: false, req_params, act, world, err: Refuse.actRefused('box', act, { call: 'listBoxes', req_params }) } }
      return { ok: true, req_params, act: (boxes.length > 0) ? 'got' : 'gotvoid', val: listedBoxesOf(vaultQuery, boxes), world }
    } catch (err) { return this.answerForRefusal(err, 'listBoxes', asked) }
  }

  /** Get a box row, with its vault row as `world`. Refuses when the vault is not live under `vault_tok`.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone; otherwise both refuse.
   */
  async getBox(ask: BoxGetAsk) { return goodOrThrow(await this.tryGetBox(ask)) }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer> {
    try {
      const checked = SX.boxGet.parse(ask)
      const stored = await this.doGetBox(checked)
      return this.boxAnswerOf('getBox', checked, stored)
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
      const checked = SX.vaultPut.parse(ask)
      const stored = await this.doPutVault(checked)
      return this.vaultAnswerOf('putVault', checked, stored)
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

  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer> {
    try {
      const checked = SX.boxPut.parse(ask)
      this.#demandEnoughVolume(checked)
      const stored = await this.doPutBox(checked)
      return this.boxAnswerOf('putBox', checked, stored)
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
    } catch (err) { return this.answerForRefusal(err, 'replacePassphrase', { ...record, ...opts }) }
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
    } catch (err) { return this.answerForRefusal(err, 'addPasskey', { ...record, ...opts }) }
  }

  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that the passkey is absent.
   * @returns an answer with the stored row: @see {@link putVault}
   */
  async revokePasskey(record: VaultRecord, opts: GateVerbOpts) { return goodOrThrow(await this.tryRevokePasskey(record, opts)) }

  /** Non-throwing form of {@link revokePasskey}. */
  async tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'revoked'>> {
    try {
      const vaultRecord = SX.passkeyRevokeRecord.parse(record)
      const answer = await this.tryPutVault(gateAskOf('revokePasskey', vaultRecord, opts))
      if (! answer.ok) { return answer }
      // `passed`: the stored vault has no passkey wayin to revoke, so its row is returned as stored.
      const val = (answer.act === 'passed') ? liveVaultOf(answer.world, vaultRecord) : vaultRecord
      return { ...answer, act: 'revoked', val, world: val }
    } catch (err) { return this.answerForRefusal(err, 'revokePasskey', { ...record, ...opts }) }
  }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault, tidyGone, tryTidyGone

  /** Store the tombstone `ask.record` over the live box row `ask.expected`. */
  async delBox(ask: BoxDelAsk) { return goodOrThrow(await this.tryDelBox(ask)) }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer> {
    try {
      const checked = SX.boxDel.parse(ask)
      const stored = await this.doDelBox(checked)
      return this.boxAnswerOf('delBox', checked, stored)
    } catch (err) { return this.answerForRefusal(err, 'delBox', ask) }
  }

  /** Store the tombstone `ask.record` over the live vault row `ask.expected`, and delete the boxes of that vault life. */
  async delVault(ask: VaultDelAsk) { return goodOrThrow(await this.tryDelVault(ask)) }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer> {
    try {
      const checked = SX.vaultDel.parse(ask)
      const stored = await this.doDelVault(checked)
      return this.vaultAnswerOf('delVault', checked, stored)
    } catch (err) { return this.answerForRefusal(err, 'delVault', ask) }
  }

  /** Housekeeping for hosts: delete the box rows whose vault is missing, tombstoned or reborn, and count the box rows left. */
  async tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>> {
    const bankScope = CX.bankScope.parse(scope)
    const req_params = SX.reqParams.parse(bankScope)
    try {
      const val = await this.doTidyGone(bankScope)
      return { ok: true, req_params, act: 'tidied', val, world: bankScope }
    } catch (err) { throw refusalOf(err, 'tidyGone', bankScope) }
  }

  /** Non-throwing form of {@link tidyGone}. */
  async tryTidyGone(scope: BankScope): Promise<Answer<Tidied, 'tidied', BankScope>> { return answerOf(() => this.tidyGone(scope)) }
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
        if (world !== null) { onNotice({ act: (world.data.am === 'x') ? 'gone' : 'got', val: world.data, world: world.data }) }
        return
      }
      const val = SX.boxRow.safeParse(box)
      if (val.success) { onNotice({ act: (val.data.am === 'x') ? 'gone' : 'got', val: val.data, world: world?.data ?? null }) }
    }, onBadNews)
  }
  // --

  // == [Protected, for a subclass to write]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch
  // Each get, put or del is one atomic step: fetch the rows the classifier needs, classify them, and store `ask.record`
  // when `isWriteAct(act)` is true.

  /** Fetch every vault row of the bank, tombstones included. */
  protected abstract doListVaults(scope: BankScope): Awaitable<RowOfVault[]>
  /** Fetch the vault row at `ask`'s scope, and return `this.classifyVault(ask, fetched)`. */
  protected abstract doGetVault(ask: VaultGetAsk): Awaitable<VaultClassified>
  /** Fetch the vault row and every box row under `vault_tok`, in one step. */
  protected abstract doListBoxes(asked: VaultQuery): Awaitable<BoxesFetched>
  /** Fetch the vault row and the box row `ask` names, in one step, and return `this.classifyBox(ask, fetched)`. */
  protected abstract doGetBox(ask: BoxGetAsk): Awaitable<BoxClassified>
  /** In one step: fetch the vault row at `ask`'s scope, classify, and store `ask.record` if the act is a write. */
  protected abstract doPutVault(ask: VaultPutAsk): Awaitable<VaultClassified>
  /** In one step: fetch the vault row, the box row and the vault's capacity at `ask`'s address, classify, and store `ask.record` if the act is a write. */
  protected abstract doPutBox(ask: BoxPutAsk): Awaitable<BoxClassified>
  /** In one step: fetch the vault row at `ask`'s scope, classify, and if the act is a write, store `ask.record` and delete that life's boxes. */
  protected abstract doDelVault(ask: VaultDelAsk): Awaitable<VaultClassified>
  /** In one step: fetch the vault row and the box row at `ask`'s address, classify, and store `ask.record` if the act is a write. */
  protected abstract doDelBox(ask: BoxDelAsk): Awaitable<BoxClassified>
  /** Delete the box rows whose vault is missing, tombstoned or reborn, and count the box rows left in the bank. */
  protected abstract doTidyGone(scope: BankScope): Awaitable<Tidied>
  /** Start a watch: call `hear` with each changed row, and `onBadNews` with trouble, whether or not it ends the watch.
   * Returns a function that stops it. This default, for storage with no watch, calls neither.
   */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void, _onBadNews: (news: VaultError) => void): () => void { return noUnwatching }
  // --
}

// == [Helpers]: goodOrThrow, refusalOf, gateAskOf, RowOfOtherAddress, listedRowOf, liveVaultOf, listedBoxesOf, jsonSize

/** `answer` if it is good, else throw its refusal. */
function goodOrThrow<ValT, ActT extends string, WorldT>(answer: Answer<ValT, ActT, WorldT>): GoodAnswer<ValT, ActT, WorldT> {
  if (! answer.ok) { throw answer.err }
  return answer
}

/** Select the appropriate refusal for a thrown error. A VaultError is returned directly. Other errors become `storage_unavailable`.
 * Either way, its meta names the `callerlabel` as `call`, with the ask's safe metadata as `req_params`.
 */
const refusalOf = (thrown: unknown, callerlabel: string, ask: unknown): VaultError => {
  const refusal = storageTroubleOf(thrown)
  // A request that failed its check has no metadata to trust: its refusal carries none.
  const params = SX.requestParams.safeParse(ask)
  return Object.assign(refusal, { meta: { ...refusal.meta, call: callerlabel, req_params: params.success ? params.data : {} } })
}

/** The put request of a gate verb: `record` over the live vault row at `opts.prior`, in the same life, tagged with the verb. */
function gateAskOf(gateVerb: GateVerb, record: VaultRecord, opts: GateVerbOpts): VaultPutAsk {
  const { prior } = SX.gateVerbOpts.parse(opts)
  const { applabel, user_id, vaultlabel, vault_tok } = record
  return { op: 'put', applabel, user_id, vaultlabel, ifAbsent: 'fail', ifPresent: 'repl', gateVerb, expected: { ...prior, am: 'a', vault_tok }, record }
}

const RowOfOtherAddress = { kind: 'storage_issue', message: Phrases.rowOfOtherAddress } as const

/** Return a listing row if healthy and consistent with the listing, or null if it is damaged. Refuse otherwise, as appropriate for its flaws. */
function listedRowOf<RowT extends object>(rowCheck: Z.ZodType<RowT>, raw: unknown, address: object): RowT | null {
  if (! CX.isPlainBag(raw)) { throw Refuse.storageIssue() }
  const parsed = rowCheck.safeParse(raw)
  return parsed.success ? verifyConsistent(parsed.data, address, RowOfOtherAddress) : null
}

/** Return the given `stored` vault, if live at the asked-for `vault_tok`. Otherwise throw
 * the appropriate refusal: `absent_vault` for a void or tombstoned vault, `vault_reborn` for another life.
 */
function liveVaultOf(stored: VaultRow | null, asked: VaultQuery): VaultRecord {
  if (stored === null)                      { throw Refuse.actRefused('box', 'vault_void') }
  if (stored.am === 'x')                    { throw Refuse.actRefused('box', 'vault_gone') }
  if (stored.vault_tok !== asked.vault_tok) { throw Refuse.actRefused('box', 'vault_reborn') }
  return stored
}

const listedBoxesOf = ({ vault_tok, ...scope }: VaultQuery, rows: RowOfBox[]): BoxesListed => {
  const listed: BoxesListed = { boxes: [], damaged_rows: [] }
  for (const { boxlabel, box } of rows) {
    const address = { ...scope, boxlabel, vault_tok }
    const found = listedRowOf(SX.boxRow, box, address)
    if (found === null) { listed.damaged_rows.push(SX.damagedBoxOf(address, vault_tok)) } else { listed.boxes.push(SX.boxSparse.parse(found)) }
  }
  return listed
}

const jsonSize = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --

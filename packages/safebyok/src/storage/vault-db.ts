/** The vaultDB: the verbs the models call. A subclass writes only the generic `do*` calls, each one atomic step. */

import { isEqual } from 'es-toolkit'
import type * as Z from 'zod'
import { DefaultMaxRecordBytes, IsAdapterVaultDB, IsVaultDB } from '../helpers/consts'
import type { Awaitable } from '../helpers/helpers'
import * as Phrases from '../helpers/phrases'
import { verifyConsistent } from '../helpers/validator'
import { type VaultError, isVaultError, rowsOfRefusal } from '../refusals/errors'
import { type BadOutcome, type GoodOutcome, outcomeOf, storageTroubleOf } from '../refusals/outcome'
import * as SX from '../shapes/shapes-storage'
import * as CX from '../shapes/shapes-core'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import type { ListAct, OkAct } from '../shapes/shapes-enums'
import { type BoxClassified, type BoxFetched, type VaultClassified, type VaultFetched, classifyBox, classifyVault } from './classifier'
import type {
  AdapterVaultDBOpts, BoxAsk, BoxDelAsk, BoxGetAsk, BoxPutAsk, BoxRow, BoxSparse, DamagedBox, DamagedVault,
  GateVerbOpts, ReqParams, VaultAsk, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRecord, VaultRow, VaultTombstone, WatchScope,
} from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Answers]: GoodAnswer, BadAnswer, Answer, VaultAnswer, BoxAnswer, ListAct, OkAct, BankListed, BoxesListed, Tidied, Notice, answerOf

/** What a verb returns: its `val`, the `act` that says what happened, and the `world` vault row. */
export type GoodAnswer<ValT, ActT extends string, WorldT = VaultRow> = GoodOutcome<ValT> & { req_params: ReqParams, act: ActT, world: WorldT, dbhas?: unknown }

/** What a `try*` verb answers on a refusal: its `err`, with the `act`, `world` and `dbhas` it carries. */
export type BadAnswer = BadOutcome & { req_params: ReqParams, act: string, world: unknown, dbhas?: unknown }

/** The answer of a `try*` verb: a {@link GoodAnswer} or a {@link BadAnswer}. */
export type Answer<ValT, ActT extends string, WorldT = VaultRow> = GoodAnswer<ValT, ActT, WorldT> | BadAnswer

/** The answer of a vault's get, put or del: `val` is the row stored as the call leaves it, null for none. */
export type VaultAnswer = Answer<VaultRow | null, OkAct>
/** The answer of a box's get, put or del: `val` is the row stored as the call leaves it, null for none. */
export type BoxAnswer = Answer<BoxRow | null, OkAct>

export type { DelAct, GotAct, ListAct, OkAct, PutAct } from '../shapes/shapes-enums'

/** The bank's vaults from `listVaults`, and the rows that failed their checks. */
export type BankListed  = { vaults: (VaultRecord | VaultTombstone)[], damaged_rows: DamagedVault[] }
/** A vault's boxes from `listBoxes`, sparse, and the rows that failed their checks. */
export type BoxesListed = { boxes: BoxSparse[], damaged_rows: DamagedBox[] }
/** The count of box rows left after `tidyGone`. */
export type Tidied      = { totalCount: number }

/** A row that changed, as a watch hears it, with its vault row where storage sent one. */
export type Notice = { act: 'got' | 'gone', val: VaultRow | BoxRow, world: VaultRow | null }

const answerOf = async <ValT, ActT extends string, WorldT>(thunk: () => Promise<GoodAnswer<ValT, ActT, WorldT>>): Promise<Answer<ValT, ActT, WorldT>> => {
  const outcome = await outcomeOf(thunk)
  return outcome.ok ? outcome.val : badAnswerOf(outcome.err)
}

/** `answer`'s act, world and request metadata, with `val`: what a listing hands on once it has delivered a good answer. */
export const answerWithVal = <ValT>(answer: Answer<unknown, string, unknown>, val: ValT): GoodAnswer<ValT, string, unknown> => ({ ...carriedOf(answer), ok: true, val })

// A refusal met delivering a good answer keeps its act, as storage did what it says.
/** The bad answer `thrown` makes: on `answer`'s act and world where storage had answered, else on the refusal alone. */
export const refusedAnswerOf = (thrown: unknown, answer: Answer<unknown, string, unknown> | null): BadAnswer => {
  const err = isVaultError(thrown) ? thrown : Refuse.unexpectedError(thrown)
  return (answer === null) ? badAnswerOf(err) : { ...carriedOf(answer), ok: false, err }
}

/** What an answer carries beside its val or err. */
const carriedOf = ({ req_params, act, world, dbhas }: Answer<unknown, string, unknown>) => ({ req_params, act, world, ...((dbhas !== undefined) && { dbhas }) })

/** The answer `err` stands for: its act, its request's metadata and the rows it carries, where it has them. */
export const badAnswerOf = (err: VaultError): BadAnswer => {
  const { act = err.refusalkind, req_params = {} } = err.meta ?? {}
  const { world = null, dbhas } = rowsOfRefusal(err)
  return { ok: false, err, act, world, req_params, ...((dbhas !== undefined) && { dbhas }) }
}
// --

// == [What storage answers]: RowOfVault, RowOfBox, BoxesFetched, Heard

/** A vault row as storage hands it up, unchecked, under its vaultlabel. */
export type RowOfVault = { vaultlabel: string, vault: unknown }
/** A box row as storage hands it up, unchecked, under its boxlabel. */
export type RowOfBox   = { boxlabel: string, box: unknown }
/** A vault's rows as storage hands them up, unchecked: the vault row and its box rows. */
export type BoxesFetched = { vault: unknown, boxes: RowOfBox[] }
// A box's notice may come without its vault row: the vault changes slowly, and arrives in its own notices.
/** A change reported by storage's watch: a vault row, a box row, or both. */
export type Heard = { vault?: unknown, box?: unknown }
// --

// == [What a model calls]: VaultDB, VaultDBVerbnames

/** The verbs a model calls on a vaultDB, each with its `try*` form. */
export interface VaultDB {
  /** True: the brand a model knows a vaultDB by, from whichever copy of safebyok. */
  readonly [IsVaultDB]: true
  /** The bank's vaults, full or tombstone, no boxes; a row failing validation goes in `damaged_rows`. */
  listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, ListAct, BankScope>>
  /** Non-throwing form of {@link VaultDB.listVaults}. */
  tryListVaults(scope: BankScope): Promise<Answer<BankListed, ListAct, BankScope>>
  /** The vault at a scope, whatever its life. Over none stored, `ifAbsent: 'nil'` answers null, and over a tombstone, the tombstone. */
  getVault(ask: VaultGetAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.getVault}. */
  tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer>
  /** The boxes under this `vault_tok`, sparse, with its vault row as `world`. */
  listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>>
  /** Non-throwing form of {@link VaultDB.listBoxes}. */
  tryListBoxes(asked: VaultQuery): Promise<Answer<BoxesListed, ListAct>>
  /** The box under this `vault_tok`, with its vault row as `world`. Over none stored, `ifAbsent: 'nil'` answers null, and over a tombstone, the tombstone. */
  getBox(ask: BoxGetAsk): Promise<GoodAnswer<BoxRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.getBox}. */
  tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer>
  /** Stores `ask.record` over the vault row `ask.expected`, as its policies allow. `passed` answers the live row found. */
  putVault(ask: VaultPutAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.putVault}. */
  tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer>
  /** Stores `ask.record` over the box row `ask.expected`, under a vault live at its `vault_tok`, as its policies allow. `passed` answers the live row found. */
  putBox(ask: BoxPutAsk): Promise<GoodAnswer<BoxRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.putBox}. */
  tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer>
  /** Puts `record`, the vault row at `opts.prior` with a new passphrase wayin and its `gate_epoch` one up. */
  replacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'replaced'>>
  /** Non-throwing form of {@link VaultDB.replacePassphrase}. */
  tryReplacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'replaced'>>
  /** Puts `record`, the vault row at `opts.prior`, which has no passkey wayin, with one laid on and its `gate_epoch` one up. */
  addPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'added'>>
  /** Non-throwing form of {@link VaultDB.addPasskey}. */
  tryAddPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'added'>>
  /** Puts `record`, the vault row at `opts.prior` with no passkey wayin and its `gate_epoch` one up; a row with none answers as stored. */
  revokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'revoked'>>
  /** Non-throwing form of {@link VaultDB.revokePasskey}. */
  tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'revoked'>>
  /** Stores the tombstone `ask.record` over the live box row `ask.expected`. */
  delBox(ask: BoxDelAsk): Promise<GoodAnswer<BoxRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.delBox}. */
  tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer>
  /** Stores the tombstone `ask.record` over the live vault row `ask.expected`, and deletes the boxes of its life. */
  delVault(ask: VaultDelAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.delVault}. */
  tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer>
  /** For hosts: removes the box rows of tombstoned or vanished vaults, and counts those left. */
  tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>>
  /** Non-throwing form of {@link VaultDB.tidyGone}. */
  tryTidyGone(scope: BankScope): Promise<Answer<Tidied, 'tidied', BankScope>>
  /** Tells `onNotice` of rows that change under a bank or a vault, `onBadNews` of a watch it ends; returns how to stop.
   * Nothing may count on a notice arriving.
   */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews?: (news: VaultError) => void): () => void
}

/** The name of each verb of {@link VaultDB}, as a duck check asks a vaultDB to answer each with a function. */
export const VaultDBVerbnames = [
  'listVaults', 'tryListVaults', 'getVault', 'tryGetVault', 'listBoxes', 'tryListBoxes', 'getBox', 'tryGetBox',
  'putVault', 'tryPutVault', 'putBox', 'tryPutBox',
  'replacePassphrase', 'tryReplacePassphrase', 'addPasskey', 'tryAddPasskey', 'revokePasskey', 'tryRevokePasskey',
  'delBox', 'tryDelBox', 'delVault', 'tryDelVault', 'tidyGone', 'tryTidyGone', 'watch',
] as const satisfies readonly (keyof VaultDB)[]

true satisfies Z.core.util.AssertEqual<typeof VaultDBVerbnames[number], Exclude<keyof VaultDB, typeof IsVaultDB>>
// --

const noUnwatching = (): void => undefined

/** The base of a vaultDB. Each verb throws its refusal and returns its answer; each `try*` answers either.
 * A subclass writes only the generic `do*` calls, each one atomic step.
 */
export abstract class AdapterVaultDB implements VaultDB {
  // == [Props]: #maxRecordBytes, IsVaultDB, IsAdapterVaultDB

  readonly #maxRecordBytes: number

  // A getter on the class, never an own field, so the brand neither serializes nor rides along in a spread.
  /** True: the brand a model knows a vaultDB by, from whichever copy of safebyok. */
  get [IsVaultDB](): true { return true }

  /** True: the brand an adapter answers to, and a client of one does not. */
  get [IsAdapterVaultDB](): true { return true }
  // --

  // == [Construction]: constructor

  constructor(opts: AdapterVaultDBOpts = {}) {
    const { maxRecordBytes = DefaultMaxRecordBytes } = SX.adapterVaultDBOpts.parse(opts)
    this.#maxRecordBytes = maxRecordBytes
  }
  // --

  // == [An ask and its answer]: classifyVault, classifyBox, vaultAnswerOf, boxAnswerOf, answerThrown
  // A get, put or del checks its ask once and hands it on whole. Its `do*` call answers what the classifier made of the ask,
  // and that is the answer but for its names: nothing is checked or shaped again on the way back.

  /** What a vault's ask comes to over the row fetched for it. A subclass's `do*` calls this inside its atomic step, and may replace it. */
  protected classifyVault(ask: VaultAsk, fetched: VaultFetched): VaultClassified { return classifyVault(ask, fetched) }

  /** What a box's ask comes to over the rows fetched for it. A subclass's `do*` calls this inside its atomic step, and may replace it. */
  protected classifyBox(ask: BoxAsk, fetched: BoxFetched): BoxClassified { return classifyBox(ask, fetched) }

  /** The answer of a vault's `call`, made of what its ask came to. */
  protected vaultAnswerOf(call: string, ask: VaultAsk, classified: VaultClassified): VaultAnswer {
    const req_params = SX.reqParamsOf(ask)
    const { act, world, row } = classified
    if (classified.ok) { return { ok: true, req_params, act: classified.act, val: row, world } }
    return { ok: false, req_params, act, world, dbhas: row, err: Refuse.actRefused('vault', classified.act, { call, req_params }) }
  }

  /** The answer of a box's `call`, made of what its ask came to. */
  protected boxAnswerOf(call: string, ask: BoxAsk, classified: BoxClassified): BoxAnswer {
    const req_params = SX.reqParamsOf(ask)
    const { act, world, row, capacity } = classified
    if (classified.ok) { return { ok: true, req_params, act: classified.act, val: row, world } }
    const meta = { call, req_params, ...((act === 'vault_full') && (capacity !== null) && { capacity }) }
    return { ok: false, req_params, act, world, dbhas: row, err: Refuse.actRefused('box', classified.act, meta) }
  }

  // Every throw under a get, put or del lands here: an ask that fails its checks, a stored row that fails its own, a store that is down.
  /** The answer of a `call` that threw: the refusal as it came, anything else as `storage_unavailable`. A subclass may tell one refusal from another here. */
  protected answerThrown(thrown: unknown, call: string, ask: unknown): BadAnswer {
    return badAnswerOf(refusalOf(thrown, call, SX.reqParamsOf(ask)))
  }
  // --

  // == [Gets]: listVaults, tryListVaults, getVault, tryGetVault, listBoxes, tryListBoxes, getBox, tryGetBox

  /** The bank's vaults, full or tombstone, no boxes; a row failing validation goes in `damaged_rows`. */
  async listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, ListAct, BankScope>> {
    const req_params = SX.reqParamsOf(scope)
    try {
      const bankScope = CX.bankScope.parse(scope)
      const rows = await this.doListVaults(bankScope)
      const val: BankListed = { vaults: [], damaged_rows: [] }
      for (const { vaultlabel, vault } of rows) {
        const address = { ...bankScope, vaultlabel }
        const listed = listedRowOf(SX.vaultRow, vault, address)
        if (listed === null) { val.damaged_rows.push(SX.damagedVaultOf(address)) } else { val.vaults.push(listed) }
      }
      return { ok: true, req_params, act: (rows.length > 0) ? 'got' : 'gotvoid', val, world: bankScope }
    } catch (err) { throw refusalOf(err, 'listVaults', req_params) }
  }

  /** Non-throwing form of {@link listVaults}. */
  async tryListVaults(scope: BankScope) { return answerOf(() => this.listVaults(scope)) }

  /** The vault at a scope, whatever its life. Over none stored, `ifAbsent: 'nil'` answers null, and over a tombstone, the tombstone. */
  async getVault(ask: VaultGetAsk) { return goodOrThrow(await this.tryGetVault(ask)) }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer> {
    try {
      const checked = SX.vaultGet.parse(ask)
      return this.vaultAnswerOf('getVault', checked, await this.doGetVault(checked))
    } catch (err) { return this.answerThrown(err, 'getVault', ask) }
  }

  /** The boxes under this `vault_tok`, sparse, with its vault row as `world`. */
  async listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>> {
    const req_params = SX.reqParamsOf(asked)
    try {
      const vaultQuery = SX.vaultQuery.parse(asked)
      const { vault, boxes } = await this.doListBoxes(vaultQuery)
      const world = liveVaultOf(foundVaultRowOf(vault, vaultQuery), vaultQuery)
      return { ok: true, req_params, act: (boxes.length > 0) ? 'got' : 'gotvoid', val: listedBoxesOf(vaultQuery, boxes), world }
    } catch (err) { throw refusalOf(err, 'listBoxes', req_params) }
  }

  /** Non-throwing form of {@link listBoxes}. */
  async tryListBoxes(asked: VaultQuery) { return answerOf(() => this.listBoxes(asked)) }

  /** The box under this `vault_tok`, with its vault row as `world`. Over none stored, `ifAbsent: 'nil'` answers null, and over a tombstone, the tombstone. */
  async getBox(ask: BoxGetAsk) { return goodOrThrow(await this.tryGetBox(ask)) }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer> {
    try {
      const checked = SX.boxGet.parse(ask)
      return this.boxAnswerOf('getBox', checked, await this.doGetBox(checked))
    } catch (err) { return this.answerThrown(err, 'getBox', ask) }
  }
  // --

  // == [Puts]: putVault, tryPutVault, #demandEnoughVolume, putBox, tryPutBox

  /** Stores `ask.record` over the vault row `ask.expected`, as its policies allow. `passed` answers the live row found. */
  async putVault(ask: VaultPutAsk) { return goodOrThrow(await this.tryPutVault(ask)) }

  /** Non-throwing form of {@link putVault}. */
  async tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer> {
    try {
      const checked = SX.vaultPut.parse(ask)
      return this.vaultAnswerOf('putVault', checked, await this.doPutVault(checked))
    } catch (err) { return this.answerThrown(err, 'putVault', ask) }
  }

  /** Throws `box_too_large` for a record over what this vaultDB stores in one row. */
  #demandEnoughVolume({ record }: BoxPutAsk): void {
    const recordBytes = jsonBytes(record)
    if (recordBytes > this.#maxRecordBytes) { throw Refuse.boxTooLarge(recordBytes, this.#maxRecordBytes) }
  }

  /** Stores `ask.record` over the box row `ask.expected`, under a vault live at its `vault_tok`, as its policies allow. `passed` answers the live row found. */
  async putBox(ask: BoxPutAsk) { return goodOrThrow(await this.tryPutBox(ask)) }

  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer> {
    try {
      const checked = SX.boxPut.parse(ask)
      this.#demandEnoughVolume(checked)
      return this.boxAnswerOf('putBox', checked, await this.doPutBox(checked))
    } catch (err) { return this.answerThrown(err, 'putBox', ask) }
  }
  // --

  // == [Gate verbs]: #liveVaultAt, replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey

  /** The vault row stored at `asked`'s scope, where it is live in the life `asked` names. */
  async #liveVaultAt({ applabel, user_id, vaultlabel, vault_tok }: VaultQuery): Promise<VaultRecord> {
    const { row } = await this.doGetVault({ op: 'get', ifAbsent: 'nil', applabel, user_id, vaultlabel })
    return liveVaultOf(row, { applabel, user_id, vaultlabel, vault_tok })
  }

  /** Puts `record`, the vault row at `opts.prior` with a new passphrase wayin and its `gate_epoch` one up. */
  async replacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'replaced'>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const vaultRecord = SX.vaultRecord.parse(record)
      const { prior } = SX.gateVerbOpts.parse(opts)
      const stored = await this.#liveVaultAt(vaultRecord)
      if (! SX.isRowAt(stored, prior)) { throw Refuse.actRefused('vault', 'stale') }
      if (stored.registered_at !== vaultRecord.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
      if (vaultRecord.gate.gate_epoch !== (stored.gate.gate_epoch + 1)) { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
      if (! isEqual(vaultRecord.gate.passkey_wayin, stored.gate.passkey_wayin)) { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
      await this.putVault({ op: 'put', ifAbsent: 'fail', ifPresent: 'repl', expected: stored, record: vaultRecord })
      return { ok: true, req_params, act: 'replaced', val: vaultRecord, world: vaultRecord }
    } catch (err) { throw refusalOf(err, 'replacePassphrase', req_params) }
  }

  /** Non-throwing form of {@link replacePassphrase}. */
  async tryReplacePassphrase(record: VaultRecord, opts: GateVerbOpts) { return answerOf(() => this.replacePassphrase(record, opts)) }

  /** Puts `record`, the vault row at `opts.prior`, which has no passkey wayin, with one laid on and its `gate_epoch` one up. */
  async addPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'added'>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const vaultRecord = SX.passkeyAddRecord.parse(record)
      const { prior } = SX.gateVerbOpts.parse(opts)
      const stored = await this.#liveVaultAt(vaultRecord)
      if (! SX.isRowAt(stored, prior)) { throw Refuse.actRefused('vault', 'stale') }
      if (stored.registered_at !== vaultRecord.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
      if (stored.gate.passkey_wayin !== null) { throw Refuse.actRefused('vault', 'camped') }
      if (vaultRecord.gate.gate_epoch !== (stored.gate.gate_epoch + 1)) { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
      if (! isEqual(vaultRecord.gate.passphrase_wayin, stored.gate.passphrase_wayin)) { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
      await this.putVault({ op: 'put', ifAbsent: 'fail', ifPresent: 'repl', expected: stored, record: vaultRecord })
      return { ok: true, req_params, act: 'added', val: vaultRecord, world: vaultRecord }
    } catch (err) { throw refusalOf(err, 'addPasskey', req_params) }
  }

  /** Non-throwing form of {@link addPasskey}. */
  async tryAddPasskey(record: VaultRecord, opts: GateVerbOpts) { return answerOf(() => this.addPasskey(record, opts)) }

  /** Puts `record`, the vault row at `opts.prior` with no passkey wayin and its `gate_epoch` one up; a row with none answers as stored. */
  async revokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'revoked'>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const vaultRecord = SX.passkeyRevokeRecord.parse(record)
      const { prior } = SX.gateVerbOpts.parse(opts)
      // this needs to be transactional.
      // better to (a) not bury the lede: this.doGetVault is important! deserves own line.
      // also, doGetVault knows what its type is, and is likely to spread args anyway. don't put the field extraction in the caller
      const stored = await this.#liveVaultAt(vaultRecord)
      if (! SX.isRowAt(stored, prior)) { throw Refuse.actRefused('vault', 'stale') }
      // these checks take place in the datastore, not here on an out-of-date row
      if (stored.registered_at !== vaultRecord.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
      // this will have been validated by now (make sure it has been)
      if (stored.gate.passkey_wayin === null) { return { ok: true, req_params, act: 'revoked', val: stored, world: stored } }
      if (vaultRecord.gate.gate_epoch !== (stored.gate.gate_epoch + 1)) { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
      if (! isEqual(vaultRecord.gate.passphrase_wayin, stored.gate.passphrase_wayin)) { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
      await this.putVault({ op: 'put', ifAbsent: 'fail', ifPresent: 'repl', expected: stored, record: vaultRecord })
      return { ok: true, req_params, act: 'revoked', val: vaultRecord, world: vaultRecord }
    } catch (err) { throw refusalOf(err, 'revokePasskey', req_params) }
  }

  /** Non-throwing form of {@link revokePasskey}. */
  async tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts) { return answerOf(() => this.revokePasskey(record, opts)) }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault, tidyGone, tryTidyGone

  /** Stores the tombstone `ask.record` over the live box row `ask.expected`. */
  async delBox(ask: BoxDelAsk) { return goodOrThrow(await this.tryDelBox(ask)) }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer> {
    try {
      const checked = SX.boxDel.parse(ask)
      return this.boxAnswerOf('delBox', checked, await this.doDelBox(checked))
    } catch (err) { return this.answerThrown(err, 'delBox', ask) }
  }

  /** Stores the tombstone `ask.record` over the live vault row `ask.expected`, and deletes the boxes of its life. */
  async delVault(ask: VaultDelAsk) { return goodOrThrow(await this.tryDelVault(ask)) }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer> {
    try {
      const checked = SX.vaultDel.parse(ask)
      return this.vaultAnswerOf('delVault', checked, await this.doDelVault(checked))
    } catch (err) { return this.answerThrown(err, 'delVault', ask) }
  }

  /** For hosts: removes the box rows of tombstoned or vanished vaults, and counts those left. */
  async tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>> {
    const req_params = SX.reqParamsOf(scope)
    try {
      const bankScope = CX.bankScope.parse(scope)
      const val = await this.doTidyGone(bankScope)
      return { ok: true, req_params, act: 'tidied', val, world: bankScope }
    } catch (err) { throw refusalOf(err, 'tidyGone', req_params) }
  }

  /** Non-throwing form of {@link tidyGone}. */
  async tryTidyGone(scope: BankScope): Promise<Answer<Tidied, 'tidied', BankScope>> { return answerOf(() => this.tidyGone(scope)) }
  // --

  // == [Watch]: watch

  /** Tells `onNotice` of rows that change under a bank or a vault, and returns how to stop. */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void): () => void {
    return this.doWatch(SX.watchScope.parse(scope), ({ vault, box }) => {
      const world = (vault === undefined) ? null : SX.vaultRow.safeParse(vault)
      if ((world !== null) && (! world.success)) { return }
      if (box === undefined) {
        if (world !== null) { onNotice({ act: (world.data.am === 'x') ? 'gone' : 'got', val: world.data, world: world.data }) }
        return
      }
      const val = SX.boxRow.safeParse(box)
      if (val.success) { onNotice({ act: (val.data.am === 'x') ? 'gone' : 'got', val: val.data, world: world?.data ?? null }) }
    })
  }
  // --

  // == [Protected, for a subclass to write]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch
  // A get, put or del is one atomic step: fetch what the classifier reads, classify, and store `classified.write` where there is one.

  /** Every vault row of the bank, full or tombstone. */
  protected abstract doListVaults(scope: BankScope): Awaitable<RowOfVault[]>
  /** Fetch the vault row at `ask`'s scope, and answer `this.classifyVault(ask, fetched)`. */
  protected abstract doGetVault(ask: VaultGetAsk): Awaitable<VaultClassified>
  /** The vault row, and every box row under `vault_tok`, read in one step. */
  protected abstract doListBoxes(asked: VaultQuery): Awaitable<BoxesFetched>
  /** Fetch the vault row and the box row `ask` names, in one step, and answer `this.classifyBox(ask, fetched)`. */
  protected abstract doGetBox(ask: BoxGetAsk): Awaitable<BoxClassified>
  /** In one step: fetch the vault row at `ask.record`'s scope, classify, and store `classified.write` where it is not null. */
  protected abstract doPutVault(ask: VaultPutAsk): Awaitable<VaultClassified>
  /** In one step: fetch the vault row, the box row and the vault's room for `ask.record`, classify, and store `classified.write` where it is not null. */
  protected abstract doPutBox(ask: BoxPutAsk): Awaitable<BoxClassified>
  /** In one step: fetch the vault row at `ask.record`'s scope, classify, and where `classified.write` is not null store it and delete that life's boxes. */
  protected abstract doDelVault(ask: VaultDelAsk): Awaitable<VaultClassified>
  /** In one step: fetch the vault row and the box row for `ask.record`, classify, and store `classified.write` where it is not null. */
  protected abstract doDelBox(ask: BoxDelAsk): Awaitable<BoxClassified>
  /** Removes the box rows of vaults that are void, tombstoned or reborn, and counts those left in the bank. */
  protected abstract doTidyGone(scope: BankScope): Awaitable<Tidied>
  /** Starts telling `hear` of rows that change, and returns how to stop. Storage with no watch never calls it. */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void): () => void { return noUnwatching }
  // --
}

// == [Helpers]: goodOrThrow, refusalOf, RowOfOtherAddress, demandVaultObject, foundVaultRowOf, listedRowOf, liveVaultOf, listedBoxesOf, jsonBytes

/** `answer` where it is good; else throws its refusal. */
function goodOrThrow<ValT, ActT extends string, WorldT>(answer: Answer<ValT, ActT, WorldT>): GoodAnswer<ValT, ActT, WorldT> {
  if (! answer.ok) { throw answer.err }
  return answer
}

/** The refusal a verb's throw stands for: a refusal as it came, else `storage_unavailable`. */
const refusalOf = (thrown: unknown, call: string, req_params: ReqParams): VaultError => {
  const refusal = storageTroubleOf(thrown)
  return Object.assign(refusal, { meta: { ...refusal.meta, call, req_params } })
}

const RowOfOtherAddress = { kind: 'storage_issue', message: Phrases.rowOfOtherAddress } as const

function demandVaultObject(asked: VaultScope, raw: unknown): VaultRow {
  if (! CX.isPlainBag(raw)) { throw Refuse.storageIssue() }
  return SX.storedVaultRow.parseConsistent(raw, CX.vaultScope.parse(asked), RowOfOtherAddress)
}

// Checked against its scope and not its vault_tok: a vault row of another life is an answer the verbs have words for.
/** The vault row storage answered for `asked`'s scope, null for none. */
function foundVaultRowOf(raw: unknown, asked: VaultScope): VaultRow | null {
  if (raw === null) { return null }
  return demandVaultObject(asked, raw)
}

/** A listing's row, checked against the `address` it is listed at; null for one that is to be set aside as damaged. */
function listedRowOf<RowT extends object>(rowCheck: Z.ZodType<RowT>, raw: unknown, address: object): RowT | null {
  if (! CX.isPlainBag(raw)) { throw Refuse.storageIssue() }
  const parsed = rowCheck.safeParse(raw)
  return parsed.success ? verifyConsistent(parsed.data, address, RowOfOtherAddress) : null
}

// These are the classifier's three acts of a box's vault: a listing of boxes and a gate verb read a vault row with no ask to classify.
/** `stored` where it is a vault row live in the life `asked` names; else throws as a box's call refuses for its vault. */
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

const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --

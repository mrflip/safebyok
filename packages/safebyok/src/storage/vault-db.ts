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
import type { DelAct, GotAct, ListAct, PutAct } from '../shapes/shapes-enums'
import type { AdapterVaultDBOpts, BoxQuery, BoxRecord, BoxRow, BoxSparse, BoxTombstone, DamagedBox, DamagedVault, DelOpts, GateVerbOpts, IfAbsentOpts, PutOpts, PutOptsGiven, ReqParams, VaultQuery, VaultRecord, VaultRow, VaultTombstone, WatchScope } from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Answers]: GoodAnswer, BadAnswer, Answer, ListAct, GotAct, PutAct, DelAct, BankListed, BoxesListed, Tidied, Notice, answerOf

/** What a verb returns: its `val`, the `act` that says what happened, and the `world` vault row. */
export type GoodAnswer<ValT, ActT extends string, WorldT = VaultRow> = GoodOutcome<ValT> & { req_params: ReqParams, act: ActT, world: WorldT, dbhas?: unknown }

/** What a `try*` verb answers on a refusal: its `err`, with the `act`, `world` and `dbhas` it carries. */
export type BadAnswer = BadOutcome & { req_params: ReqParams, act: string, world: unknown, dbhas?: unknown }

/** The answer of a `try*` verb: a {@link GoodAnswer} or a {@link BadAnswer}. */
export type Answer<ValT, ActT extends string, WorldT = VaultRow> = GoodAnswer<ValT, ActT, WorldT> | BadAnswer

export type { DelAct, GotAct, ListAct, PutAct } from '../shapes/shapes-enums'

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

// == [What storage answers]: Written, BoxWritten, RowOfVault, RowOfBox, BoxesFetched, BoxFetched, Heard

/** Whether a conditional write took effect, and `ante`, the row it replaced or that stood in its way. */
export type Written = { isWritten: boolean, ante: unknown }

/** A box write's {@link Written}, with the vault row as read in the same step. */
export type BoxWritten = Written & { vault: unknown }

/** A vault row as storage hands it up, unchecked, under its vaultlabel. */
export type RowOfVault = { vaultlabel: string, vault: unknown }
/** A box row as storage hands it up, unchecked, under its boxlabel. */
export type RowOfBox   = { boxlabel: string, box: unknown }
/** A vault's rows as storage hands them up, unchecked: the vault row and its box rows. */
export type BoxesFetched = { vault: unknown, boxes: RowOfBox[] }
/** A box row and its vault row as storage hands them up, unchecked. */
export type BoxFetched   = { vault: unknown, box: unknown }
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
  /** The vault by scope alone, whatever its life. Over a void or gone row, `ifAbsent: 'nil'` answers null. */
  getVault(scope: VaultScope, opts?: IfAbsentOpts): Promise<GoodAnswer<VaultRecord | null, GotAct>>
  /** Non-throwing form of {@link VaultDB.getVault}. */
  tryGetVault(scope: VaultScope, opts?: IfAbsentOpts): Promise<Answer<VaultRecord | null, GotAct>>
  /** The boxes under this `vault_tok`, sparse, with its vault row as `world`. */
  listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>>
  /** Non-throwing form of {@link VaultDB.listBoxes}. */
  tryListBoxes(asked: VaultQuery): Promise<Answer<BoxesListed, ListAct>>
  /** The box under this `vault_tok`, with its vault row as `world`; `ifAbsent: 'nil'` answers null over none. */
  getBox(asked: BoxQuery, opts?: IfAbsentOpts): Promise<GoodAnswer<BoxRecord | null, GotAct>>
  /** Non-throwing form of {@link VaultDB.getBox}. */
  tryGetBox(asked: BoxQuery, opts?: IfAbsentOpts): Promise<Answer<BoxRecord | null, GotAct>>
  /** Puts a vault, as `opts` allow. */
  putVault(record: VaultRecord, opts: PutOpts): Promise<GoodAnswer<VaultRow, PutAct>>
  /** Non-throwing form of {@link VaultDB.putVault}. */
  tryPutVault(record: VaultRecord, opts: PutOpts): Promise<Answer<VaultRow, PutAct>>
  /** Puts a box under a vault live at its `vault_tok`, as `opts` allow. */
  putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>>
  /** Non-throwing form of {@link VaultDB.putBox}. */
  tryPutBox(record: BoxRecord, opts: PutOpts): Promise<Answer<BoxRow, PutAct>>
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
  /** Deletes a box's live row at `prior`. */
  delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>>
  /** Non-throwing form of {@link VaultDB.delBox}. */
  tryDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<Answer<BoxTombstone, DelAct>>
  /** Deletes a vault's live row at `prior`, with the boxes of its life. */
  delVault(tombstone: VaultTombstone, opts: DelOpts): Promise<GoodAnswer<VaultTombstone, DelAct>>
  /** Non-throwing form of {@link VaultDB.delVault}. */
  tryDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Answer<VaultTombstone, DelAct>>
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

  /** The vault by scope alone, whatever its life. Over a void or gone row, `ifAbsent: 'nil'` answers null. */
  async getVault(scope: VaultScope, opts: IfAbsentOpts = {}): Promise<GoodAnswer<VaultRecord | null, GotAct>> {
    const req_params = SX.reqParamsOf(scope)
    try {
      const vaultScope = CX.vaultScope.parse(scope)
      const { ifAbsent } = SX.ifAbsentOpts.parse(opts)
      const found = foundVaultRowOf(await this.doGetVault(vaultScope), vaultScope)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(vaultScope)) }
      if (found === null) { return { ok: true, req_params, act: 'gotvoid', val: null, world: SX.sentinelVaultOf(vaultScope), dbhas: null } }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.vaultGone(found) }
      if (found.am === 'x') { return { ok: true, req_params, act: 'gotgone', val: null, world: found, dbhas: found } }
      return { ok: true, req_params, act: 'got', val: found, world: found }
    } catch (err) { throw refusalOf(err, 'getVault', req_params) }
  }

  /** Non-throwing form of {@link getVault}. */
  async tryGetVault(scope: VaultScope, opts?: IfAbsentOpts) { return answerOf(() => this.getVault(scope, opts)) }

  /** The boxes under this `vault_tok`, sparse, with its vault row as `world`. */
  async listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>> {
    const req_params = SX.reqParamsOf(asked)
    try {
      const vaultQuery = SX.vaultQuery.parse(asked)
      const { vault, boxes } = await this.doListBoxes(vaultQuery)
      const world = liveVaultOf(vault, vaultQuery)
      return { ok: true, req_params, act: (boxes.length > 0) ? 'got' : 'gotvoid', val: listedBoxesOf(vaultQuery, boxes), world }
    } catch (err) { throw refusalOf(err, 'listBoxes', req_params) }
  }

  /** Non-throwing form of {@link listBoxes}. */
  async tryListBoxes(asked: VaultQuery) { return answerOf(() => this.listBoxes(asked)) }

  /** The box under this `vault_tok`, with its vault row as `world`; `ifAbsent: 'nil'` answers null over none. */
  async getBox(asked: BoxQuery, opts: IfAbsentOpts = {}): Promise<GoodAnswer<BoxRecord | null, GotAct>> {
    const req_params = SX.reqParamsOf(asked)
    try {
      const boxQuery = SX.boxQuery.parse(asked)
      const { ifAbsent } = SX.ifAbsentOpts.parse(opts)
      const { vault, box } = await this.doGetBox(boxQuery)
      const world = liveVaultOf(vault, boxQuery)
      const found = foundBoxRowOf(box, boxQuery)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.absentBox(world, null) }
      if (found === null) { return { ok: true, req_params, act: 'gotvoid', val: null, world, dbhas: null } }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.absentBox(world, found) }
      if (found.am === 'x') { return { ok: true, req_params, act: 'gotgone', val: null, world, dbhas: found } }
      return { ok: true, req_params, act: 'got', val: found, world }
    } catch (err) { throw refusalOf(err, 'getBox', req_params) }
  }

  /** Non-throwing form of {@link getBox}. */
  async tryGetBox(asked: BoxQuery, opts?: IfAbsentOpts) { return answerOf(() => this.getBox(asked, opts)) }
  // --

  // == [Puts]: putVault, tryPutVault, putBox, tryPutBox

  /** Puts a vault, as `opts` allow. */
  async putVault(record: VaultRecord, opts: PutOpts): Promise<GoodAnswer<VaultRow, PutAct>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const vaultRecord = SX.vaultRecord.parse(record)
      const putOpts = SX.putOpts.parse(opts)
      SX.nextSeq.parse({ record: vaultRecord, prior: putOpts.prior })
      const { isWritten, ante } = await this.doPutVault(vaultRecord, putOpts)
      if (isWritten) { return { ok: true, req_params, act: writeActOf(ante), val: vaultRecord, world: vaultRecord } }
      const { ifAbsent, ifPresent } = putOpts
      const found = foundVaultRowOf(ante, vaultRecord)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(vaultRecord, vaultRecord.vault_tok)) }
      if (found === null) { throw Refuse.staleWrite(SX.sentinelVaultOf(vaultRecord, vaultRecord.vault_tok), null) }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.vaultGone(found) }
      if (found.am === 'x') { throw Refuse.staleWrite(found, found) }
      if (ifPresent === 'get') { return { ok: true, req_params, act: 'declined', val: found, world: found } }
      if (ifPresent === 'fail') { throw Refuse.camped(found, found) }
      throw Refuse.staleWrite(found, found)
    } catch (err) { throw refusalOf(err, 'putVault', req_params) }
  }

  /** Non-throwing form of {@link putVault}. */
  async tryPutVault(record: VaultRecord, opts: PutOpts) { return answerOf(() => this.putVault(record, opts)) }

  /** Puts a box under a vault live at its `vault_tok`, as `opts` allow. */
  async putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const boxRecord = SX.boxRecord.parse(record)
      const putOpts = SX.putOpts.parse(opts)
      SX.nextSeq.parse({ record: boxRecord, prior: putOpts.prior })
      const recordBytes = jsonBytes(boxRecord)
      if (recordBytes > this.#maxRecordBytes) { throw Refuse.boxTooLarge(recordBytes, this.#maxRecordBytes) }
      const { isWritten, ante, vault } = await this.doPutBox(boxRecord, putOpts)
      const world = liveVaultOf(vault, boxRecord)
      if (isWritten) { return { ok: true, req_params, act: writeActOf(ante), val: boxRecord, world } }
      const { ifAbsent, ifPresent } = putOpts
      const found = foundBoxRowOf(ante, boxRecord)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.absentBox(world, null) }
      if (found === null) { throw Refuse.staleWrite(world, null) }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.absentBox(world, found) }
      if (found.am === 'x') { throw Refuse.staleWrite(world, found) }
      if (ifPresent === 'get') { return { ok: true, req_params, act: 'declined', val: found, world } }
      if (ifPresent === 'fail') { throw Refuse.camped(world, found) }
      throw Refuse.staleWrite(world, found)
    } catch (err) { throw refusalOf(err, 'putBox', req_params) }
  }

  /** Non-throwing form of {@link putBox}. */
  async tryPutBox(record: BoxRecord, opts: PutOpts) { return answerOf(() => this.putBox(record, opts)) }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey

  /** Puts `record`, the vault row at `opts.prior` with a new passphrase wayin and its `gate_epoch` one up. */
  async replacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'replaced'>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const vaultRecord = SX.vaultRecord.parse(record)
      const putOpts = SX.gateVerbOpts.parse(opts)
      const stored = liveVaultOf(await this.doGetVault(CX.vaultScope.parse(vaultRecord)), vaultRecord)
      if (! SX.isRowAt(stored, putOpts.prior)) { throw Refuse.staleWrite(stored, stored) }
      if (stored.registered_at !== vaultRecord.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
      if (vaultRecord.gate.gate_epoch !== (stored.gate.gate_epoch + 1)) { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
      if (! isEqual(vaultRecord.gate.passkey_wayin, stored.gate.passkey_wayin)) { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
      await this.putVault(vaultRecord, { ...putOpts, ifAbsent: 'fail', ifPresent: 'repl' })
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
      const putOpts = SX.gateVerbOpts.parse(opts)
      const stored = liveVaultOf(await this.doGetVault(CX.vaultScope.parse(vaultRecord)), vaultRecord)
      if (! SX.isRowAt(stored, putOpts.prior)) { throw Refuse.staleWrite(stored, stored) }
      if (stored.registered_at !== vaultRecord.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
      if (stored.gate.passkey_wayin !== null) { throw Refuse.camped(stored, stored) }
      if (vaultRecord.gate.gate_epoch !== (stored.gate.gate_epoch + 1)) { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
      if (! isEqual(vaultRecord.gate.passphrase_wayin, stored.gate.passphrase_wayin)) { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
      await this.putVault(vaultRecord, { ...putOpts, ifAbsent: 'fail', ifPresent: 'repl' })
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
      const putOpts = SX.gateVerbOpts.parse(opts)
      const stored = liveVaultOf(await this.doGetVault(CX.vaultScope.parse(vaultRecord)), vaultRecord)
      if (! SX.isRowAt(stored, putOpts.prior)) { throw Refuse.staleWrite(stored, stored) }
      if (stored.registered_at !== vaultRecord.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
      if (stored.gate.passkey_wayin === null) { return { ok: true, req_params, act: 'revoked', val: stored, world: stored } }
      if (vaultRecord.gate.gate_epoch !== (stored.gate.gate_epoch + 1)) { throw Refuse.gateIssue(stored, Phrases.GateEpochNotNext) }
      if (! isEqual(vaultRecord.gate.passphrase_wayin, stored.gate.passphrase_wayin)) { throw Refuse.gateIssue(stored, Phrases.OtherWayinMoved) }
      await this.putVault(vaultRecord, { ...putOpts, ifAbsent: 'fail', ifPresent: 'repl' })
      return { ok: true, req_params, act: 'revoked', val: vaultRecord, world: vaultRecord }
    } catch (err) { throw refusalOf(err, 'revokePasskey', req_params) }
  }

  /** Non-throwing form of {@link revokePasskey}. */
  async tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts) { return answerOf(() => this.revokePasskey(record, opts)) }
  // --

  // == [Dels]: delBox, tryDelBox, #answerDelBoxVoid, #answerDelBoxGone, #answerDelBoxRecord, delVault, tryDelVault, #answerDelVaultVoid, #answerDelVaultGone, #answerDelVaultRecord, tidyGone, tryTidyGone

  /** Deletes a box's live row at `prior`. */
  async delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>> {
    const req_params = SX.reqParamsOf({ ...tombstone, ...opts })
    try {
      const boxTombstone = SX.boxTombstone.parse(tombstone)
      const delOpts = SX.delOpts.parse(opts)
      SX.nextSeq.parse({ record: boxTombstone, prior: delOpts.prior })
      const { isWritten, ante, vault } = await this.doDelBox(boxTombstone, delOpts)
      const world = liveVaultOf(vault, boxTombstone)
      if (isWritten) { return { ok: true, req_params, act: 'deleted', val: boxTombstone, world } }
      const found = foundBoxRowOf(ante, boxTombstone)
      if (found === null) { return this.#answerDelBoxVoid(boxTombstone, world, req_params) }
      if (found.am === 'x') { return this.#answerDelBoxGone(found, world, req_params) }
      return this.#answerDelBoxRecord(found, world)
    } catch (err) { throw refusalOf(err, 'delBox', req_params) }
  }

  /** Non-throwing form of {@link delBox}. */
  async tryDelBox(tombstone: BoxTombstone, opts: DelOpts) { return answerOf(() => this.delBox(tombstone, opts)) }

  /** The `void` answer: the box label's sentinel. */
  #answerDelBoxVoid(boxTombstone: BoxTombstone, world: VaultRecord, req_params: ReqParams): GoodAnswer<BoxTombstone, 'void'> {
    return { ok: true, req_params, act: 'void', val: SX.sentinelBoxOf(boxTombstone, boxTombstone.vault_tok), world }
  }

  /** The `gone` answer: the box tombstone found. */
  #answerDelBoxGone(found: BoxTombstone, world: VaultRecord, req_params: ReqParams): GoodAnswer<BoxTombstone, 'gone'> {
    return { ok: true, req_params, act: 'gone', val: found, world }
  }

  /** Refuses a del made from another revision of the live box row. */
  #answerDelBoxRecord(found: BoxRecord, world: VaultRecord): never {
    throw Refuse.staleWrite(world, found)
  }

  /** Deletes a vault's live row at `prior`, with the boxes of its life. */
  async delVault(tombstone: VaultTombstone, opts: DelOpts): Promise<GoodAnswer<VaultTombstone, DelAct>> {
    const req_params = SX.reqParamsOf({ ...tombstone, ...opts })
    try {
      const vaultTombstone = SX.vaultTombstone.parse(tombstone)
      const delOpts = SX.delOpts.parse(opts)
      SX.nextSeq.parse({ record: vaultTombstone, prior: delOpts.prior })
      const { isWritten, ante } = await this.doDelVault(vaultTombstone, delOpts)
      if (isWritten) { return { ok: true, req_params, act: 'deleted', val: vaultTombstone, world: vaultTombstone } }
      const found = foundVaultRowOf(ante, vaultTombstone)
      if (found === null) { return this.#answerDelVaultVoid(vaultTombstone, req_params) }
      if (found.vault_tok !== vaultTombstone.vault_tok) { return this.#answerDelVaultVoid(vaultTombstone, req_params) }
      if (found.am === 'x') { return this.#answerDelVaultGone(found, req_params) }
      return this.#answerDelVaultRecord(found)
    } catch (err) { throw refusalOf(err, 'delVault', req_params) }
  }

  /** Non-throwing form of {@link delVault}. */
  async tryDelVault(tombstone: VaultTombstone, opts: DelOpts) { return answerOf(() => this.delVault(tombstone, opts)) }

  /** The `void` answer: the sentinel of the life the del names. */
  #answerDelVaultVoid(vaultTombstone: VaultTombstone, req_params: ReqParams): GoodAnswer<VaultTombstone, 'void'> {
    const sentinel = SX.sentinelVaultOf(vaultTombstone, vaultTombstone.vault_tok)
    return { ok: true, req_params, act: 'void', val: sentinel, world: sentinel }
  }

  /** The `gone` answer: the life's tombstone. */
  #answerDelVaultGone(found: VaultTombstone, req_params: ReqParams): GoodAnswer<VaultTombstone, 'gone'> {
    return { ok: true, req_params, act: 'gone', val: found, world: found }
  }

  /** Refuses a del made from another revision of this life's live vault row. */
  #answerDelVaultRecord(found: VaultRecord): never {
    throw Refuse.staleWrite(found, found)
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

  /** Every vault row of the bank, full or tombstone. */
  protected abstract doListVaults(scope: BankScope): Awaitable<RowOfVault[]>
  /** The vault row by scope alone. */
  protected abstract doGetVault(scope: VaultScope): Awaitable<unknown>
  /** The vault row, and every box row under `vault_tok`, read in one step. */
  protected abstract doListBoxes(asked: VaultQuery): Awaitable<BoxesFetched>
  /** The vault row, and the box row under `vault_tok`, read in one step. */
  protected abstract doGetBox(asked: BoxQuery): Awaitable<BoxFetched>
  /** Puts `record` where `isVaultPutAllowed` lets it be written over the row found, atomic on `revision_tok`. */
  protected abstract doPutVault(record: VaultRecord, opts: PutOptsGiven): Awaitable<Written>
  /** Puts `record` where `isBoxPutAllowed` lets it be written over the row found, under a vault row that passes `isLiveVaultRecord`. */
  protected abstract doPutBox(record: BoxRecord, opts: PutOptsGiven): Awaitable<BoxWritten>
  /** In one step, writes `tombstone` over a row at `opts.prior` that passes `isLiveVaultRecord`, and tombstones that life's boxes. */
  protected abstract doDelVault(tombstone: VaultTombstone, opts: DelOpts): Awaitable<Written>
  /** Writes `tombstone` over a row at `opts.prior` that passes `isLiveBoxRecord`, under a vault row that passes `isLiveVaultRecord`. */
  protected abstract doDelBox(tombstone: BoxTombstone, opts: DelOpts): Awaitable<BoxWritten>
  /** Removes the box rows of vaults that are void, tombstoned or reborn, and counts those left in the bank. */
  protected abstract doTidyGone(scope: BankScope): Awaitable<Tidied>
  /** Starts telling `hear` of rows that change, and returns how to stop. Storage with no watch never calls it. */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void): () => void { return noUnwatching }
  // --
}

// == [Helpers]: refusalOf, RowOfOtherAddress, isRowFound, foundVaultRowOf, foundBoxRowOf, listedRowOf, liveVaultOf, listedBoxesOf, writeActOf, jsonBytes

/** The refusal a verb's throw stands for: a refusal as it came, else `storage_unavailable`. */
const refusalOf = (thrown: unknown, call: string, req_params: ReqParams): VaultError => {
  const refusal = storageTroubleOf(thrown)
  return Object.assign(refusal, { meta: { ...refusal.meta, call, req_params } })
}

const RowOfOtherAddress = { kind: 'storage_issue', message: Phrases.rowOfOtherAddress } as const

const demandRowObject = (raw: unknown): void => {
  if (! CX.isPlainBag(raw)) { throw Refuse.storageIssue() }
}

/** Whether storage answered a row at all: null is its word for none. */
const isRowFound = (raw: unknown): boolean => {
  if (raw === null) { return false }
  demandRowObject(raw)
  return true
}

// Checked against its scope and not its vault_tok: a vault row of another life is an answer the verbs have words for.
/** The vault row storage answered for `asked`'s scope, null for none. */
const foundVaultRowOf = (raw: unknown, asked: VaultScope): VaultRow | null => (
  isRowFound(raw) ? SX.storedVaultRow.parseConsistent(raw, CX.vaultScope.parse(asked), RowOfOtherAddress) : null
)

/** The box row storage answered for `asked`'s scope and `vault_tok`, null for none. */
const foundBoxRowOf = (raw: unknown, asked: BoxQuery): BoxRow | null => (
  isRowFound(raw) ? SX.storedBoxRow.parseConsistent(raw, SX.boxQuery.parse(asked), RowOfOtherAddress) : null
)

/** A listing's row, checked against the `address` it is listed at; null for one that is to be set aside as damaged. */
const listedRowOf = <RowT extends object>(rowCheck: Z.ZodType<RowT>, raw: unknown, address: object): RowT | null => {
  const parsed = rowCheck.safeParse(raw)
  if (parsed.success) { return verifyConsistent(parsed.data, address, RowOfOtherAddress) }
  demandRowObject(raw)
  return null
}

/** The vault row storage answered, where it is live in the life `asked` names. */
const liveVaultOf = (raw: unknown, asked: VaultQuery): VaultRecord => {
  const found = foundVaultRowOf(raw, asked)
  if (found === null) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(asked, asked.vault_tok)) }
  if ((found.am === 'a') && (found.vault_tok !== asked.vault_tok)) { throw Refuse.vaultMismatch(found) }
  if (found.vault_tok !== asked.vault_tok) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(asked, asked.vault_tok)) }
  if (found.am === 'x') { throw Refuse.vaultGone(found) }
  return found
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

// A peek is enough: storage judged `ante` against its row check before the put was written.
const writeActOf = (ante: unknown): 'born' | 'reborn' | 'replaced' => {
  if (ante === null) { return 'born' }
  return SX.isTombstoneRow(ante) ? 'reborn' : 'replaced'
}

const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --

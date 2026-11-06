/** The vaultDB: the verbs the storables and listings call, and every invariant of them. A subclass writes only the generic `do*` calls, each one atomic step. */

import type { Awaitable } from '../helpers/helpers'
import { nowMillis } from '../helpers/clock'
import * as Phrases from '../helpers/phrases'
import type { VaultError } from '../refusals/errors'
import { type BadOutcome, type GoodOutcome, outcomeOf, storageTroubleOf } from '../refusals/outcome'
import * as SX from '../shapes/shapes-storage'
import type { AddPasskeyParams, BankScope, BoxQuery, BoxRecord, BoxRow, BoxSparse, BoxTombstone, DamagedBox, DamagedVault, DelOpts, Gate, IfAbsentOpts, PutOpts, PutOptsGiven, PutVaultOpts, ReplacePassphraseParams, ReqParams, Revision, RevokePasskeyParams, VaultDBOpts, VaultQuery, VaultRecord, VaultRow, VaultScope, VaultSparse, VaultTombstone, WatchScope } from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Answers]: GoodAnswer, BadAnswer, Answer, GotAct, PutAct, DelAct, BankListed, BoxesListed, Tidied, Notice, answerOf

/** What a verb returns: its `val`, the `act` that says what happened, and the `world`, the vault row as read in the same step. */
export type GoodAnswer<ValT, ActT extends string, WorldT = VaultRow> = GoodOutcome<ValT> & { req_params: ReqParams, act: ActT, world: WorldT, dbhas?: unknown }

/** What a `try*` verb answers on a refusal: its `err`, with `act`, `world` and `dbhas` read from it, `world` null where it holds none. */
export type BadAnswer = BadOutcome & { req_params: ReqParams, act: string, world: unknown, dbhas?: unknown }

export type Answer<ValT, ActT extends string, WorldT = VaultRow> = GoodAnswer<ValT, ActT, WorldT> | BadAnswer

export type GotAct = 'got' | 'gotvoid' | 'gotgone'
export type PutAct = 'born' | 'reborn' | 'replaced' | 'declined'
export type DelAct = 'deleted' | 'gone' | 'void'

export type BankListed  = { vaults: (VaultRecord | VaultTombstone)[], damaged_rows: DamagedVault[] }
export type BoxesListed = { boxes: BoxSparse[], damaged_rows: DamagedBox[] }
export type Tidied      = { totalCount: number }

/** A row that changed, as a watch hears it. Nothing may count on hearing one. */
export type Notice = { act: 'got' | 'gone', val: VaultRow | BoxRow, world: VaultRow }

const answerOf = async <ValT, ActT extends string, WorldT>(thunk: () => Promise<GoodAnswer<ValT, ActT, WorldT>>): Promise<Answer<ValT, ActT, WorldT>> => {
  const outcome = await outcomeOf(thunk)
  if (outcome.ok) { return outcome.val }
  const { err } = outcome
  const { act = err.refusalkind, world = null, req_params = {}, dbhas } = err.meta ?? {}
  return { ok: false, err, act, world, req_params, ...((dbhas !== undefined) && { dbhas }) }
}
// --

// == [What a store answers]: Landing, BoxLanding, RowOfVault, RowOfBox, BoxesFetched, BoxFetched, Heard, VaultDBRelay

/** The answer of a conditional write: whether it landed, and `ante`, the row it replaced, or that stands in its way. Null is a void row. */
export type Landing = { landed: boolean, ante: unknown }

/** A box write's {@link Landing}, with the vault row as read in the same step. */
export type BoxLanding = Landing & { vault: unknown }

export type RowOfVault = { vaultlabel: string, vault: unknown }
export type RowOfBox   = { boxlabel: string, box: unknown }
export type BoxesFetched = { vault: unknown, boxes: RowOfBox[] }
export type BoxFetched   = { vault: unknown, box: unknown }
export type Heard = { vault: unknown, box?: unknown }

/** A VaultDB's generic calls, for a server to carry to a VaultDB in a browser: each checks what it is handed, as its verb does. */
export type VaultDBRelay = {
  listVaults: (scope: unknown) => Promise<RowOfVault[]>
  getVault:   (scope: unknown) => Promise<unknown>
  listBoxes:  (asked: unknown) => Promise<BoxesFetched>
  getBox:     (asked: unknown) => Promise<BoxFetched>
  putVault:   (record: unknown, opts: unknown) => Promise<Landing>
  putBox:     (record: unknown, opts: unknown) => Promise<BoxLanding>
  delVault:   (tombstone: unknown, opts: unknown) => Promise<Landing>
  delBox:     (tombstone: unknown, opts: unknown) => Promise<BoxLanding>
  tidyGone:   (scope: unknown) => Promise<Tidied>
  watch:      (scope: unknown, hear: (heard: Heard) => void) => () => void
}
// --

const noUnwatching = (): void => undefined

/** The base of a vaultDB. Each verb throws its refusal and returns its answer; each `try*` answers either. */
export abstract class VaultDB {
  // == [Props]: #maxRecordBytes

  readonly #maxRecordBytes: number
  // --

  // == [Construction]: constructor

  constructor(opts: VaultDBOpts = {}) {
    const { maxRecordBytes = Infinity } = SX.vaultDBOpts.parse(opts)
    this.#maxRecordBytes = maxRecordBytes
  }
  // --

  // == [Gets]: listVaults, tryListVaults, getVault, tryGetVault, listBoxes, tryListBoxes, getBox, tryGetBox

  /** The bank's vaults, full or tombstone, no boxes; a row failing validation goes in `damaged_rows`. */
  async listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, 'got' | 'gotvoid', BankScope>> {
    const req_params = SX.reqParamsOf(scope)
    try {
      const bankScope = SX.bankScope.parse(scope)
      const rows = await this.doListVaults(bankScope)
      const val: BankListed = { vaults: [], damaged_rows: [] }
      for (const { vaultlabel, vault } of rows) {
        const parsed = SX.vaultRow.safeParse(vault)
        if (parsed.success) { val.vaults.push(parsed.data) } else { val.damaged_rows.push(SX.damagedVaultOf({ ...bankScope, vaultlabel }, vault)) }
      }
      return { ok: true, req_params, act: (rows.length > 0) ? 'got' : 'gotvoid', val, world: bankScope }
    } catch (err) { throw refusalOf(err, 'listVaults', req_params) }
  }

  async tryListVaults(scope: BankScope) { return answerOf(() => this.listVaults(scope)) }

  /** The vault by scope alone, whatever its life. Over a void or gone row, `ifAbsent: 'nil'` answers null. */
  async getVault(scope: VaultScope, opts: IfAbsentOpts = {}): Promise<GoodAnswer<VaultRecord | null, GotAct>> {
    const req_params = SX.reqParamsOf(scope)
    try {
      const vaultScope = SX.vaultScope.parse(scope)
      const { ifAbsent } = SX.ifAbsentOpts.parse(opts)
      const found = SX.foundVaultRow.parse(await this.doGetVault(vaultScope))
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(vaultScope)) }
      if (found === null) { return { ok: true, req_params, act: 'gotvoid', val: null, world: SX.sentinelVaultOf(vaultScope), dbhas: null } }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.vaultGone(found) }
      if (found.am === 'x') { return { ok: true, req_params, act: 'gotgone', val: null, world: found, dbhas: found } }
      return { ok: true, req_params, act: 'got', val: found, world: found }
    } catch (err) { throw refusalOf(err, 'getVault', req_params) }
  }

  async tryGetVault(scope: VaultScope, opts?: IfAbsentOpts) { return answerOf(() => this.getVault(scope, opts)) }

  /** The boxes under this `vault_tok`, sparse, its vault row as `world`; a row failing validation goes in `damaged_rows`. */
  async listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, 'got' | 'gotvoid'>> {
    const req_params = SX.reqParamsOf(asked)
    try {
      const vaultQuery = SX.vaultQuery.parse(asked)
      const { vault, boxes } = await this.doListBoxes(vaultQuery)
      const world = liveVaultOf(vault, vaultQuery)
      return { ok: true, req_params, act: (boxes.length > 0) ? 'got' : 'gotvoid', val: listedBoxesOf(vaultQuery, boxes), world }
    } catch (err) { throw refusalOf(err, 'listBoxes', req_params) }
  }

  async tryListBoxes(asked: VaultQuery) { return answerOf(() => this.listBoxes(asked)) }

  /** The box under this `vault_tok`, its vault row as `world`. Over a void or gone box row, `ifAbsent: 'nil'` answers null. */
  async getBox(asked: BoxQuery, opts: IfAbsentOpts = {}): Promise<GoodAnswer<BoxRecord | null, GotAct>> {
    const req_params = SX.reqParamsOf(asked)
    try {
      const boxQuery = SX.boxQuery.parse(asked)
      const { ifAbsent } = SX.ifAbsentOpts.parse(opts)
      const { vault, box } = await this.doGetBox(boxQuery)
      const world = liveVaultOf(vault, boxQuery)
      const found = SX.foundBoxRow.parse(box)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.absentBox(world, null) }
      if (found === null) { return { ok: true, req_params, act: 'gotvoid', val: null, world, dbhas: null } }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.absentBox(world, found) }
      if (found.am === 'x') { return { ok: true, req_params, act: 'gotgone', val: null, world, dbhas: found } }
      return { ok: true, req_params, act: 'got', val: found, world }
    } catch (err) { throw refusalOf(err, 'getBox', req_params) }
  }

  async tryGetBox(asked: BoxQuery, opts?: IfAbsentOpts) { return answerOf(() => this.getBox(asked, opts)) }
  // --

  // == [Puts]: putVault, tryPutVault, putBox, tryPutBox

  /** Stores a vault's birth, or its rebirth over a tombstone; a live vault row moves only by a gate verb. */
  async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const vaultRecord = SX.vaultRecord.parse(record)
      const putOpts = SX.putVaultOpts.parse(opts)
      demandNextSeq(vaultRecord, putOpts.prior)
      const { landed, ante } = await this.doPutVault(vaultRecord, putOpts)
      if (landed) { return { ok: true, req_params, act: landingActOf(ante), val: vaultRecord, world: vaultRecord } }
      const { ifAbsent, ifPresent } = putOpts
      const found = SX.foundVaultRow.parse(ante)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(vaultRecord, vaultRecord.vault_tok)) }
      if (found === null) { throw Refuse.staleWrite(SX.sentinelVaultOf(vaultRecord, vaultRecord.vault_tok), null) }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.vaultGone(found) }
      if (found.am === 'x') { throw Refuse.staleWrite(found, found) }
      if (ifPresent === 'get') { return { ok: true, req_params, act: 'declined', val: found, world: found } }
      throw Refuse.camped(found, found)
    } catch (err) { throw refusalOf(err, 'putVault', req_params) }
  }

  async tryPutVault(record: VaultRecord, opts: PutVaultOpts) { return answerOf(() => this.putVault(record, opts)) }

  /** Stores a box under a vault live at its `vault_tok`, as `opts` allow. */
  async putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>> {
    const req_params = SX.reqParamsOf({ ...record, ...opts })
    try {
      const boxRecord = SX.boxRecord.parse(record)
      const putOpts = SX.putOpts.parse(opts)
      demandNextSeq(boxRecord, putOpts.prior)
      const recordBytes = jsonBytes(boxRecord)
      if (recordBytes > this.#maxRecordBytes) { throw Refuse.boxTooLarge(recordBytes, this.#maxRecordBytes) }
      const { landed, ante, vault } = await this.doPutBox(boxRecord, putOpts)
      const world = liveVaultOf(vault, boxRecord)
      if (landed) { return { ok: true, req_params, act: landingActOf(ante), val: boxRecord, world } }
      const { ifAbsent, ifPresent } = putOpts
      const found = SX.foundBoxRow.parse(ante)
      if ((ifAbsent === 'fail') && (found === null)) { throw Refuse.absentBox(world, null) }
      if (found === null) { throw Refuse.staleWrite(world, null) }
      if ((ifAbsent === 'fail') && (found.am === 'x')) { throw Refuse.absentBox(world, found) }
      if (found.am === 'x') { throw Refuse.staleWrite(world, found) }
      if (ifPresent === 'get') { return { ok: true, req_params, act: 'declined', val: found, world } }
      if (ifPresent === 'fail') { throw Refuse.camped(world, found) }
      throw Refuse.staleWrite(world, found)
    } catch (err) { throw refusalOf(err, 'putBox', req_params) }
  }

  async tryPutBox(record: BoxRecord, opts: PutOpts) { return answerOf(() => this.putBox(record, opts)) }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey, #gateRowOf, #putMovedGate

  /** Lays the new passphrase wayin on the vault row at this revision, leaving its passkey wayin as stored. */
  async replacePassphrase(params: ReplacePassphraseParams): Promise<GoodAnswer<VaultRecord, 'replaced'>> {
    const req_params = SX.reqParamsOf(params)
    try {
      const asked = SX.replacePassphraseParams.parse(params)
      const stored = await this.#gateRowOf(asked)
      const record = movedGateOf(stored, { passphrase_wayin: asked.gate.passphrase_wayin })
      await this.#putMovedGate(record, stored)
      return { ok: true, req_params, act: 'replaced', val: record, world: record }
    } catch (err) { throw refusalOf(err, 'replacePassphrase', req_params) }
  }

  async tryReplacePassphrase(params: ReplacePassphraseParams) { return answerOf(() => this.replacePassphrase(params)) }

  /** Lays a passkey wayin on a vault row holding none. */
  async addPasskey(params: AddPasskeyParams): Promise<GoodAnswer<VaultRecord, 'added'>> {
    const req_params = SX.reqParamsOf(params)
    try {
      const asked = SX.passkeyAddParams.parse(params)
      const stored = await this.#gateRowOf(asked)
      if (stored.gate.passkey_wayin !== null) { throw Refuse.camped(stored, stored) }
      const record = movedGateOf(stored, { passkey_wayin: asked.gate.passkey_wayin })
      await this.#putMovedGate(record, stored)
      return { ok: true, req_params, act: 'added', val: record, world: record }
    } catch (err) { throw refusalOf(err, 'addPasskey', req_params) }
  }

  async tryAddPasskey(params: AddPasskeyParams) { return answerOf(() => this.addPasskey(params)) }

  /** Takes the passkey wayin off the vault row; one holding none answers as stored. */
  async revokePasskey(params: RevokePasskeyParams): Promise<GoodAnswer<VaultRecord, 'revoked'>> {
    const req_params = SX.reqParamsOf(params)
    try {
      const stored = await this.#gateRowOf(SX.revokePasskeyParams.parse(params))
      if (stored.gate.passkey_wayin === null) { return { ok: true, req_params, act: 'revoked', val: stored, world: stored } }
      const record = movedGateOf(stored, { passkey_wayin: null })
      await this.#putMovedGate(record, stored)
      return { ok: true, req_params, act: 'revoked', val: record, world: record }
    } catch (err) { throw refusalOf(err, 'revokePasskey', req_params) }
  }

  async tryRevokePasskey(params: RevokePasskeyParams) { return answerOf(() => this.revokePasskey(params)) }

  /** The vault row a gate verb moves: live in this life, at the revision and registration `asked` names. */
  async #gateRowOf(asked: VaultSparse): Promise<VaultRecord> {
    const stored = liveVaultOf(await this.doGetVault(SX.vaultScope.parse(asked)), asked)
    if (! SX.isRowAt(stored, asked)) { throw Refuse.staleWrite(stored, stored) }
    if (stored.registered_at !== asked.registered_at) { throw Refuse.gateIssue(stored, Phrases.RegisteredAtNotStored) }
    return stored
  }

  /** Stores the moved gate's `record` over the row it was made from. */
  async #putMovedGate(record: VaultRecord, stored: VaultRecord): Promise<void> {
    const { landed, ante } = await this.doPutVault(record, { prior: SX.revisionOf(stored), ifAbsent: 'fail', ifPresent: 'repl' })
    if (landed) { return }
    const found = liveVaultOf(ante, record)
    throw Refuse.staleWrite(found, found)
  }
  // --

  // == [Dels]: delBox, tryDelBox, #answerDelBoxVoid, #answerDelBoxGone, #answerDelBoxRecord, delVault, tryDelVault, #answerDelVaultVoid, #answerDelVaultGone, #answerDelVaultRecord, tidyGone, tryTidyGone

  /** Deletes a box at `prior`: its live row, or the damaged row `damaged_rows` lists. */
  async delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>> {
    const req_params = SX.reqParamsOf({ ...tombstone, ...opts })
    try {
      const boxTombstone = SX.boxTombstone.parse(tombstone)
      const delOpts = SX.delOpts.parse(opts)
      demandNextSeq(boxTombstone, delOpts.prior)
      const { landed, ante, vault } = await this.doDelBox(boxTombstone, delOpts)
      const world = liveVaultOf(vault, boxTombstone)
      if (landed) { return { ok: true, req_params, act: 'deleted', val: boxTombstone, world } }
      const found = SX.foundBoxRow.parse(ante)
      if (found === null) { return this.#answerDelBoxVoid(boxTombstone, world, req_params) }
      if (found.am === 'x') { return this.#answerDelBoxGone(found, world, req_params) }
      return this.#answerDelBoxRecord(found, world)
    } catch (err) { throw refusalOf(err, 'delBox', req_params) }
  }

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

  /** Deletes a vault at `prior`, its live row or the damaged row `damaged_rows` lists, with the boxes of its life. */
  async delVault(tombstone: VaultTombstone, opts: DelOpts): Promise<GoodAnswer<VaultTombstone, DelAct>> {
    const req_params = SX.reqParamsOf({ ...tombstone, ...opts })
    try {
      const vaultTombstone = SX.vaultTombstone.parse(tombstone)
      const delOpts = SX.delOpts.parse(opts)
      demandNextSeq(vaultTombstone, delOpts.prior)
      const { landed, ante } = await this.doDelVault(vaultTombstone, delOpts)
      if (landed) { return { ok: true, req_params, act: 'deleted', val: vaultTombstone, world: vaultTombstone } }
      const found = SX.foundVaultRow.parse(ante)
      if (found === null) { return this.#answerDelVaultVoid(vaultTombstone, req_params) }
      if (found.vault_tok !== vaultTombstone.vault_tok) { return this.#answerDelVaultVoid(vaultTombstone, req_params) }
      if (found.am === 'x') { return this.#answerDelVaultGone(found, req_params) }
      return this.#answerDelVaultRecord(found)
    } catch (err) { throw refusalOf(err, 'delVault', req_params) }
  }

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
      const bankScope = SX.bankScope.parse(scope)
      const val = await this.doTidyGone(bankScope)
      return { ok: true, req_params, act: 'tidied', val, world: bankScope }
    } catch (err) { throw refusalOf(err, 'tidyGone', req_params) }
  }

  async tryTidyGone(scope: BankScope) { return answerOf(() => this.tidyGone(scope)) }
  // --

  // == [Watch]: watch

  /** Tells `onNotice` of rows that change under a bank or a vault, and returns how to stop. Nothing may count on a notice arriving. */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void): () => void {
    return this.doWatch(SX.watchScope.parse(scope), ({ vault, box }) => {
      const world = SX.vaultRow.safeParse(vault)
      if (! world.success) { return }
      if (box === undefined) {
        onNotice({ act: (world.data.am === 'x') ? 'gone' : 'got', val: world.data, world: world.data })
        return
      }
      const val = SX.boxRow.safeParse(box)
      if (val.success) { onNotice({ act: (val.data.am === 'x') ? 'gone' : 'got', val: val.data, world: world.data }) }
    })
  }
  // --

  // == [Relay]: relay

  /** This store's generic calls, for a server relaying them: each refuses what its verb would refuse before storage is asked. */
  get relay(): VaultDBRelay {
    return {
      listVaults: async (scope) => await relayed(() => this.doListVaults(SX.bankScope.parse(scope))),
      getVault:   async (scope) => await relayed(() => this.doGetVault(SX.vaultScope.parse(scope))),
      listBoxes:  async (asked) => await relayed(() => this.doListBoxes(SX.vaultQuery.parse(asked))),
      getBox:     async (asked) => await relayed(() => this.doGetBox(SX.boxQuery.parse(asked))),
      putVault:   async (record, opts) => await relayed(() => {
        const vaultRecord = SX.vaultRecord.parse(record)
        const putOpts = SX.putOpts.parse(opts)
        demandNextSeq(vaultRecord, putOpts.prior)
        return this.doPutVault(vaultRecord, putOpts)
      }),
      putBox: async (record, opts) => await relayed(() => {
        const boxRecord = SX.boxRecord.parse(record)
        const putOpts = SX.putOpts.parse(opts)
        demandNextSeq(boxRecord, putOpts.prior)
        const recordBytes = jsonBytes(boxRecord)
        if (recordBytes > this.#maxRecordBytes) { throw Refuse.boxTooLarge(recordBytes, this.#maxRecordBytes) }
        return this.doPutBox(boxRecord, putOpts)
      }),
      delVault: async (tombstone, opts) => await relayed(() => {
        const vaultTombstone = SX.vaultTombstone.parse(tombstone)
        const delOpts = SX.delOpts.parse(opts)
        demandNextSeq(vaultTombstone, delOpts.prior)
        return this.doDelVault(vaultTombstone, delOpts)
      }),
      delBox: async (tombstone, opts) => await relayed(() => {
        const boxTombstone = SX.boxTombstone.parse(tombstone)
        const delOpts = SX.delOpts.parse(opts)
        demandNextSeq(boxTombstone, delOpts.prior)
        return this.doDelBox(boxTombstone, delOpts)
      }),
      tidyGone: async (scope) => await relayed(() => this.doTidyGone(SX.bankScope.parse(scope))),
      watch:    (scope, hear) => this.doWatch(SX.watchScope.parse(scope), hear),
    }
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
  /** Stores `record` where the row stands at `opts.prior`, live and `ifPresent` 'repl', or absent and `ifAbsent` 'add'; atomic on `revision_tok`. */
  protected abstract doPutVault(record: VaultRecord, opts: PutOptsGiven): Awaitable<Landing>
  /** Stores `record` as `doPutVault` would, where the vault row also passes its checks live under its `vault_tok`. */
  protected abstract doPutBox(record: BoxRecord, opts: PutOptsGiven): Awaitable<BoxLanding>
  /** In one step, stores `tombstone` over this life's live row at `opts.prior`, or the damaged row it names, and tombstones the life's box rows. */
  protected abstract doDelVault(tombstone: VaultTombstone, opts: DelOpts): Awaitable<Landing>
  /** Stores `tombstone` over a live box row at `opts.prior`, or the damaged row it names, where the vault row passes its checks live under its `vault_tok`. */
  protected abstract doDelBox(tombstone: BoxTombstone, opts: DelOpts): Awaitable<BoxLanding>
  /** Removes the box rows whose vault row is void, a tombstone, or under another `vault_tok`, as {@link SX.isLifeOver} says, and counts those left in the bank. */
  protected abstract doTidyGone(scope: BankScope): Awaitable<Tidied>
  /** Starts telling `hear` of rows that change, and returns how to stop. A store with no watch never calls it. */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void): () => void { return noUnwatching }
  // --
}

// == [Helpers]: refusalOf, relayed, liveVaultOf, movedGateOf, listedBoxesOf, demandNextSeq, landingActOf, jsonBytes

/** What a verb throws: a refusal as it came, anything else `storage_unavailable`, each carrying the verb and the request's safe metadata. */
const refusalOf = (thrown: unknown, call: string, req_params: ReqParams): VaultError => {
  const refusal = storageTroubleOf(thrown)
  return Object.assign(refusal, { meta: { ...refusal.meta, call, req_params } })
}

/** What `call` answers, or its throw as a refusal: a refusal as it came, anything else `storage_unavailable`. */
const relayed = async <ValT>(call: () => Awaitable<ValT>): Promise<ValT> => {
  try {
    return await call()
  } catch (err) { throw storageTroubleOf(err) }
}

/** The vault row a store answered, where it is live in the life `asked` names. */
const liveVaultOf = (raw: unknown, asked: VaultQuery): VaultRecord => {
  const found = SX.foundVaultRow.parse(raw)
  if (found === null) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(asked, asked.vault_tok)) }
  if ((found.am === 'a') && (found.vault_tok !== asked.vault_tok)) { throw Refuse.vaultMismatch(found) }
  if (found.vault_tok !== asked.vault_tok) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(asked, asked.vault_tok)) }
  if (found.am === 'x') { throw Refuse.vaultGone(found) }
  return found
}

/** The next revision of `stored`, `wayin` laid on its gate and its `gate_epoch` moved up. */
const movedGateOf = (stored: VaultRecord, wayin: Partial<Gate>): VaultRecord => ({
  ...stored,
  ...SX.nextRevisionOf(stored, nowMillis()),
  gate: { ...stored.gate, ...wayin, gate_epoch: stored.gate.gate_epoch + 1 },
})

const listedBoxesOf = ({ vault_tok, ...scope }: VaultQuery, rows: RowOfBox[]): BoxesListed => {
  const listed: BoxesListed = { boxes: [], damaged_rows: [] }
  for (const { boxlabel, box } of rows) {
    const parsed = SX.boxRow.safeParse(box)
    if (parsed.success) { listed.boxes.push(SX.boxSparse.parse(parsed.data)) } else { listed.damaged_rows.push(SX.damagedBoxOf({ ...scope, boxlabel }, vault_tok, box)) }
  }
  return listed
}

const demandNextSeq = ({ revision_seq }: Revision, prior: Revision): void => {
  if (revision_seq !== (prior.revision_seq + 1)) { throw Refuse.seqNotNext() }
}

// A raw peek, not a parse: a put lands over a damaged row its `prior` names.
const landingActOf = (ante: unknown): 'born' | 'reborn' | 'replaced' => {
  if (ante === null) { return 'born' }
  return SX.isTombstoneRow(ante) ? 'reborn' : 'replaced'
}

const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --

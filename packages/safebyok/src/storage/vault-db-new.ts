/** The vaultDB: the verbs the storables and listings call, and every invariant of them. A subclass writes only the generic `do*` calls, each one atomic step. */

import type * as Z from 'zod'
import { IsVaultDB } from '../helpers/consts'
import type { Awaitable } from '../helpers/helpers'
import { nowMillis } from '../helpers/clock'
import { type VaultError, isVaultError } from '../refusals/errors'
import { type BadOutcome, type GoodOutcome, outcomeOf } from '../refusals/outcome'
import type { IfPresent, PutIfAbsent } from '../shapes/shapes-enums'
import * as SX from '../shapes/shapes-storage'
import * as CX from '../shapes/shapes-core'
import type { BankScope, VaultScope } from '../shapes/shapes-core'
import type { AddPasskeyParams, BoxQuery, BoxRecord, BoxRow, BoxSparse, BoxTombstone, DamagedBox, DamagedVault, DelOpts, Gate, IfAbsentOpts, PutOpts, PutVaultOpts, ReplacePassphraseParams, ReqParams, Revision, RevokePasskeyParams, VaultDBOpts, VaultQuery, VaultRecord, VaultRow, VaultSparse, VaultTombstone, WatchScope } from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Answers]: AnswerFacts, GoodAnswer, BadAnswer, Answer, Said, BankListed, BoxesListed, Tidied, Notice, answerOf

export type AnswerFacts = { meta: { call: string }, req_params: ReqParams, dbhas?: unknown }

/** What a verb returns: its `val`, the `act` that says what happened, and the `world`, the vault row as read in the same step. */
export type GoodAnswer<ValT, ActT extends string, WorldT = VaultRow> = GoodOutcome<ValT> & AnswerFacts & { act: ActT, world: WorldT }

/** What a `try*` verb answers on a refusal: its `err`, with `act`, `world` and `dbhas` read from it. `world` is null when the refusal holds no aligned row. */
export type BadAnswer = BadOutcome & AnswerFacts & { act: string, world: unknown }

export type Answer<ValT, ActT extends string, WorldT = VaultRow> = GoodAnswer<ValT, ActT, WorldT> | BadAnswer

export type GotAct = 'got' | 'gotvoid' | 'gotgone'
export type PutAct = 'born' | 'reborn' | 'replaced' | 'declined'
export type DelAct = 'deleted' | 'gone' | 'void'

type Said<ValT, ActT extends string, WorldT> = { act: ActT, val: ValT, world: WorldT, dbhas?: unknown }
type PutChoices = { prior: Revision, ifAbsent: PutIfAbsent, ifPresent: IfPresent }

export type BankListed  = { vaults: (VaultRecord | VaultTombstone)[], damaged_rows: DamagedVault[] }
export type BoxesListed = { boxes: BoxSparse[], damaged_rows: DamagedBox[] }
export type Tidied      = { totalCount: number }

/** A row that changed, as a watch hears it. Nothing may count on hearing one. */
export type Notice = { act: 'got' | 'gone', val: VaultRow | BoxRow, world: VaultRow }

const answerOf = async <ValT, ActT extends string, WorldT>(thunk: () => Promise<GoodAnswer<ValT, ActT, WorldT>>): Promise<Answer<ValT, ActT, WorldT>> => {
  const outcome = await outcomeOf(thunk)
  if (outcome.ok) { return outcome.val }
  const { err } = outcome
  const { act = err.refusalkind, world = null, call = 'unknown', req_params = {} } = err.meta ?? {}
  return { ok: false, err, act, world, meta: { call }, req_params, ...((err.meta?.dbhas !== undefined) && { dbhas: err.meta.dbhas }) }
}
// --

// == [What a store writes]: Landing, BoxLanding, PutTerms, RowOfVault, RowOfBox, BoxesFetched, BoxFetched, Heard

/** The answer of a conditional write: whether it landed, and `ante`, the row it replaced, or that stands in its way. Null is a void row. */
export type Landing = { landed: boolean, ante: unknown }

/** A box write's {@link Landing}, with the vault row as read in the same step. */
export type BoxLanding = Landing & { vault: unknown }

/** A put's terms: the revision `prior` the row must stand at, and whether it may replace a live row or add over an absent one. */
export type PutTerms = { prior: Revision, mayReplaceLive: boolean, mayAdd: boolean }

export type RowOfVault = { vaultlabel: string, vault: unknown }
export type RowOfBox   = { boxlabel: string, box: unknown }
export type BoxesFetched = { vault: unknown, boxes: RowOfBox[] }
export type BoxFetched   = { vault: unknown, box: unknown }
export type Heard = { vault: unknown, box?: unknown }
// --

const noUnwatching = (): void => undefined

const putTermsOf = ({ prior, ifAbsent, ifPresent }: PutChoices): PutTerms => ({ prior, mayReplaceLive: (ifPresent === 'repl'), mayAdd: (ifAbsent === 'add') })

/** The base of a vaultDB. Each verb throws its refusal and returns its answer; each `try*` answers either. */
export abstract class VaultDB {
  // == [Props]: #maxRecordBytes, IsVaultDB

  readonly #maxRecordBytes: number

  // A getter on the class, never an own field, so the brand neither serializes nor rides along in a spread.
  /** True: the brand a model knows a vaultDB by, from whichever copy of safebyok. */
  get [IsVaultDB](): true { return true } // eslint-disable-line @typescript-eslint/class-literal-property-style
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
    return this.#call<BankListed, 'got' | 'gotvoid', BankScope>('listVaults', scope, async () => {
      const bankScope = CX.bankScope.parse(scope)
      const rows = await adapted(() => this.doListVaults(bankScope))
      const val: BankListed = { vaults: [], damaged_rows: [] }
      for (const { vaultlabel, vault } of rows) {
        const parsed = SX.vaultRow.safeParse(vault)
        if (parsed.success) { val.vaults.push(parsed.data) } else { val.damaged_rows.push(SX.damagedVaultOf({ ...bankScope, vaultlabel }, vault)) }
      }
      return { act: (rows.length > 0) ? 'got' : 'gotvoid', val, world: bankScope }
    })
  }

  async tryListVaults(scope: BankScope) { return answerOf(() => this.listVaults(scope)) }

  /** The vault by scope alone, whatever its life. Over a void or gone row, `ifAbsent: 'nil'` answers null. */
  async getVault(scope: VaultScope, opts?: IfAbsentOpts): Promise<GoodAnswer<VaultRecord | null, GotAct>> {
    return this.#call<VaultRecord | null, GotAct, VaultRow>('getVault', { ...scope, ...opts }, async () => {
      const vaultScope = CX.vaultScope.parse(scope)
      const { ifAbsent } = SX.ifAbsentOpts.parse(opts ?? {})
      const stored = vaultRowOf(await adapted(() => this.doGetVault(vaultScope)))
      if (stored === null) {
        const world = SX.sentinelVaultOf(vaultScope)
        if (ifAbsent === 'fail') { throw Refuse.vaultEmpty(world) }
        return { act: 'gotvoid', val: null, world, dbhas: null }
      }
      if (stored.am === 'x') {
        if (ifAbsent === 'fail') { throw Refuse.vaultGone(stored) }
        return { act: 'gotgone', val: null, world: stored, dbhas: stored }
      }
      return { act: 'got', val: stored, world: stored }
    })
  }

  async tryGetVault(scope: VaultScope, opts?: IfAbsentOpts) { return answerOf(() => this.getVault(scope, opts)) }

  /** The boxes under this `vault_tok`, sparse, its vault row as `world`; a row failing validation goes in `damaged_rows`. */
  async listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, 'got' | 'gotvoid'>> {
    return this.#call<BoxesListed, 'got' | 'gotvoid', VaultRow>('listBoxes', asked, async () => {
      const vaultQuery = SX.vaultQuery.parse(asked)
      const { vault, boxes } = await adapted(() => this.doListBoxes(vaultQuery))
      const world = checkedVaultLife(vaultRowOf(vault), vaultQuery, vaultQuery.vault_tok)
      return { act: (boxes.length > 0) ? 'got' : 'gotvoid', val: listedBoxesOf(vaultQuery, boxes), world }
    })
  }

  async tryListBoxes(asked: VaultQuery) { return answerOf(() => this.listBoxes(asked)) }

  /** The box under this `vault_tok`, its vault row as `world`. Over a void or gone box row, `ifAbsent: 'nil'` answers null. */
  async getBox(asked: BoxQuery, opts?: IfAbsentOpts): Promise<GoodAnswer<BoxRecord | null, GotAct>> {
    return this.#call<BoxRecord | null, GotAct, VaultRow>('getBox', { ...asked, ...opts }, async () => {
      const boxQuery = SX.boxQuery.parse(asked)
      const { ifAbsent } = SX.ifAbsentOpts.parse(opts ?? {})
      const { vault, box } = await adapted(() => this.doGetBox(boxQuery))
      const world = checkedVaultLife(vaultRowOf(vault), boxQuery, boxQuery.vault_tok)
      const stored = boxRowOf(box)
      if (stored?.am === 'a') { return { act: 'got', val: stored, world } }
      if (ifAbsent === 'fail') { throw Refuse.absentBox(world, stored) }
      return { act: (stored === null) ? 'gotvoid' : 'gotgone', val: null, world, dbhas: stored }
    })
  }

  async tryGetBox(asked: BoxQuery, opts?: IfAbsentOpts) { return answerOf(() => this.getBox(asked, opts)) }
  // --

  // == [Puts]: putVault, tryPutVault, #putVault, putBox, tryPutBox, #putBox

  /** SLOPDOC: Stores a vault's birth or rebirth; once live, its row moves only by a gate verb. */
  async putVault(record: VaultRecord, opts: PutVaultOpts): Promise<GoodAnswer<VaultRow, PutAct>> {
    return this.#call<VaultRow, PutAct, VaultRow>('putVault', { ...record, ...opts }, async () => {
      const vaultRecord = preparedOf(SX.vaultRecord, record)
      const terms = SX.putVaultOpts.parse(opts)
      demandNextSeq(vaultRecord, terms.prior)
      return this.#putVault(vaultRecord, terms)
    })
  }

  async tryPutVault(record: VaultRecord, opts: PutVaultOpts) { return answerOf(() => this.putVault(record, opts)) }

  async #putVault(record: VaultRecord, { prior, ifAbsent, ifPresent }: PutChoices): Promise<Said<VaultRow, PutAct, VaultRow>> {
    const { landed, ante } = await adapted(() => this.doPutVault(record, putTermsOf({ prior, ifAbsent, ifPresent })))
    if (landed) { return { act: landingActOf(ante), val: record, world: record } }
    const stored = vaultRowOf(ante)
    if (stored?.am === 'a') {
      if (ifPresent === 'fail') { throw Refuse.camped(stored, stored) }
      if (ifPresent === 'get')  { return { act: 'declined', val: stored, world: stored } }
    } else if (ifAbsent === 'fail') {
      throw (stored === null) ? Refuse.vaultEmpty(SX.sentinelVaultOf(record, record.vault_tok)) : Refuse.vaultGone(stored)
    }
    throw Refuse.staleWrite(stored ?? SX.sentinelVaultOf(record, record.vault_tok), stored)
  }

  /** Stores `record` under a vault live at its `vault_tok`, with the answers of {@link VaultDB.putVault}. */
  async putBox(record: BoxRecord, opts: PutOpts): Promise<GoodAnswer<BoxRow, PutAct>> {
    return this.#call<BoxRow, PutAct, VaultRow>('putBox', { ...record, ...opts }, async () => {
      const boxRecord = preparedOf(SX.boxRecord, record)
      const { prior, ifAbsent, ifPresent } = SX.putOpts.parse(opts)
      demandNextSeq(boxRecord, prior)
      const recordBytes = jsonBytes(boxRecord)
      if (recordBytes > this.#maxRecordBytes) { throw Refuse.boxTooLarge(recordBytes, this.#maxRecordBytes) }
      return this.#putBox(boxRecord, { prior, ifAbsent, ifPresent })
    })
  }

  async tryPutBox(record: BoxRecord, opts: PutOpts) { return answerOf(() => this.putBox(record, opts)) }

  async #putBox(boxRecord: BoxRecord, { prior, ifAbsent, ifPresent }: PutChoices): Promise<Said<BoxRow, PutAct, VaultRow>> {
    const { landed, ante, vault } = await adapted(() => this.doPutBox(boxRecord, putTermsOf({ prior, ifAbsent, ifPresent })))
    const world = checkedVaultLife(vaultRowOf(vault), boxRecord, boxRecord.vault_tok)
    if (landed) { return { act: landingActOf(ante), val: boxRecord, world } }
    const stored = boxRowOf(ante)
    if (stored?.am === 'a') {
      if (ifPresent === 'fail') { throw Refuse.camped(world, stored) }
      if (ifPresent === 'get')  { return { act: 'declined', val: stored, world } }
    } else if (ifAbsent === 'fail') {
      throw Refuse.absentBox(world, stored)
    }
    throw Refuse.staleWrite(world, stored)
  }
  // --

  // == [Gate verbs]: replacePassphrase, tryReplacePassphrase, addPasskey, tryAddPasskey, revokePasskey, tryRevokePasskey, #moveGate

  /** Lays the new passphrase wayin on the row at this revision, moving `gate_epoch` and the revision up; `passkey_wayin` is left as stored. */
  async replacePassphrase(params: ReplacePassphraseParams): Promise<GoodAnswer<VaultRecord, 'replaced'>> {
    return this.#call<VaultRecord, 'replaced', VaultRow>('replacePassphrase', params, async () => {
      const { gate, ...ante } = SX.replacePassphraseParams.parse(params)
      return this.#moveGate(ante, 'replaced', (stored) => {
        if (gate.passkey_wayin !== undefined) { throw Refuse.gateIssue(stored, 'replacePassphrase leaves the passkey alone.') }
        return { passphrase_wayin: gate.passphrase_wayin }
      })
    })
  }

  async tryReplacePassphrase(params: ReplacePassphraseParams) { return answerOf(() => this.replacePassphrase(params)) }

  /** Lays a passkey wayin on a row holding none. */
  async addPasskey(params: AddPasskeyParams): Promise<GoodAnswer<VaultRecord, 'added'>> {
    return this.#call<VaultRecord, 'added', VaultRow>('addPasskey', params, async () => {
      const { gate, ...ante } = SX.passkeyAddParams.parse(params)
      return this.#moveGate(ante, 'added', (stored) => {
        if (gate.passphrase_wayin !== undefined) { throw Refuse.gateIssue(stored, 'addPasskey leaves the passphrase alone.') }
        if (stored.gate.passkey_wayin !== null) { throw Refuse.camped(stored, stored) }
        return { passkey_wayin: gate.passkey_wayin }
      })
    })
  }

  async tryAddPasskey(params: AddPasskeyParams) { return answerOf(() => this.addPasskey(params)) }

  /** Nulls the row's passkey wayin. A row holding none answers `revoked` as stored, nothing moved. */
  async revokePasskey(params: RevokePasskeyParams): Promise<GoodAnswer<VaultRecord, 'revoked'>> {
    return this.#call<VaultRecord, 'revoked', VaultRow>('revokePasskey', params, async () => {
      const { gate, ...ante } = SX.revokePasskeyParams.parse(params)
      return this.#moveGate(ante, 'revoked', (stored) => {
        if (gate.passphrase_wayin !== undefined) { throw Refuse.gateIssue(stored, 'revokePasskey leaves the passphrase alone.') }
        return (stored.gate.passkey_wayin === null) ? null : { passkey_wayin: null }
      })
    })
  }

  async tryRevokePasskey(params: RevokePasskeyParams) { return answerOf(() => this.revokePasskey(params)) }

  /** A gate verb's one path: a get, the integrity checks, the wayin laid on, and a put conditional on the prior revision. A null wayin has nothing to lay on, and answers the row as stored. */
  async #moveGate<ActT extends string>(ante: VaultSparse, act: ActT, wayinOf: (stored: VaultRecord) => Partial<Gate> | null): Promise<Said<VaultRecord, ActT, VaultRow>> {
    const vault = await adapted(() => this.doGetVault(CX.vaultScope.parse(ante)))
    const stored = checkedVaultLife(vaultRowOf(vault), ante, ante.vault_tok)
    if (! SX.isRowAt(stored, ante)) { throw Refuse.staleWrite(stored, stored) }
    if (stored.registered_at !== ante.registered_at) { throw Refuse.gateIssue(stored, 'its registered_at is not the stored one.') }
    const wayin = wayinOf(stored)
    if (wayin === null) { return { act, val: stored, world: stored } }
    const record: VaultRecord = {
      ...stored,
      ...SX.nextRevisionOf(stored, nowMillis()),
      gate: { ...stored.gate, ...wayin, gate_epoch: stored.gate.gate_epoch + 1 },
    }
    await this.#putVault(record, { prior: SX.revisionOf(stored), ifAbsent: 'add', ifPresent: 'repl' })
    return { act, val: record, world: record }
  }
  // --

  // == [Dels]: delBox, tryDelBox, delVault, tryDelVault, tidyGone, tryTidyGone

  /** SLOPDOC: Writes a box's tombstone over its live row at `prior`, or the damaged row `damaged_rows` lists. */
  async delBox(tombstone: BoxTombstone, opts: DelOpts): Promise<GoodAnswer<BoxTombstone, DelAct>> {
    return this.#call<BoxTombstone, DelAct, VaultRow>('delBox', { ...tombstone, ...opts }, async () => {
      const boxTombstone = preparedOf(SX.boxTombstone, tombstone)
      const { prior } = SX.delOpts.parse(opts)
      demandNextSeq(boxTombstone, prior)
      const { landed, ante, vault } = await adapted(() => this.doDelBox(boxTombstone, prior))
      const world = checkedVaultLife(vaultRowOf(vault), boxTombstone, boxTombstone.vault_tok)
      if (landed) { return { act: 'deleted', val: boxTombstone, world } }
      const stored = boxRowOf(ante)
      if (stored === null) { return { act: 'void', val: SX.sentinelBoxOf(boxTombstone, boxTombstone.vault_tok), world } }
      if (stored.am === 'x') { return { act: 'gone', val: stored, world } }
      throw Refuse.staleWrite(world, stored)
    })
  }

  async tryDelBox(tombstone: BoxTombstone, opts: DelOpts) { return answerOf(() => this.delBox(tombstone, opts)) }

  /** SLOPDOC: Tombstones a vault at `prior` and its life's boxes in one transaction; a repeat sweeps the boxes. */
  async delVault(tombstone: VaultTombstone, opts: DelOpts): Promise<GoodAnswer<VaultTombstone, DelAct>> {
    return this.#call<VaultTombstone, DelAct, VaultRow>('delVault', { ...tombstone, ...opts }, async () => {
      const vaultTombstone = preparedOf(SX.vaultTombstone, tombstone)
      const { prior } = SX.delOpts.parse(opts)
      demandNextSeq(vaultTombstone, prior)
      const { landed, ante } = await adapted(() => this.doDelVault(vaultTombstone, prior))
      if (landed) { return { act: 'deleted', val: vaultTombstone, world: vaultTombstone } }
      const stored = vaultRowOf(ante)
      if (stored?.vault_tok !== vaultTombstone.vault_tok) {
        const sentinel = SX.sentinelVaultOf(vaultTombstone, vaultTombstone.vault_tok)
        return { act: 'void', val: sentinel, world: sentinel }
      }
      if (stored.am === 'x') { return { act: 'gone', val: stored, world: stored } }
      throw Refuse.staleWrite(stored, stored)
    })
  }

  async tryDelVault(tombstone: VaultTombstone, opts: DelOpts) { return answerOf(() => this.delVault(tombstone, opts)) }

  /** For hosts: removes the box rows of tombstoned or vanished vaults, and counts those left. */
  async tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>> {
    return this.#call<Tidied, 'tidied', BankScope>('tidyGone', scope, async () => {
      const bankScope = CX.bankScope.parse(scope)
      return { act: 'tidied', val: await adapted(() => this.doTidyGone(bankScope)), world: bankScope }
    })
  }

  async tryTidyGone(scope: BankScope) { return answerOf(() => this.tidyGone(scope)) }
  // --

  // == [Watch]: watch

  /** Tells `onNotice` of rows that change under a bank or a vault, and returns how to stop. Optional for a store: nothing may count on a notice arriving. */
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

  // == [Calling]: #call

  /** A verb's one frame: the good answer of `body`, or its refusal, each carrying the verb and the request's safe metadata. */
  async #call<ValT, ActT extends string, WorldT>(call: string, args: unknown, body: () => Promise<Said<ValT, ActT, WorldT>>): Promise<GoodAnswer<ValT, ActT, WorldT>> {
    const req_params = SX.reqParamsOf(args)
    try {
      const said = await body()
      return { ok: true, meta: { call }, req_params, ...said }
    } catch (err) {
      throw isVaultError(err) ? Object.assign(err, { meta: { ...err.meta, call, req_params } }) : err
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
  /** Writes `record` when the row meets `terms`; atomic on `revision_tok`. */
  protected abstract doPutVault(record: VaultRecord, terms: PutTerms): Awaitable<Landing>
  /** Writes `record` when the box row meets `terms` and the vault row, passing its checks, is live under its `vault_tok`; atomic on `revision_tok`. */
  protected abstract doPutBox(record: BoxRecord, terms: PutTerms): Awaitable<BoxLanding>
  /** SLOPDOC: In one transaction, tombstones a live row at `prior` and this life's boxes; a repeat sweeps them. */
  protected abstract doDelVault(tombstone: VaultTombstone, prior: Revision): Awaitable<Landing>
  /** Writes `tombstone` when the box row is live at `prior` and the vault row, passing its checks, is live under its `vault_tok`; atomic on `revision_tok`. */
  protected abstract doDelBox(tombstone: BoxTombstone, prior: Revision): Awaitable<BoxLanding>
  /** Removes the box rows whose vault row is void, a tombstone, or under another `vault_tok`, as {@link SX.isLifeOver} says, and counts those left in the bank. */
  protected abstract doTidyGone(scope: BankScope): Awaitable<Tidied>
  /** Starts telling `hear` of rows that change, and returns how to stop. A store with no watch never calls it. */
  protected doWatch(_scope: WatchScope, _hear: (heard: Heard) => void): () => void { return noUnwatching }
  // --
}

// == [Row checks]: preparedOf, adapted, unreadableRowOf, vaultRowOf, boxRowOf, listedBoxesOf, checkedVaultLife, demandNextSeq, landingActOf, jsonBytes

/** A record the package prepared, as `checker` parses it: one failing it is a package bug, unlike the options beside it. */
const preparedOf = <ValT>(checker: { safeParse: (val: unknown) => Z.ZodSafeParseResult<ValT> }, record: unknown): ValT => {
  const parsed = checker.safeParse(record)
  if (parsed.success) { return parsed.data }
  throw Refuse.recordPreparedWrong(parsed.error)
}

/** A store call: what it throws that is no refusal of its own is `storage_unavailable`. */
const adapted = async <ValT>(thunk: () => Awaitable<ValT>): Promise<ValT> => {
  try { return await thunk() } catch (err) { throw (isVaultError(err) ? err : Refuse.storageError(err)) }
}

const unreadableRowOf = (raw: unknown, ownFormat: number): VaultError => (SX.isNewerFormat(raw, ownFormat) ? Refuse.newerFormat() : Refuse.damagedRecord())

const vaultRowOf = (raw: unknown): VaultRow | null => {
  if (raw === null) { return null }
  const parsed = SX.vaultRow.safeParse(raw)
  if (parsed.success) { return parsed.data }
  throw unreadableRowOf(raw, SX.VaultFormat)
}

const boxRowOf = (raw: unknown): BoxRow | null => {
  if (raw === null) { return null }
  const parsed = SX.boxRow.safeParse(raw)
  if (parsed.success) { return parsed.data }
  throw unreadableRowOf(raw, SX.BoxFormat)
}

const listedBoxesOf = ({ vault_tok, ...scope }: VaultQuery, rows: RowOfBox[]): BoxesListed => {
  const listed: BoxesListed = { boxes: [], damaged_rows: [] }
  for (const { boxlabel, box } of rows) {
    const parsed = SX.boxRow.safeParse(box)
    if (parsed.success) { listed.boxes.push(SX.boxSparse.parse(parsed.data)) } else { listed.damaged_rows.push(SX.damagedBoxOf({ ...scope, boxlabel }, vault_tok, box)) }
  }
  return listed
}

/** The vault row, where it is live in this life. */
const checkedVaultLife = (stored: VaultRow | null, scope: VaultScope, vault_tok: string): VaultRecord => {
  if ((stored?.am === 'a') && (stored.vault_tok !== vault_tok)) { throw Refuse.vaultMismatch(stored) }
  if (stored?.vault_tok !== vault_tok) { throw Refuse.vaultEmpty(SX.sentinelVaultOf(scope, vault_tok)) }
  if (stored.am === 'x') { throw Refuse.vaultGone(stored) }
  return stored
}

const demandNextSeq = ({ revision_seq }: Revision, prior: Revision): void => {
  if (revision_seq !== (prior.revision_seq + 1)) { throw Refuse.seqNotNext() }
}

const landingActOf = (ante: unknown): 'born' | 'reborn' | 'replaced' => {
  if (ante === null) { return 'born' }
  return SX.isTombstoneRow(ante) ? 'reborn' : 'replaced'
}

const jsonBytes = (val: unknown): number => new TextEncoder().encode(JSON.stringify(val)).length
// --

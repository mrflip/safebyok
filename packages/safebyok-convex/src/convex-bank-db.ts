/** The bankDB adapter for Convex. */

import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import { BX } from 'safebyok/storage'
import type { BoxTidyAsk, Tidied, VaultError, WatchScope } from 'safebyok/storage'
import * as Phrases from './phrases'
import { isSafebyokErrorData, safebyokErrorData } from './refusals'
import type { SafebyokBankApi } from './server'

// == [Clients]: ConvexCalls, ConvexWatchingClient, ConvexReactWatchingClient, ConvexBankClient, ConvexBankDBOpts

/** The `query` and `mutation` calls that `ConvexClient` and `ConvexReactClient` share. */
export type ConvexCalls = {
  /** Run a query function and return its result. */
  query<QueryRef extends FunctionReference<'query'>>(queryRef: QueryRef, args: FunctionArgs<QueryRef>): Promise<FunctionReturnType<QueryRef>>
  /** Run a mutation function and return its result. */
  mutation<MutationRef extends FunctionReference<'mutation'>>(mutationRef: MutationRef, args: FunctionArgs<MutationRef>): Promise<FunctionReturnType<MutationRef>>
}

/** The part of a `ConvexClient` (from `convex/browser`) that the adapter uses. */
export type ConvexWatchingClient = ConvexCalls & {
  onUpdate<QueryRef extends FunctionReference<'query'>>(
    queryRef: QueryRef,
    args: FunctionArgs<QueryRef>,
    callback: (result: FunctionReturnType<QueryRef>) => unknown,
    onError?: (err: Error) => unknown,
  ): () => void
}

/** The part of a `ConvexReactClient` (from `convex/react`) that the adapter uses. */
export type ConvexReactWatchingClient = ConvexCalls & {
  watchQuery<QueryRef extends FunctionReference<'query'>>(queryRef: QueryRef, args: FunctionArgs<QueryRef>): {
    onUpdate(callback: () => void): () => void
    localQueryResult(): FunctionReturnType<QueryRef> | undefined
  }
}

/** A Convex client the adapter accepts: a `ConvexClient`, or the app's own `ConvexReactClient`. */
export type ConvexBankClient = ConvexWatchingClient | ConvexReactWatchingClient

/** Options for {@link ConvexBankDB}. */
export type ConvexBankDBOpts = BX.AdapterBankDBOpts & {
  /** The app's Convex client. */
  client: ConvexBankClient
  /** The app's safebyok bankDB functions: `api.safebyokBank`, not the whole `api`. */
  api: SafebyokBankApi
  /** A soft cap on a vault life's box rows, tombstones included. A put of a new boxlabel past it refuses `vault_full`.
   * Defaults to `DefaultMaxBoxes`, and never exceeds the component's own limit. This adapter currently enforces it exactly.
   */
  maxBoxes?: number | undefined
}

/** The bank row, and every gate row, vault row and box row of a live vault in a watch's scope, as `watchRows` returns them. */
type RowsWatched = {
  bank:   unknown,
  gates:  { gatelabel: string, gate: unknown }[],
  vaults: { vaultlabel: string, vault: unknown }[],
  boxes:  { vaultlabel: string, boxlabel: string, box: unknown }[],
}
// --

// == [The bankDB]: ConvexBankDB

/** A BankDB that stores its rows in the host's Convex deployment, through the app's Convex client. */
export class ConvexBankDB extends DB.AdapterBankDB {
  // == [Props]: #client, #api, #maxBoxes

  readonly #client: ConvexBankClient
  readonly #api: SafebyokBankApi
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: ConvexBankDBOpts) {
    const { client, api, maxBoxes = DB.DefaultMaxBoxes, maxRecordSizeEst = DB.DefaultMaxRecordSizeEst } = convexBankDBOpts.parse(opts, { where: 'ConvexBankDB', advice: Phrases.ConvexBankDBAdvice })
    super({ maxRecordSizeEst: Math.min(maxRecordSizeEst, ConvexDocumentSize) })
    this.#client = client
    this.#api = api
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Protected, the generic calls of AdapterBankDB]: doEnsureBank, doBuildBank, doPutGate, doDelBank, doGetVault, doPutVault, doDelVault, doListBoxes, doGetBox, doPutBox, doDelBox, doTidyGone, doWatch
  // A get is one query, and the rows it fetched are classified here. A write is one mutation, so one transaction: the component
  // fetches the rows, classifies the ask with the same classifier, and stores the record if the act is a write. It returns the
  // rows as it fetched them, which are classified here to the same outcome, and whether it wrote, which is checked against it.

  protected async doEnsureBank(ask: BX.BankEnsureAsk): Promise<BX.BankEnsureStored> {
    const fetched = await runOrRefuse('doEnsureBank', () => this.#client.query(this.#api.ensureBank, { ask }))
    return this.classifyEnsureBank(ask, fetched)
  }

  protected async doBuildBank(ask: BX.BankBuildAsk): Promise<BX.BankBuildStored> {
    const { wrote, ...fetched } = await runOrRefuse('doBuildBank', () => this.#client.mutation(this.#api.buildBank, { ask }))
    return storedAsWritten(this.classifyBuildBank(ask, fetched), wrote)
  }

  protected async doPutGate(ask: BX.GatePutAsk): Promise<BX.GateStored> {
    const { wrote, ...fetched } = await runOrRefuse('doPutGate', () => this.#client.mutation(this.#api.putGate, { ask }))
    return storedAsWritten(this.classifyStoredGate(ask, fetched), wrote)
  }

  protected async doDelBank(ask: BX.BankDelAsk): Promise<BX.BankDelStored> {
    const { wrote, ...fetched } = await runOrRefuse('doDelBank', () => this.#client.mutation(this.#api.delBank, { ask }))
    return storedAsWritten(this.classifyDelBank(ask, fetched), wrote)
  }

  protected async doGetVault(ask: BX.VaultGetAsk): Promise<BX.VaultStored> {
    const fetched = await runOrRefuse('doGetVault', () => this.#client.query(this.#api.getVault, { ask }))
    return this.classifyStoredVault(ask, fetched)
  }

  protected async doPutVault(ask: BX.VaultPutAsk): Promise<BX.VaultStored> {
    const { wrote, ...fetched } = await runOrRefuse('doPutVault', () => this.#client.mutation(this.#api.putVault, { ask }))
    return storedAsWritten(this.classifyStoredVault(ask, fetched), wrote)
  }

  protected async doDelVault(ask: BX.VaultDelAsk): Promise<BX.VaultStored> {
    const { wrote, ...fetched } = await runOrRefuse('doDelVault', () => this.#client.mutation(this.#api.delVault, { ask }))
    return storedAsWritten(this.classifyStoredVault(ask, fetched), wrote)
  }

  protected async doListBoxes(ask: BX.BoxListAsk): Promise<BX.BoxesStored> {
    const fetched = await runOrRefuse('doListBoxes', () => this.#client.query(this.#api.listBoxes, { ask }))
    return this.classifyStoredBoxes(ask, fetched)
  }

  protected async doGetBox(ask: BX.BoxGetAsk): Promise<BX.BoxStored> {
    const fetched = await runOrRefuse('doGetBox', () => this.#client.query(this.#api.getBox, { ask }))
    return this.classifyStoredBox(ask, fetched)
  }

  // The component refuses a write that would take the life past one of its limits, where the classifier, which counts only the
  // cap, found a write: that refusal is `vault_full`, with the box row stored.
  protected async doPutBox(ask: BX.BoxPutAsk): Promise<BX.BoxStored> {
    const { wrote, roomless, ...fetched } = await runOrRefuse('doPutBox', () => this.#client.mutation(this.#api.putBox, { ask, maxBoxes: this.#maxBoxes }))
    const stored = this.classifyStoredBox(ask, fetched)
    if (! roomless) { return storedAsWritten(stored, wrote) }
    const { parent, presence } = storedAsWritten(stored, true)
    const box = (fetched.box === null) ? null : BX.storedBoxRow.parse(fetched.box)
    return { ok: false, act: 'vault_full', parent, box, presence, capacity: fetched.capacity }
  }

  protected async doDelBox(ask: BX.BoxDelAsk): Promise<BX.BoxStored> {
    const { wrote, ...fetched } = await runOrRefuse('doDelBox', () => this.#client.mutation(this.#api.delBox, { ask }))
    return storedAsWritten(this.classifyStoredBox(ask, fetched), wrote)
  }

  protected async doTidyGone(ask: BoxTidyAsk): Promise<Tidied> {
    return await runOrRefuse('doTidyGone', () => this.#client.mutation(this.#api.tidyGone, { ask }))
  }

  // Convex re-sends a watched query's whole result each time it changes, so `hear` gets only the
  // rows that differ from the previous result. The first result is the starting state, and is not
  // reported.
  protected override doWatch(scope: WatchScope, hear: (heard: BX.Heard) => void, onBadNews: (news: VaultError) => void): () => void {
    let seen: RowsWatched | null = null
    let isWatching = true
    const hearRows = (rows: RowsWatched): void => {
      if (! isWatching) { return }
      if (seen !== null) { for (const heard of changesOf(scope, seen, rows)) { hear(heard) } }
      seen = rows
    }
    const fail = (thrown: unknown): void => {
      if (isWatching) { onBadNews(refusalOf('watchRows', thrown)) }
    }
    const unsubscribe = this.#subscribe(scope, hearRows, fail)
    // Convex counts a query's watchers, and each unsubscribe call lowers that count. A second call
    // would end another watch of the same rows on the same client.
    return () => {
      if (! isWatching) { return }
      isWatching = false
      unsubscribe()
    }
  }
  // --

  // == [Watching]: #subscribe

  // A failing watch reports to `fail` and keeps running. When it recovers, its next result is compared
  // with the last one it received.
  #subscribe({ vaultlabel, ...bankScope }: WatchScope, hearRows: (rows: RowsWatched) => void, fail: (thrown: unknown) => void): () => void {
    const args = { scope: (vaultlabel === undefined) ? bankScope : { ...bankScope, vaultlabel } }
    if ('watchQuery' in this.#client) {
      const watch = this.#client.watchQuery(this.#api.watchRows, args)
      const hearLatest = () => {
        const rows = latestOf(watch, fail)
        if (rows !== undefined) { hearRows(rows) }
      }
      const unsubscribe = watch.onUpdate(hearLatest)
      // A ConvexReactClient that is already watching these rows sends no first result, only changes.
      hearLatest()
      return unsubscribe
    }
    return this.#client.onUpdate(this.#api.watchRows, args, hearRows, fail)
  }
  // --
}
// --

// == [Helpers]: runOrRefuse, refusalOf, refusalOfCrossed, storedAsWritten, changesOf, heardOf, latestOf, isConvexClient, isSafebyokBankApi, convexBankDBOpts

/** Convex's size limit for one document, in bytes. */
const ConvexDocumentSize = 1_048_576

// Takes a thunk because ConvexReactClient.query can throw synchronously, before it returns a promise.
/** Run `thunk`, converting anything it throws into a safebyok refusal. */
async function runOrRefuse<ValT>(oplabel: string, thunk: () => Promise<ValT>): Promise<ValT> {
  try {
    return await thunk()
  } catch (err) {
    throw refusalOf(oplabel, err)
  }
}

// On a dev deployment Convex's error text may quote the call's arguments, so its message is never
// passed on. A refusal from the host's safebyok functions is recognized by its `data`, which only they make.
/** The refusal for `thrown`: one sent by the host's safebyok functions is rebuilt as itself, and anything else becomes `storage_unavailable`, naming `oplabel`. */
function refusalOf(oplabel: string, thrown: unknown): VaultError {
  if ((thrown instanceof ConvexError) && isSafebyokErrorData(thrown.data)) { return refusalOfCrossed(thrown.data) }
  return DB.storageFailed(oplabel, thrown)
}

/** Rebuild the VaultError a `ConvexError`'s `data` describes, with the core's message. */
function refusalOfCrossed(data: unknown): VaultError {
  const crossed = safebyokErrorData.parse(data)
  if (crossed.kind === 'identity_revoked') { return DB.identityRevoked() }
  return new DB.VaultError(crossed.kind, crossed.message)
}

// A disagreement is a component out of step with this copy of safebyok, never a damaged row: the classifier checked the rows.
/** `stored`, the outcome classified here, once it agrees with what the component did: a write act where it wrote, and none where it did not. */
function storedAsWritten<StoredT extends { act: DB.BoxAct | DB.VaultAct | DB.ParentBankAct }>(stored: StoredT, wrote: boolean): StoredT {
  if (BX.isWriteAct(stored.act) !== wrote) { throw DB.unexpectedError(new Error(Phrases.StoredOutOfStep)) }
  return stored
}

// Both results come from Convex's own serializer, so an unchanged row serializes the same way twice. A bank or gate row has
// no vaultlabel, so only a watch of the whole bank hears it.
/** Return the rows in `rows` that are new or changed since `seen`, each with the row above it. */
function changesOf({ vaultlabel }: WatchScope, seen: RowsWatched, rows: RowsWatched): BX.Heard[] {
  const seenGates  = new Map(seen.gates.map(({ gatelabel, gate }) => [gatelabel, JSON.stringify(gate)]))
  const seenVaults = new Map(seen.vaults.map(({ vaultlabel: label, vault }) => [label, JSON.stringify(vault)]))
  const seenBoxes  = new Map(seen.boxes.map(({ vaultlabel: label, boxlabel, box }) => [DB.ckeyOf(label, boxlabel), JSON.stringify(box)]))
  const vaultOf    = new Map(rows.vaults.map(({ vaultlabel: label, vault }) => [label, vault]))
  const isBankwide = (vaultlabel === undefined)
  const banksHeard = (isBankwide && (rows.bank !== null) && (JSON.stringify(seen.bank) !== JSON.stringify(rows.bank))) ? [{ row: rows.bank }] : []
  const gatesHeard = rows.gates
    .filter(({ gatelabel, gate }) => isBankwide && (seenGates.get(gatelabel) !== JSON.stringify(gate)))
    .map(({ gate }) => heardOf(gate, rows.bank))
  const vaultsHeard = rows.vaults
    .filter(({ vaultlabel: label, vault }) => seenVaults.get(label) !== JSON.stringify(vault))
    .map(({ vault }) => heardOf(vault, rows.bank))
  const boxesHeard = rows.boxes
    .filter(({ vaultlabel: label, boxlabel, box }) => seenBoxes.get(DB.ckeyOf(label, boxlabel)) !== JSON.stringify(box))
    .map(({ vaultlabel: label, box }) => heardOf(box, vaultOf.get(label) ?? null))
  return [...banksHeard, ...gatesHeard, ...vaultsHeard, ...boxesHeard]
}

/** The notice of `row`, with `parent` as the row above it unless that is null. */
function heardOf(row: unknown, parent: unknown): BX.Heard { return (parent === null) ? { row } : { row, parent } }

/** Return a React watch's latest result, or undefined while it has none or is failing, telling `fail` what it throws. */
function latestOf(watch: { localQueryResult(): RowsWatched | undefined }, fail: (thrown: unknown) => void): RowsWatched | undefined {
  try {
    return watch.localQueryResult()
  } catch (err) {
    fail(err)
    return undefined
  }
}

/** True when `candidate` has `query`, `mutation`, and either `onUpdate` or `watchQuery`. */
function isConvexClient(candidate: unknown): candidate is ConvexBankClient {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const calls = candidate as Partial<Record<'query' | 'mutation' | 'onUpdate' | 'watchQuery', unknown>>
  return (typeof calls.query === 'function') && (typeof calls.mutation === 'function') && ((typeof calls.onUpdate === 'function') || (typeof calls.watchQuery === 'function'))
}

/** The names of the safebyok bankDB functions the adapter calls. */
const SafebyokBankFnnames = ['ensureBank', 'buildBank', 'putGate', 'delBank', 'getVault', 'putVault', 'delVault', 'listBoxes', 'getBox', 'putBox', 'delBox', 'tidyGone', 'watchRows'] as const

// Each reference must have a name of the form `<module>:<function>`. The generated `api` returns a
// reference for any property, so `api.getVault` exists, but it names no module and
// `getFunctionName` throws on it.
/** True when `candidate` is the module of safebyok bankDB functions (`api.safebyokBank`), not the whole `api`. */
function isSafebyokBankApi(candidate: unknown): candidate is SafebyokBankApi {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const fnRefs = candidate as Partial<Record<string, FunctionReference<'query' | 'mutation'>>>
  return SafebyokBankFnnames.every((fnname) => {
    const fnRef = fnRefs[fnname]
    if (fnRef === undefined) { return false }
    try {
      return getFunctionName(fnRef).endsWith(`:${fnname}`)
    } catch {
      return false
    }
  })
}

/** Validator for {@link ConvexBankDBOpts}. */
const convexBankDBOpts = DB.objCheck(({ custom, int }) => ({
  ...BX.adapterBankDBOpts.shape,
  client:   custom<ConvexBankClient>(isConvexClient, Phrases.ClientExpected),
  api:      custom<SafebyokBankApi>(isSafebyokBankApi, Phrases.ApiExpected),
  maxBoxes: int.positive().optional(),
}), 'bad_option')
// --

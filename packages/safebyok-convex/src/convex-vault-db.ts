/** The vaultDB adapter for Convex. */

import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, BankScope, BoxClassified, BoxDelAsk, BoxesFetched, BoxGetAsk, BoxPutAsk, Heard, RowOfVault, Tidied,
  VaultClassified, VaultDelAsk, VaultError, VaultGetAsk, VaultPutAsk, VaultQuery, WatchScope,
} from 'safebyok/storage'
import * as Phrases from './phrases'
import { isSafebyokErrorData, safebyokErrorData } from './refusals'
import type { SafebyokApi } from './server'

// == [Clients]: ConvexCalls, ConvexWatchingClient, ConvexReactWatchingClient, ConvexVaultClient, ConvexVaultDBOpts

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
export type ConvexVaultClient = ConvexWatchingClient | ConvexReactWatchingClient

/** Options for {@link ConvexVaultDB}. */
export type ConvexVaultDBOpts = AdapterVaultDBOpts & {
  /** The app's Convex client. */
  client: ConvexVaultClient
  /** The app's safebyok functions: `api.safebyok`, not the whole `api`. */
  api: SafebyokApi
  /** A soft cap on a vault life's box rows, tombstones included. A put of a new boxlabel past it refuses `vault_full`.
   * Defaults to `DefaultMaxBoxes`, and never exceeds the component's own limit. This adapter currently enforces it exactly.
   */
  maxBoxes?: number | undefined
}

/** Every vault row and box row in a watch's scope, as `watchRows` returns them. */
type RowsWatched = {
  vaults: { vaultlabel: string, vault: unknown }[],
  boxes:  { vaultlabel: string, vault_tok: string, boxlabel: string, box: unknown }[],
}

// --

// == [The vaultDB]: ConvexVaultDB

/** A VaultDB that stores its rows in the host's Convex deployment, through the app's Convex client. */
export class ConvexVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #client, #api, #maxBoxes

  readonly #client: ConvexVaultClient
  readonly #api: SafebyokApi
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: ConvexVaultDBOpts) {
    const { client, api, maxBoxes = DB.DefaultMaxBoxes, maxRecordSizeEst = DB.DefaultMaxRecordSizeEst } = convexVaultDBOpts.parse(opts, { where: 'ConvexVaultDB', advice: Phrases.ConvexVaultDBAdvice })
    super({ maxRecordSizeEst: Math.min(maxRecordSizeEst, ConvexDocumentSize) })
    this.#client = client
    this.#api = api
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    return await runOrRefuse('doListVaults', () => this.#client.query(this.#api.listVaults, { scope }))
  }

  // A get reads its rows in one query, from one snapshot, and the client classifies them: a get stores nothing, so it needs no mutation.
  protected async doGetVault(ask: VaultGetAsk): Promise<VaultClassified> {
    const vault: unknown = await runOrRefuse('doGetVault', () => this.#client.query(this.#api.getVault, { scope: DB.vaultScope.parse(ask) }))
    return this.classifyVault(ask, { vault })
  }

  protected async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    return await runOrRefuse('doListBoxes', () => this.#client.query(this.#api.listBoxes, { asked }))
  }

  protected async doGetBox(ask: BoxGetAsk): Promise<BoxClassified> {
    const { vault, box } = await runOrRefuse('doGetBox', () => this.#client.query(this.#api.getBox, { asked: DB.boxQuery.parse(ask) }))
    return this.classifyBox(ask, { world: vault, box })
  }

  // A put or del is one mutation, so one transaction: the component checks the ask, fetches the rows, classifies the ask,
  // and stores the record if the act is a write. It returns the classifier's outcome, which is checked here.
  protected async doPutVault(ask: VaultPutAsk): Promise<VaultClassified> {
    return vaultClassified.parse(await runOrRefuse('doPutVault', () => this.#client.mutation(this.#api.putVault, { ask })))
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxClassified> {
    return boxClassified.parse(await runOrRefuse('doPutBox', () => this.#client.mutation(this.#api.putBox, { ask, maxBoxes: this.#maxBoxes })))
  }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultClassified> {
    return vaultClassified.parse(await runOrRefuse('doDelVault', () => this.#client.mutation(this.#api.delVault, { ask })))
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxClassified> {
    return boxClassified.parse(await runOrRefuse('doDelBox', () => this.#client.mutation(this.#api.delBox, { ask })))
  }

  protected async doTidyGone(scope: BankScope): Promise<Tidied> {
    return await runOrRefuse('doTidyGone', () => this.#client.mutation(this.#api.tidyGone, { scope }))
  }

  // Convex re-sends a watched query's whole result each time it changes, so `hear` gets only the
  // rows that differ from the previous result. The first result is the starting state, and is not
  // reported.
  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void, onBadNews: (news: VaultError) => void): () => void {
    let seen: RowsWatched | null = null
    let isWatching = true
    const hearRows = (rows: RowsWatched): void => {
      if (! isWatching) { return }
      if (seen !== null) { for (const heard of changesOf(seen, rows)) { hear(heard) } }
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

// == [Helpers]: runOrRefuse, refusalOf, refusalOfCrossed, changesOf, latestOf, isConvexClient, isSafebyokApi, convexVaultDBOpts, vaultClassified, boxClassified

/** Convex's size limit for one document, in bytes. */
const ConvexDocumentSize = 1_048_576

// Takes a thunk because ConvexReactClient.query can throw synchronously, before it returns a promise.
/** Run `call`, converting anything it throws into a safebyok refusal. */
async function runOrRefuse<ValT>(callname: string, call: () => Promise<ValT>): Promise<ValT> {
  try {
    return await call()
  } catch (err) {
    throw refusalOf(callname, err)
  }
}

// On a dev deployment Convex's error text may quote the call's arguments, so its message is never
// passed on. A refusal from the host's safebyok functions is recognized by its `data`, which only they make.
/** The refusal for `thrown`: one sent by the host's safebyok functions is rebuilt as itself, and anything else becomes `storage_unavailable`, naming `callname`. */
function refusalOf(callname: string, thrown: unknown): VaultError {
  if ((thrown instanceof ConvexError) && isSafebyokErrorData(thrown.data)) { return refusalOfCrossed(thrown.data) }
  return DB.storageFailed(callname, thrown)
}

/** Rebuild the VaultError a `ConvexError`'s `data` describes, with the core's message and, for a `gate_issue`, the stored vault row. */
function refusalOfCrossed(data: unknown): VaultError {
  const crossed = safebyokErrorData.parse(data)
  if (crossed.kind === 'identity_revoked') { return DB.identityRevoked() }
  if (crossed.kind === 'gate_issue') { return new DB.VaultError('gate_issue', crossed.message, { rows: { world: crossed.world, dbhas: crossed.world } }) }
  return new DB.VaultError(crossed.kind, crossed.message)
}

// Both results come from Convex's own serializer, so an unchanged row serializes the same way twice.
/** Return the vault rows and box rows in `rows` that are new or changed since `seen`. */
function changesOf(seen: RowsWatched, rows: RowsWatched): Heard[] {
  const seenVaults = new Map(seen.vaults.map(({ vaultlabel, vault }) => [vaultlabel, JSON.stringify(vault)]))
  const seenBoxes = new Map(seen.boxes.map(({ vaultlabel, vault_tok, boxlabel, box }) => [DB.ckeyOf(vaultlabel, vault_tok, boxlabel), JSON.stringify(box)]))
  const vaultOf = new Map(rows.vaults.map(({ vaultlabel, vault }) => [vaultlabel, vault]))
  const vaultsHeard = rows.vaults
    .filter(({ vaultlabel, vault }) => seenVaults.get(vaultlabel) !== JSON.stringify(vault))
    .map(({ vault }) => ({ vault }))
  const boxesHeard = rows.boxes
    .filter(({ vaultlabel, vault_tok, boxlabel, box }) => seenBoxes.get(DB.ckeyOf(vaultlabel, vault_tok, boxlabel)) !== JSON.stringify(box))
    .map(({ vaultlabel, box }) => ({ vault: vaultOf.get(vaultlabel) ?? null, box }))
  return [...vaultsHeard, ...boxesHeard]
}

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
function isConvexClient(candidate: unknown): candidate is ConvexVaultClient {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const calls = candidate as Partial<Record<'query' | 'mutation' | 'onUpdate' | 'watchQuery', unknown>>
  return (typeof calls.query === 'function') && (typeof calls.mutation === 'function') && ((typeof calls.onUpdate === 'function') || (typeof calls.watchQuery === 'function'))
}

/** The names of the safebyok functions the adapter calls. */
const SafebyokFnnames = ['listVaults', 'getVault', 'listBoxes', 'getBox', 'putVault', 'putBox', 'delVault', 'delBox', 'tidyGone', 'watchRows'] as const

// Each reference must have a name of the form `<module>:<function>`. The generated `api` returns a
// reference for any property, so `api.getVault` exists, but it names no module and
// `getFunctionName` throws on it.
/** True when `candidate` is the module of safebyok functions (`api.safebyok`), not the whole `api`. */
function isSafebyokApi(candidate: unknown): candidate is SafebyokApi {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const fnRefs = candidate as Partial<Record<string, FunctionReference<'query' | 'mutation'>>>
  return SafebyokFnnames.every((fnname) => {
    const fnRef = fnRefs[fnname]
    if (fnRef === undefined) { return false }
    try {
      return getFunctionName(fnRef).endsWith(`:${fnname}`)
    } catch {
      return false
    }
  })
}

/** Validator for {@link ConvexVaultDBOpts}. */
const convexVaultDBOpts = DB.objCheck(({ custom, int }) => ({
  ...DB.adapterVaultDBOpts.shape,
  client:   custom<ConvexVaultClient>(isConvexClient, Phrases.ClientExpected),
  api:      custom<SafebyokApi>(isSafebyokApi, Phrases.ApiExpected),
  maxBoxes: int.positive().optional(),
}), 'bad_option')

const OkActVals = [...DB.writeActVals, ...DB.foundActVals] as const

// A failed check here is a component out of step with this copy of safebyok, never a damaged row: the classifier checked the rows.
/** Validators for the result of a put or del mutation: the classifier's outcome for a vault ask, and for a box ask. */
const { vaultClassified, boxClassified } = DB.Checkers('unexpected_error', ({ obj, union, lit, oneof }) => {
  const presence = oneof(DB.presenceVals)
  const vaultParts = { world: DB.vaultRow, vault: DB.vaultRow.nullable(), presence }
  const boxParts   = { world: DB.vaultRow, box: DB.boxRow.nullable(), presence: presence.nullable(), capacity: DB.capacity.nullable() }
  return {
    vaultClassified: union([
      obj({ ok: lit(true), act: oneof(OkActVals), ...vaultParts }),
      obj({ ok: lit(false), act: oneof(DB.refusedActVals), ...vaultParts }),
    ]),
    boxClassified: union([
      obj({ ok: lit(true), act: oneof(OkActVals), ...boxParts }),
      obj({ ok: lit(false), act: oneof([...DB.refusedActVals, ...DB.boxVaultActVals]), ...boxParts }),
    ]),
  }
})
// --

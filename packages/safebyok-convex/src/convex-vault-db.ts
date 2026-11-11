/** The vaultDB adapter for Convex. */

import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import type { AdapterVaultDBOpts, BankScope, BoxesFetched, BoxFetched, BoxWritten, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Written, PutOptsGiven, RowOfVault, Tidied, VaultError, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope } from 'safebyok/storage'
import * as Phrases from './phrases'
import { isSafebyokErrorData } from './refusals'
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
  /** A soft cap on a vault's box rows, tombstones included. Defaults to `DefaultMaxBoxes`, and never exceeds the component's own limit. */
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
    const { client, api, maxBoxes = DB.DefaultMaxBoxes, maxRecordBytes = DB.DefaultMaxRecordBytes } = convexVaultDBOpts.parse(opts, { where: 'ConvexVaultDB', advice: Phrases.ConvexVaultDBAdvice })
    super({ maxRecordBytes: Math.min(maxRecordBytes, ConvexDocumentBytes) })
    this.#client = client
    this.#api = api
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    return await reaching('doListVaults', () => this.#client.query(this.#api.listVaults, { scope }))
  }

  protected async doGetVault(scope: VaultScope): Promise<unknown> {
    return await reaching('doGetVault', () => this.#client.query(this.#api.getVault, { scope }))
  }

  protected async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    return await reaching('doListBoxes', () => this.#client.query(this.#api.listBoxes, { asked }))
  }

  protected async doGetBox(asked: BoxQuery): Promise<BoxFetched> {
    return await reaching('doGetBox', () => this.#client.query(this.#api.getBox, { asked }))
  }

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Written> {
    return await reaching('doPutVault', () => this.#client.mutation(this.#api.putVault, { record, opts }))
  }

  // For a full vault the component returns its capacity instead of throwing, so `vault_full` is thrown here, with the core's thrower.
  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxWritten> {
    const answer = await reaching('doPutBox', () => this.#client.mutation(this.#api.putBox, { record, opts, maxBoxes: this.#maxBoxes }))
    if ('capacity' in answer) { throw DB.vaultFull(answer.capacity) }
    return answer
  }

  protected async doDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Written> {
    return await reaching('doDelVault', () => this.#client.mutation(this.#api.delVault, { tombstone, opts }))
  }

  protected async doDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<BoxWritten> {
    return await reaching('doDelBox', () => this.#client.mutation(this.#api.delBox, { tombstone, opts }))
  }

  protected async doTidyGone(scope: BankScope): Promise<Tidied> {
    return await reaching('doTidyGone', () => this.#client.mutation(this.#api.tidyGone, { scope }))
  }

  // Convex re-sends a watched query's whole result each time it changes, so `hear` gets only the
  // rows that differ from the previous result. The first result is the starting state, and is not
  // reported.
  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void, onBadNews: (news: VaultError) => void): () => void {
    let seen: RowsWatched | null = null
    let isWatching = true
    const heed = (rows: RowsWatched): void => {
      if (! isWatching) { return }
      if (seen !== null) { for (const heard of changesOf(seen, rows)) { hear(heard) } }
      seen = rows
    }
    const fail = (thrown: unknown): void => {
      if (isWatching) { onBadNews(refusalOf('watchRows', thrown)) }
    }
    const unsubscribe = this.#subscribe(scope, heed, fail)
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

  // A failing watch is told to `fail`, and carries on: when it recovers, its next result is compared
  // with the last one it received.
  #subscribe({ vaultlabel, ...bankScope }: WatchScope, heed: (rows: RowsWatched) => void, fail: (thrown: unknown) => void): () => void {
    const args = { scope: (vaultlabel === undefined) ? bankScope : { ...bankScope, vaultlabel } }
    if ('watchQuery' in this.#client) {
      const watch = this.#client.watchQuery(this.#api.watchRows, args)
      const heedLatest = () => {
        const rows = latestOf(watch, fail)
        if (rows !== undefined) { heed(rows) }
      }
      const unsubscribe = watch.onUpdate(heedLatest)
      // A ConvexReactClient that is already watching these rows sends no first result, only changes.
      heedLatest()
      return unsubscribe
    }
    return this.#client.onUpdate(this.#api.watchRows, args, heed, fail)
  }
  // --
}
// --

// == [Helpers]: reaching, refusalOf, changesOf, latestOf, isConvexClient, isSafebyokApi, convexVaultDBOpts

/** Convex's size limit for one document, in bytes. */
const ConvexDocumentBytes = 1_048_576

// Takes a thunk because ConvexReactClient.query can throw synchronously, before it returns a promise.
/** Run `call`, converting anything it throws into a safebyok refusal. */
const reaching = async <ValT>(callname: string, call: () => Promise<ValT>): Promise<ValT> => {
  try {
    return await call()
  } catch (err) {
    throw refusalOf(callname, err)
  }
}

// On a dev deployment Convex's error text may quote the call's arguments, so its message is never
// passed on. The wrapper's own refusal is recognized by its `data`.
const refusalOf = (callname: string, thrown: unknown): VaultError => {
  if ((thrown instanceof ConvexError) && isSafebyokErrorData(thrown.data)) { return DB.identityRevoked() }
  return DB.storageFailed(callname, thrown)
}

// Both results come from Convex's own serializer, so an unchanged row serializes the same way twice.
/** Return the vault rows and box rows in `rows` that are new or changed since `seen`. */
const changesOf = (seen: RowsWatched, rows: RowsWatched): Heard[] => {
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
const latestOf = (watch: { localQueryResult(): RowsWatched | undefined }, fail: (thrown: unknown) => void): RowsWatched | undefined => {
  try {
    return watch.localQueryResult()
  } catch (err) {
    fail(err)
    return undefined
  }
}

/** True when `candidate` has `query`, `mutation`, and either `onUpdate` or `watchQuery`. */
const isConvexClient = (candidate: unknown): candidate is ConvexVaultClient => {
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
const isSafebyokApi = (candidate: unknown): candidate is SafebyokApi => {
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
const convexVaultDBOpts = DB.objCheck(({ custom, uint }) => ({
  ...DB.adapterVaultDBOpts.shape,
  client:   custom<ConvexVaultClient>(isConvexClient, Phrases.ClientExpected),
  api:      custom<SafebyokApi>(isSafebyokApi, Phrases.ApiExpected),
  maxBoxes: uint.optional(),
}), 'bad_option')
// --

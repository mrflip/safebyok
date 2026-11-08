/** The vaultDB over Convex. */

import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import type { AdapterVaultDBOpts, BankScope, BoxesFetched, BoxFetched, BoxLanding, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Landing, PutOptsGiven, RowOfVault, Tidied, VaultError, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope } from 'safebyok/storage'
import * as Phrases from './phrases'
import { isSafebyokErrorData } from './refusals'
import type { SafebyokApi } from './server'

// == [Clients]: ConvexCalls, ConvexWatchingClient, ConvexReactWatchingClient, ConvexVaultClient, ConvexVaultDBOpts

/** The calls every Convex client makes alike: `ConvexClient` and `ConvexReactClient` both have them. */
export type ConvexCalls = {
  query<QueryRef extends FunctionReference<'query'>>(queryRef: QueryRef, args: FunctionArgs<QueryRef>): Promise<FunctionReturnType<QueryRef>>
  mutation<MutationRef extends FunctionReference<'mutation'>>(mutationRef: MutationRef, args: FunctionArgs<MutationRef>): Promise<FunctionReturnType<MutationRef>>
}

/** What a vault uses of a `ConvexClient`, from `convex/browser`. */
export type ConvexWatchingClient = ConvexCalls & {
  onUpdate<QueryRef extends FunctionReference<'query'>>(
    queryRef: QueryRef,
    args: FunctionArgs<QueryRef>,
    callback: (result: FunctionReturnType<QueryRef>) => unknown,
    onError?: (err: Error) => unknown,
  ): () => void
}

/** What a vault uses of a `ConvexReactClient`, from `convex/react`. */
export type ConvexReactWatchingClient = ConvexCalls & {
  watchQuery<QueryRef extends FunctionReference<'query'>>(queryRef: QueryRef, args: FunctionArgs<QueryRef>): {
    onUpdate(callback: () => void): () => void
    localQueryResult(): FunctionReturnType<QueryRef> | undefined
  }
}

/** The Convex client a vault talks through: a `ConvexClient`, or the app's own `ConvexReactClient`. */
export type ConvexVaultClient = ConvexWatchingClient | ConvexReactWatchingClient

/** What a {@link ConvexVaultDB} is made with. */
export type ConvexVaultDBOpts = AdapterVaultDBOpts & {
  /** The app's Convex client. */
  client: ConvexVaultClient
  /** The safebyok functions the app serves, `api.safebyok`. */
  api: SafebyokApi
  /** A soft cap on the box rows a vault holds, live or tombstoned, under the component's own limit. */
  maxBoxes?: number | undefined
}

/** Every vault row and box row under a watch's scope, as `watchRows` answers. */
type RowsWatched = {
  vaults: { vaultlabel: string, vault: unknown }[],
  boxes:  { vaultlabel: string, vault_tok: string, boxlabel: string, box: unknown }[],
}

// --

// == [The vaultDB]: ConvexVaultDB

/** A VaultDB whose rows live in the host's Convex deployment, reached through the app's Convex client. */
export class ConvexVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #client, #api, #maxBoxes

  readonly #client: ConvexVaultClient
  readonly #api: SafebyokApi
  readonly #maxBoxes: number | undefined
  // --

  // == [Construction]: constructor

  constructor(opts: ConvexVaultDBOpts) {
    const { client, api, maxBoxes, maxRecordBytes = ConvexDocumentBytes } = convexVaultDBOpts.parse(opts, { where: 'ConvexVaultDB', advice: Phrases.ConvexVaultDBAdvice })
    super({ maxRecordBytes: Math.min(maxRecordBytes, ConvexDocumentBytes) })
    this.#client = client
    this.#api = api
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doDelDamagedBox, doTidyGone, doWatch

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

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Landing> {
    return await reaching('doPutVault', () => this.#client.mutation(this.#api.putVault, { record, opts }))
  }

  // The component answers a full vault with its capacity rather than throwing, so the refusal is made here, where the core's throwers are.
  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxLanding> {
    const args = (this.#maxBoxes === undefined) ? { record, opts } : { record, opts, maxBoxes: this.#maxBoxes }
    const answer = await reaching('doPutBox', () => this.#client.mutation(this.#api.putBox, args))
    if ('capacity' in answer) { throw DB.vaultFull(answer.capacity) }
    return answer
  }

  protected async doDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Landing> {
    return await reaching('doDelVault', () => this.#client.mutation(this.#api.delVault, { tombstone, opts }))
  }

  protected async doDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<BoxLanding> {
    return await reaching('doDelBox', () => this.#client.mutation(this.#api.delBox, { tombstone, opts }))
  }

  protected async doDelDamagedBox(tombstone: BoxTombstone, boxprops: unknown): Promise<BoxLanding> {
    return await reaching('doDelDamagedBox', () => this.#client.mutation(this.#api.delDamagedBox, { tombstone, boxprops }))
  }

  protected async doTidyGone(scope: BankScope): Promise<Tidied> {
    return await reaching('doTidyGone', () => this.#client.mutation(this.#api.tidyGone, { scope }))
  }

  // Convex sends a watched query's whole answer each time it changes, so a watch hears the rows
  // that differ from the answer before. The first answer is what stood when the watch began, and
  // is heard by no one.
  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    let seen: RowsWatched | null = null
    let isWatching = true
    const heed = (rows: RowsWatched): void => {
      if (! isWatching) { return }
      if (seen !== null) { for (const heard of changesOf(seen, rows)) { hear(heard) } }
      seen = rows
    }
    const unsubscribe = this.#subscribe(scope, heed)
    // Convex counts a query's watchers, and its unsubscribe counts down each time it is called: a
    // second call would end another watch of the same rows on the same client.
    return () => {
      if (! isWatching) { return }
      isWatching = false
      unsubscribe()
    }
  }
  // --

  // == [Watching]: #subscribe

  // A failing watch has no one to throw to: the next call meets the trouble itself, and a watch
  // that recovers compares its next answer with the last it heard.
  #subscribe({ vaultlabel, ...bankScope }: WatchScope, heed: (rows: RowsWatched) => void): () => void {
    const args = { scope: (vaultlabel === undefined) ? bankScope : { ...bankScope, vaultlabel } }
    if ('watchQuery' in this.#client) {
      const watch = this.#client.watchQuery(this.#api.watchRows, args)
      const heedLatest = () => {
        const rows = latestOf(watch)
        if (rows !== undefined) { heed(rows) }
      }
      const unsubscribe = watch.onUpdate(heedLatest)
      // A ConvexReactClient already watching these rows sends no first answer, only changes.
      heedLatest()
      return unsubscribe
    }
    return this.#client.onUpdate(this.#api.watchRows, args, heed, () => undefined)
  }
  // --
}
// --

// == [Helpers]: reaching, refusalOf, changesOf, latestOf, isConvexClient, isSafebyokApi, convexVaultDBOpts

/** Convex's most for one document, in bytes. */
const ConvexDocumentBytes = 1_048_576

/** What `call` resolves, or the refusal that says what stopped it. */
// A thunk, since ConvexReactClient.query throws at once a refusal it already holds.
const reaching = async <ValT>(callname: string, call: () => Promise<ValT>): Promise<ValT> => {
  try {
    return await call()
  } catch (err) {
    throw refusalOf(callname, err)
  }
}

// Convex's own error text may quote the call's arguments on a dev deployment, so nothing of it is
// carried: only the wrapper's refusal is read, by its data.
const refusalOf = (callname: string, thrown: unknown): VaultError => {
  if ((thrown instanceof ConvexError) && isSafebyokErrorData(thrown.data)) { return DB.identityRevoked() }
  return DB.storageFailed(callname, thrown)
}

/** The vault rows and box rows that differ between `seen` and `rows`. */
// Both answers come from Convex's own serializer, so a row unchanged says itself the same way twice.
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

/** A React watch's latest answer, or undefined while it has none or is failing. */
const latestOf = (watch: { localQueryResult(): RowsWatched | undefined }): RowsWatched | undefined => {
  try {
    return watch.localQueryResult()
  } catch {
    return undefined
  }
}

/** True for a client with the calls a vault makes, and one way of watching. */
const isConvexClient = (candidate: unknown): candidate is ConvexVaultClient => {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const calls = candidate as Partial<Record<'query' | 'mutation' | 'onUpdate' | 'watchQuery', unknown>>
  return (typeof calls.query === 'function') && (typeof calls.mutation === 'function') && ((typeof calls.onUpdate === 'function') || (typeof calls.watchQuery === 'function'))
}

/** The functions a vault calls, by name. */
const SafebyokFnnames = ['listVaults', 'getVault', 'listBoxes', 'getBox', 'putVault', 'putBox', 'delVault', 'delBox', 'delDamagedBox', 'tidyGone', 'watchRows'] as const

// Each function must name itself as `<module>:<function>`. The whole generated `api` answers any
// property, so `api.getVault` exists, but names no module, and Convex refuses to name it.
/** True for the module of safebyok functions, each under its own name. */
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

/** The check of a {@link ConvexVaultDB}'s options. */
const convexVaultDBOpts = DB.objCheck(({ custom, uint }) => ({
  ...DB.adapterVaultDBOpts.shape,
  client:   custom<ConvexVaultClient>(isConvexClient, Phrases.ClientExpected),
  api:      custom<SafebyokApi>(isSafebyokApi, Phrases.ApiExpected),
  maxBoxes: uint.optional(),
}), 'bad_option')
// --

/** The vaultDB adapter for Convex. */

import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError, convexToJson } from 'convex/values'
import * as DB from 'safebyok/storage'
import type {
  BirthBankAsk, BirthManifest, GetAsk, GetManifest, GetWorldAsk, ListAsk, ListManifest, Received, StatsAsk, StatsManifest, ThingWatchScope, VaultError, WorldManifest, WriteAsk, WriteManifest,
} from 'safebyok/storage'
import * as Phrases from './phrases'
import { safebyokRefusal } from './refusals'
import type { SafebyokRefusal } from './refusals'
import type { SafebyokVaultApi } from './server'

// == [Clients]: ConvexCalls, ConvexWatchingClient, ConvexReactWatchingClient, ConvexVaultClient, ConvexVaultDBOpts, Watched

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

/** Options for {@link ConvexVaultDB}:
 * - `client` -- the app's Convex client
 * - `api` -- the app's safebyok vaultDB functions: `api.safebyokVault`, not the whole `api`
 */
export type ConvexVaultDBOpts = Readonly<{ client: ConvexVaultClient, api: SafebyokVaultApi }>

/** The result of `watchThings`: the Things committed after the cursor, the banktok of their bank, and the next cursor. */
type Watched = FunctionReturnType<SafebyokVaultApi['watchThings']>
// --

// == [The vaultDB]: ConvexVaultDB

/** A vaultDB that keeps its Things in the host's Convex deployment, through the app's Convex client. Its watch is a reactive query. */
export class ConvexVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #client, #api

  readonly #client: ConvexVaultClient
  readonly #api: SafebyokVaultApi
  // --

  // == [Construction]: constructor

  constructor(opts: ConvexVaultDBOpts) {
    const { client, api } = convexVaultDBOpts.parse(opts, { where: 'ConvexVaultDB', advice: Phrases.ConvexVaultDBAdvice })
    super()
    this.#client = client
    this.#api = api
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doStats, doWatch
  // Each call is one query or mutation of the component, which hands back the manifest of what it observed but its
  // `read_tc`. That is made here, before the call is sent, so no later than the snapshot it reads, and a watch's notice is
  // dated as it arrives. Convex's own clock is no better: a query's Date.now() is frozen as it starts, and Convex serves a
  // query's result again from its cache, so a later call could answer an earlier read_tc.

  protected async doGetThing(ask: GetAsk): Promise<GetManifest> {
    const read_tc = DB.readTcNow()
    return { ...(await runOrRefuse('getThing', () => this.#client.query(this.#api.getThing, { ask }))), read_tc }
  }

  protected async doWriteThing(ask: WriteAsk): Promise<WriteManifest> {
    demandStorableKeys(ask)
    const read_tc = DB.readTcNow()
    return { ...(await runOrRefuse('writeThing', () => this.#client.mutation(this.#api.writeThing, { ask }))), read_tc }
  }

  protected async doListThings(ask: ListAsk): Promise<ListManifest> {
    const read_tc = DB.readTcNow()
    return { ...(await runOrRefuse('listThings', () => this.#client.query(this.#api.listThings, { ask }))), read_tc }
  }

  // The component makes the same puts of the ask.
  protected async doBirthBank(ask: BirthBankAsk): Promise<BirthManifest> {
    demandStorableKeys(ask)
    const read_tc = DB.readTcNow()
    return { ...(await runOrRefuse('birthBank', () => this.#client.mutation(this.#api.birthBank, { ask }))), read_tc }
  }

  protected async doGetWorld(ask: GetWorldAsk): Promise<WorldManifest> {
    const read_tc = DB.readTcNow()
    return { ...(await runOrRefuse('getWorld', () => this.#client.query(this.#api.getWorld, { ask }))), read_tc }
  }

  protected async doStats(ask: StatsAsk): Promise<StatsManifest> {
    const read_tc = DB.readTcNow()
    return { ...(await runOrRefuse('stats', () => this.#client.query(this.#api.stats, { ask }))), read_tc }
  }

  // Each result of `watchThings` holds the Things committed after the cursor it was asked with, so `receive` gets each, with
  // the banktok of their bank in the same result. Where the cursor moved, the watch subscribes again from the new one, and drops
  // the old subscription; every Thing committed later is after the new cursor. The first subscription, from null, fetches no
  // Thing: the watch reports what changes after it starts.
  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void): () => void {
    let cursor: bigint | null = null
    let unsubscribe = noop
    let isWatching = true
    const fail = (thrown: unknown): void => { onBadNews(refusalOf('watchThings', thrown)) }
    const watchFrom = (from: bigint | null): void => {
      cursor = from
      const { stop, replay } = this.#subscribe(scope, from, hearThings, fail)
      unsubscribe = stop
      replay()
    }
    // A listener told of a Thing may stop the watch then and there, and a stopped watch subscribes no more.
    const hearThings = (watched: Watched): void => {
      for (const { raw } of watched.things) { receive({ record: raw, banktok: watched.banktok }) }
      if ((! isWatching) || (watched.cursor === cursor)) { return }
      unsubscribe()
      watchFrom(watched.cursor)
    }
    watchFrom(null)
    // Convex counts a query's watchers, and each unsubscribe call lowers that count. A second call would end another watch
    // of the same bank on the same client.
    return () => {
      if (! isWatching) { return }
      isWatching = false
      unsubscribe()
    }
  }
  // --

  // == [Watching]: #subscribe

  // A failing watch reports to `fail` and keeps running. A ConvexReactClient already watching the same query sends no
  // first result, only changes, so `replay` hears the result it holds, once `stop` is in the caller's hands.
  /** Subscribe to `watchThings` from `cursor`, returning the subscription's `stop`, and a `replay` of any result the client already holds. */
  #subscribe({ userid, banklabel }: ThingWatchScope, cursor: bigint | null, hearThings: (watched: Watched) => void, fail: (thrown: unknown) => void) {
    const args = { scope: { userid, banklabel }, cursor }
    if ('watchQuery' in this.#client) {
      const watch = this.#client.watchQuery(this.#api.watchThings, args)
      const hearLatest = () => {
        const watched = latestOf(watch, fail)
        if (watched !== undefined) { hearThings(watched) }
      }
      return { stop: watch.onUpdate(hearLatest), replay: hearLatest }
    }
    return { stop: this.#client.onUpdate(this.#api.watchThings, args, hearThings, fail), replay: noop }
  }
  // --
}
// --

// == [Helpers]: runOrRefuse, refusalOf, refusalOfCrossed, demandStorableKeys, latestOf, noop

// Accepts a thunk because ConvexReactClient.query can throw synchronously, before it returns a promise.
/** Run `thunk`, rethrowing any failure as a VaultError. */
async function runOrRefuse<ValT>(oplabel: string, thunk: () => Promise<ValT>): Promise<ValT> {
  try {
    return await thunk()
  } catch (err) {
    throw refusalOf(oplabel, err)
  }
}

// Convex's client sends a call again itself after a reconnect, so what it throws is a function's failure, which would repeat.
// Its error is kept only as the cause, never in the message: on a dev deployment its text may quote the call's arguments.
// A refusal from the host's safebyok functions is recognized by its `data`, which only they make.
/** The refusal for `thrown`: a refusal sent by the host's safebyok functions, else `storage_issue` naming `oplabel`. */
function refusalOf(oplabel: string, thrown: unknown): VaultError {
  if (! (thrown instanceof ConvexError)) { return DB.storageCallRefused(oplabel, thrown) }
  const refusalReport = safebyokRefusal.safeParse(thrown.data)
  return refusalReport.success ? refusalOfCrossed(refusalReport.data) : DB.storageCallRefused(oplabel, thrown)
}

/** Rebuild the VaultError that `crossed`, a `ConvexError`'s `data`, describes, with the core's message. */
function refusalOfCrossed(crossed: SafebyokRefusal): VaultError {
  if (crossed.kind === 'identity_revoked') { return DB.identityRevoked() }
  return new DB.VaultError(crossed.kind, crossed.message)
}

// Convex refuses an object key that starts with `$`, holds a character outside printable ASCII, or runs past 1024
// characters, and `convexToJson` applies its rules (`validateObjectField`, not exported). Of the keys in an ask, only those
// of a box's sidecar are not safebyok's own. Convex's error names the key and its fault, never a value, and is the cause.
/** Throw `bad_record` if `ask` holds an object key Convex would refuse, before it is sent. */
function demandStorableKeys(ask: WriteAsk | BirthBankAsk): void {
  try {
    convexToJson(ask)
  } catch (err) {
    throw new DB.VaultError('bad_record', Phrases.SidecarKeyRefused, { cause: err })
  }
}

/** A React watch's latest result, or undefined while it has none. A failing watch passes its error to `fail`, and gives undefined. */
function latestOf(watch: { localQueryResult(): Watched | undefined }, fail: (thrown: unknown) => void): Watched | undefined {
  try {
    return watch.localQueryResult()
  } catch (err) {
    fail(err)
    return undefined
  }
}

/** Do nothing. */
function noop(): void { /* nothing */ }
// --

// == [Checks]: isConvexClient, SafebyokVaultFnnames, isSafebyokVaultApi, convexVaultDBOpts

/** True when `candidate` has `query`, `mutation`, and either `onUpdate` or `watchQuery`. */
function isConvexClient(candidate: unknown): candidate is ConvexVaultClient {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const calls = candidate as Partial<Record<'query' | 'mutation' | 'onUpdate' | 'watchQuery', unknown>>
  return (typeof calls.query === 'function') && (typeof calls.mutation === 'function') && ((typeof calls.onUpdate === 'function') || (typeof calls.watchQuery === 'function'))
}

/** The names of the safebyok vaultDB functions the adapter calls. */
const SafebyokVaultFnnames = ['getThing', 'writeThing', 'listThings', 'birthBank', 'getWorld', 'stats', 'watchThings'] as const

// Each reference must have a name of the form `<module>:<function>`. The generated `api` returns a reference for any
// property, so `api.getThing` exists, but it names no module and `getFunctionName` throws on it.
/** True when `candidate` is the module of safebyok vaultDB functions (`api.safebyokVault`), not the whole `api`. */
function isSafebyokVaultApi(candidate: unknown): candidate is SafebyokVaultApi {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const fnRefs = candidate as Partial<Record<string, FunctionReference<'query' | 'mutation'>>>
  return SafebyokVaultFnnames.every((fnname) => {
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
const convexVaultDBOpts = DB.objCheck(({ custom }) => ({
  client: custom<ConvexVaultClient>(isConvexClient, Phrases.ClientExpected),
  api:    custom<SafebyokVaultApi>(isSafebyokVaultApi, Phrases.ApiExpected),
}), 'bad_record')
// --

/** The vaultDB adapter for Convex. */

import { getFunctionName } from 'convex/server'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'
import * as DB from 'safebyok/storage'
import type {
  BirthBankActual, BirthBankAsk, BirthPuts, GetAsk, GetWorldActual, GetWorldAsk, GotActual, ListAsk, ListThingsActual, Received, StatsActual, StatsAsk, ThingWatchScope, VaultError, WriteAsk,
  WroteActual,
} from 'safebyok/storage'
import * as Phrases from './phrases'
import { safebyokRefusal } from './refusals'
import type { SafebyokRefusal } from './refusals'
import type { SafebyokVaultApi } from './server'

// == [Clients]: ConvexCalls, ConvexWatchingClient, ConvexReactWatchingClient, ConvexVaultClient, ConvexVaultDBOpts, Filed

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

/** One Thing of what `watchThings` returns: its labelpath, and the Thing raw. */
type Filed = { labelpath: string, raw: unknown }
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
  // A get is one query, and what it fetched is classified here. A write is one mutation, so one transaction: the component
  // fetches the Things, classifies the ask with the same classifier, and writes the record if the act is a write. It returns
  // the Things as it fetched them, which are classified here to the same outcome, and what it wrote, read back, or null if
  // it wrote nothing. Whether it wrote is checked against the act, and a write answers what was stored. Each call's
  // `read_tc` is made before it is sent, so no later than the snapshot it reads, and a watch's notice is dated as it
  // arrives. Convex's own clock is no better: a query's Date.now() is frozen as it starts, and Convex serves a query's
  // result again from its cache, so a later call could answer an earlier read_tc.

  protected async doGetThing(ask: GetAsk): Promise<GotActual> {
    const read_tc = DB.readTcNow()
    const { thing, ...above } = await runOrRefuse('getThing', () => this.#client.query(this.#api.getThing, { ask }))
    return this.classifyGetThing(ask, thing, { ...above, read_tc })
  }

  protected async doWriteThing(ask: WriteAsk): Promise<WroteActual> {
    const read_tc = DB.readTcNow()
    const { thing, written, ...above } = await runOrRefuse('writeThing', () => this.#client.mutation(this.#api.writeThing, { ask }))
    const actual = this.classifyWriteThing(ask, thing, { ...above, read_tc })
    if (! (actual.ok && DB.Classifier.isWriteAct(actual.act))) {
      demandUnwritten(written)
      return actual
    }

    const after = checkedWritten(written)
    return { ...actual, banktok: DB.Classifier.banktokOf(ask, after.bank), tracked: DB.Classifier.trackedOf(ask, after.tracked), record: DB.Classifier.writtenThingOf(ask, after.thing) }
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    const read_tc = DB.readTcNow()
    const { parent, children, ...bankFetched } = await runOrRefuse('listThings', () => this.#client.query(this.#api.listThings, { ask }))
    return this.classifyListThings(ask, { parent, children }, { ...bankFetched, read_tc })
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    const read_tc = DB.readTcNow()
    const { written, ...fetched } = await runOrRefuse('birthBank', () => this.#client.mutation(this.#api.birthBank, { ask }))
    const actual = this.classifyBirthBank(puts, { ...fetched, read_tc })
    if (! (actual.ok && (actual.act === 'born'))) {
      demandUnwritten(written)
      return actual
    }

    const after = checkedWritten(written)
    return { ...actual, banktok: DB.Classifier.banktokOf(ask, after.bank), tracked: DB.Classifier.trackedOf(ask, after.tracked), things: DB.Classifier.writtenRootsOf(puts, after) }
  }

  protected async doGetWorld(ask: GetWorldAsk): Promise<GetWorldActual> {
    const read_tc = DB.readTcNow()
    const fetched = await runOrRefuse('getWorld', () => this.#client.query(this.#api.getWorld, { ask }))
    return this.classifyGetWorld(ask, { ...fetched, read_tc })
  }

  protected async doStats(ask: StatsAsk): Promise<StatsActual> {
    const read_tc = DB.readTcNow()
    const { box, gate, ...bankFetched } = await runOrRefuse('stats', () => this.#client.query(this.#api.stats, { ask }))
    return this.classifyStats(ask, { ...bankFetched, read_tc }, { box, gate, max: ConvexBankLimits })
  }

  // Convex re-sends a watched query's whole result each time it changes, so `receive` gets only the Things that differ from
  // the previous result, each with the banktok of the bank in the same result. The first result is the starting state, and
  // is not reported.
  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void): () => void {
    let seen: ReadonlyMap<string, string> | null = null
    let isWatching = true
    const hearThings = (things: Filed[]): void => {
      if (! isWatching) { return }
      if (seen !== null) { for (const received of changesOf(scope, seen, things)) { receive(received) } }
      seen = serializedOf(things)
    }
    const fail = (thrown: unknown): void => {
      if (isWatching) { onBadNews(refusalOf('watchThings', thrown)) }
    }
    const unsubscribe = this.#subscribe(scope, hearThings, fail)
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

  // A failing watch reports to `fail` and keeps running. When it recovers, its next result is compared with the last one it received.
  #subscribe({ userid, banklabel }: ThingWatchScope, hearThings: (things: Filed[]) => void, fail: (thrown: unknown) => void): () => void {
    const args = { scope: { userid, banklabel } }
    if ('watchQuery' in this.#client) {
      const watch = this.#client.watchQuery(this.#api.watchThings, args)
      const hearLatest = () => {
        const things = latestOf(watch, fail)
        if (things !== undefined) { hearThings(things) }
      }
      const unsubscribe = watch.onUpdate(hearLatest)
      // A ConvexReactClient that is already watching this bank sends no first result, only changes.
      hearLatest()
      return unsubscribe
    }
    return this.#client.onUpdate(this.#api.watchThings, args, hearThings, fail)
  }
  // --
}
// --

// == [Limits]: ConvexBankLimits

// docs.convex.dev/production/state/limits: one query may scan 32,000 documents and read 16 MiB. The stats and the watch each
// read every Thing of a bank in one query, so a bank holds no more than that.
/** The most a bank holds in Convex: the documents and bytes one query may read. */
const ConvexBankLimits = DB.storeLimitsOf({ count: 32_000, size: 16_777_216 })
// --

// == [Helpers]: runOrRefuse, refusalOf, refusalOfCrossed, storedOutOfStep, demandUnwritten, checkedWritten, serializedOf, changesOf, latestOf

// Accepts a thunk because ConvexReactClient.query can throw synchronously, before it returns a promise.
/** Run `thunk`, converting anything it throws into a safebyok refusal. */
async function runOrRefuse<ValT>(oplabel: string, thunk: () => Promise<ValT>): Promise<ValT> {
  try {
    return await thunk()
  } catch (err) {
    throw refusalOf(oplabel, err)
  }
}

// On a dev deployment Convex's error text may quote the call's arguments, so its message is never passed on. A refusal from
// the host's safebyok functions is recognized by its `data`, which only they make.
/** The refusal for `thrown`: a refusal sent by the host's safebyok functions, else `storage_unavailable` naming `oplabel`. */
function refusalOf(oplabel: string, thrown: unknown): VaultError {
  if (! (thrown instanceof ConvexError)) { return DB.storageFailed(oplabel, thrown) }
  const refusalReport = safebyokRefusal.safeParse(thrown.data)
  return refusalReport.success ? refusalOfCrossed(refusalReport.data) : DB.storageFailed(oplabel, thrown)
}

/** Rebuild the VaultError that `crossed`, a `ConvexError`'s `data`, describes, with the core's message. */
function refusalOfCrossed(crossed: SafebyokRefusal): VaultError {
  if (crossed.kind === 'identity_revoked') { return DB.identityRevoked() }
  return new DB.VaultError(crossed.kind, crossed.message)
}

// A disagreement is a component out of step with this copy of safebyok, never a damaged Thing: the classifier checked what was fetched.
/** The `unexpected_error` for a component that wrote where the classifier found no write, or wrote nothing where it found one. */
function storedOutOfStep(): VaultError { return DB.unexpectedError(new Error(Phrases.StoredOutOfStep)) }

/** Throw unless the component wrote nothing. */
function demandUnwritten(written: unknown): void {
  if (written !== null) { throw storedOutOfStep() }
}

/** What the component wrote, refused if it wrote nothing. */
function checkedWritten<WrittenT>(written: WrittenT | null): WrittenT {
  if (written === null) { throw storedOutOfStep() }
  return written
}

/** Each Thing of `things`, serialized, by its labelpath. */
function serializedOf(things: Filed[]): ReadonlyMap<string, string> {
  return new Map(things.map(({ labelpath, raw }) => [labelpath, JSON.stringify(raw)]))
}

// Both results come from Convex's own serializer, so an unchanged Thing serializes the same way twice.
/** The notices for the Things in `things` that are new or changed since `seen`, each with the banktok of the bank among `things`. */
function changesOf(scope: ThingWatchScope, seen: ReadonlyMap<string, string>, things: Filed[]): Received[] {
  const bank = things.find(({ labelpath }) => labelpath === 'bank')?.raw ?? null
  const banktok = DB.Classifier.banktokOf(scope, bank)
  return things
    .filter(({ labelpath, raw }) => seen.get(labelpath) !== JSON.stringify(raw))
    .map(({ raw }) => ({ record: raw, banktok }))
}

/** A React watch's latest result, or undefined while it has none. A failing watch passes its error to `fail`, and gives undefined. */
function latestOf(watch: { localQueryResult(): Filed[] | undefined }, fail: (thrown: unknown) => void): Filed[] | undefined {
  try {
    return watch.localQueryResult()
  } catch (err) {
    fail(err)
    return undefined
  }
}
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

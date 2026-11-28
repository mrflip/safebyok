/** The datastore in IndexedDB: one function per verb, each one IndexedDB transaction that hands back what it observed. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  AnyAsk, BankObserved, BirthBankAsk, BirthManifest, BirthPuts, GetAsk, GetManifest, GetBankAsk, ThingScope, ListAsk, ListManifest, Received, RootRows, StatsAsk, StatsManifest, ThingWatchScope, VaultError, GetBankManifest, WriteAsk, WriteManifest,
} from 'safebyok/storage'
import { bankThingsIn, bellnameOf, childrenIn, shelfOf, thingScopepathOf } from './vault-shelf'

// == [Helpers]: Rung, isHeardBy, quotaNow, shelfRefusingSmallQuota

/** The notice of one Thing written, broadcast to every watch on the database. */
type Rung = { scope: ThingWatchScope, received: Received }

/** True when `scope` and `watched` name the same bank. */
function isHeardBy(watched: ThingWatchScope, scope: ThingWatchScope): boolean {
  return (watched.userid === scope.userid) && (watched.banklabel === scope.banklabel)
}

/** The bytes this browser lets the page's origin fill, all its databases together, or undefined where it gives no estimate. */
async function quotaNow(): Promise<number | undefined> {
  const { storage } = globalThis.navigator as Partial<Navigator> | undefined ?? {}
  if (storage === undefined) { return undefined }
  const { quota } = await storage.estimate()
  return quota
}

/** `shelf`, but its first use refuses `storage_blocked` where the browser's quota is under {@link DB.DatastoreLimitFloor}. Where the browser gives no estimate, nothing is refused.
 * The quota is known only asynchronously, so the refusal cannot come from the constructor: it comes at the first call of any kind, which at startup is the read of the bank's roots at sign-in.
 */
function shelfRefusingSmallQuota(shelf: UseStore): UseStore {
  let isQuotaPending = true
  return async (txMode, callback) => {
    if (isQuotaPending) {
      const quota = await quotaNow()
      if ((quota !== undefined) && (quota < DB.DatastoreLimitFloor)) { throw DB.datastoreQuotaTooSmall(quota) }
      isQuotaPending = false
    }
    return await shelf(txMode, callback)
  }
}
// --

// == [Rows]: rowAt, ancestorOf, rootsOf, bankObservedOf

/** The raw row of kind `modelkind` at `scope` in `store`'s transaction, or null for none. */
async function rowAt(store: IDBObjectStore, scope: ThingScope): Promise<unknown> { return await DB.rowAt(store, thingScopepathOf(scope)) }

/** The nearest row above `ask`'s scope in `store`'s transaction, read only where `actual` is null; otherwise null. */
async function ancestorOf(store: IDBObjectStore, ask: GetAsk | WriteAsk, actual: unknown): Promise<unknown> {
  if (actual !== null) { return null }
  // A Thing's ancestors are of its own kind (a box's are boxes, and a gate has none), so they are in its key range.
  const { modelkind, userid, banklabel } = ask
  const aboves = await Promise.all(DB.Labelpath.ancestorsOf(ask.labelpath).map(async (labelpath) => await rowAt(store, { modelkind, userid, banklabel, labelpath })))
  return aboves.find((raw) => raw !== null) ?? null
}

/** The raw roots of `scope`'s bank in `store`'s transaction, each null for none. */
async function rootsOf(store: IDBObjectStore, scope: ThingWatchScope): Promise<RootRows> {
  const scopes = DB.rootScopesOf(scope)
  const [gate, root] = await Promise.all([rowAt(store, scopes.gate), rowAt(store, scopes.root)])
  return { gate, root }
}

/** The banktok of `ask`'s bank as `store`'s transaction now has it, its `tracked` for what `ask` tracks, and when they were read. */
async function bankObservedOf(store: IDBObjectStore, ask: AnyAsk): Promise<BankObserved> {
  const read_tc = DB.readTcNow()
  const { gate, root } = await rootsOf(store, ask)
  return { banktok: DB.ManifestTags.banktokOf(gate), tracked: DB.ManifestTags.trackedOf(ask, { gate, root }), read_tc }
}
// --

// The rows are only what our code wrote, or what a test planted: the datastore never judges one. Each call is one IndexedDB transaction, which ends at
// an await on anything but its own requests, so the quota is read before a transaction begins.
/** The datastore of a vaultDB in this browser's IndexedDB. */
export class IdbDatastore {
  // == [Props]: #shelf, #bellname

  readonly #shelf: UseStore
  readonly #bellname: string
  // --

  // == [Construction]: constructor

  constructor(dbName?: string) {
    this.#shelf    = shelfRefusingSmallQuota(shelfOf(dbName))
    this.#bellname = bellnameOf(dbName)
  }
  // --

  // == [Verbs]: getThing, writeThing, listThings, birthBank, getBank, stats, watch

  /** The Thing at `ask`'s scope, observed in one transaction. */
  async getThing(ask: GetAsk): Promise<GetManifest> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const actual = await rowAt(store, ask)
      return { tags: DB.ManifestTags.getTagsOf(actual), actual, ancestor: await ancestorOf(store, ask, actual), ...(await bankObservedOf(store, ask)) }
    })
  }

  /** Write `ask.record` where {@link DB.isWritable} allows, and observe the result, in one transaction. */
  async writeThing(ask: WriteAsk): Promise<WriteManifest> {
    const manifest = await DB.inOneStep(this.#shelf, 'readwrite', async (store): Promise<WriteManifest> => {
      const prior     = await rowAt(store, ask)
      const isWritten = DB.isWritable(ask, prior)
      if (isWritten) { store.put(ask.record, thingScopepathOf(ask)) }
      const actual = await rowAt(store, ask)
      return { tags: DB.ManifestTags.writeTagsOf(ask, prior, isWritten), actual, ancestor: await ancestorOf(store, ask, actual), ...(await bankObservedOf(store, ask)) }
    })
    if (manifest.tags.written) { this.#ring([{ scope: ask, received: { record: manifest.actual, modelkind: ask.modelkind, banktok: manifest.banktok } }]) }
    return manifest
  }

  // Like Postgres's, the listing reads the children whatever the parent: the vaultDB reads them only under a live one.
  /** The Thing at `ask`'s scope, and each Thing one label under it, observed in one transaction. */
  async listThings(ask: ListAsk): Promise<ListManifest> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const actual   = await rowAt(store, ask)
      const children = await childrenIn(store, ask)
      return { tags: DB.ManifestTags.getTagsOf(actual), actual, children, ...(await bankObservedOf(store, ask)) }
    })
  }

  /** Write a new bank's two roots, each put's record, where {@link DB.isBirthWritable} allows, and observe the result, in one transaction. */
  async birthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthManifest> {
    const manifest = await DB.inOneStep(this.#shelf, 'readwrite', async (store): Promise<BirthManifest> => {
      const prior     = await rootsOf(store, ask)
      const isWritten = DB.isBirthWritable(puts, prior)
      if (isWritten) { for (const put of puts) { store.put(put.record, thingScopepathOf(put)) } }
      const actual = await rootsOf(store, ask)
      return { tags: DB.ManifestTags.birthTagsOf(puts, prior, isWritten), actual, ...(await bankObservedOf(store, ask)) }
    })
    if (manifest.tags.written) {
      const { actual, banktok } = manifest
      this.#ring((['gate', 'root'] as const).map((rootckey) => ({ scope: ask, received: { record: actual[rootckey], modelkind: DB.RootModelkinds[rootckey], banktok } })))
    }
    return manifest
  }

  /** The two roots of `ask`'s bank, observed in one transaction. */
  async getBank(ask: GetBankAsk): Promise<GetBankManifest> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => ({ actual: await rootsOf(store, ask), ...(await bankObservedOf(store, ask)) }))
  }

  // The limit on the size is the quota, the origin's and all its databases together; IndexedDB sets no limit on how many Things are stored.
  /** The storage stats of `ask`'s bank, observed in one transaction. */
  async stats(ask: StatsAsk): Promise<StatsManifest> {
    const quota = await quotaNow()
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [gate, box] = await Promise.all([bankThingsIn(store, { ...ask, modelkind: 'gate' }), bankThingsIn(store, { ...ask, modelkind: 'box' })])
      return { stats: DB.vaultStatsOf({ gate, box }, (quota === undefined) ? {} : { size: quota }), ...(await bankObservedOf(store, ask)) }
    })
  }

  /** Watch `scope`'s bank: `receive` is called with each Thing written in it, by any tab. Returns a function that stops it. */
  watch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void): () => void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.addEventListener('message', ({ data }: MessageEvent<Rung>) => {
      try {
        if (isHeardBy(scope, data.scope)) { receive(data.received) }
      } catch (err) { onBadNews(DB.storageRefusalOf(err)) }
    })
    return () => { channel.close() }
  }
  // --

  // == [Ringing]: #ring

  /** Ring the bell for the Things in `rungs`, so that every tab's watch of this database is notified of them. */
  #ring(rungs: Rung[]): void {
    const channel = new BroadcastChannel(this.#bellname)
    for (const { scope: { userid, banklabel }, received } of rungs) { channel.postMessage({ scope: { userid, banklabel }, received }) }
    channel.close()
  }
  // --
}

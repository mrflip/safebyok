/** The datastore in IndexedDB: one function per verb, each one IndexedDB transaction that hands back what it observed. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  AnyAsk, BankObserved, BirthBankAsk, BirthManifest, BirthPuts, GetAsk, GetManifest, GetWorldAsk, ListAsk, ListManifest, Received, RootRows, StatsAsk, StatsManifest, ThingScope, ThingWatchScope, VaultError, WorldManifest, WriteAsk, WriteManifest,
} from 'safebyok/storage'
import { bankThingsIn, bellnameOf, childrenIn, shelfOf, thingScopepathOf } from './vault-shelf'

// == [Helpers]: Rung, isHeardBy, quotaNow, shelfRefusingSmallQuota

/** The notice of one Thing written, broadcast to every watch on the database. */
type Rung = { scope: ThingWatchScope, received: Received }

/** True when `scope` and `watched` name the same bank. */
function isHeardBy(watched: ThingWatchScope, scope: ThingWatchScope): boolean {
  return (watched.userid === scope.userid) && (watched.banklabel === scope.banklabel)
}

/** The bytes this browser lets the page's origin store, all its databases together, or undefined where it gives no estimate. */
async function quotaNow(): Promise<number | undefined> {
  const { storage } = globalThis.navigator as Partial<Navigator> | undefined ?? {}
  if (storage === undefined) { return undefined }
  const { quota } = await storage.estimate()
  return quota
}

/** `shelf`, but its first use refuses `storage_blocked` where the browser's quota is under {@link DB.StoreLimitFloor}. Where the browser gives no estimate, nothing is refused.
 * The quota is known only asynchronously, so the refusal cannot come from the constructor: it comes at the first call of any kind, which at startup is the world read at sign-in.
 */
function shelfRefusingSmallQuota(shelf: UseStore): UseStore {
  let isQuotaPending = true
  return async (txMode, callback) => {
    if (isQuotaPending) {
      const quota = await quotaNow()
      if ((quota !== undefined) && (quota < DB.StoreLimitFloor)) { throw DB.storeQuotaTooSmall(quota) }
      isQuotaPending = false
    }
    return await shelf(txMode, callback)
  }
}
// --

// == [Rows]: rowAt, ancestorOf, rootsOf, bankObservedOf

/** The raw row at `scope` in `store`'s transaction, or null for none. */
async function rowAt(store: IDBObjectStore, scope: ThingScope): Promise<unknown> { return await DB.rowAt(store, thingScopepathOf(scope)) }

/** The nearest row above `ask`'s scope in `store`'s transaction, read only where `actual` is null; otherwise null. */
async function ancestorOf(store: IDBObjectStore, ask: GetAsk | WriteAsk, actual: unknown): Promise<unknown> {
  if (actual !== null) { return null }
  const { userid, banklabel } = ask
  const aboves = await Promise.all(DB.Labelpath.ancestorsOf(ask.labelpath).map(async (labelpath) => await rowAt(store, { userid, banklabel, labelpath })))
  return aboves.find((raw) => raw !== null) ?? null
}

/** The raw roots of `scope`'s bank in `store`'s transaction, each null for none. */
async function rootsOf(store: IDBObjectStore, scope: ThingWatchScope): Promise<RootRows> {
  const { userid, banklabel } = scope
  const [bank, gate, root] = await Promise.all([
    rowAt(store, { userid, banklabel, labelpath: DB.RootLabelpaths.bank }),
    rowAt(store, { userid, banklabel, labelpath: DB.RootLabelpaths.gate }),
    rowAt(store, { userid, banklabel, labelpath: DB.RootLabelpaths.root }),
  ])
  return { bank, gate, root }
}

/** The banktok of `ask`'s bank as `store`'s transaction now has it, its `tracked` for what `ask` tracks, and when they were read. */
async function bankObservedOf(store: IDBObjectStore, ask: AnyAsk): Promise<BankObserved> {
  const read_tc = DB.readTcNow()
  const { bank, gate, root } = await rootsOf(store, ask)
  return { banktok: DB.ManifestTags.banktokOf(bank), tracked: DB.ManifestTags.trackedOf(ask, { bank, [DB.Labelpath.MainGate]: gate, [DB.Labelpath.RootBox]: root }), read_tc }
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

  // == [Verbs]: getThing, writeThing, listThings, birthBank, getWorld, stats, watch

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
      const ante    = await rowAt(store, ask)
      const written = DB.isWritable(ask, ante)
      if (written) { store.put(ask.record, thingScopepathOf(ask)) }
      const actual = await rowAt(store, ask)
      return { tags: DB.ManifestTags.writeTagsOf(ask, ante, written), actual, ancestor: await ancestorOf(store, ask, actual), ...(await bankObservedOf(store, ask)) }
    })
    if (manifest.tags.written) { this.#ring([{ scope: ask, received: { record: manifest.actual, banktok: manifest.banktok } }]) }
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

  /** Write a new bank's three roots, each put's record, where {@link DB.isBirthWritable} allows, and observe the result, in one transaction. */
  async birthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthManifest> {
    const manifest = await DB.inOneStep(this.#shelf, 'readwrite', async (store): Promise<BirthManifest> => {
      const ante    = await rootsOf(store, ask)
      const written = DB.isBirthWritable(ante)
      if (written) { for (const put of puts) { store.put(put.record, thingScopepathOf(put)) } }
      const actual = await rootsOf(store, ask)
      return { tags: DB.ManifestTags.birthTagsOf(puts, ante, written), actual, ...(await bankObservedOf(store, ask)) }
    })
    if (manifest.tags.written) {
      const { bank, gate, root } = manifest.actual
      this.#ring([bank, gate, root].map((record) => ({ scope: ask, received: { record, banktok: manifest.banktok } })))
    }
    return manifest
  }

  /** The three roots of `ask`'s bank, observed in one transaction. */
  async getWorld(ask: GetWorldAsk): Promise<WorldManifest> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => ({ actual: await rootsOf(store, ask), ...(await bankObservedOf(store, ask)) }))
  }

  // The limit on the size is the quota, the origin's and all its databases together; IndexedDB sets no limit on how many Things are stored.
  /** The storage stats of `ask`'s bank, observed in one transaction. */
  async stats(ask: StatsAsk): Promise<StatsManifest> {
    const quota = await quotaNow()
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const filed = await bankThingsIn(store, ask)
      return { stats: DB.vaultStatsOf(filed, (quota === undefined) ? {} : { size: quota }), ...(await bankObservedOf(store, ask)) }
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

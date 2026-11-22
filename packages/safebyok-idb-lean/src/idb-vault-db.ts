/** The vaultDB in this browser's IndexedDB. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  Actual, AnyAsk, BirthBankActual, BirthBankAsk, BirthPuts, DelAct, GetAsk, GotAct, ListAsk, ListThingsActual, PutAct, Received, ThingWatchScope, Tracked, VaultError, WorldRecord, WriteAsk,
} from 'safebyok/storage'
import { bellnameOf, childrenIn, shelfOf, thingScopepathOf } from './vault-shelf'

// == [Options]: IdbVaultDBOpts, idbVaultDBOpts

/** Options for {@link IdbVaultDB}:
 * - `dbName` -- scopes the database names: `safebyok-<dbName>:…`, or `safebyok:…` if left out
 */
export type IdbVaultDBOpts = { dbName?: string | undefined }

/** The check of {@link IdbVaultDBOpts}. */
const idbVaultDBOpts = DB.objCheck(({ str }) => ({ dbName: str.min(1).optional() }), 'bad_record')
// --

// == [Helpers]: Rung, isHeardBy, rootsFetchedIn, worldFetchedIn, worldAfterIn

/** The notice of one Thing written, broadcast to every watch on the database. */
type Rung = { scope: ThingWatchScope, received: Received }

/** True when `scope` and `watched` name the same bank. */
function isHeardBy(watched: ThingWatchScope, scope: ThingWatchScope): boolean {
  return (watched.userid === scope.userid) && (watched.banklabel === scope.banklabel)
}

/** The roots of `ask`'s bank, fetched raw in `store`'s transaction. */
async function rootsFetchedIn(store: IDBObjectStore, ask: AnyAsk): Promise<DB.Classifier.BankRootsFetched> {
  const { userid, banklabel } = ask
  const [bank, gate, root] = await Promise.all([
    DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath: 'bank' })),
    DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath: DB.Labelpath.MainGate })),
    DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath: DB.Labelpath.RootBox })),
  ])
  return { bank, gate, root, tracked: DB.Classifier.trackedFetchedOf(ask, { bank, [DB.Labelpath.MainGate]: gate, [DB.Labelpath.RootBox]: root }) }
}

/** The bank and main gate of `ask`'s bank, fetched raw in `store`'s transaction. */
async function worldFetchedIn(store: IDBObjectStore, ask: AnyAsk): Promise<DB.Classifier.WorldFetched> {
  const { gate: maingate, root: _root, ...fetched } = await rootsFetchedIn(store, ask)
  return { ...fetched, maingate }
}

/** The world of `ask`'s bank as `store`'s transaction now has it, and its {@link Tracked} if `ask` tracks the roots. */
async function worldAfterIn(store: IDBObjectStore, ask: AnyAsk): Promise<{ world: WorldRecord | null, tracked?: Tracked }> {
  const fetched = await worldFetchedIn(store, ask)
  return { world: DB.Classifier.worldOf(ask, fetched), ...DB.Classifier.trackedFieldOf(ask, fetched.tracked) }
}
// --

/** A vaultDB stored in this browser's IndexedDB. Its watches receive the writes made in every tab. */
export class IdbVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #shelf, #bellname

  readonly #shelf: UseStore
  readonly #bellname: string
  // --

  // == [Construction]: constructor

  constructor(opts: IdbVaultDBOpts = {}) {
    const { dbName } = idbVaultDBOpts.parse(opts, { where: "In IdbVaultDB's options" })
    super()
    this.#shelf    = shelfOf(dbName)
    this.#bellname = bellnameOf(dbName)
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch

  // Each call is one IndexedDB transaction. It fetches the Things the ask depends on, classifies the ask against them, and
  // on a write act writes the ask's records and reads them back, with the world after, before the transaction ends.
  protected async doGetThing(ask: GetAsk): Promise<Actual<GotAct>> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [raw, world] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), worldFetchedIn(store, ask)])
      return this.classifyGetThing(ask, raw, world)
    })
  }

  protected async doWriteThing(ask: WriteAsk): Promise<Actual<PutAct | DelAct>> {
    const actual = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [raw, world] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), worldFetchedIn(store, ask)])
      const actual = this.classifyWriteThing(ask, raw, world)
      if (! (actual.ok && DB.Classifier.isWriteAct(actual.act))) { return actual }
      store.put(ask.record, thingScopepathOf(ask))
      const [written, after] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), worldAfterIn(store, ask)])
      return { ...actual, ...after, record: DB.Classifier.writtenThingOf(ask, written) }
    })
    if (actual.ok && DB.Classifier.isWriteAct(actual.act) && (actual.record !== null)) {
      this.#ring([{ scope: ask, received: { record: actual.record, world: actual.world } }])
    }
    return actual
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [parent, children, world] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), childrenIn(store, ask), worldFetchedIn(store, ask)])
      return this.classifyListThings(ask, { parent, children, read_tc: DB.Classifier.readTcNow() }, world)
    })
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    const actual = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const actual = this.classifyBirthBank(puts, await rootsFetchedIn(store, ask))
      if (! (actual.ok && (actual.act === 'born'))) { return actual }
      for (const put of puts) { store.put(put.record, thingScopepathOf(put)) }
      const things = DB.Classifier.writtenRootsOf(puts, await rootsFetchedIn(store, ask))
      return { ...actual, ...(await worldAfterIn(store, ask)), things }
    })
    if (actual.ok && (actual.act === 'born')) {
      const { world } = actual
      this.#ring(Object.values(actual.things).map((record) => ({ scope: ask, received: { record, world } })))
    }
    return actual
  }

  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void): () => void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.addEventListener('message', ({ data }: MessageEvent<Rung>) => {
      try {
        if (isHeardBy(scope, data.scope)) { receive(data.received) }
      } catch (err) { onBadNews(DB.storageRefusalOf(err)) }
    })
    return () => { channel.close() }
  }
  // --

  // == [Telling]: #ring

  /** Tell every watch on this database, in every tab, of the Things in `rungs`. */
  #ring(rungs: Rung[]): void {
    const channel = new BroadcastChannel(this.#bellname)
    for (const { scope: { userid, banklabel }, received } of rungs) { channel.postMessage({ scope: { userid, banklabel }, received }) }
    channel.close()
  }
  // --
}

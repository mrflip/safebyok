/** The vaultDB in this browser's IndexedDB. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  ActualBeside, AnyAsk, BirthBankActual, BirthBankAsk, BirthPuts, GetAsk, GetWorldActual, GetWorldAsk, GotActual, ListAsk, ListThingsActual, Received, ThingWatchScope, VaultError, WriteAsk, WroteActual,
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

// == [Helpers]: Rung, isHeardBy, rootsFetchedIn, bankFetchedIn, aboveFetchedIn, besideAfterIn

/** The notice of one Thing written, broadcast to every watch on the database. */
type Rung = { scope: ThingWatchScope, received: Received }

/** True when `scope` and `watched` name the same bank. */
function isHeardBy(watched: ThingWatchScope, scope: ThingWatchScope): boolean {
  return (watched.userid === scope.userid) && (watched.banklabel === scope.banklabel)
}

/** The roots of `ask`'s bank, fetched raw in `store`'s transaction, how they compare with what `ask` tracks, and when they were read. */
async function rootsFetchedIn(store: IDBObjectStore, ask: AnyAsk): Promise<DB.Classifier.BankRootsFetched> {
  const { userid, banklabel } = ask
  const read_tc = DB.readTcNow()
  const [bank, gate, root] = await Promise.all([
    DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath: 'bank' })),
    DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath: DB.Labelpath.MainGate })),
    DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath: DB.Labelpath.RootBox })),
  ])
  return { bank, gate, root, tracked: DB.Classifier.trackedFetchedOf(ask, { bank, [DB.Labelpath.MainGate]: gate, [DB.Labelpath.RootBox]: root }), read_tc }
}

/** The bank of `ask`'s bank, fetched raw in `store`'s transaction, how its roots compare with what `ask` tracks, and when they were read. */
async function bankFetchedIn(store: IDBObjectStore, ask: AnyAsk): Promise<DB.Classifier.BankFetched> {
  const { bank, tracked, read_tc } = await rootsFetchedIn(store, ask)
  return { bank, tracked, read_tc }
}

/** The bank of `ask`'s bank and the nearest Thing stored above its scope, fetched raw in `store`'s transaction. */
async function aboveFetchedIn(store: IDBObjectStore, ask: GetAsk | WriteAsk): Promise<DB.Classifier.AboveFetched> {
  const { userid, banklabel } = ask
  const [bankFetched, ...ancestors] = await Promise.all([
    bankFetchedIn(store, ask),
    ...DB.Labelpath.ancestorsOf(ask.labelpath).map((labelpath) => DB.rowAt(store, thingScopepathOf({ userid, banklabel, labelpath }))),
  ])
  return { ...bankFetched, ancestor: ancestors.find((raw) => raw !== null) ?? null }
}

/** The banktok of `ask`'s bank as `store`'s transaction now has it, its `tracked` for what `ask` tracks, and when they were read. */
async function besideAfterIn(store: IDBObjectStore, ask: AnyAsk): Promise<ActualBeside> {
  const fetched = await bankFetchedIn(store, ask)
  return { banktok: DB.Classifier.banktokOf(ask, fetched.bank), tracked: DB.Classifier.trackedOf(ask, fetched.tracked), read_tc: fetched.read_tc }
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

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doWatch

  // Each call is one IndexedDB transaction. It fetches the Things the ask depends on, classifies the ask against them, and
  // on a write act writes the ask's records and reads them back, with the banktok after, before the transaction ends.
  protected async doGetThing(ask: GetAsk): Promise<GotActual> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [raw, above] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), aboveFetchedIn(store, ask)])
      return this.classifyGetThing(ask, raw, above)
    })
  }

  protected async doWriteThing(ask: WriteAsk): Promise<WroteActual> {
    const actual = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [raw, above] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), aboveFetchedIn(store, ask)])
      const actual = this.classifyWriteThing(ask, raw, above)
      if (! (actual.ok && DB.Classifier.isWriteAct(actual.act))) { return actual }
      store.put(ask.record, thingScopepathOf(ask))
      const [written, after] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), besideAfterIn(store, ask)])
      return { ...actual, ...after, record: DB.Classifier.writtenThingOf(ask, written) }
    })
    if (actual.ok && DB.Classifier.isWriteAct(actual.act)) {
      this.#ring([{ scope: ask, received: { record: actual.record, banktok: actual.banktok } }])
    }
    return actual
  }

  protected async doListThings(ask: ListAsk): Promise<ListThingsActual> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [parent, children, bankFetched] = await Promise.all([DB.rowAt(store, thingScopepathOf(ask)), childrenIn(store, ask), bankFetchedIn(store, ask)])
      return this.classifyListThings(ask, { parent, children }, bankFetched)
    })
  }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    const actual = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const actual = this.classifyBirthBank(puts, await rootsFetchedIn(store, ask))
      if (! (actual.ok && (actual.act === 'born'))) { return actual }
      for (const put of puts) { store.put(put.record, thingScopepathOf(put)) }
      const things = DB.Classifier.writtenRootsOf(puts, await rootsFetchedIn(store, ask))
      return { ...actual, ...(await besideAfterIn(store, ask)), things }
    })
    if (actual.ok && (actual.act === 'born')) {
      const { banktok } = actual
      this.#ring(Object.values(actual.things).map((record) => ({ scope: ask, received: { record, banktok } })))
    }
    return actual
  }

  protected async doGetWorld(ask: GetWorldAsk): Promise<GetWorldActual> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => this.classifyGetWorld(ask, await rootsFetchedIn(store, ask)))
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

  // == [Ringing]: #ring

  /** Ring the bell for the Things in `rungs`, so that every tab's watch of this database is notified of them. */
  #ring(rungs: Rung[]): void {
    const channel = new BroadcastChannel(this.#bellname)
    for (const { scope: { userid, banklabel }, received } of rungs) { channel.postMessage({ scope: { userid, banklabel }, received }) }
    channel.close()
  }
  // --
}

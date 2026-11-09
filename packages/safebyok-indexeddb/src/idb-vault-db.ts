/** safebyok's vaultDB in this browser's IndexedDB. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, BankScope, BoxesFetched, BoxFetched, BoxLanding, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Landing, PutOptsGiven,
  RowOfVault, Tidied, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope,
} from 'safebyok/storage'
import { bankBoxesRangeOf, boxPlaceOf, boxScopepathOf, filedIn, lifeRangeOf, shelfOf, vaultlabelOf, vaultScopepathOf, vaultsRangeOf } from './shelf'

// == [Options]: IdbVaultDBOpts, idbVaultDBOpts

/** What an IdbVaultDB is made with: the AdapterVaultDB's options, and `dbName` ('safebyok' if left out). */
export type IdbVaultDBOpts = AdapterVaultDBOpts & { dbName?: string | undefined }

const idbVaultDBOpts = DB.objCheck(({ str }) => ({ ...DB.adapterVaultDBOpts.shape, dbName: str.min(1).optional() }), 'bad_option')
// --

// == [Helpers]: Rung, isHeardBy

/** What a write tells every watch on its database: the scope it wrote under, and the rows a watch hears. */
type Rung = { scope: VaultScope, heard: Heard }

/** True when a watch on `watched` hears a write under `scope`. */
const isHeardBy = (watched: WatchScope, scope: VaultScope): boolean => (
  (watched.applabel === scope.applabel) && (watched.user_id === scope.user_id) && ((watched.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
)
// --

/** A vaultDB in this browser's IndexedDB, whose watch hears every tab's writes. */
export class IdbVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #shelf, #bellname

  readonly #shelf: UseStore
  readonly #bellname: string
  // --

  // == [Construction]: constructor

  constructor(opts: IdbVaultDBOpts = {}) {
    const { dbName = 'safebyok', ...adapterVaultDBOpts } = idbVaultDBOpts.parse(opts, { where: "In IdbVaultDB's options" })
    super(adapterVaultDBOpts)
    this.#shelf = shelfOf(dbName)
    this.#bellname = `safebyok-indexeddb:${dbName}`
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    const filed = await DB.inOneStep(this.#shelf, 'readonly', (store) => filedIn(store, vaultsRangeOf(scope)))
    return filed.map(({ scopepath, row }) => ({ vaultlabel: vaultlabelOf(scopepath), vault: row }))
  }

  protected async doGetVault(scope: VaultScope): Promise<unknown> {
    return await DB.inOneStep(this.#shelf, 'readonly', (store) => DB.rowAt(store, vaultScopepathOf(scope)))
  }

  protected async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [vault, filed] = await Promise.all([DB.rowAt(store, vaultScopepathOf(asked)), filedIn(store, lifeRangeOf(asked))])
      return { vault, boxes: filed.map(({ scopepath, row }) => ({ boxlabel: boxPlaceOf(scopepath).boxlabel, box: row })) }
    })
  }

  protected async doGetBox(asked: BoxQuery): Promise<BoxFetched> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [vault, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(asked)), DB.rowAt(store, boxScopepathOf(asked))])
      return { vault, box }
    })
  }

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Landing> {
    const landing = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const ante = await DB.rowAt(store, vaultScopepathOf(record))
      const landed = DB.isVaultPutAllowed(ante, opts)
      if (landed) { store.put(record, vaultScopepathOf(record)) }
      return { landed, ante }
    })
    if (landing.landed) { this.#ring([{ scope: record, heard: { vault: record } }]) }
    return landing
  }

  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxLanding> {
    const landing = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vault, ante] = await Promise.all([DB.rowAt(store, vaultScopepathOf(record)), DB.rowAt(store, boxScopepathOf(record))])
      const landed = DB.isLiveVaultRecord(vault, record.vault_tok) && DB.isBoxPutAllowed(ante, opts)
      if (landed) { store.put(record, boxScopepathOf(record)) }
      return { landed, ante, vault }
    })
    if (landing.landed) { this.#ring([{ scope: record, heard: { vault: landing.vault, box: record } }]) }
    return landing
  }

  protected async doDelVault(tombstone: VaultTombstone, { prior }: DelOpts): Promise<Landing> {
    const { landing, rungs } = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const ante = await DB.rowAt(store, vaultScopepathOf(tombstone))
      const isOurs = DB.isLiveVaultRecord(ante, tombstone.vault_tok)
      const isDamaged = (ante !== null) && (! DB.vaultRow.safeParse(ante).success)
      const landed = isOurs && DB.isRowAt(ante, prior)
      // A live row of this life at another revision, or damage, stops the del whole; any other row lets a repeat sweep the boxes.
      if ((! landed) && (isOurs || isDamaged)) { return { landing: { landed, ante }, rungs: [] } }
      if (landed) { store.put(tombstone, vaultScopepathOf(tombstone)) }
      const vault = landed ? tombstone : ante
      const rungs: Rung[] = landed ? [{ scope: tombstone, heard: { vault } }] : []
      const boxes = await filedIn(store, lifeRangeOf(tombstone))
      for (const { scopepath, row } of boxes) {
        const boxTombstone = DB.boxTombstoneOf(row, tombstone.written_at)
        if (boxTombstone === null) { continue }
        store.put(boxTombstone, scopepath)
        rungs.push({ scope: tombstone, heard: { vault, box: boxTombstone } })
      }
      return { landing: { landed, ante }, rungs }
    })
    this.#ring(rungs)
    return landing
  }

  protected async doDelBox(tombstone: BoxTombstone, { prior }: DelOpts): Promise<BoxLanding> {
    const landing = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vault, ante] = await Promise.all([DB.rowAt(store, vaultScopepathOf(tombstone)), DB.rowAt(store, boxScopepathOf(tombstone))])
      const isDeletable = DB.isLiveBoxRecord(ante, tombstone.vault_tok) && DB.isRowAt(ante, prior)
      const landed = DB.isLiveVaultRecord(vault, tombstone.vault_tok) && isDeletable
      if (landed) { store.put(tombstone, boxScopepathOf(tombstone)) }
      return { landed, ante, vault }
    })
    if (landing.landed) { this.#ring([{ scope: tombstone, heard: { vault: landing.vault, box: tombstone } }]) }
    return landing
  }

  protected async doTidyGone(scope: BankScope): Promise<Tidied> {
    return await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vaults, boxes] = await Promise.all([filedIn(store, vaultsRangeOf(scope)), filedIn(store, bankBoxesRangeOf(scope))])
      const vaultOfLabel = new Map(vaults.map(({ scopepath, row }) => [vaultlabelOf(scopepath), row]))
      let totalCount = 0
      for (const { scopepath } of boxes) {
        const { vaultlabel, vault_tok } = boxPlaceOf(scopepath)
        if (DB.isLifeOver(vaultOfLabel.get(vaultlabel) ?? null, vault_tok)) { store.delete(scopepath) } else { totalCount += 1 }
      }
      return { totalCount }
    })
  }

  protected override doWatch(scope: WatchScope, hear: (heard: Heard) => void): () => void {
    const channel = new BroadcastChannel(this.#bellname)
    channel.addEventListener('message', ({ data }: MessageEvent<Rung>) => {
      if (isHeardBy(scope, data.scope)) { hear(data.heard) }
    })
    return () => { channel.close() }
  }
  // --

  // == [Telling]: #ring

  /** Tells every watch on this database, in this tab and every other, of rows a committed transaction wrote. */
  #ring(rungs: Rung[]): void {
    if (rungs.length === 0) { return }
    const channel = new BroadcastChannel(this.#bellname)
    for (const rung of rungs) { channel.postMessage(rung) }
    channel.close()
  }
  // --
}

/** A vaultDB in this browser's IndexedDB, for an app with no backend. */
export const idbVaultDB = (opts?: IdbVaultDBOpts): IdbVaultDB => new IdbVaultDB(opts)

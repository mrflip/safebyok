/** safebyok's vaultDB in this browser's IndexedDB. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, BankScope, BoxesFetched, BoxFetched, BoxWritten, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Written, PutOptsGiven,
  RowOfVault, Tidied, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope,
} from 'safebyok/storage'
import { bankBoxesRangeOf, boxPlaceOf, boxScopepathOf, filedIn, lifeRangeOf, shelfOf, vaultlabelOf, vaultScopepathOf, vaultsRangeOf } from './shelf'

// == [Options]: IdbVaultDBOpts, idbVaultDBOpts

/** Options for an IdbVaultDB: the AdapterVaultDB's options, plus
 * - `dbName`   -- the IndexedDB database name (default: `'safebyok'`)
 * - `maxBoxes` -- a soft cap on one vault's live boxes (default: the core's `DefaultMaxBoxes`)
 */
export type IdbVaultDBOpts = AdapterVaultDBOpts & { dbName?: string | undefined, maxBoxes?: number | undefined }

const idbVaultDBOpts = DB.objCheck(({ str, uint }) => ({ ...DB.adapterVaultDBOpts.shape, dbName: str.min(1).optional(), maxBoxes: uint.optional() }), 'bad_option')
// --

// == [Helpers]: Rung, isHeardBy

/** A notice of one write, broadcast to every watch on the database: the scope written under, and the rows written. */
type Rung = { scope: VaultScope, heard: Heard }

/** True when a write under `scope` falls within the `watched` scope. */
const isHeardBy = (watched: WatchScope, scope: VaultScope): boolean => (
  (watched.applabel === scope.applabel) && (watched.user_id === scope.user_id) && ((watched.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
)
// --

/** A vaultDB stored in this browser's IndexedDB. Its watch reports writes from every tab. */
export class IdbVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #shelf, #bellname, #maxBoxes

  readonly #shelf: UseStore
  readonly #bellname: string
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: IdbVaultDBOpts = {}) {
    const { dbName = 'safebyok', maxBoxes = DB.DefaultMaxBoxes, ...adapterVaultDBOpts } = idbVaultDBOpts.parse(opts, { where: "In IdbVaultDB's options" })
    super(adapterVaultDBOpts)
    this.#shelf = shelfOf(dbName)
    this.#bellname = `safebyok-indexeddb:${dbName}`
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Room]: #demandRoom

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** Demand that the vault has room for a new live box, under the soft cap `maxBoxes`. */
  async #demandRoom(store: IDBObjectStore, record: BoxRecord, ante: unknown): Promise<void> {
    if (DB.isLiveRow(ante)) { return }
    const boxes = await filedIn(store, lifeRangeOf(record))
    const used = boxes.filter(({ row }) => DB.isLiveRow(row)).length
    if (used >= this.#maxBoxes) { throw DB.vaultFull({ boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }) }
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

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Written> {
    const written = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const ante = await DB.rowAt(store, vaultScopepathOf(record))
      const isWritten = DB.isVaultPutAllowed(ante, record, opts)
      if (isWritten) { store.put(record, vaultScopepathOf(record)) }
      return { isWritten, ante }
    })
    if (written.isWritten) { this.#ring([{ scope: record, heard: { vault: record } }]) }
    return written
  }

  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxWritten> {
    const written = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vault, ante] = await Promise.all([DB.rowAt(store, vaultScopepathOf(record)), DB.rowAt(store, boxScopepathOf(record))])
      const isWritten = DB.isLiveVaultRecord(vault, record.vault_tok) && DB.isBoxPutAllowed(ante, record, opts)
      if (isWritten) {
        await this.#demandRoom(store, record, ante)
        store.put(record, boxScopepathOf(record))
      }
      return { isWritten, ante, vault }
    })
    if (written.isWritten) { this.#ring([{ scope: record, heard: { vault: written.vault, box: record } }]) }
    return written
  }

  protected async doDelVault(tombstone: VaultTombstone, { prior }: DelOpts): Promise<Written> {
    const { written, rungs } = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const ante = await DB.rowAt(store, vaultScopepathOf(tombstone))
      const isOurs = DB.isLiveVaultRecord(ante, tombstone.vault_tok)
      const isDamaged = (ante !== null) && (! DB.vaultRow.safeParse(ante).success)
      const isWritten = isOurs && DB.isRowAt(ante, prior)
      // Stop here, leaving the boxes alone, when the vault row is damaged or is this life's live row at another revision.
      // For any other row, go on to tombstone the boxes, so that a repeated del finishes the job.
      if ((! isWritten) && (isOurs || isDamaged)) { return { written: { isWritten, ante }, rungs: [] } }
      if (isWritten) { store.put(tombstone, vaultScopepathOf(tombstone)) }
      const vault = isWritten ? tombstone : ante
      const rungs: Rung[] = isWritten ? [{ scope: tombstone, heard: { vault } }] : []
      const boxes = await filedIn(store, lifeRangeOf(tombstone))
      for (const { scopepath, row } of boxes) {
        const boxTombstone = DB.boxTombstoneOf(row, tombstone.written_at)
        if (boxTombstone === null) { continue }
        store.put(boxTombstone, scopepath)
        rungs.push({ scope: tombstone, heard: { vault, box: boxTombstone } })
      }
      return { written: { isWritten, ante }, rungs }
    })
    this.#ring(rungs)
    return written
  }

  protected async doDelBox(tombstone: BoxTombstone, { prior }: DelOpts): Promise<BoxWritten> {
    const written = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vault, ante] = await Promise.all([DB.rowAt(store, vaultScopepathOf(tombstone)), DB.rowAt(store, boxScopepathOf(tombstone))])
      const isDeletable = DB.isLiveBoxRecord(ante, tombstone.vault_tok) && DB.isRowAt(ante, prior)
      const isWritten = DB.isLiveVaultRecord(vault, tombstone.vault_tok) && isDeletable
      if (isWritten) { store.put(tombstone, boxScopepathOf(tombstone)) }
      return { isWritten, ante, vault }
    })
    if (written.isWritten) { this.#ring([{ scope: tombstone, heard: { vault: written.vault, box: tombstone } }]) }
    return written
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

  /** Broadcast the rows a committed transaction wrote to every watch on this database, in every tab. */
  #ring(rungs: Rung[]): void {
    if (rungs.length === 0) { return }
    const channel = new BroadcastChannel(this.#bellname)
    for (const rung of rungs) { channel.postMessage(rung) }
    channel.close()
  }
  // --
}

/** Make an {@link IdbVaultDB}: a vaultDB in this browser's IndexedDB, for an app with no backend. */
export const idbVaultDB = (opts?: IdbVaultDBOpts): IdbVaultDB => new IdbVaultDB(opts)

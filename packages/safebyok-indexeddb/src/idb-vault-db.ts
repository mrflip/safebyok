/** safebyok's vaultDB in this browser's IndexedDB. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, BoxDelAsk, BoxesStored, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxTidyAsk, BoxStored, Capacity, Heard,
  Tidied, VaultDelAsk, VaultGetAsk, VaultListAsk, VaultPutAsk, VaultQuery, VaultScope, VaultsStored, VaultStored, WatchScope,
} from 'safebyok/storage'
import { bankBoxesRangeOf, boxPlaceOf, boxScopepathOf, filedIn, lifeRangeOf, shelfOf, vaultlabelOf, vaultScopepathOf, vaultsRangeOf } from './shelf'

// == [Options]: IdbVaultDBOpts, idbVaultDBOpts

/** Options for an IdbVaultDB: the AdapterVaultDB's options, plus
 * - `dbName`   -- the IndexedDB database name (default: `'safebyok'`)
 * - `maxBoxes` -- a soft cap on the box rows of one vault life, live and deleted together (default: the core's `DefaultMaxBoxes`)
 */
export type IdbVaultDBOpts = AdapterVaultDBOpts & { dbName?: string | undefined, maxBoxes?: number | undefined }

const idbVaultDBOpts = DB.objCheck(({ str, uint }) => ({ ...DB.adapterVaultDBOpts.shape, dbName: str.min(1).optional(), maxBoxes: uint.optional() }), 'bad_option')
// --

// == [Helpers]: Rung, isHeardBy, scopeOf

/** A notice of one write, broadcast to every watch on the database: the scope written under, and the rows written. */
type Rung = { scope: VaultScope, heard: Heard }

/** True when a write under `scope` falls within the `watched` scope. */
function isHeardBy(watched: WatchScope, scope: VaultScope): boolean {
  return (watched.applabel === scope.applabel) && (watched.user_id === scope.user_id) && ((watched.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
}

/** The vault scope of an ask or a row, without its other fields. */
function scopeOf({ applabel, user_id, vaultlabel }: VaultScope): VaultScope { return { applabel, user_id, vaultlabel } }
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

  // == [Room]: #roomIn

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** The capacity of the vault life `asked` names: its box rows, live and deleted, counted in the caller's transaction, against the soft cap `maxBoxes`. */
  async #roomIn(store: IDBObjectStore, life: VaultQuery): Promise<Capacity> {
    const used = await promisifyRequest(store.count(lifeRangeOf(life)))
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(ask: VaultListAsk): Promise<VaultsStored> {
    const filed = await DB.inOneStep(this.#shelf, 'readonly', (store) => filedIn(store, vaultsRangeOf(ask)))
    const vaults = filed.map(({ scopepath, row }) => ({ vaultlabel: vaultlabelOf(scopepath), vault: row }))
    return this.classifyStoredVaults(ask, vaults)
  }

  // Each get, list, put or del is one IndexedDB transaction. It fetches the rows, classifies the ask against them, and, if the
  // classifier finds a write, stores the ask's record before the transaction ends.
  protected async doGetVault(ask: VaultGetAsk): Promise<VaultStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const vault = await DB.rowAt(store, vaultScopepathOf(ask))
      return this.classifyStoredVault(ask, { vault })
    })
  }

  protected async doListBoxes(ask: BoxListAsk): Promise<BoxesStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [world, filed] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), filedIn(store, lifeRangeOf(ask))])
      const boxes = filed.map(({ scopepath, row }) => ({ boxlabel: boxPlaceOf(scopepath).boxlabel, box: row }))
      return this.classifyStoredBoxes(ask, { world, boxes })
    })
  }

  protected async doGetBox(ask: BoxGetAsk): Promise<BoxStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [world, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask))])
      return this.classifyStoredBox(ask, { world, box })
    })
  }

  protected async doPutVault(ask: VaultPutAsk): Promise<VaultStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const vault  = await DB.rowAt(store, vaultScopepathOf(ask))
      const stored = this.classifyStoredVault(ask, { vault })
      if (DB.isWriteAct(stored.act)) { store.put(ask.record, vaultScopepathOf(ask)) }
      return stored
    })
    if (DB.isWriteAct(stored.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: ask.record } }]) }
    return stored
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [world, box, capacity] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask)), this.#roomIn(store, ask)])
      const stored = this.classifyStoredBox(ask, { world, box, capacity })
      if (DB.isWriteAct(stored.act)) { store.put(ask.record, boxScopepathOf(ask)) }
      return stored
    })
    if (DB.isWriteAct(stored.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: stored.world, box: ask.record } }]) }
    return stored
  }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const vault  = await DB.rowAt(store, vaultScopepathOf(ask))
      const stored = this.classifyStoredVault(ask, { vault })
      if (! DB.isWriteAct(stored.act)) { return stored }
      store.put(ask.record, vaultScopepathOf(ask))
      // A vault's boxes end with its life: nothing reads a box row of a life that is over.
      const boxes = await filedIn(store, lifeRangeOf({ ...scopeOf(ask), vault_tok: ask.expected.vault_tok }))
      for (const { scopepath } of boxes) { store.delete(scopepath) }
      return stored
    })
    if (DB.isWriteAct(stored.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: ask.record } }]) }
    return stored
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [world, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask))])
      const stored = this.classifyStoredBox(ask, { world, box })
      if (DB.isWriteAct(stored.act)) { store.put(ask.record, boxScopepathOf(ask)) }
      return stored
    })
    if (DB.isWriteAct(stored.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: stored.world, box: ask.record } }]) }
    return stored
  }

  protected async doTidyGone(ask: BoxTidyAsk): Promise<Tidied> {
    return await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vaults, boxes] = await Promise.all([filedIn(store, vaultsRangeOf(ask)), filedIn(store, bankBoxesRangeOf(ask))])
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
export function idbVaultDB(opts?: IdbVaultDBOpts): IdbVaultDB { return new IdbVaultDB(opts) }

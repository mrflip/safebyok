/** safebyok's vaultDB in this browser's IndexedDB. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  AdapterVaultDBOpts, BankScope, BoxClassified, BoxDelAsk, BoxesFetched, BoxGetAsk, BoxPutAsk, Capacity, Heard,
  RowOfVault, Tidied, VaultClassified, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultQuery, VaultScope, WatchScope,
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
const isHeardBy = (watched: WatchScope, scope: VaultScope): boolean => (
  (watched.applabel === scope.applabel) && (watched.user_id === scope.user_id) && ((watched.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
)

/** The vault scope alone of an ask or a row. */
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
  /** The room of the vault life `asked` names, under the soft cap `maxBoxes`: its count of box rows, live and deleted, taken inside the caller's transaction. */
  async #roomIn(store: IDBObjectStore, asked: VaultQuery): Promise<Capacity> {
    const used = await promisifyRequest(store.count(lifeRangeOf(asked)))
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }
  // --

  // == [Protected, the generic calls of AdapterVaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    const filed = await DB.inOneStep(this.#shelf, 'readonly', (store) => filedIn(store, vaultsRangeOf(scope)))
    return filed.map(({ scopepath, row }) => ({ vaultlabel: vaultlabelOf(scopepath), vault: row }))
  }

  // A get, put or del is one IndexedDB transaction: it fetches the rows, the classifier names what the ask comes to over them,
  // and where that is a write the ask's record is stored, all before the transaction ends.
  protected async doGetVault(ask: VaultGetAsk): Promise<VaultClassified> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => (
      this.classifyVault(ask, { vault: await DB.rowAt(store, vaultScopepathOf(ask)) })
    ))
  }

  protected async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [vault, filed] = await Promise.all([DB.rowAt(store, vaultScopepathOf(asked)), filedIn(store, lifeRangeOf(asked))])
      return { vault, boxes: filed.map(({ scopepath, row }) => ({ boxlabel: boxPlaceOf(scopepath).boxlabel, box: row })) }
    })
  }

  protected async doGetBox(ask: BoxGetAsk): Promise<BoxClassified> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [world, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask))])
      return this.classifyBox(ask, { world, box })
    })
  }

  protected async doPutVault(ask: VaultPutAsk): Promise<VaultClassified> {
    const classified = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const classified = this.classifyVault(ask, { vault: await DB.rowAt(store, vaultScopepathOf(ask)) })
      if (DB.isWriteAct(classified.act)) { store.put(ask.record, vaultScopepathOf(ask)) }
      return classified
    })
    if (DB.isWriteAct(classified.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: ask.record } }]) }
    return classified
  }

  protected async doPutBox(ask: BoxPutAsk): Promise<BoxClassified> {
    const classified = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [world, box, capacity] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask)), this.#roomIn(store, ask)])
      const classified = this.classifyBox(ask, { world, box, capacity })
      if (DB.isWriteAct(classified.act)) { store.put(ask.record, boxScopepathOf(ask)) }
      return classified
    })
    if (DB.isWriteAct(classified.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: classified.world, box: ask.record } }]) }
    return classified
  }

  protected async doDelVault(ask: VaultDelAsk): Promise<VaultClassified> {
    const classified = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const classified = this.classifyVault(ask, { vault: await DB.rowAt(store, vaultScopepathOf(ask)) })
      if (! DB.isWriteAct(classified.act)) { return classified }
      store.put(ask.record, vaultScopepathOf(ask))
      // A vault's boxes end with its life: nothing reads a box row of a life that is over.
      const boxes = await filedIn(store, lifeRangeOf({ ...scopeOf(ask), vault_tok: ask.expected.vault_tok }))
      for (const { scopepath } of boxes) { store.delete(scopepath) }
      return classified
    })
    if (DB.isWriteAct(classified.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: ask.record } }]) }
    return classified
  }

  protected async doDelBox(ask: BoxDelAsk): Promise<BoxClassified> {
    const classified = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [world, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask))])
      const classified = this.classifyBox(ask, { world, box })
      if (DB.isWriteAct(classified.act)) { store.put(ask.record, boxScopepathOf(ask)) }
      return classified
    })
    if (DB.isWriteAct(classified.act)) { this.#ring([{ scope: scopeOf(ask), heard: { vault: classified.world, box: ask.record } }]) }
    return classified
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

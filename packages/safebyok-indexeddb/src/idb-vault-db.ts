/** safebyok's vaultDB in this browser's IndexedDB, each generic call one IndexedDB transaction. */

import type { UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import type {
  BankScope, BoxesFetched, BoxFetched, BoxLanding, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Heard, Landing, PutOptsGiven,
  RowOfVault, Tidied, VaultDBOpts, VaultQuery, VaultRecord, VaultScope, VaultTombstone, WatchScope,
} from 'safebyok/storage'
import { bankBoxesRangeOf, boxPlaceOf, boxScopepathOf, filedIn, inOneStep, lifeRangeOf, rowAt, shelfOf, vaultlabelOf, vaultScopepathOf, vaultsRangeOf } from './shelf'

// == [Options]: IdbVaultDBOpts, idbVaultDBOpts

/** What an IdbVaultDB is made with: the VaultDB's own options, and `dbName`, the name its database is made under ('safebyok' if left out). */
export type IdbVaultDBOpts = VaultDBOpts & { dbName?: string | undefined }

const idbVaultDBOpts = DB.objCheck(({ str }) => ({ ...DB.vaultDBOpts.shape, dbName: str.min(1).optional() }), 'bad_option')
// --

// == [Helpers]: Rung, isPutAllowed, isHeardBy

/** What a write tells every watch on its database: the scope it wrote under, and the rows a watch hears. */
type Rung = { scope: VaultScope, heard: Heard }

/** True when a put under `opts` may land over `ante`, the row it would replace. */
const isPutAllowed = (ante: unknown, { prior, ifAbsent, ifPresent }: PutOptsGiven): boolean => (
  DB.isRowAt(ante, prior) && (DB.isLiveRow(ante) ? (ifPresent === 'repl') : (ifAbsent === 'add'))
)

/** True when a watch on `watched` hears a write under `scope`. */
const isHeardBy = (watched: WatchScope, scope: VaultScope): boolean => (
  (watched.applabel === scope.applabel) && (watched.user_id === scope.user_id) && ((watched.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
)
// --

/** A vaultDB that keeps a vault's rows, ciphertext and unencrypted fields, in this browser's IndexedDB; a watch hears every tab's writes. */
export class IdbVaultDB extends DB.VaultDB {
  // == [Props]: #shelf, #bellname

  readonly #shelf: UseStore
  readonly #bellname: string
  // --

  // == [Construction]: constructor

  constructor(opts: IdbVaultDBOpts = {}) {
    const { dbName = 'safebyok', ...vaultDBOpts } = idbVaultDBOpts.parse(opts, { where: "In IdbVaultDB's options" })
    super(vaultDBOpts)
    this.#shelf = shelfOf(dbName)
    this.#bellname = `safebyok-indexeddb:${dbName}`
  }
  // --

  // == [Protected, the generic calls of VaultDB]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone, doWatch

  protected async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    const filed = await inOneStep(this.#shelf, 'readonly', (store) => filedIn(store, vaultsRangeOf(scope)))
    return filed.map(({ scopepath, row }) => ({ vaultlabel: vaultlabelOf(scopepath), vault: row }))
  }

  protected async doGetVault(scope: VaultScope): Promise<unknown> {
    return await inOneStep(this.#shelf, 'readonly', (store) => rowAt(store, vaultScopepathOf(scope)))
  }

  protected async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    return await inOneStep(this.#shelf, 'readonly', async (store) => {
      const [vault, filed] = await Promise.all([rowAt(store, vaultScopepathOf(asked)), filedIn(store, lifeRangeOf(asked))])
      return { vault, boxes: filed.map(({ scopepath, row }) => ({ boxlabel: boxPlaceOf(scopepath).boxlabel, box: row })) }
    })
  }

  protected async doGetBox(asked: BoxQuery): Promise<BoxFetched> {
    return await inOneStep(this.#shelf, 'readonly', async (store) => {
      const [vault, box] = await Promise.all([rowAt(store, vaultScopepathOf(asked)), rowAt(store, boxScopepathOf(asked))])
      return { vault, box }
    })
  }

  protected async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Landing> {
    const landing = await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const ante = await rowAt(store, vaultScopepathOf(record))
      const landed = isPutAllowed(ante, opts)
      if (landed) { store.put(record, vaultScopepathOf(record)) }
      return { landed, ante }
    })
    if (landing.landed) { this.#ring([{ scope: record, heard: { vault: record } }]) }
    return landing
  }

  protected async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxLanding> {
    const landing = await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vault, ante] = await Promise.all([rowAt(store, vaultScopepathOf(record)), rowAt(store, boxScopepathOf(record))])
      const landed = DB.isCheckedLiveVault(vault, record.vault_tok) && isPutAllowed(ante, opts)
      if (landed) { store.put(record, boxScopepathOf(record)) }
      return { landed, ante, vault }
    })
    if (landing.landed) { this.#ring([{ scope: record, heard: { vault: landing.vault, box: record } }]) }
    return landing
  }

  protected async doDelVault(tombstone: VaultTombstone, { prior }: DelOpts): Promise<Landing> {
    const { landing, rungs } = await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const ante = await rowAt(store, vaultScopepathOf(tombstone))
      const isOurs = DB.isLiveRowUnder(ante, tombstone.vault_tok)
      const isDamaged = (ante !== null) && (! DB.vaultRow.safeParse(ante).success)
      const landed = (isOurs && DB.isRowAt(ante, prior)) || DB.isDamagedVaultAt(ante, tombstone, prior)
      // A live row of this life, or damage, that the tombstone does not name stops the del whole; any other row lets a repeat sweep the boxes.
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
    const landing = await inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [vault, ante] = await Promise.all([rowAt(store, vaultScopepathOf(tombstone)), rowAt(store, boxScopepathOf(tombstone))])
      const isDeletable = (DB.isLiveRow(ante) && DB.isRowAt(ante, prior)) || DB.isDamagedBoxAt(ante, tombstone, prior)
      const landed = DB.isCheckedLiveVault(vault, tombstone.vault_tok) && isDeletable
      if (landed) { store.put(tombstone, boxScopepathOf(tombstone)) }
      return { landed, ante, vault }
    })
    if (landing.landed) { this.#ring([{ scope: tombstone, heard: { vault: landing.vault, box: tombstone } }]) }
    return landing
  }

  protected async doTidyGone(scope: BankScope): Promise<Tidied> {
    return await inOneStep(this.#shelf, 'readwrite', async (store) => {
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

/** A vaultDB in this browser's IndexedDB, for an app with no backend; give two the same `dbName` and they share one database. */
export const idbVaultDB = (opts?: IdbVaultDBOpts): IdbVaultDB => new IdbVaultDB(opts)

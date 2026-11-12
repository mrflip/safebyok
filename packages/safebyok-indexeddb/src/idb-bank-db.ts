/** safebyok's bankDB in this browser's IndexedDB. */

import { promisifyRequest, type UseStore } from 'idb-keyval'
import * as DB from 'safebyok/storage'
import { BX } from 'safebyok/storage'
import type { BankScope, VaultScope, WatchScope } from 'safebyok/storage'
import { bankScopepathOf, boxesRangeOf, boxPlaceOf, boxScopepathOf, filedIn, gatesRangeOf, gateScopepathOf, lifeRangeOf, shelfOf, vaultlabelOf, vaultScopepathOf, vaultsRangeOf } from './bank-shelf'

// == [Options]: IdbBankDBOpts, idbBankDBOpts

/** Options for an IdbBankDB: the AdapterBankDB's options, plus
 * - `dbName`   -- the name the IndexedDB database is made under, after `safebyok-` (default: `'safebyok'`)
 * - `maxBoxes` -- a soft cap on the box rows of one vault life, live and deleted together (default: the core's `DefaultMaxBoxes`)
 */
export type IdbBankDBOpts = BX.AdapterBankDBOpts & { dbName?: string | undefined, maxBoxes?: number | undefined }

const idbBankDBOpts = DB.objCheck(({ str, uint }) => ({ ...BX.adapterBankDBOpts.shape, dbName: str.min(1).optional(), maxBoxes: uint.optional() }), 'bad_option')
// --

// == [Helpers]: Rung, isHeardBy, bankScopeOf, vaultScopeOf

/** A notice of one write, broadcast to every watch on the database: the scope written under, and the row written. A bank or gate row has no vaultlabel. */
type Rung = { scope: BankScope & { vaultlabel?: string }, heard: BX.Heard }

/** True when a write under `scope` falls within the `watched` scope. */
function isHeardBy(watched: WatchScope, scope: Rung['scope']): boolean {
  return (watched.user_id === scope.user_id) && (watched.banklabel === scope.banklabel) && ((watched.vaultlabel ?? scope.vaultlabel) === scope.vaultlabel)
}

/** The bank scope of an ask or a row, without its other fields. */
function bankScopeOf({ user_id, banklabel }: BankScope): BankScope { return { user_id, banklabel } }

/** The vault scope of an ask or a row, without its other fields. */
function vaultScopeOf({ user_id, banklabel, vaultlabel }: VaultScope): VaultScope { return { user_id, banklabel, vaultlabel } }
// --

/** A bankDB stored in this browser's IndexedDB. Its watch reports writes from every tab. */
export class IdbBankDB extends DB.AdapterBankDB {
  // == [Props]: #shelf, #bellname, #maxBoxes

  readonly #shelf: UseStore
  readonly #bellname: string
  readonly #maxBoxes: number
  // --

  // == [Construction]: constructor

  constructor(opts: IdbBankDBOpts = {}) {
    const { dbName = 'safebyok', maxBoxes = DB.DefaultMaxBoxes, ...adapterBankDBOpts } = idbBankDBOpts.parse(opts, { where: "In IdbBankDB's options" })
    super(adapterBankDBOpts)
    this.#shelf = shelfOf(dbName)
    // A name of its own: an IdbVaultDB over the same dbName rings on `safebyok-indexeddb:<dbName>`, with notices of another shape.
    this.#bellname = `safebyok-indexeddb:${dbName}:bank`
    this.#maxBoxes = maxBoxes
  }
  // --

  // == [Room]: #roomIn

  // Best effort, not a hard cap: exact at moderate write rates; a strict cap would need concurrency machinery in every adapter.
  /** The capacity of the vault life `life` names, by its `bank_tok` and `vault_tok`: its box rows, live and deleted, counted in the caller's transaction, against the soft cap `maxBoxes`. */
  async #roomIn(store: IDBObjectStore, life: BX.BoxQuery): Promise<DB.Capacity> {
    const used = await promisifyRequest(store.count(lifeRangeOf(life)))
    return { boxes: { used, max: this.#maxBoxes }, bytes: { used: 0, max: Infinity } }
  }
  // --

  // == [Protected, the generic calls of AdapterBankDB]: doEnsureBank, doBuildBank, doPutGate, doDelBank, doGetVault, doPutVault, doDelVault, doListBoxes, doGetBox, doPutBox, doDelBox, doTidyGone, doWatch

  // Each call is one IndexedDB transaction. It fetches the rows, classifies the ask against them, and, if the classifier finds a
  // write, stores the ask's record before the transaction ends.
  protected async doEnsureBank(ask: BX.BankEnsureAsk): Promise<BX.BankEnsureStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [bank, gate, filed] = await Promise.all([
        DB.rowAt(store, bankScopepathOf(ask)), DB.rowAt(store, gateScopepathOf({ ...ask, gatelabel: 'main' })), filedIn(store, vaultsRangeOf(ask)),
      ])
      const vaults = filed.map(({ scopepath, row }) => ({ vaultlabel: vaultlabelOf(scopepath), vault: row }))
      return this.classifyEnsureBank(ask, { bank, gate, vaults })
    })
  }

  protected async doBuildBank(ask: BX.BankBuildAsk): Promise<BX.BankBuildStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [bank, gate] = await Promise.all([DB.rowAt(store, bankScopepathOf(ask)), DB.rowAt(store, gateScopepathOf({ ...ask, gatelabel: 'main' }))])
      const stored = this.classifyBuildBank(ask, { bank, gate })
      if (BX.isWriteAct(stored.act)) {
        store.put(ask.record, bankScopepathOf(ask))
        store.put(ask.gate, gateScopepathOf(ask.gate))
      }
      return stored
    })
    if (BX.isWriteAct(stored.act)) {
      this.#ring([{ scope: bankScopeOf(ask), heard: { row: ask.record } }, { scope: bankScopeOf(ask), heard: { row: ask.gate, parent: ask.record } }])
    }
    return stored
  }

  protected async doPutGate(ask: BX.GatePutAsk): Promise<BX.GateStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [bank, gate] = await Promise.all([DB.rowAt(store, bankScopepathOf(ask)), DB.rowAt(store, gateScopepathOf(ask))])
      const stored = this.classifyStoredGate(ask, { bank, gate })
      if (BX.isWriteAct(stored.act)) { store.put(ask.record, gateScopepathOf(ask)) }
      return stored
    })
    if (BX.isWriteAct(stored.act)) { this.#ring([{ scope: bankScopeOf(ask), heard: { row: ask.record, parent: stored.parent } }]) }
    return stored
  }

  protected async doDelBank(ask: BX.BankDelAsk): Promise<BX.BankDelStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const bank   = await DB.rowAt(store, bankScopepathOf(ask))
      const stored = this.classifyDelBank(ask, { bank })
      if (BX.isWriteAct(stored.act)) {
        store.put(ask.record, bankScopepathOf(ask))
        // A bank's gates, vaults and boxes end with its life: nothing under it outlives the bank row.
        for (const range of [gatesRangeOf(ask), vaultsRangeOf(ask), boxesRangeOf(ask)]) { store.delete(range) }
      }
      return stored
    })
    if (BX.isWriteAct(stored.act)) { this.#ring([{ scope: bankScopeOf(ask), heard: { row: ask.record } }]) }
    return stored
  }

  protected async doGetVault(ask: BX.VaultGetAsk): Promise<BX.VaultStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [bank, vault] = await Promise.all([DB.rowAt(store, bankScopepathOf(ask)), DB.rowAt(store, vaultScopepathOf(ask))])
      return this.classifyStoredVault(ask, { bank, vault })
    })
  }

  protected async doPutVault(ask: BX.VaultPutAsk): Promise<BX.VaultStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [bank, vault] = await Promise.all([DB.rowAt(store, bankScopepathOf(ask)), DB.rowAt(store, vaultScopepathOf(ask))])
      const stored = this.classifyStoredVault(ask, { bank, vault })
      if (BX.isWriteAct(stored.act)) { store.put(ask.record, vaultScopepathOf(ask)) }
      return stored
    })
    if (BX.isWriteAct(stored.act)) { this.#ring([{ scope: vaultScopeOf(ask), heard: { row: ask.record, parent: stored.parent } }]) }
    return stored
  }

  protected async doDelVault(ask: BX.VaultDelAsk): Promise<BX.VaultStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [bank, vault] = await Promise.all([DB.rowAt(store, bankScopepathOf(ask)), DB.rowAt(store, vaultScopepathOf(ask))])
      const stored = this.classifyStoredVault(ask, { bank, vault })
      if (BX.isWriteAct(stored.act)) {
        store.put(ask.record, vaultScopepathOf(ask))
        // A vault's boxes end with its life: no call fetches a box row from a life that is over.
        store.delete(lifeRangeOf({ ...ask, vault_tok: ask.expected.vault_tok }))
      }
      return stored
    })
    if (BX.isWriteAct(stored.act)) { this.#ring([{ scope: vaultScopeOf(ask), heard: { row: ask.record, parent: stored.parent } }]) }
    return stored
  }

  protected async doListBoxes(ask: BX.BoxListAsk): Promise<BX.BoxesStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [parent, filed] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), filedIn(store, lifeRangeOf(ask))])
      const boxes = filed.map(({ scopepath, row }) => ({ boxlabel: boxPlaceOf(scopepath).boxlabel, box: row }))
      return this.classifyStoredBoxes(ask, { parent, boxes })
    })
  }

  protected async doGetBox(ask: BX.BoxGetAsk): Promise<BX.BoxStored> {
    return await DB.inOneStep(this.#shelf, 'readonly', async (store) => {
      const [parent, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask))])
      return this.classifyStoredBox(ask, { parent, box })
    })
  }

  protected async doPutBox(ask: BX.BoxPutAsk): Promise<BX.BoxStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [parent, box, capacity] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask)), this.#roomIn(store, ask)])
      const stored = this.classifyStoredBox(ask, { parent, box, capacity })
      if (BX.isWriteAct(stored.act)) { store.put(ask.record, boxScopepathOf(ask)) }
      return stored
    })
    if (BX.isWriteAct(stored.act)) { this.#ring([{ scope: vaultScopeOf(ask), heard: { row: ask.record, parent: stored.parent } }]) }
    return stored
  }

  protected async doDelBox(ask: BX.BoxDelAsk): Promise<BX.BoxStored> {
    const stored = await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [parent, box] = await Promise.all([DB.rowAt(store, vaultScopepathOf(ask)), DB.rowAt(store, boxScopepathOf(ask))])
      const stored = this.classifyStoredBox(ask, { parent, box })
      if (BX.isWriteAct(stored.act)) { store.put(ask.record, boxScopepathOf(ask)) }
      return stored
    })
    if (BX.isWriteAct(stored.act)) { this.#ring([{ scope: vaultScopeOf(ask), heard: { row: ask.record, parent: stored.parent } }]) }
    return stored
  }

  // The rows are trusted to be rows: a row damaged inside the datastore is out of scope.
  protected async doTidyGone(ask: DB.BoxTidyAsk): Promise<BX.Tidied> {
    return await DB.inOneStep(this.#shelf, 'readwrite', async (store) => {
      const [bankRaw, vaults, boxes] = await Promise.all([DB.rowAt(store, bankScopepathOf(ask)), filedIn(store, vaultsRangeOf(ask)), filedIn(store, boxesRangeOf(ask))])
      const bank = bankRaw as BX.BankRow | null
      const bank_tok = (bank?.am === 'a') ? bank.bank_tok : null
      const vaultOfLabel = new Map<string, BX.VaultRow>()
      for (const { scopepath, row } of vaults) {
        const vault = row as BX.VaultRow
        if (vault.bank_tok === bank_tok) { vaultOfLabel.set(vaultlabelOf(scopepath), vault) } else { store.delete(scopepath) }
      }
      let totalCount = 0
      for (const { scopepath } of boxes) {
        const { vaultlabel, ...tokpair } = boxPlaceOf(scopepath)
        const vault = vaultOfLabel.get(vaultlabel)
        if ((vault === undefined) || (vault.am === 'x') || (BX.vaultLifeOf(vault) !== BX.vaultLifeOf(tokpair))) { store.delete(scopepath) } else { totalCount += 1 }
      }
      return { totalCount }
    })
  }

  protected override doWatch(scope: WatchScope, hear: (heard: BX.Heard) => void): () => void {
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
    const channel = new BroadcastChannel(this.#bellname)
    for (const rung of rungs) { channel.postMessage(rung) }
    channel.close()
  }
  // --
}

/** Make an {@link IdbBankDB}: a bankDB in this browser's IndexedDB, for an app with no backend. */
export function idbBankDB(opts?: IdbBankDBOpts): IdbBankDB { return new IdbBankDB(opts) }

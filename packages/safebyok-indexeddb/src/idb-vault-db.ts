import { Expectations, Refusals, Scopepath, VaultDB } from 'safebyok'
import type { VaultRecordExpectation, VaultDelExpectation, BoxRecord, BoxGetExpectation, BoxExpectation, BoxDelExpectation, BoxDeletion, StoredBox, StoredVault, VaultRecord, VaultScope } from 'safebyok'
import { ChangeBell } from 'safebyok/idb'
import { boxRange } from './box-range'
import { bellnameOf, parseDbName, type IdbVaultDBOpts } from './idb-opts'
import { inOneTransaction, settle, withheldShelfOf } from './shelf'

/** safebyok's storage in this browser's IndexedDB: a VaultDB for an app with no backend.
 * It keeps on this device the rows a synced backend would hold, so whispers are encrypted at rest
 * all the same. Nothing syncs. Nothing is opened until the first read or write.
 *
 * * **Each verb is one IndexedDB transaction**: a write lands only while what it expects stands,
 *   even with another tab writing at the same moment, and `getVault` reads the vault record and
 *   every box with no write between.
 * * **Other tabs' writes** ring `subscribe`, over a BroadcastChannel.
 * * **No limits of its own**: the four `max*` limits are `Infinity`, and the origin's storage quota
 *   bounds the whole database. `getCapacity` weighs each box as the UTF-8 bytes of its JSON.
 * * **Storage the browser withholds** refuses with kind `storage_blocked`, which a retry cannot
 *   mend: site data blocked, a private window or frame that keeps none, no room left, no IndexedDB.
 *
 * Browser storage is best-effort: the browser may evict it under pressure, and "clear site data"
 * removes it. An app keeping its vaults here should call `navigator.storage.persist()`, and tell
 * the user plainly that the vault lives only in this browser.
 *
 * @returns The VaultDB, to hand `Bank.make`. Kind 'bad_option' for a `dbName` that is not non-empty text.
 *
 * @example
 *   const vaultDB = idbVaultDB({ dbName: 'acme' })   // once, at module level
 *   const bank = Bank.make({ applabel: 'acme', user_id: session.user_id, vaultDB, ...browserOpts({ dbName: 'acme' }) })   // as the user signs in
 *   const vault = await bank.ensureVault({ vaultlabel: 'main' })
 */
export const idbVaultDB = (opts?: IdbVaultDBOpts): VaultDB => new IdbVaultDB(parseDbName(opts, 'idbVaultDB'), opts)

class IdbVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxBoxes = Infinity
  readonly maxNameBytes = Infinity

  private readonly dbName: string

  constructor(dbName: string, opts: IdbVaultDBOpts | undefined) {
    super(opts ?? {})
    this.dbName = dbName
  }

  private get shelf() { return withheldShelfOf(this.dbName) }

  // The vault record and the scope's boxes are read in one transaction: no other tab's write lands
  // between them.
  protected async doGetVault(scope: VaultScope): Promise<StoredVault> {
    return await this.shelf('readonly', (store) => vaultIn(store, scope))
  }

  // A tombstone in the vault record's row is no vault: a new life takes its place with the counter carried on.
  protected async doEnsureVault(draft: VaultRecord & { gate: null }): Promise<StoredVault> {
    const { ensured, created } = await inOneTransaction(this.shelf, async (store) => {
      const vaultScopepath = Scopepath.vault(draft)
      const life = Expectations.newLifeOf(draft, await rowAt(store, vaultScopepath))
      if (life) { store.put(life, vaultScopepath) }
      return { ensured: await vaultIn(store, draft), created: life !== null }
    })
    if (created) { this.ring() }
    return ensured
  }

  // The props stored are the row as the put left it, read in the same transaction; a write that
  // misses is refused from the row its transaction read, once that has ended.
  protected async doPutVaultRecord(vaultRecord: VaultRecord, expected: VaultRecordExpectation): Promise<unknown> {
    const { refusal, stored } = await inOneTransaction(this.shelf, async (store) => {
      const vaultScopepath = Scopepath.vault(vaultRecord)
      const standing = await rowAt(store, vaultScopepath)
      const missed = Expectations.vaultRecordRefusalOf(standing, expected)
      if (missed) { return { refusal: missed, stored: null } }
      store.put(Expectations.vaultRecordPutOf(vaultRecord, standing), vaultScopepath)
      return { refusal: null, stored: await rowAt(store, vaultScopepath) }
    })
    if (refusal) { throw refusal }
    this.ring()
    return stored
  }

  // The vault record and the box are read in one transaction; a read whose vault record is not the
  // ones expected is refused from that transaction's rows, once it has ended.
  protected async doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown> {
    const [standingVaultRecord, standingBox] = await this.shelf('readonly', (store) => (
      Promise.all([rowAt(store, Scopepath.vault(scope)), rowAt(store, Scopepath.box({ ...scope, boxlabel }))])
    ))
    if (! Expectations.vaultMeets(standingVaultRecord, expected)) { throw Refusals.vaultMismatch() }
    return standingBox ?? null
  }

  // The box handed back is the row as the put left it, read in the same transaction; a write that
  // misses is refused from the rows that transaction read, once it has ended, writing nothing.
  protected async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    const { refusal, stored } = await inOneTransaction(this.shelf, async (store) => {
      const boxScopepath = Scopepath.box({ ...scope, boxlabel: box.boxlabel })
      const [standingVaultRecord, standingBox] = await Promise.all([rowAt(store, Scopepath.vault(scope)), rowAt(store, boxScopepath)])
      const missed = Expectations.boxRefusalOf(standingVaultRecord, standingBox, expected)
      if (missed) { return { refusal: missed, stored: null } }
      store.put(box, boxScopepath)
      return { refusal: null, stored: await rowAt(store, boxScopepath) }
    })
    if (refusal) { throw refusal }
    this.ring()
    return stored
  }

  // Counted and weighed in one transaction over the scope's key range: each row as its JSON, in
  // UTF-8 bytes, against no limit, as IndexedDB keeps none.
  protected async doGetCapacity(scope: VaultScope): Promise<unknown> {
    const rows = await this.shelf('readonly', (store) => settle<unknown[]>(store.getAll(boxRange(scope))))
    const bytesUsed = rows.reduce<number>((sum, row) => sum + new TextEncoder().encode(JSON.stringify(row)).length, 0)
    return { boxes: { used: rows.length, max: this.maxBoxes }, bytes: { used: bytesUsed, max: this.maxVaultBytes } }
  }

  // What it removed is the row read in the transaction that deletes it. A deletion that found
  // nothing to remove changed nothing, and rings no other tab.
  protected async doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<BoxDeletion | null> {
    const deletion = await inOneTransaction(this.shelf, async (store) => {
      const boxScopepath = Scopepath.box({ ...scope, boxlabel })
      const [standingVaultRecord, standingBox] = await Promise.all([rowAt(store, Scopepath.vault(scope)), rowAt(store, boxScopepath)])
      if (! Expectations.vaultMeets(standingVaultRecord, expected)) { return null }
      store.delete(boxScopepath)
      return Expectations.deletionOf(standingBox, expected)
    })
    if (deletion !== null && deletion.outcome !== 'absent') { this.ring() }
    return deletion
  }

  // The look at the vault record, the deletion of the boxes (by their key range) and the tombstone
  // laid in the place of the vault record are one transaction: a box another tab writes waits for
  // the delete and then finds no vault record, so no box outlives its vault.
  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const vaultScopepath = Scopepath.vault(scope)
      const tombstone = Expectations.tombstoneOf(await rowAt(store, vaultScopepath), scope, expected)
      if (tombstone === null) { return null }
      store.delete(boxRange(scope))
      store.put(tombstone, vaultScopepath)
      return await rowAt(store, vaultScopepath)
    }))
  }

  // Rings on every write to the shelf, not only ones in scope: a spurious refresh is harmless.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
    return ChangeBell.listen(bellnameOf(this.dbName), onChange)
  }

  private ring() { ChangeBell.ring(bellnameOf(this.dbName)) }

  /** `landed`, ringing the bell unless it is `false` or `null`, a write that did not land. */
  private ringIfLanded<LandedT>(landed: LandedT): LandedT {
    if (landed !== false && landed !== null) { this.ring() }
    return landed
  }
}

/** The vault of `scope` as stored, its vault record (null for none) and every box, read in the transaction `store` belongs to. */
const vaultIn = async (store: IDBObjectStore, scope: VaultScope): Promise<StoredVault> => {
  const range = boxRange(scope)
  const [vaultRecord, ckeys, rows] = await Promise.all([rowAt(store, Scopepath.vault(scope)), settle(store.getAllKeys(range)), settle<unknown[]>(store.getAll(range))])
  return { vaultProps: vaultRecord ?? null, boxes: storedBoxesOf(ckeys, rows) }
}

/** The scope's boxes from the keys and rows of its key range, read together: each under the boxlabel its scopepath names.
 * A row under a key that is no box's scopepath holds no box a verb can reach, and is passed over.
 */
const storedBoxesOf = (ckeys: IDBValidKey[], rows: unknown[]): StoredBox[] => (
  ckeys
    .map((ckey, idx) => ({ ckey, box: rows[idx] }))
    .filter((stored): stored is { ckey: Scopepath.BoxScopepath, box: unknown } => Scopepath.isBox(stored.ckey))
    .map(({ ckey, box }) => ({ boxlabel: Scopepath.boxscope(ckey).boxlabel, box }))
)

/** The row at `scopepath`, read in the transaction `store` belongs to, or undefined for none. */
const rowAt = (store: IDBObjectStore, scopepath: string): Promise<unknown> => settle<unknown>(store.get(scopepath))

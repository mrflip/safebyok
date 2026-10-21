import { Ckeys, Expectations, VaultDB } from 'safebyok'
import type { VaultPropsExpectation, VaultDelExpectation, BoxRecord, BoxExpectation, BoxDelExpectation, BoxDeletion, StoredBox, VaultProps, VaultScope } from 'safebyok'
import { ChangeBell } from 'safebyok/idb'
import { boxRange } from './ckeys'
import { bellnameOf, parseDbName, type IdbVaultDBOpts } from './idb-opts'
import { inOneTransaction, settle, withheldShelfOf } from './shelf'

/** safebyok's storage in this browser's IndexedDB: a VaultDB for an app with no backend.
 * It keeps on this device the rows a synced backend would hold, so whispers are encrypted at rest
 * all the same. Nothing syncs. Nothing is opened until the first read or write.
 *
 * * **Each verb is one IndexedDB transaction**: a write lands only while what it expects stands,
 *   even with another tab writing at the same moment.
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
 * @returns The VaultDB, to hand `Vault.make`. Kind 'bad_option' for a `dbName` that is not non-empty text.
 *
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB: idbVaultDB({ dbName: 'acme' }), ...browserOpts({ dbName: 'acme' }) })
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

  protected async doGetVaultProps(scope: VaultScope): Promise<unknown> {
    return (await this.shelf('readonly', (store) => rowAt(store, Ckeys.vaultProps(scope)))) ?? null
  }

  protected async doEnsureVaultProps(vaultProps: VaultProps): Promise<unknown> {
    const { standing, created } = await inOneTransaction(this.shelf, async (store) => {
      const already = await rowAt(store, Ckeys.vaultProps(vaultProps))
      if (already !== undefined) { return { standing: already, created: false } }
      store.put(vaultProps, Ckeys.vaultProps(vaultProps))
      return { standing: vaultProps, created: true }
    })
    if (created) { this.ring() }
    return standing
  }

  protected async doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, Ckeys.vaultProps(vaultProps))
      if (! Expectations.vaultPropsMeets(standing, expected)) { return false }
      store.put(vaultProps, Ckeys.vaultProps(vaultProps))
      return true
    }))
  }

  protected async doGetBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return (await this.shelf('readonly', (store) => rowAt(store, Ckeys.box(scope, boxlabel)))) ?? null
  }

  // Reads the key range of the scope's boxes, not the whole shelf: every other vault's rows, of
  // every user in this database, stay unread. The ckeys and their rows come from one transaction.
  protected async doListBoxes(scope: VaultScope): Promise<StoredBox[]> {
    const range = boxRange(scope)
    const [ckeys, rows] = await this.shelf('readonly', (store) => Promise.all([settle(store.getAllKeys(range)), settle<unknown[]>(store.getAll(range))]))
    return ckeys
      .map((ckey, idx) => ({ boxlabel: typeof ckey === 'string' ? Ckeys.boxlabelOf(ckey) : null, box: rows[idx] }))
      .filter((stored): stored is StoredBox => stored.boxlabel !== null)
  }

  // The box handed back is the row as the put left it, read in the same transaction; a write that
  // misses is refused from the rows that transaction read, once it has ended, writing nothing.
  protected async doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    const { refusal, stored } = await inOneTransaction(this.shelf, async (store) => {
      const ckey = Ckeys.box(scope, box.boxlabel)
      const [standingVaultProps, standingBox] = await Promise.all([rowAt(store, Ckeys.vaultProps(scope)), rowAt(store, ckey)])
      const missed = Expectations.boxRefusalOf(standingVaultProps, standingBox, expected)
      if (missed) { return { refusal: missed, stored: null } }
      store.put(box, ckey)
      return { refusal: null, stored: await rowAt(store, ckey) }
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
      const ckey = Ckeys.box(scope, boxlabel)
      const [standingVaultProps, standingBox] = await Promise.all([rowAt(store, Ckeys.vaultProps(scope)), rowAt(store, ckey)])
      if (! Expectations.vaultMeets(standingVaultProps, expected)) { return null }
      store.delete(ckey)
      return Expectations.deletionOf(standingBox, expected)
    })
    if (deletion !== null && deletion.outcome !== 'absent') { this.ring() }
    return deletion
  }

  // The look at the vault props and every deletion (the boxes by their key range, then the
  // vault props) are one transaction: a box another tab writes waits for the delete and then
  // finds no vault props, so no box outlives its vault.
  protected async doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, Ckeys.vaultProps(scope))
      if (! Expectations.vaultTokMeets(standing, expected)) { return false }
      store.delete(boxRange(scope))
      store.delete(Ckeys.vaultProps(scope))
      return true
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

/** The row at `ckey`, read in the transaction `store` belongs to, or undefined for none. */
const rowAt = (store: IDBObjectStore, ckey: string): Promise<unknown> => settle<unknown>(store.get(ckey))

import { Ckeys, Expectations, VaultDB } from 'safebyok'
import type { VaultPropsExpectation, RetireExpectation, Lockbox, LockboxExpectation, LockboxRetireExpectation, LockboxRetirement, StoredLockbox, VaultProps, VaultScope } from 'safebyok'
import { ChangeBell } from 'safebyok/idb'
import { boxRange } from './ckeys'
import { bellnameOf, parseDbName, type IdbVaultDBOpts } from './idb-opts'
import { inOneTransaction, settle, withheldShelfOf } from './shelf'

/**
 * safebyok's storage in this browser's IndexedDB: a VaultDB for an app with no backend, keeping
 * everything a synced backend would hold on this device instead, so its whispers are encrypted
 * at rest all the same. Nothing syncs, but the rows are exactly what a backend would store, and
 * every secret field in them is ciphertext.
 *
 * * **Every verb is one IndexedDB transaction**: a write lands only while what it expects still
 *   stands, even with another tab writing at the same moment, and refuses with kind
 *   `stale_write` otherwise.
 * * **Other tabs' writes** ring `subscribe`, over a BroadcastChannel.
 * * **No limits of its own**: IndexedDB sets none per record or per vault, so `maxRecordBytes`,
 *   `maxVaultBytes`, `maxLockboxes` and `maxNameBytes` are `Infinity`; the origin's storage quota
 *   bounds the whole database.
 * * **Storage the browser withholds** -- site data blocked, a private window or frame that keeps
 *   none, no room left, or no IndexedDB at all -- refuses with kind `storage_blocked`, which a
 *   retry cannot mend; any other trouble from IndexedDB, with kind `storage_unavailable`.
 * * **Names joined on `^`** in each row's ckey (the core's `Ckeys`), which the floor keeps out of
 *   every name.
 *
 * Browser storage is best-effort: the browser may evict it under pressure, and "clear site data"
 * removes it. An app keeping its vaults here should call `navigator.storage.persist()`, and say
 * plainly that the vault lives only in this browser.
 *
 * @param opts - Where to keep the records: `dbName`, default 'safebyok'; and optionally a
 *   `logger`, the default logger without one (a vault opened with no logger of its own hears it too).
 * @returns The VaultDB, to hand `Vault.make`. Kind 'bad_option' for a `dbName` that is not
 *   non-empty text, or a `logger` that is not a VaultLogger. Nothing is opened until the first read or write.
 *
 * @example
 *   const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB: idbVaultDB({ dbName: 'acme' }), ...browserOpts({ dbName: 'acme' }) })
 */
export const idbVaultDB = (opts?: IdbVaultDBOpts): VaultDB => new IdbVaultDB(parseDbName(opts, 'idbVaultDB'), opts)

class IdbVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes = Infinity
  readonly maxNameBytes = Infinity

  private readonly dbName: string

  constructor(dbName: string, opts: IdbVaultDBOpts | undefined) {
    super(opts ?? {})
    this.dbName = dbName
  }

  private get shelf() { return withheldShelfOf(this.dbName) }

  protected async doReadVaultProps(scope: VaultScope): Promise<unknown> {
    return (await this.shelf('readonly', (store) => rowAt(store, Ckeys.vaultProps(scope)))) ?? null
  }

  protected async doFetchOrCreateVaultProps(vaultProps: VaultProps): Promise<unknown> {
    const { standing, created } = await inOneTransaction(this.shelf, async (store) => {
      const already = await rowAt(store, Ckeys.vaultProps(vaultProps))
      if (already !== undefined) { return { standing: already, created: false } }
      store.put(vaultProps, Ckeys.vaultProps(vaultProps))
      return { standing: vaultProps, created: true }
    })
    if (created) { this.ring() }
    return standing
  }

  protected async doUpdateVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, Ckeys.vaultProps(vaultProps))
      if (! Expectations.vaultPropsMeets(standing, expected)) { return false }
      store.put(vaultProps, Ckeys.vaultProps(vaultProps))
      return true
    }))
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return (await this.shelf('readonly', (store) => rowAt(store, Ckeys.box(scope, boxlabel)))) ?? null
  }

  // Reads the key range of the scope's lockboxes, not the whole shelf: every other vault's rows, of
  // every user in this database, stay unread. The ckeys and their rows come from one transaction.
  protected async doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    const range = boxRange(scope)
    const [ckeys, rows] = await this.shelf('readonly', (store) => Promise.all([settle(store.getAllKeys(range)), settle<unknown[]>(store.getAll(range))]))
    return ckeys
      .map((ckey, idx) => ({ boxlabel: typeof ckey === 'string' ? Ckeys.boxlabelOf(ckey) : null, lockbox: rows[idx] }))
      .filter((stored): stored is StoredLockbox => stored.boxlabel !== null)
  }

  // The lockbox handed back is the row as the put left it, read in the same transaction.
  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<unknown> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const ckey = Ckeys.box(scope, lockbox.boxlabel)
      const [standingVaultProps, standingBox] = await Promise.all([rowAt(store, Ckeys.vaultProps(scope)), rowAt(store, ckey)])
      if (! Expectations.lockboxMeets(standingVaultProps, standingBox, expected)) { return null }
      store.put(lockbox, ckey)
      return rowAt(store, ckey)
    }))
  }

  // What it removed is the row read in the transaction that deletes it. A retirement that found
  // nothing to remove changed nothing, and rings no other tab.
  protected async doRetireBox(scope: VaultScope, boxlabel: string, expected: LockboxRetireExpectation): Promise<LockboxRetirement | null> {
    const retirement = await inOneTransaction(this.shelf, async (store) => {
      const ckey = Ckeys.box(scope, boxlabel)
      const [standingVaultProps, standingBox] = await Promise.all([rowAt(store, Ckeys.vaultProps(scope)), rowAt(store, ckey)])
      if (! Expectations.vaultMeets(standingVaultProps, expected)) { return null }
      store.delete(ckey)
      return Expectations.retirementOf(standingBox, expected)
    })
    if (retirement !== null && retirement.outcome !== 'absent') { this.ring() }
    return retirement
  }

  // The look at the vault props and every deletion (the lockboxes by their key range, then the
  // vault props) are one transaction: a lockbox another tab writes waits for the retire and then
  // finds no vault props, so no lockbox outlives its vault.
  protected async doRetireVault(scope: VaultScope, expected: RetireExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, Ckeys.vaultProps(scope))
      if (! Expectations.vaultIdMeets(standing, expected)) { return false }
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

  /** Rings once a write lands: `true`, or what it handed back; never for `false` or `null`, a write that did not. */
  private ringIfLanded<LandedT>(landed: LandedT): LandedT {
    if (landed !== false && landed !== null) { this.ring() }
    return landed
  }
}

/** The row standing at `ckey`, read within the transaction `store` belongs to: undefined for none. */
const rowAt = (store: IDBObjectStore, ckey: string): Promise<unknown> => settle<unknown>(store.get(ckey))

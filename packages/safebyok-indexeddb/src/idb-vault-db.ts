import { Ckeys, VaultDB } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, StoredLockbox, VaultBundle, VaultScope } from 'safebyok'
import { onBell, ringBell } from './bell'
import { boxRange } from './ckeys'
import { bundleMeetsExpectation, lockboxMeetsExpectation, vaultIdMeetsExpectation, vaultMeetsExpectation } from './expectations'
import { parseIdbVaultDBOpts, type IdbVaultDBOpts } from './idb-opts'
import { inOneTransaction, settle, shelfOf } from './shelf'

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
 * * **Names joined on `^`** in each row's ckey (the core's `Ckeys`), or on `opts.ckeyDelimiter`:
 *   that character is its `reservedNameChars`, and a name holding it is refused, kind
 *   `bad_label`. The default validators admit no `^`.
 *
 * Browser storage is best-effort: the browser may evict it under pressure, and "clear site data"
 * removes it. An app keeping its vaults here should call `navigator.storage.persist()`, and say
 * plainly that the vault lives only in this browser.
 *
 * @param opts - Where to keep the records: `dbName`, default 'safebyok'; and `ckeyDelimiter`,
 *   default `^`.
 * @returns The VaultDB, to hand `openVault`. Kind 'bad_option' for a `dbName` that is not
 *   non-empty text, or a `ckeyDelimiter` that is not one character. Nothing is opened until the
 *   first read or write.
 *
 * @example
 *   const vault = await openVault({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB: idbVaultDB({ dbName: 'acme' }), ...browserOpts({ dbName: 'acme' }) })
 */
export const idbVaultDB = (opts?: IdbVaultDBOpts): VaultDB => {
  const { dbName, ckeyDelimiter } = parseIdbVaultDBOpts(opts, 'idbVaultDB')
  return new IdbVaultDB(dbName, Ckeys.joiner(ckeyDelimiter))
}

class IdbVaultDB extends VaultDB {
  readonly maxRecordBytes = Infinity
  readonly maxVaultBytes = Infinity
  readonly maxLockboxes = Infinity
  readonly maxNameBytes = Infinity
  readonly reservedNameChars: string

  private readonly dbName: string
  private readonly joiner: Ckeys.CkeyJoiner

  constructor(dbName: string, joiner: Ckeys.CkeyJoiner) {
    super()
    this.dbName = dbName
    this.joiner = joiner
    this.reservedNameChars = joiner.delimiter
  }

  private get shelf() { return shelfOf(this.dbName) }

  protected async doReadBundle(scope: VaultScope): Promise<unknown> {
    return (await this.shelf('readonly', (store) => rowAt(store, this.joiner.bundle(scope)))) ?? null
  }

  protected async doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    const { standing, created } = await inOneTransaction(this.shelf, async (store) => {
      const already = await rowAt(store, this.joiner.bundle(bundle))
      if (already !== undefined) { return { standing: already, created: false } }
      store.put(bundle, this.joiner.bundle(bundle))
      return { standing: bundle, created: true }
    })
    if (created) { this.ring() }
    return standing
  }

  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, this.joiner.bundle(bundle))
      if (! bundleMeetsExpectation(standing, expected)) { return false }
      store.put(bundle, this.joiner.bundle(bundle))
      return true
    }))
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return (await this.shelf('readonly', (store) => rowAt(store, this.joiner.box(scope, boxlabel)))) ?? null
  }

  // Reads the key range of the scope's lockboxes, not the whole shelf: every other vault's rows, of
  // every user in this database, stay unread. The ckeys and their rows come from one transaction.
  protected async doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    const range = boxRange(this.joiner, scope)
    const [ckeys, rows] = await this.shelf('readonly', (store) => Promise.all([settle(store.getAllKeys(range)), settle<unknown[]>(store.getAll(range))]))
    return ckeys
      .map((ckey, idx) => ({ boxlabel: typeof ckey === 'string' ? this.joiner.boxlabelOf(ckey) : null, lockbox: rows[idx] }))
      .filter((stored): stored is StoredLockbox => stored.boxlabel !== null)
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const [standingBundle, standingBox] = await Promise.all([rowAt(store, this.joiner.bundle(scope)), rowAt(store, this.joiner.box(scope, lockbox.boxlabel))])
      if (! lockboxMeetsExpectation(standingBundle, standingBox, expected)) { return false }
      store.put(lockbox, this.joiner.box(scope, lockbox.boxlabel))
      return true
    }))
  }

  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, this.joiner.bundle(scope))
      if (! vaultMeetsExpectation(standing, expected)) { return false }
      store.delete(this.joiner.box(scope, boxlabel))
      return true
    }))
  }

  // The look at the bundle and every deletion (the lockboxes by their key range, then the bundle)
  // are one transaction: a lockbox another tab writes waits for the erase and then finds no
  // bundle, so no lockbox outlives its vault.
  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    return this.ringIfLanded(await inOneTransaction(this.shelf, async (store) => {
      const standing = await rowAt(store, this.joiner.bundle(scope))
      if (! vaultIdMeetsExpectation(standing, expected)) { return false }
      store.delete(boxRange(this.joiner, scope))
      store.delete(this.joiner.bundle(scope))
      return true
    }))
  }

  // Rings on every write to the shelf, not only ones in scope: a spurious refresh is harmless.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
    return onBell(this.dbName, onChange)
  }

  private ring() { ringBell(this.dbName) }

  private ringIfLanded(landed: boolean): boolean {
    if (landed) { this.ring() }
    return landed
  }
}

/** The row standing at `ckey`, read within the transaction `store` belongs to: undefined for none. */
const rowAt = (store: IDBObjectStore, ckey: string): Promise<unknown> => settle<unknown>(store.get(ckey))

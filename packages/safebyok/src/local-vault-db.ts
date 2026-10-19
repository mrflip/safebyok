import * as Z from 'zod/mini'
import { Lockbox } from './lockbox'
import { VaultScope, VaultProps } from './types'
import { VaultError } from './errors'
import type { StringStore } from './string-store'
import * as Ckeys from './ckeys'
import * as Expectations from './expectations'
import { type VaultDBOpts, VaultDB, type VaultPropsExpectation, type StoredLockbox, type LockboxExpectation, type LockboxRetireExpectation, type RetireExpectation } from './vault-db'

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()

/** What {@link localVaultDB} is made with. */
export type LocalVaultDBOpts = VaultDBOpts & {
  /** Where the rows live: `domStore(localStorage, prefix)`, `memoryStore()`, or a StringStore of your own. */
  store: StringStore
}

/**
 * VaultDB over a {@link StringStore}: rows as JSON text under the ckeys `Ckeys` gives, names
 * joined on `^`. A host backs one with localStorage, for a vault that lives on this device alone;
 * tests back one with a Map. Every secret field in what it stores is ciphertext; what it lacks is
 * reach -- rows stay on this device instead of syncing through a shared database.
 *
 * * **One tab.** Each write checks what stands and saves in one synchronous step, so nothing else
 *   in this tab runs in between: that is its atomic step. Two tabs sharing one localStorage are
 *   not held apart -- browsers do not lock it across tabs -- so a vault two tabs write at once may
 *   lose a write. For a vault several tabs keep, use `idbVaultDB` from `safebyok-indexeddb`, whose
 *   every write is one IndexedDB transaction.
 * * **No limits but a record's**: a mebibyte in one record, and none on a vault. The origin's
 *   storage quota bounds the whole store: a write past it is refused as `storage_unavailable`, the
 *   browser's own error (a `QuotaExceededError`) its cause, and nothing is written.
 *
 * @param opts - The `store`, and optionally a `logger`. Kind 'bad_option' for a `store` that is
 *   not a StringStore, or a `logger` that is not a VaultLogger.
 * @returns The VaultDB, to hand `Vault.make`.
 *
 * @example
 *   const vaultDB = localVaultDB({ store: memoryStore() })
 *   await vaultDB.readVaultProps({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // null
 * @example
 *   const vaultDB = localVaultDB({ store: domStore(localStorage, 'acme:db:'), logger })
 */
export const localVaultDB = (opts: LocalVaultDBOpts): VaultDB => {
  if (! localVaultDBOptsShape.safeParse(opts).success) {
    throw new VaultError('bad_option', 'localVaultDB takes one bag of options: a `store` (a StringStore, such as memoryStore() or domStore(localStorage, prefix)), and optionally a `logger`.')
  }
  return new StringStoreVaultDB(opts)
}

const isFunction = (candidate: unknown) => typeof candidate === 'function'

/** What localVaultDB must be handed: a store carrying a StringStore's five calls. Checked only. */
const localVaultDBOptsShape = Z.object({
  store: Z.object({
    read:      Z.custom(isFunction),
    write:     Z.custom(isFunction),
    erase:     Z.custom(isFunction),
    ckeys:     Z.custom(isFunction),
    subscribe: Z.custom(isFunction),
  }),
})

class StringStoreVaultDB extends VaultDB {
  // localStorage holds about five megabytes per origin, in all: a mebibyte is this adapter's
  // most for any one record.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a whole vault under a budget; the store's own quota refuses a write past it.
  readonly maxVaultBytes = Infinity
  // Nor does it count lockboxes: the vault's own maxLockboxes is the only limit.
  readonly maxLockboxes = Infinity
  // A ckey holds a name of any length the floor admits.
  readonly maxNameBytes = Infinity

  private readonly store: StringStore

  constructor(opts: LocalVaultDBOpts) {
    super(opts)
    this.store = opts.store
  }

  // Work is deferred into the promise even though the store is synchronous: a storage fault must
  // reject the returned promise, never throw before the caller has one in hand. And each write
  // checks and saves in one synchronous step, so nothing else in this tab runs in between.
  protected doReadVaultProps(scope: VaultScope): Promise<unknown> {
    return soon(() => readJson(this.store, Ckeys.vaultProps(scope)))
  }

  protected doFetchOrCreateVaultProps(vaultProps: VaultProps): Promise<unknown> {
    return soon(() => {
      const standing = readJson(this.store, Ckeys.vaultProps(vaultProps))
      if (standing !== null) { return standing }
      this.store.write(Ckeys.vaultProps(vaultProps), JSON.stringify(vaultProps))
      return vaultProps
    })
  }

  protected doUpdateVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<boolean> {
    return soon(() => {
      if (! Expectations.vaultPropsMeets(readJson(this.store, Ckeys.vaultProps(vaultProps)), expected)) { return false }
      this.store.write(Ckeys.vaultProps(vaultProps), JSON.stringify(vaultProps))
      return true
    })
  }

  protected doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    return soon(() => readJson(this.store, Ckeys.box(scope, boxlabel)))
  }

  protected doListBoxes(scope: VaultScope): Promise<StoredLockbox[]> {
    return soon(() => (
      this.store.ckeys()
        .filter(Ckeys.isBoxIn(scope))
        .map((ckey) => ({ boxlabel: Ckeys.boxlabelOf(ckey), text: this.store.read(ckey) }))
        // A row erased since the ckeys were read is gone; one that is not JSON goes up as its text.
        .filter((row): row is { boxlabel: string, text: string } => row.boxlabel !== null && row.text !== null)
        .map(({ boxlabel, text }) => ({ boxlabel, lockbox: jsonOrText(text) }))
    ))
  }

  protected doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<unknown> {
    return soon(() => {
      const ckey = Ckeys.box(scope, lockbox.boxlabel)
      const standingVaultProps = readJson(this.store, Ckeys.vaultProps(scope))
      if (! Expectations.lockboxMeets(standingVaultProps, readJson(this.store, ckey), expected)) { return null }
      this.store.write(ckey, JSON.stringify(lockbox))
      return readJson(this.store, ckey)
    })
  }

  protected doRetireBox(scope: VaultScope, boxlabel: string, expected: LockboxRetireExpectation): Promise<unknown> {
    return soon(() => {
      if (! Expectations.vaultMeets(readJson(this.store, Ckeys.vaultProps(scope)), expected)) { return null }
      const ckey = Ckeys.box(scope, boxlabel)
      // A row that is not JSON is still retired, and reported as holding no revision.
      const text = this.store.read(ckey)
      const retirement = Expectations.retirementOf(text === null ? null : jsonOrText(text), expected)
      this.store.erase(ckey)
      return retirement
    })
  }

  protected doRetireVault(scope: VaultScope, expected: RetireExpectation): Promise<boolean> {
    return soon(() => {
      if (! Expectations.vaultIdMeets(readJson(this.store, Ckeys.vaultProps(scope)), expected)) { return false }
      const doomed = this.store.ckeys().filter(Ckeys.isBoxIn(scope))
      for (const ckey of [...doomed, Ckeys.vaultProps(scope)]) { this.store.erase(ckey) }
      return true
    })
  }

  // The store's bell rings on every write, not only ones in scope: a spurious refresh is
  // harmless here, and a real adapter (Convex) subscribes precisely.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
    return this.store.subscribe(onChange)
  }
}

/** Stored text as the JSON it holds, or as itself when it holds none: a damaged row, for the listing to mark. */
const jsonOrText = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const readJson = (store: StringStore, ckey: string): unknown => {
  const text = store.read(ckey)
  if (text === null) { return null }
  try {
    return JSON.parse(text)
  } catch {
    throw new VaultError('corrupt_record', 'A stored record did not read back as JSON. It may be damaged; it was left as it is.')
  }
}

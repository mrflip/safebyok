import { BoxRecord } from './box'
import type { GatelessVaultProps, VaultScope, VaultProps } from './types/types'
import { VaultError } from './errors'
import type { StringStore } from './string-store'
import * as Scopepath from './scopepath'
import * as Expectations from './expectations'
import * as Refusals from './refusals'
import { Validator } from './checks/validator'
import { type VaultDBOpts, VaultDB, type VaultPropsExpectation, type StoredBox, type StoredVault, type BoxGetExpectation, type BoxExpectation, type BoxDelExpectation, type VaultDelExpectation } from './vault-db'

/** `fn`'s result (or failure) as a promise: a sync throw becomes a rejection, never an escape. */
const soon = async <ValT>(fn: () => ValT | Promise<ValT>): Promise<ValT> => await fn()

/** What {@link localVaultDB} is made with. */
export type LocalVaultDBOpts = VaultDBOpts & {
  /** Where the rows live: `domStore(localStorage, prefix)`, `memoryStore()`, or a StringStore of your own. */
  store: StringStore
}

/**
 * VaultDB over a {@link StringStore}: rows as JSON text under the scopepaths `Scopepath` gives, names
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
 *   browser's own error (a `QuotaExceededError`) its cause, and nothing is written. Its
 *   `getCapacity` counts the vault's boxes and weighs each as its row's JSON text, in UTF-8 bytes.
 *
 * @param opts - The `store`, and optionally a `logger`. Kind 'bad_option' for a `store` that is
 *   not a StringStore, or a `logger` that is not a VaultLogger.
 * @returns The VaultDB, to hand `Bank.make`.
 *
 * @example
 *   const vaultDB = localVaultDB({ store: memoryStore() })
 *   await vaultDB.getVault({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })  // { ok: true, val: null }
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

/** What localVaultDB must be handed, a store carrying a StringStore's five calls, refusing 'bad_option'. Checked only. */
const { localVaultDBOptsShape } = Validator('bad_option', ({ obj, custom }) => {
  const call = custom(isFunction)
  return { localVaultDBOptsShape: obj({ store: obj({ read: call, write: call, erase: call, ckeys: call, subscribe: call }) }) }
})

class StringStoreVaultDB extends VaultDB {
  // localStorage holds about five megabytes per origin, in all: a mebibyte is this adapter's
  // most for any one record.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a whole vault under a budget; the store's own quota refuses a write past it.
  readonly maxVaultBytes = Infinity
  // Nor does it count boxes: the vault's own maxBoxes is the only limit.
  readonly maxBoxes = Infinity
  // A scopepath holds a name of any length the checks admit.
  readonly maxNameBytes = Infinity

  private readonly store: StringStore

  constructor(opts: LocalVaultDBOpts) {
    super(opts)
    this.store = opts.store
  }

  // Work is deferred into the promise even though the store is synchronous: a storage fault must
  // reject the returned promise, never throw before the caller has one in hand. And each write
  // checks and saves in one synchronous step, so nothing else in this tab runs in between; each
  // read of a vault reads its props and its boxes in one such step.
  protected doGetVault(scope: VaultScope): Promise<StoredVault> {
    return soon(() => ({ vaultProps: readJson(this.store, Scopepath.vault(scope)), boxes: this.storedBoxesOf(scope) }))
  }

  protected doEnsureVault(draft: GatelessVaultProps): Promise<StoredVault> {
    return soon(() => {
      const vaultScopepath = Scopepath.vault(draft)
      const standing = readJson(this.store, vaultScopepath)
      const life = Expectations.newLifeOf(draft, standing)
      if (life) { this.store.write(vaultScopepath, JSON.stringify(life)) }
      return { vaultProps: life ?? standing, boxes: this.storedBoxesOf(draft) }
    })
  }

  protected doPutVaultProps(vaultProps: VaultProps, expected: VaultPropsExpectation): Promise<unknown> {
    return soon(() => {
      const vaultScopepath = Scopepath.vault(vaultProps)
      const standing = readJson(this.store, vaultScopepath)
      const refusal = Expectations.vaultPropsRefusalOf(standing, expected)
      if (refusal) { throw refusal }
      this.store.write(vaultScopepath, JSON.stringify(Expectations.vaultPropsPutOf(vaultProps, standing)))
      return readJson(this.store, vaultScopepath)
    })
  }

  protected doGetBox(scope: VaultScope, boxlabel: string, expected: BoxGetExpectation): Promise<unknown> {
    return soon(() => {
      if (! Expectations.vaultMeets(readJson(this.store, Scopepath.vault(scope)), expected)) { throw Refusals.vaultMismatch() }
      return readJson(this.store, Scopepath.box({ ...scope, boxlabel }))
    })
  }

  /** Every box row of `scope`, read in the synchronous step that calls it: each under the boxlabel its scopepath names. */
  private storedBoxesOf(scope: VaultScope): StoredBox[] {
    return this.store.ckeys()
      .filter(Scopepath.withinVaultScopepathPred(scope))
      // A row under the vault's prefix that is no box's scopepath holds no box a verb can reach: it is passed over.
      .filter((scopepath) => Scopepath.isBox(scopepath))
      .map((boxScopepath) => ({ boxlabel: Scopepath.boxscope(boxScopepath).boxlabel, text: this.store.read(boxScopepath) }))
      // A row erased since the scopepaths were read is gone; one that is not JSON goes up as its text.
      .filter((row): row is { boxlabel: string, text: string } => row.text !== null)
      .map(({ boxlabel, text }) => ({ boxlabel, box: jsonOrText(text) }))
  }

  // A row that is not JSON stands as its text, so a stale write names it, damaged, as the listing does.
  protected doPutBox(scope: VaultScope, expected: BoxExpectation, box: BoxRecord): Promise<unknown> {
    return soon(() => {
      const boxScopepath = Scopepath.box({ ...scope, boxlabel: box.boxlabel })
      const standingText = this.store.read(boxScopepath)
      const refusal = Expectations.boxRefusalOf(readJson(this.store, Scopepath.vault(scope)), standingText === null ? null : jsonOrText(standingText), expected)
      if (refusal) { throw refusal }
      this.store.write(boxScopepath, JSON.stringify(box))
      return readJson(this.store, boxScopepath)
    })
  }

  // Each box weighs its row's text as stored, in UTF-8 bytes, against no limit: the store keeps none.
  protected doGetCapacity(scope: VaultScope): Promise<unknown> {
    return soon(() => {
      const texts = this.store.ckeys()
        .filter(Scopepath.withinVaultScopepathPred(scope))
        .map((scopepath) => this.store.read(scopepath))
        .filter((text): text is string => text !== null)
      const bytesUsed = texts.reduce((sum, text) => sum + new TextEncoder().encode(text).length, 0)
      return { boxes: { used: texts.length, max: this.maxBoxes }, bytes: { used: bytesUsed, max: this.maxVaultBytes } }
    })
  }

  protected doDelBox(scope: VaultScope, boxlabel: string, expected: BoxDelExpectation): Promise<unknown> {
    return soon(() => {
      if (! Expectations.vaultMeets(readJson(this.store, Scopepath.vault(scope)), expected)) { return null }
      const boxScopepath = Scopepath.box({ ...scope, boxlabel })
      // A row that is not JSON is still deleted, and reported as holding no revision.
      const text = this.store.read(boxScopepath)
      const deletion = Expectations.deletionOf(text === null ? null : jsonOrText(text), expected)
      this.store.erase(boxScopepath)
      return deletion
    })
  }

  // The tombstone takes the place of the vault props, in their row, so a scope holds one or the other.
  protected doDelVault(scope: VaultScope, expected: VaultDelExpectation): Promise<unknown> {
    return soon(() => {
      const vaultScopepath = Scopepath.vault(scope)
      const tombstone = Expectations.tombstoneOf(readJson(this.store, vaultScopepath), scope, expected)
      if (tombstone === null) { return null }
      // Every row under the vault's prefix goes, a box's or not.
      const isWithinVault = Scopepath.withinVaultScopepathPred(scope)
      for (const ckey of this.store.ckeys()) {
        if (isWithinVault(ckey)) { this.store.erase(ckey) }
      }
      this.store.write(vaultScopepath, JSON.stringify(tombstone))
      return readJson(this.store, vaultScopepath)
    })
  }

  // The store's bell rings on every write, not only ones in scope: a spurious refresh is
  // harmless here, and a real adapter (Convex) subscribes precisely.
  protected override doSubscribe(_scope: VaultScope, onChange: () => void): () => void {
    return this.store.subscribe(onChange)
  }
}

/** Stored text as the JSON it holds, or as itself when it holds none: a damaged row, for the base class's checks to refuse or the listing to mark. */
const jsonOrText = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** The row under `scopepath` as {@link jsonOrText} reads it, or null when there is none. */
const readJson = (store: StringStore, scopepath: string): unknown => {
  const text = store.read(scopepath)
  return text === null ? null : jsonOrText(text)
}

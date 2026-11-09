import { IdbVaultDB } from 'safebyok-indexeddb'
import { storageUnavailable } from 'safebyok/storage'
import type {
  BankScope, BoxesFetched, BoxFetched, BoxWritten, BoxQuery, BoxRecord, BoxTombstone, DelOpts, Written, PutOptsGiven,
  RowOfVault, Tidied, VaultQuery, VaultRecord, VaultScope, VaultTombstone,
} from 'safebyok/storage'

/** What the outage switch's refusals say. */
const OutageMessage = "The demo's backend is switched off: switch it back on to reach the vault."

/** The demo's vaultDB, in this browser's IndexedDB, with a switch that takes it offline: each verb then refuses as an unreachable backend does. */
export class OutageVaultDB extends IdbVaultDB {
  // == [The switch]: #isOnline, #listeners, isOnline, setOnline, subscribe, getSnapshot, #demandOnline

  #isOnline = true
  readonly #listeners = new Set<() => void>()

  /** True while the vaultDB answers its verbs. */
  get isOnline(): boolean { return this.#isOnline }

  /** Take the vaultDB offline, or bring it back, and tell each subscriber. */
  setOnline(isOnline: boolean): void {
    this.#isOnline = isOnline
    for (const listener of this.#listeners) { listener() }
  }

  /** Hear each flip of the switch, for useSyncExternalStore. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Whether the vaultDB is online, for useSyncExternalStore. */
  readonly getSnapshot = (): boolean => this.#isOnline

  #demandOnline(): void {
    if (! this.#isOnline) { throw storageUnavailable(new Error('the outage switch is off'), OutageMessage) }
  }
  // --

  // == [The generic calls, refused while offline]: doListVaults, doGetVault, doListBoxes, doGetBox, doPutVault, doPutBox, doDelVault, doDelBox, doTidyGone

  protected override async doListVaults(scope: BankScope): Promise<RowOfVault[]> {
    this.#demandOnline()
    return await super.doListVaults(scope)
  }

  protected override async doGetVault(scope: VaultScope): Promise<unknown> {
    this.#demandOnline()
    return await super.doGetVault(scope)
  }

  protected override async doListBoxes(asked: VaultQuery): Promise<BoxesFetched> {
    this.#demandOnline()
    return await super.doListBoxes(asked)
  }

  protected override async doGetBox(asked: BoxQuery): Promise<BoxFetched> {
    this.#demandOnline()
    return await super.doGetBox(asked)
  }

  protected override async doPutVault(record: VaultRecord, opts: PutOptsGiven): Promise<Written> {
    this.#demandOnline()
    return await super.doPutVault(record, opts)
  }

  protected override async doPutBox(record: BoxRecord, opts: PutOptsGiven): Promise<BoxWritten> {
    this.#demandOnline()
    return await super.doPutBox(record, opts)
  }

  protected override async doDelVault(tombstone: VaultTombstone, opts: DelOpts): Promise<Written> {
    this.#demandOnline()
    return await super.doDelVault(tombstone, opts)
  }

  protected override async doDelBox(tombstone: BoxTombstone, opts: DelOpts): Promise<BoxWritten> {
    this.#demandOnline()
    return await super.doDelBox(tombstone, opts)
  }

  protected override async doTidyGone(scope: BankScope): Promise<Tidied> {
    this.#demandOnline()
    return await super.doTidyGone(scope)
  }
  // --
}

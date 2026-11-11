import { IdbVaultDB } from 'safebyok-indexeddb'
import { storageUnavailable } from 'safebyok/storage'
import type {
  BankScope, BoxDelAsk, BoxesStored, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxStored, Tidied,
  VaultDelAsk, VaultGetAsk, VaultListAsk, VaultPutAsk, VaultsStored, VaultStored,
} from 'safebyok/storage'

/** The message of every refusal while the outage switch is off. */
const OutageMessage = "The demo's backend is switched off: switch it back on to reach the vault."

/** The demo's vaultDB: an IdbVaultDB with a switch that takes it offline. While offline, every call refuses the way an unreachable backend would. */
export class OutageVaultDB extends IdbVaultDB {
  // == [The switch]: #isOnline, #listeners, isOnline, setOnline, subscribe, getSnapshot, #demandOnline

  #isOnline = true
  readonly #listeners = new Set<() => void>()

  /** True while the vaultDB is online. */
  get isOnline(): boolean { return this.#isOnline }

  /** Take the vaultDB offline, or bring it back, and notify each subscriber. */
  setOnline(isOnline: boolean): void {
    this.#isOnline = isOnline
    for (const listener of this.#listeners) { listener() }
  }

  /** Subscribe to changes of the switch, for useSyncExternalStore. */
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

  protected override async doListVaults(ask: VaultListAsk): Promise<VaultsStored> {
    this.#demandOnline()
    return await super.doListVaults(ask)
  }

  protected override async doGetVault(ask: VaultGetAsk): Promise<VaultStored> {
    this.#demandOnline()
    return await super.doGetVault(ask)
  }

  protected override async doListBoxes(ask: BoxListAsk): Promise<BoxesStored> {
    this.#demandOnline()
    return await super.doListBoxes(ask)
  }

  protected override async doGetBox(ask: BoxGetAsk): Promise<BoxStored> {
    this.#demandOnline()
    return await super.doGetBox(ask)
  }

  protected override async doPutVault(ask: VaultPutAsk): Promise<VaultStored> {
    this.#demandOnline()
    return await super.doPutVault(ask)
  }

  protected override async doPutBox(ask: BoxPutAsk): Promise<BoxStored> {
    this.#demandOnline()
    return await super.doPutBox(ask)
  }

  protected override async doDelVault(ask: VaultDelAsk): Promise<VaultStored> {
    this.#demandOnline()
    return await super.doDelVault(ask)
  }

  protected override async doDelBox(ask: BoxDelAsk): Promise<BoxStored> {
    this.#demandOnline()
    return await super.doDelBox(ask)
  }

  protected override async doTidyGone(scope: BankScope): Promise<Tidied> {
    this.#demandOnline()
    return await super.doTidyGone(scope)
  }
  // --
}

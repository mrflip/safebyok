import { IdbBankDB } from 'safebyok-indexeddb'
import { storageUnavailable } from 'safebyok-big/storage'
import type { BoxTidyAsk, BX } from 'safebyok-big/storage'

/** The message of every refusal while the outage switch is off. */
const OutageMessage = "The demo's backend is switched off: switch it back on to reach the vault."

/** The demo's bankDB: an IdbBankDB with a switch that takes it offline. While offline, every call refuses the way an unreachable backend would. */
export class OutageBankDB extends IdbBankDB {
  // == [The switch]: #isOnline, #listeners, isOnline, setOnline, subscribe, getSnapshot, #demandOnline

  #isOnline = true
  readonly #listeners = new Set<() => void>()

  /** True while the bankDB is online. */
  get isOnline(): boolean { return this.#isOnline }

  /** Take the bankDB offline, or bring it back, and notify each subscriber. */
  setOnline(isOnline: boolean): void {
    this.#isOnline = isOnline
    for (const listener of this.#listeners) { listener() }
  }

  /** Subscribe to changes of the switch, for useSyncExternalStore. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Whether the bankDB is online, for useSyncExternalStore. */
  readonly getSnapshot = (): boolean => this.#isOnline

  #demandOnline(): void {
    if (! this.#isOnline) { throw storageUnavailable(new Error('the outage switch is off'), OutageMessage) }
  }
  // --

  // == [The generic calls, refused while offline]: doEnsureBank, doBuildBank, doPutGate, doDelBank, doGetVault, doPutVault, doDelVault, doListBoxes, doGetBox, doPutBox, doDelBox, doTidyGone

  protected override async doEnsureBank(ask: BX.BankEnsureAsk): Promise<BX.BankEnsureStored> {
    this.#demandOnline()
    return await super.doEnsureBank(ask)
  }

  protected override async doBuildBank(ask: BX.BankBuildAsk): Promise<BX.BankBuildStored> {
    this.#demandOnline()
    return await super.doBuildBank(ask)
  }

  protected override async doPutGate(ask: BX.GatePutAsk): Promise<BX.GateStored> {
    this.#demandOnline()
    return await super.doPutGate(ask)
  }

  protected override async doDelBank(ask: BX.BankDelAsk): Promise<BX.BankDelStored> {
    this.#demandOnline()
    return await super.doDelBank(ask)
  }

  protected override async doGetVault(ask: BX.VaultGetAsk): Promise<BX.VaultStored> {
    this.#demandOnline()
    return await super.doGetVault(ask)
  }

  protected override async doPutVault(ask: BX.VaultPutAsk): Promise<BX.VaultStored> {
    this.#demandOnline()
    return await super.doPutVault(ask)
  }

  protected override async doDelVault(ask: BX.VaultDelAsk): Promise<BX.VaultStored> {
    this.#demandOnline()
    return await super.doDelVault(ask)
  }

  protected override async doListBoxes(ask: BX.BoxListAsk): Promise<BX.BoxesStored> {
    this.#demandOnline()
    return await super.doListBoxes(ask)
  }

  protected override async doGetBox(ask: BX.BoxGetAsk): Promise<BX.BoxStored> {
    this.#demandOnline()
    return await super.doGetBox(ask)
  }

  protected override async doPutBox(ask: BX.BoxPutAsk): Promise<BX.BoxStored> {
    this.#demandOnline()
    return await super.doPutBox(ask)
  }

  protected override async doDelBox(ask: BX.BoxDelAsk): Promise<BX.BoxStored> {
    this.#demandOnline()
    return await super.doDelBox(ask)
  }

  protected override async doTidyGone(ask: BoxTidyAsk): Promise<BX.Tidied> {
    this.#demandOnline()
    return await super.doTidyGone(ask)
  }
  // --
}

/** The dojo's vaultDB: the IndexedDB one, which can be told to refuse the next write, as a backend that is down would. */

import { IdbVaultDB } from 'safebyok-idb-lean'
import { type Actual, type BirthBankActual, type BirthBankAsk, type BirthPuts, type DelAct, type PutAct, VaultError, type WriteAsk } from 'safebyok/storage'

/** The message of the refusal a {@link RefusingVaultDB} answers when told to. */
export const RefusedWriteMessage = 'The dojo told its vaultDB to refuse this write.'

/** An {@link IdbVaultDB} that refuses the next write or birth after {@link refuseNextWrite}, with `storage_unavailable`, writing nothing.
 * It also holds the next write after {@link holdNextWrite} for {@link holdMs}, as a slow backend would.
 */
export class RefusingVaultDB extends IdbVaultDB {
  #isRefusing = false

  /** What runs while the next write is held, or null while no hold is asked for. */
  #meanwhile: (() => Promise<void>) | null = null

  /** How long a held write waits before it goes on: six seconds, so a person can watch a form meanwhile. */
  holdMs = 6000

  /** Hold the next write for {@link holdMs}, once, running `meanwhile` as the hold begins: the write goes on once both are done. */
  holdNextWrite(meanwhile: () => Promise<void> = async () => { /* nothing meanwhile */ }): void { this.#meanwhile = meanwhile }

  /** Forget a hold asked for and not yet made. */
  stopHolding(): void { this.#meanwhile = null }

  /** Refuse the next write or birth, once. */
  refuseNextWrite(): void { this.#isRefusing = true }

  /** Forget a refusal asked for and not yet made. */
  stopRefusing(): void { this.#isRefusing = false }

  protected override async doWriteThing(ask: WriteAsk): Promise<Actual<PutAct | DelAct>> {
    // The refusal is taken before the hold, so a button pressed meanwhile, which disarms, cannot change this write's outcome.
    const refusal = this.#refusalIfAsked()
    await this.#holdIfAsked()
    if (refusal !== null) { throw refusal }
    return await super.doWriteThing(ask)
  }

  protected override async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    const refusal = this.#refusalIfAsked()
    if (refusal !== null) { throw refusal }
    return await super.doBirthBank(ask, puts)
  }

  /** Wait out the hold, once, where one was asked for. */
  async #holdIfAsked(): Promise<void> {
    const meanwhile = this.#meanwhile
    if (meanwhile === null) { return }
    this.#meanwhile = null
    await Promise.all([new Promise((resolve) => { setTimeout(resolve, this.holdMs) }), meanwhile()])
  }

  /** The refusal, once, where one was asked for, else null. */
  #refusalIfAsked(): VaultError | null {
    if (! this.#isRefusing) { return null }
    this.#isRefusing = false
    return new VaultError('storage_unavailable', RefusedWriteMessage)
  }
}

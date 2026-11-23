/** The dojo's vaultDB: the IndexedDB one, which can be told to refuse the next write, as a backend that is down would. */

import { IdbVaultDB } from 'safebyok-idb-lean'
import { type Actual, type BirthBankActual, type BirthBankAsk, type BirthPuts, type DelAct, type PutAct, VaultError, type WriteAsk } from 'safebyok/storage'

/** The message of the refusal a {@link RefusingVaultDB} answers when told to. */
export const RefusedWriteMessage = 'The dojo told its vaultDB to refuse this write.'

/** An {@link IdbVaultDB} that refuses the next write or birth after {@link refuseNextWrite}, with `storage_unavailable`, writing nothing. */
export class RefusingVaultDB extends IdbVaultDB {
  #isRefusing = false

  /** Refuse the next write or birth, once. */
  refuseNextWrite(): void { this.#isRefusing = true }

  /** Forget a refusal asked for and not yet made. */
  stopRefusing(): void { this.#isRefusing = false }

  protected override async doWriteThing(ask: WriteAsk): Promise<Actual<PutAct | DelAct>> {
    this.#refuseIfAsked()
    return await super.doWriteThing(ask)
  }

  protected override async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthBankActual> {
    this.#refuseIfAsked()
    return await super.doBirthBank(ask, puts)
  }

  /** Throw the refusal, once, where one was asked for. */
  #refuseIfAsked(): void {
    if (! this.#isRefusing) { return }
    this.#isRefusing = false
    throw new VaultError('storage_unavailable', RefusedWriteMessage)
  }
}

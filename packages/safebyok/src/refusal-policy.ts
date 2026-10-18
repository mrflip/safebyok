import { VaultError, isVaultError } from './errors'
import type { VaultDB } from './vault-db'

/** What a vault does with a refusal from storage beyond throwing it: lock, or nothing more. */
export type RefusalResponse = 'lock' | 'none'

/**
 * What a vault does about `refusal`, beyond throwing it: every storage refusal's consequence for
 * the vault, decided in this one place, by one rule. Storage the vault cannot trust to serve this
 * user's own vault locks it at once, as `lock()` does, removing nothing stored:
 *
 * * `identity_revoked`: storage says the user the vault was opened for is no longer the one
 *   signed in. An adapter says it only when the user really is gone (VAULTDB.md, line 5.5).
 * * `rolled_back`: storage handed back an older copy of the vault than this device has seen,
 *   which could bring back a way in since removed.
 *
 * Nothing else does anything more. `not_permitted` is the vault's own user refused one call, which
 * locking would not mend; `stale_write`, `vault_full` and `storage_unavailable` say nothing about
 * whom storage serves. No host option changes any of this.
 *
 * @param refusal - What a storage call threw, or what the vault made of what storage handed back.
 * @returns `lock`, or `none`.
 *
 * @example decide(new VaultError('identity_revoked', 'Signed out.'))  // 'lock'
 * @example decide(new VaultError('rolled_back', 'An older copy.'))     // 'lock'
 * @example decide(new VaultError('not_permitted', 'Not yours.'))      // 'none'
 */
export const decide = (refusal: unknown): RefusalResponse => (
  isVaultError(refusal, 'identity_revoked') || isVaultError(refusal, 'rolled_back') ? 'lock' : 'none'
)

/** The verbs a vault calls on its VaultDB. */
export type HeededVaultDB = Pick<VaultDB, 'readVaultProps' | 'fetchOrCreateVaultProps' | 'updateVaultProps' | 'readBox' | 'listBoxes' | 'updateBox' | 'retireBox' | 'retireVault' | 'subscribe'>

/**
 * `vaultDB`'s verbs, each handing any VaultError it rejects with to `onRefusal`, and waiting for
 * it, before rejecting with it as before: so a vault meets every storage refusal, whichever of its
 * calls made it, a background refresh's included. Each verb takes its arguments as `vaultDB`'s
 * does, passed on whole, and is looked up on `vaultDB` as it is called, so a test's spy on one is
 * heard. `subscribe`, which answers at once, passes through.
 *
 * The refused call waits for `onRefusal` before it rejects, so a device store that never settles
 * as the vault locks holds that call with it; the vaultKey is dropped before the device store is
 * asked anything, so nothing is held open meanwhile.
 *
 * @param vaultDB - The storage adapter the host passed to Vault.make.
 * @param onRefusal - What the vault does about a refusal. Whatever it throws is dropped: the
 *   refusal is what the caller must hear.
 */
export const heed = (vaultDB: VaultDB, onRefusal: (refusal: VaultError) => Promise<void>): HeededVaultDB => {
  const heeding = async <ValT>(call: () => Promise<ValT>): Promise<ValT> => {
    try {
      return await call()
    } catch (err) {
      if (err instanceof VaultError) { await heard(onRefusal, err) }
      throw err
    }
  }
  return {
    readVaultProps:          (...args) => heeding(() => vaultDB.readVaultProps(...args)),
    fetchOrCreateVaultProps: (...args) => heeding(() => vaultDB.fetchOrCreateVaultProps(...args)),
    updateVaultProps:        (...args) => heeding(() => vaultDB.updateVaultProps(...args)),
    readBox:                 (...args) => heeding(() => vaultDB.readBox(...args)),
    listBoxes:               (...args) => heeding(() => vaultDB.listBoxes(...args)),
    updateBox:               (...args) => heeding(() => vaultDB.updateBox(...args)),
    retireBox:               (...args) => heeding(() => vaultDB.retireBox(...args)),
    retireVault:             (...args) => heeding(() => vaultDB.retireVault(...args)),
    subscribe:               (...args) => vaultDB.subscribe(...args),
  }
}

/** `onRefusal(refusal)`, awaited, anything it throws dropped. */
const heard = async (onRefusal: (refusal: VaultError) => Promise<void>, refusal: VaultError) => {
  try {
    await onRefusal(refusal)
  } catch {
    // The refusal, rethrown by the caller, is what the vault's caller must act on.
  }
}

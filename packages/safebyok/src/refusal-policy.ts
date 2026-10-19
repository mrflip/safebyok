import { VaultError, isVaultError } from './errors'
import type { Outcome } from './outcome'
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

/** The VaultDB verbs a vault calls, each resolving to an Outcome. */
type HeededVerb = 'getVaultProps' | 'ensureVaultProps' | 'putVaultProps' | 'getBox' | 'listBoxes' | 'putBox' | 'delBox' | 'delVault'

/** A VaultDB verb as {@link heed} hands it on: resolving its outcome's `val`, rejecting with its `err`. */
type Thrown<VerbT> = VerbT extends (...args: infer ArgsT) => Promise<Outcome<infer ValT>> ? (...args: ArgsT) => Promise<ValT> : never

/** The verbs a vault calls on its VaultDB, each answering with its `val` and refusing by rejecting. */
export type HeededVaultDB = { [VerbT in HeededVerb]: Thrown<VaultDB[VerbT]> } & Pick<VaultDB, 'subscribe'>

/**
 * `vaultDB`'s verbs, each resolving its outcome's `val`, or handing its refusal to `onRefusal`, and
 * waiting for it, before rejecting with that refusal: so a vault meets every storage refusal,
 * whichever of its calls made it, a background refresh's included. Each verb takes its arguments as `vaultDB`'s
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
  const heeding = async <ValT>(call: () => Promise<Outcome<ValT>>): Promise<ValT> => {
    const { ok, val, err } = await call()
    if (ok) { return val }
    await heard(onRefusal, err)
    throw err
  }
  return {
    getVaultProps:    (...args) => heeding(() => vaultDB.getVaultProps(...args)),
    ensureVaultProps: (...args) => heeding(() => vaultDB.ensureVaultProps(...args)),
    putVaultProps:    (...args) => heeding(() => vaultDB.putVaultProps(...args)),
    getBox:           (...args) => heeding(() => vaultDB.getBox(...args)),
    listBoxes:        (...args) => heeding(() => vaultDB.listBoxes(...args)),
    putBox:           (...args) => heeding(() => vaultDB.putBox(...args)),
    delBox:           (...args) => heeding(() => vaultDB.delBox(...args)),
    delVault:         (...args) => heeding(() => vaultDB.delVault(...args)),
    subscribe:        (...args) => vaultDB.subscribe(...args),
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

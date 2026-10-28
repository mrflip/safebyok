import { VaultError, isVaultError } from './errors'
import type { Outcome } from './outcome'
import type { VaultDB } from './vault-db'

/** What a vault does with a refusal from storage beyond throwing it: lock, or nothing more. */
export type RefusalResponse = 'lock' | 'none'

/** The {@link RefusalResponse} a vault gives a storage refusal beyond throwing it.
 * `identity_revoked` and `vault_behind` answer `lock`: storage the vault cannot trust to serve this
 * user's own vault locks it, as `lock()` does, removing nothing stored. Every other kind answers
 * `none`. No host option changes this.
 *
 * @param refusal - What a storage call threw, or what the vault made of what storage handed back.
 *
 * @example decide(new VaultError('identity_revoked', 'Signed out.'))  // 'lock'
 * @example decide(new VaultError('vault_behind', 'An older copy.'))    // 'lock'
 * @example decide(new VaultError('not_permitted', 'Not yours.'))      // 'none'
 */
// The one place that decides what a storage refusal does beyond throwing.
export const decide = (refusal: unknown): RefusalResponse => (
  isVaultError(refusal, 'identity_revoked') || isVaultError(refusal, 'vault_behind') ? 'lock' : 'none'
)

/** The VaultDB verbs a vault calls, each resolving to an Outcome. */
type HeededVerb = 'getVault' | 'ensureVault' | 'putVaultRecord' | 'getBox' | 'putBox' | 'delBox' | 'delVault'

/** A VaultDB verb as {@link heed} hands it on: resolving its outcome's `val`, rejecting with its `err`. */
type Thrown<VerbT> = VerbT extends (...args: infer ArgsT) => Promise<Outcome<infer ValT>> ? (...args: ArgsT) => Promise<ValT> : never

/** The verbs a vault calls on its VaultDB, each answering with its `val` and refusing by rejecting. */
export type HeededVaultDB = { [VerbT in HeededVerb]: Thrown<VaultDB[VerbT]> } & Pick<VaultDB, 'subscribe'>

/** `vaultDB`'s verbs, each resolving its outcome's `val` or rejecting with its refusal once `onRefusal` has heard it.
 * So the vault meets every storage refusal, a background refresh's included. A refused verb waits
 * for `onRefusal`: one that never settles holds the call with it. Each verb is looked up on
 * `vaultDB` as it is called, so a test's spy on one is heard. `subscribe` passes through.
 *
 * @param onRefusal - What the vault does about a refusal. Whatever it throws is dropped, so the
 *   caller hears the refusal itself.
 */
export const heed = (vaultDB: VaultDB, onRefusal: (refusal: VaultError) => Promise<void>): HeededVaultDB => {
  const heeding = async <ValT>(call: () => Promise<Outcome<ValT>>): Promise<ValT> => {
    const { ok, val, err } = await call()
    if (ok) { return val }
    // The vault drops its vaultKey before its onRefusal asks the device store anything, so a store that never settles holds nothing open.
    await heard(onRefusal, err)
    throw err
  }
  return {
    getVault:         (...args) => heeding(() => vaultDB.getVault(...args)),
    ensureVault:      (...args) => heeding(() => vaultDB.ensureVault(...args)),
    putVaultRecord:   (...args) => heeding(() => vaultDB.putVaultRecord(...args)),
    getBox:           (...args) => heeding(() => vaultDB.getBox(...args)),
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

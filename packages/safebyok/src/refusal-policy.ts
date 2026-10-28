import { isVaultError } from './errors'

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

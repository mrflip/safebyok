import { isVaultError } from 'safebyok'

/** True for a refusal the page says nothing of: a dialog the user cancelled, or one a lock closed. */
export const isQuietRefusal = (err: unknown): boolean => (
  isVaultError(err, 'declined') || isVaultError(err, 'locked_while_asking')
)

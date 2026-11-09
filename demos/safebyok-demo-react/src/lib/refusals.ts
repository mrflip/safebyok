import { isVaultError } from 'safebyok'

/** True for a refusal the page says nothing of: a dialog closed with nothing proved. */
export const isQuietRefusal = (err: unknown): boolean => isVaultError(err, 'dismissed')

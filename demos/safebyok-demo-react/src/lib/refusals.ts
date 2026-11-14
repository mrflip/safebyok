import { isVaultError } from 'safebyok-big'

/** True when `err` is a refusal the page should stay quiet about: the user dismissed a dialog. */
export const isQuietRefusal = (err: unknown): boolean => isVaultError(err, 'dismissed')

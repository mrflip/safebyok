import { type RefusalMeta, VaultError } from '../errors'
import * as Phrases   from '../phrases'

// == [Vault Throwers]

export const goneError        = () => new VaultError('vault_gone', Phrases.VaultGoneWhileOpening)

export const lockedError      = () => new VaultError('vault_locked', Phrases.VaultLocked)

export const otherStoresError = () => new VaultError('bad_option', Phrases.OtherStoresThanHeld)

export const behindError      = () => new VaultError('vault_behind', Phrases.VaultBehindWhileOpening)
// --

// == [Storable Throwers]

export const partialLoadError = () => new VaultError('bad_option', Phrases.PartialLoad)

/** The 'stale_write' of an edit laid over a central that moved meanwhile, its `meta` carrying that central as a 'stale_write' from storage carries what storage holds. */
export const movedUnderEditError = (meta: RefusalMeta) => new VaultError('stale_write', Phrases.MovedUnderEdit, { meta })

export const alreadyHeldError    = () => new VaultError('bad_option', Phrases.AlreadyHeld)
// --

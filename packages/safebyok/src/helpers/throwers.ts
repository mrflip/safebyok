import { VaultError } from '../errors'
import * as Phrases   from '../phrases'

// == [Vault Throwers]

export const goneError        = () => new VaultError('vault_gone', Phrases.VaultGoneWhileOpening)

export const lockedError      = () => new VaultError('vault_locked', Phrases.VaultLocked)

export const otherStoresError = () => new VaultError('bad_option', Phrases.OtherStoresThanHeld)

export const behindError      = () => new VaultError('vault_behind', Phrases.VaultBehindWhileOpening)
// --

// == [Storable Throwers]

export const partialLoadError = () => new VaultError('bad_option', Phrases.PartialLoad)

export const alreadyHeldError    = () => new VaultError('bad_option', Phrases.AlreadyHeld)
// --

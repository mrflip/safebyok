import { VaultError } from '../errors'
import * as Phrases   from '../phrases'

// == [Vault Throwers]

export const goneError        = () => new VaultError('vault_gone', Phrases.VaultGoneWhileOpening)

export const lockedError      = () => new VaultError('vault_locked', 'The vault is locked, so nothing was read or written: call ensureUnlocked(), which asks the user through requestCleartext, and call again.')

export const otherStoresError = () => new VaultError('bad_option', Phrases.OtherStoresThanHeld)

export const behindError      = () => new VaultError('vault_behind', Phrases.VaultBehindWhileOpening)
// --

// == [Storable Throwers]

export const notFullError        = () => new VaultError('bad_option', "The record in hand is not full, so it cannot be opened: hydrate it, and call again.")

export const movedUnderEditError = () => new VaultError('stale_write', "Storage delivered a newer record while this edit was being made, so the edit was laid over a record storage no longer holds, and nothing was staged. The record in hand is the one delivered: call again to edit it.")

export const vaultRemadeError    = () => new VaultError('vault_remade', "Storage holds this record under another vault_tok than this device holds it under: the vault was deleted and made anew elsewhere, and what this device holds belongs to the vault that was deleted. This device kept its own copy and did not take in the one storage sent. Load the vault again, and its boxes with it.")
// --

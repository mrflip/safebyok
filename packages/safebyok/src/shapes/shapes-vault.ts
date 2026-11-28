/** The checks of what a `Vault` is made with, and of what its verbs are handed: a box's labelpath, never the root box's, and the function a whisper is used in. */

import { Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { Labelpath } from './primitives'
import type { VaultTSQ } from '../minding/vault-tsq'
import type { Bank } from '../models/bank'
import { type BoxUnsealed, isBank } from './shapes-bankish'
import { BoxChecks } from './shapes-thingkinds'
import { isVaultTSQ } from './shapes-vault-tsq'

// == [Checks]: VaultChecks

/** The checks of `Vault.make`'s arguments, of a box's labelpath, never the root box's, and of the `fn` `Vault.withWhisper` and `Vault.withUnlockedWhisper` call. */
export const VaultChecks = Validator.Checkers('bad_record', ({ obj, custom, fn }) => ({
  makeArgs:     obj({ bank: custom<Bank>(isBank, Phrases.BankExpected), vaultTSQ: custom<VaultTSQ>(isVaultTSQ, Phrases.VaultTSQExpected) }),
  // The root box is the bank's: a vault writes and reads only the boxes under it.
  boxLabelpath: BoxChecks.labelpath.refine((given) => given !== Labelpath.RootBox, Phrases.VaultBoxIsRoot),
  fn:           fn<(box: BoxUnsealed) => unknown>(),
}))
// --

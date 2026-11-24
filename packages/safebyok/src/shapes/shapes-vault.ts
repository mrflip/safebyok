/** The checks of what a `Vault`'s verbs are handed: a box's labelpath, never the root box's, and the function a whisper is used in. */

import { Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { Labelpath } from './primitives'
import type { BoxUnsealed } from './shapes-bankish'
import { BoxChecks } from './shapes-thingkinds'

// == [Checks]: VaultChecks

/** The checks of a box's labelpath, never the root box's, and of the `fn` `Vault.withWhisper` and `Vault.withUnlockedWhisper` call. */
export const VaultChecks = Validator.Checkers('bad_record', ({ fn }) => ({
  // The root box is the bank's: a vault writes and reads only the boxes under it.
  boxLabelpath: BoxChecks.labelpath.refine((given) => given !== Labelpath.RootBox, Phrases.VaultBoxIsRoot),
  fn:           fn<(box: BoxUnsealed) => unknown>(),
}))
// --

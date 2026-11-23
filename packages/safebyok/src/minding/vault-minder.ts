/** `VaultMinder`, which minds the boxes of one bank in a TanStack Query cache, its own or one it shares with minders of other banks. */

import { Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type MinderFriend, type MinderOpts, type QueryCacheOpts, MinderChecks } from '../shapes/shapes-minder'
import { Minder, MinderOptsChecks } from './minder'

/** This device's cache of one bank's boxes under its root box, and their listings, the root box's included ({@link Minder}).
 * The bank, its main gate and the root box itself are its BankMinder's.
 */
export class VaultMinder extends Minder {
  // == [Construction]: make, constructor

  /** Make a minder of the boxes in `bank`. It does nothing until `hello`. */
  static make(opts: MinderOpts, bank: MinderFriend): VaultMinder {
    const checked = Checks.vaultMinderMakeArgs.parse({ opts, bank })
    return new VaultMinder(checked.opts, checked.bank)
  }

  private constructor(opts: MinderOpts & Readonly<{ queryCacheOpts: QueryCacheOpts }>, bank: MinderFriend) {
    super(opts, bank)
    Object.freeze(this)
  }
  // --

  // == [What it minds]: mindsItemAt

  /** True for a box under the root box. */
  protected mindsItemAt(labelpath: Labelpath): boolean { return Labelpath.isBox(labelpath) && (labelpath !== Labelpath.RootBox) }
  // --
}

// == [Checks]: Checks

/** The checks of {@link VaultMinder.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj }) => ({
  vaultMinderMakeArgs: obj({ opts: MinderOptsChecks.minderOpts, bank: MinderChecks.minderFriend }),
}))
// --

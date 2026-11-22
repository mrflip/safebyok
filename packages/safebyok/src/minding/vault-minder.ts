/** `VaultMinder`, which minds the boxes of one bank in a TanStack Query cache, its own or one it shares with minders of other banks. */

import { Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import type { BoxRecord, VoidSentinel } from '../shapes/shapes-thing'
import { type MinderFriend, type QueryCacheOpts, type VaultMinderOpts, MinderChecks } from '../shapes/shapes-minder'
import { BankMinder } from './bank-minder'
import { Minder, MinderOptsChecks } from './minder'
import * as Phrases from '../phrases'

/** This device's cache of one bank's boxes under its root box, and their listings, the root box's included ({@link Minder}).
 * The bank, its main gate and the root box itself are its BankMinder's, which it reads the root box from.
 */
export class VaultMinder extends Minder {
  // == [Props]: #bankMinder

  /** The minder of the bank's roots, which the root box is read from. */
  readonly #bankMinder: BankMinder
  // --

  // == [Construction]: make, constructor

  /** Make a minder of the boxes in `bank`, reading the root box from `opts.bankMinder`. It does nothing until `hello`. */
  static make(opts: VaultMinderOpts, bank: MinderFriend): VaultMinder {
    const checked = Checks.vaultMinderMakeArgs.parse({ opts, bank })
    return new VaultMinder(checked.opts, checked.bank)
  }

  private constructor(opts: VaultMinderOpts & Readonly<{ queryCacheOpts: QueryCacheOpts }>, bank: MinderFriend) {
    super(opts, bank)
    this.#bankMinder = opts.bankMinder
    Object.freeze(this)
  }
  // --

  // == [What it minds]: mindsItemAt, rootBox

  /** True for a box under the root box. */
  protected mindsItemAt(labelpath: Labelpath): boolean { return Labelpath.isBox(labelpath) && (labelpath !== Labelpath.RootBox) }

  /** The bank's root box, the parent of every box, as its BankMinder last heard of it: its shell while none is. */
  get rootBox(): BoxRecord | VoidSentinel { return this.#bankMinder.rootBox }
  // --
}

// == [Checks]: Checks

/** The checks of {@link VaultMinder.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, custom }) => ({
  vaultMinderMakeArgs: obj({
    opts: MinderOptsChecks.minderOpts.extend({
      bankMinder: custom<BankMinder>((val) => val instanceof BankMinder, Phrases.BankMinderExpected),
    }),
    bank: MinderChecks.minderFriend,
  }),
}))
// --

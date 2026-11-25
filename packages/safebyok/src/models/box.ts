import { Validator } from 'safebyok-big/internals'
import { BaseBox } from './base-box'
import { type BulletproofCallback, type BoxRecord, type ThingScope, ThingChecks } from '../shapes/shapes-thing'
import { type ThingMakeOpts, ThingMakeChecks } from '../shapes/shapes-bankish'
import type { ShellOf } from '../shapes/shapes-sealers'
import type { BoxStamp } from '../shapes/shapes-stamps'
import { BoxChecks } from '../shapes/shapes-thingkinds'
import { type VaultItemEvent, SeenChecks } from '../shapes/shapes-vault-event'
import { Labelpath } from '../shapes/primitives'
import * as Phrases from '../phrases'

/** A box of the signed-in user's bank, as last heard of: a live box, its tombstone, or its shell. */
export class Box extends BaseBox {
  // == [Construction]: make, constructor

  // A box keeps nothing of its world but the wrapper of its subscribers.
  /** Make the box at `begun`, its shell, or an item event of its record, which it then receives. Nothing is fetched or stored.
   * Each subscriber is wrapped by `opts.world`'s `bulletproofCallback`. Throws where it refuses `begun`'s record.
   */
  static make(begun: ShellOf<BoxRecord> | VaultItemEvent<BoxRecord>, opts: ThingMakeOpts): Box {
    Checks.boxMakeArgs.parse({ begun, opts })
    const box = new Box(super.shellOf(('eventkind' in begun) ? begun.val : begun), opts.world.bulletproofCallback)
    if ('eventkind' in begun) { box.receive(begun) }
    return box
  }

  private constructor(shell: ShellOf<BoxRecord>, bulletproofCallback: BulletproofCallback) { super(shell, bulletproofCallback) }
  // --

  // == [Shapes]: scope, stamp

  /** Where this box is stored. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This box's {@link BoxStamp}, which its whisper's seal is bound to. Refuses the shell, whose lifeseq is the void one. */
  get stamp(): BoxStamp { return BoxChecks.stamp.parse(this) }
  // --
}

// == [Checks]: Checks

/** The checks of {@link Box.make}'s arguments. */
const Checks = Validator.Checkers('bad_record', ({ obj, union }) => ({
  boxMakeArgs: obj({
    begun: union([BoxChecks.shell, SeenChecks.itemEvent]).refine(({ labelpath }) => Labelpath.isOfModelkind(labelpath, 'box'), Phrases.BegunOfOtherKind),
    opts:  ThingMakeChecks.thingMakeOpts,
  }),
}))
// --

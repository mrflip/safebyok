import { BaseBox } from './base-box'
import type { ShellOf } from '../shapes/shapes-sealers'
import type { BoxStamp } from '../shapes/shapes-stamps'
import { type BoxRecord, type ThingScope, ThingChecks } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'

/** A box of the signed-in user's bank, as last heard of: a live box, its tombstone, or its shell. */
export class Box extends BaseBox {
  // == [Construction]: make, constructor

  // don't #bury-the-lede -- putting `.make` on one line doesn't let me see where the magic is made
  // this can also be a method on Thing, calling this.constructor.recordOrShell.parse(record)
  /** Make the box of `record`, a whole box record, live or a tombstone, or the box's shell. Nothing is fetched or stored. */
  static make(record: BoxRecord | ShellOf<BoxRecord>): Box {
    return new Box(BoxChecks.recordOrShell.parse(record))
  }

  private constructor(begun: BoxRecord | ShellOf<BoxRecord>) { super(begun) }
  // --

  // == [Shapes]: scope, stamp

  /** Where this box is stored. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  // BoxChecks.stamp.parse(this.pickle()) don't need the pickle, things duck as themselves
  // this should be a method on Thing, calling this.constructor.stamp.parse(this)
  /** This box's {@link BoxStamp}, which its whisper's seal is bound to. A 'void' box (lifeseq -1) will be refused  */
  get stamp(): BoxStamp { return BoxChecks.stamp.parse(this.pickle()) }
  // --
}

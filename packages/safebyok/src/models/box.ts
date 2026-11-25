import { BaseBox } from './base-box'
import type { ShellOf } from '../shapes/shapes-sealers'
import type { BoxStamp } from '../shapes/shapes-stamps'
import { type BoxRecord, type ThingScope, ThingChecks } from '../shapes/shapes-thing'
import { BoxChecks } from '../shapes/shapes-thingkinds'

/** A box of the signed-in user's bank, as last heard of: a live box, its tombstone, or its shell. */
export class Box extends BaseBox {
  // == [Construction]: make, constructor

  // A box models the very record it is handed, never the check's copy.
  /** Make the box of `record`, a whole box record, live or a tombstone, or the box's shell. Nothing is fetched or stored. */
  static make(record: BoxRecord | ShellOf<BoxRecord>): Box {
    BoxChecks.recordOrShell.parse(record)
    return new Box(record)
  }

  private constructor(begun: BoxRecord | ShellOf<BoxRecord>) { super(begun) }
  // --

  // == [Shapes]: scope, stamp

  /** Where this box is stored. */
  get scope(): ThingScope { return ThingChecks.thingScope.parse(this) }

  /** This box's {@link BoxStamp}, which its whisper's seal is bound to. Refuses the shell, whose lifeseq is the void one. */
  get stamp(): BoxStamp { return BoxChecks.stamp.parse(this) }
  // --
}

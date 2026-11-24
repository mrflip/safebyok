/** `PlainThing`, a concrete Thing of any kind, for the tests of Thing and of a VaultMinder. */

import { type ThingRecord, type ThingScope, Shell } from '../../src/shapes/shapes-thing'
import { type SeenThing, SeenChecks } from '../../src/shapes/shapes-vault-event'
import { type Adoptable, Thing } from '../../src/models/thing'

// == [PlainThing]: PlainThing

/** A Thing of any kind that holds only the records seen of it, with no device, gate or lease.
 * Begun from a record that is not whole, it models the shell until it receives a whole one. It binds no ctx, so it has no stamp.
 */
export class PlainThing extends Thing<ThingRecord, ThingScope, undefined, Adoptable<ThingRecord>> {
  // == [Construction]: make, constructor

  // Begun as `world.makeThing` begins a Thing: the VaultMinder that makes one has it receive `seen` after.
  /** A Thing begun from `seen`, the first record learned of at its labelpath: `seen` itself where it is whole, else the shell under the lives it names above it. */
  static make(seen: SeenThing): PlainThing {
    SeenChecks.seenCited.parse(seen)
    return new PlainThing(super.isWhole(seen) ? seen : Shell.inParentLivesOf(seen))
  }

  private constructor(begun: Adoptable<ThingRecord>) { super(begun) }
  // --

  // == [Shapes]: scope, stamp

  /** Where this Thing is stored. */
  get scope(): ThingScope { return Object.freeze({ userid: this.userid, banklabel: this.banklabel, labelpath: this.labelpath }) }

  /** No stamp: a plain Thing binds no ctx. */
  get stamp(): undefined { return }
  // --
}
// --

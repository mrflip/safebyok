/** `PlainThing`, a concrete Thing of any kind, and `RefusingThing`, one that refuses a record, for the tests of Thing and of a VaultMinder. */

import { type ThingRecord, type ThingScope, Shell } from '../../src/shapes/shapes-thing'
import { type SeenThing, SeenChecks } from '../../src/shapes/shapes-vault-event'
import { type Adoptable, Thing } from '../../src/models/thing'

// == [PlainThing]: PlainThing, RefusingThing

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

// A subclass's adopt may check what it adopts, as Gate's does its wayins: this one refuses outright.
/** A Thing of any kind whose adopt throws for a record of revseq {@link RefusingThing.RefusedRevseq}, begun as a {@link PlainThing} is. */
export class RefusingThing extends Thing<ThingRecord, ThingScope, undefined, Adoptable<ThingRecord>> {
  /** The revseq whose record this Thing's adopt refuses. */
  static readonly RefusedRevseq = 3
  /** What its adopt says as it refuses. */
  static readonly Refusal = "This record is refused."

  /** A Thing begun from `seen`: `seen` itself where it is whole, else the shell under the lives it names above it. */
  static make(seen: SeenThing): RefusingThing {
    SeenChecks.seenCited.parse(seen)
    return new RefusingThing(super.isWhole(seen) ? seen : Shell.inParentLivesOf(seen))
  }

  private constructor(begun: Adoptable<ThingRecord>) { super(begun) }

  /** Where this Thing is stored. */
  get scope(): ThingScope { return Object.freeze({ userid: this.userid, banklabel: this.banklabel, labelpath: this.labelpath }) }

  /** No stamp. */
  get stamp(): undefined { return }

  /** Adopt `record`, refusing one of revseq {@link RefusingThing.RefusedRevseq}. */
  protected override adopt(record: Adoptable<ThingRecord>): void {
    if (record.revseq === RefusingThing.RefusedRevseq) { throw new Error(RefusingThing.Refusal) }
    super.adopt(record)
  }
}
// --

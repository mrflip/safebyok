/** `PlainThing`, a concrete Thing of any kind, and `RefusingThing`, one that refuses a record, for the tests of Thing and of a VaultMinder. */

import type { ThingRecord, ThingScope, VoidSentinel } from '../../src/shapes/shapes-thing'
import { type VaultItemEvent, SeenChecks } from '../../src/shapes/shapes-vault-event'
import { type Adoptable, Thing } from '../../src/models/thing'

// == [PlainThing]: PlainThing, RefusingThing

/** A Thing of any kind that holds only the records seen of it, with no device, gate or lease.
 * It holds the shell until it receives a whole record. It binds no ctx, so it has no stamp.
 */
export class PlainThing extends Thing<ThingRecord, ThingScope, undefined, Adoptable<ThingRecord>> {
  // == [Construction]: make, constructor

  /** A Thing at `begun`, the shell at its labelpath, or an item event of its record, which it then receives. */
  static make(begun: VoidSentinel | VaultItemEvent): PlainThing {
    SeenChecks.begun.parse(begun)
    const thing = new PlainThing(super.shellOf(('eventkind' in begun) ? begun.val : begun))
    if ('eventkind' in begun) { thing.receive(begun) }
    return thing
  }

  private constructor(shell: VoidSentinel) { super(shell) }
  // --

  // == [Shapes]: scope, stamp

  /** Where this Thing is stored. */
  get scope(): ThingScope { return Object.freeze({ userid: this.userid, banklabel: this.banklabel, labelpath: this.labelpath }) }

  /** No stamp: a plain Thing binds no ctx. */
  get stamp(): undefined { return }
  // --
}

// A subclass's adopt may check what it adopts, as Gate's does its wayins: this one refuses outright.
/** A Thing of any kind whose adopt throws for a record of revseq {@link RefusingThing.RefusedRevseq}, made as a {@link PlainThing} is. */
export class RefusingThing extends Thing<ThingRecord, ThingScope, undefined, Adoptable<ThingRecord>> {
  /** The revseq whose record this Thing's adopt refuses. */
  static readonly RefusedRevseq = 3
  /** What its adopt says as it refuses. */
  static readonly Refusal = "This record is refused."

  /** A Thing at `begun`, the shell at its labelpath, or an item event of its record, which it then receives. */
  static make(begun: VoidSentinel | VaultItemEvent): RefusingThing {
    SeenChecks.begun.parse(begun)
    const thing = new RefusingThing(super.shellOf(('eventkind' in begun) ? begun.val : begun))
    if ('eventkind' in begun) { thing.receive(begun) }
    return thing
  }

  private constructor(shell: VoidSentinel) { super(shell) }

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

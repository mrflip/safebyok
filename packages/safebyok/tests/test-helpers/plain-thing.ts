/** `PlainThing`, a concrete Thing of any kind, for the tests of Thing and of a VaultMinder. */

import type { ThingRecord, ThingScope } from '../../src/shapes/shapes-thing'
import { type SeenThing, SeenChecks } from '../../src/shapes/shapes-vault-event'
import { type Adoptable, Thing } from '../../src/models/thing'

// == [PlainThing]: PlainThing

/** A Thing of any kind that holds only the records seen of it, with no device, gate or lease.
 * Begun from a sparse record, it models the shell until it receives a whole one. It binds no ctx, so it has no stamp.
 */
export class PlainThing extends Thing<ThingRecord, ThingScope, undefined, Adoptable<ThingRecord>> {
  // == [Construction]: make, constructor

  /** A Thing begun from `seen`, a record of any kind, whole or sparse, live or a tombstone, or the void sentinel: the first record learned of at its labelpath. */
  static make(seen: SeenThing): PlainThing {
    SeenChecks.seenCited.parse(seen)
    return new PlainThing(seen)
  }

  private constructor(seen: SeenThing) { super(seen) }
  // --

  // == [Shapes]: scope, stamp

  /** Where this Thing is stored. */
  get scope(): ThingScope { return Object.freeze({ userid: this.userid, banklabel: this.banklabel, labelpath: this.labelpath }) }

  /** No stamp: a plain Thing binds no ctx. */
  get stamp(): undefined { return }
  // --
}
// --

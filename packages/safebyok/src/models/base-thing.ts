import { Helpers } from 'safebyok-big/internals'
import type { Banklabel, EpochMillis, Labelpath, Lifepath, Lifeseq, Revtok, Userid } from '../storage/primitives'
import { type Thing, type ThingRecord, sparseOf } from '../storage/shapes-thing'

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which parses what it is given.
/** A model of one revision of a stored Thing: its Thing fields are read-only props, and its record is private.
 * A subclass parses its record before calling `super`, and freezes itself last.
 */
export abstract class BaseThing<RecordT extends Thing, ScopeT, StampT> implements ThingRecord {
  // == [Props]: userid, banklabel, labelpath, label, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am, #record

  /** The user's id. With `banklabel` and `labelpath`, it says where this Thing is stored. */
  declare readonly userid:     Userid
  declare readonly banklabel:  Banklabel
  declare readonly labelpath:  Labelpath
  /** The last label of `labelpath`. */
  declare readonly label:      string
  declare readonly fmt:        number
  /** The lifeseqs of this Thing's life and of each life above it, root first. */
  declare readonly lifepath:   Lifepath
  /** This Thing's life, as a lifeseq. A Thing born again has the next. */
  declare readonly lifeseq:    Lifeseq
  /** This revision's token. Every write makes a new one. */
  declare readonly revtok:     Revtok
  /** This revision's sequence number, 0 at the Thing's birth. */
  declare readonly revseq:     number
  declare readonly born_at:    EpochMillis
  /** When this revision was written, in epoch milliseconds. */
  declare readonly written_at: EpochMillis
  /** `'a'` while live, `'x'` for a tombstone. */
  declare readonly am:         ThingRecord['am']

  readonly #record: RecordT
  // --

  // == [Construction]: constructor

  protected constructor(record: RecordT) {
    this.#record = Object.freeze(record)
    Helpers.tattoo(this, sparseOf(record), { configurable: false })
  }
  // --

  // == [Shapes]: scope, stamp, pickle

  /** This Thing's scope, in the form its kind uses. */
  abstract get scope(): ScopeT

  /** This Thing's stamp: the fields fixed for its life, which every ctx under it binds. */
  abstract get stamp(): StampT

  /** This Thing's record, frozen. */
  pickle(): RecordT { return this.#record }
  // --
}

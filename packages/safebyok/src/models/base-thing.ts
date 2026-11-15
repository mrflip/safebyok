import { Helpers } from 'safebyok-big/internals'
import { type Thing, type ThingRecord, sparseOf } from '../storage/shapes-thing'

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which parses what it is given.
/** A model of a stored Thing: one revision of it, its Thing fields shown as read-only props, its record kept private.
 * A subclass parses its record before calling `super`, and freezes itself last.
 */
export abstract class BaseThing<RecordT extends Thing, ScopeT, StampT> implements ThingRecord {
  // == [Props]: userid, banklabel, labelpath, label, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am, #record

  /** The user's id; with `banklabel` and `labelpath`, where this Thing is stored. */
  declare readonly userid:     string
  declare readonly banklabel:  string
  declare readonly labelpath:  string
  /** The last label of `labelpath`. */
  declare readonly label:      string
  declare readonly fmt:        number
  /** The lifeseqs of this Thing's life and of each life above it, root first. */
  declare readonly lifepath:   string
  /** This Thing's life: one born again has the next. */
  declare readonly lifeseq:    string
  /** The revision in hand: every write makes a new one. */
  declare readonly revtok:     string
  /** The sequence number of the revision in hand, counting from 0 at its birth. */
  declare readonly revseq:     number
  declare readonly born_at:    number
  /** When the revision in hand was written, in epoch milliseconds. */
  declare readonly written_at: number
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

  /** This Thing's scope, as its kind is addressed. */
  abstract get scope(): ScopeT

  /** What every ctx under this Thing binds: the fields fixed for its life. */
  abstract get stamp(): StampT

  /** This Thing's record, frozen. */
  pickle(): RecordT { return this.#record }
  // --
}

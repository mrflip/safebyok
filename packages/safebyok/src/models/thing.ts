import { Helpers } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { ThingRecord } from '../shapes/shapes-thing'

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which parses what it is given.
/** A model of one revision of a stored Thing: its Thing fields are read-only props, and its record is private.
 * A subclass parses its record before calling `super`, and freezes itself last.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT> extends BaseThing {
  // == [Props]: #record

  readonly #record: RecordT
  // --

  // == [Construction]: constructor

  protected constructor(record: RecordT) {
    super()
    this.#record = Object.freeze(record)
    Helpers.tattoo(this, BaseThing.sparseOf(record), { configurable: false })
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

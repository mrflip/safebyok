import { omit, pick } from 'es-toolkit'
import { Helpers } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { ThingRecord } from '../shapes/shapes-thing'

/** The Thing fields that change from one revision to the next of a life: a newer record of the same life sets them again. */
const RevisionFieldnames = ['fmt', 'revtok', 'revseq', 'written_at', 'am'] as const satisfies readonly (keyof ThingRecord)[]

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which parses what it is given.
/** A model of one life of a stored Thing: its Thing fields are read-only props, and its record is private.
 * A subclass parses its record before calling `super`. One that never adopts a newer record freezes itself last.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT> extends BaseThing {
  // == [Props]: #record

  #record: RecordT
  // --

  // == [Construction]: constructor, adoptRecord

  protected constructor(record: RecordT) {
    super()
    this.#record = Object.freeze(record)
    const sparse = BaseThing.sparseOf(record)
    Helpers.tattoo(this, omit(sparse, RevisionFieldnames), { configurable: false })
    Helpers.tattoo(this, pick(sparse, RevisionFieldnames))
  }

  // The fields fixed for a life stay as they were: `record` is taken to be of this Thing's life, and nothing checks it.
  /** Make `record`, a newer revision of this Thing's life, the one this Thing models. */
  protected adoptRecord(record: RecordT): void {
    this.#record = Object.freeze(record)
    Helpers.tattoo(this, pick(BaseThing.sparseOf(record), RevisionFieldnames))
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

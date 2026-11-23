import { Helpers, VX } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { ThingRecord } from '../shapes/shapes-thing'

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which parses what it is given.
/** A model of one life of a stored Thing: its Thing fields are read-only props, and its record is private.
 * Its spread, `{ ...thing }`, shows its Thing fields alone, which belong in a log: nothing secret and nothing opaque. A subclass keeps what it adds private, or behind a getter.
 * A subclass parses its record before calling `super`. One that never adopts a newer record freezes itself last.
 * A listener can {@link subscribe} to the changes a subclass tells of.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT> extends BaseThing {
  // == [Props]: #record, #subscribers, #subscribe

  #record: RecordT

  readonly #subscribers = new Set<() => void>()
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(VX.listener.parse(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  // --

  // == [Construction]: constructor, adoptRecord

  protected constructor(record: RecordT) {
    super()
    this.#record = Object.freeze(record)
    const { lifeFields, revisionFields } = fieldsOf(record)
    Helpers.tattoo(this, lifeFields, { configurable: false })
    Helpers.tattoo(this, revisionFields)
  }

  // The fields fixed for a life stay as they were: `record` is taken to be of this Thing's life, and nothing checks it.
  /** Make `record`, a newer revision of this Thing's life, the one this Thing models. */
  protected adoptRecord(record: RecordT): void {
    this.#record = Object.freeze(record)
    Helpers.tattoo(this, fieldsOf(record).revisionFields)
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

  // == [Subscribers]: subscribe, tellSubscribers, dropSubscribers

  /** Subscribe a listener to this Thing's changes, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument after each change the subclass tells of: read the Thing again.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** Call each subscriber, handing what one throws to `onThrow`. */
  protected tellSubscribers(onThrow: (err: unknown) => void): void {
    for (const listener of this.#subscribers) {
      try {
        listener()
      } catch (err) {
        onThrow(err)
      }
    }
  }

  /** Let go of every subscriber: none is told of anything after. */
  protected dropSubscribers(): void { this.#subscribers.clear() }
  // --
}

// == [Helpers]: fieldsOf

/** The Thing fields of `record`: those fixed for its life, and those a newer revision of the life sets again. */
function fieldsOf(record: ThingRecord) {
  const { fmt, revtok, revseq, written_at, am, ...lifeFields } = BaseThing.sparseOf(record)
  return { lifeFields, revisionFields: { fmt, revtok, revseq, written_at, am } }
}
// --

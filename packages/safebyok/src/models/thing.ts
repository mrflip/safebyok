import { pick } from 'es-toolkit'
import { Helpers, VX, Validator } from 'safebyok-big/internals'
import { BaseThing, ThingFieldnames } from './base-thing'
import * as Phrases from '../phrases'
import { type EpochMillis, Labelpath } from '../shapes/primitives'
import type { ShellOf } from '../shapes/shapes-sealers'
import { type Sparse, type ThingCited, type ThingRecord, type Tombstone, Shell, ThingChecks, isLifepathDeep, isParityRight } from '../shapes/shapes-thing'
import { type Agerank, type SeenThing, type VaultEvent, livenessVals, vaultEventkindVals } from '../shapes/shapes-vault-event'
import { eventsOf, itemSeenOf, raisedOf, timeOf } from '../storage/agerank'
import { ReadTcPattern, readAtOf } from '../storage/thing-classifier'
import type { ReadTc } from '../storage/vault-db'

// == [Adoptable]: Adoptable

/** A record a Thing of `RecordT`'s kind models: a whole live record, a tombstone, or the void sentinel. */
export type Adoptable<RecordT extends ThingRecord> = RecordT | Tombstone<RecordT> | ShellOf<RecordT>
// --

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which parses what it is given.
// A subclass whose `PickleT` leaves out a tombstone or the void sentinel must begin from a whole live record, and never
// receive either: `pickle` answers what was adopted, typed as the subclass says.
/** A model of the stored Thing at one labelpath, across its lives, which reads as the record it last adopted.
 * Each field of that record is a read-only prop. Only the loggable ones, its Thing fields unless a subclass names more in
 * {@link loggableFieldnames}, are enumerable: a spread, `{ ...thing }`, or `JSON.stringify` shows nothing secret and nothing opaque.
 * A field the record lacks is no prop: after a tombstone or the shell, a Thing answers none of its last live record's body. Its scope fields never change.
 * Its type names the Thing fields and what a subclass declares; narrow {@link pickle} for the rest of a kind's fields.
 * What Thing itself holds is records as the vaultDB stores them, and what is derived from them: never a cleartext, a key or a lease.
 * It always models a record, at worst the shell, and its {@link receive} says which item events of the Thing are news.
 * A subclass parses what it begins from before calling `super`, and has no other member under a record field's name. One that never receives may freeze itself last.
 * A listener can {@link subscribe} to the changes a subclass tells of.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT, PickleT extends Adoptable<RecordT> = RecordT> extends BaseThing {
  // == [Props]: #record, #citable, #agerank, #readAt, #subscribers, #subscribe

  // Set by the constructor's adopt, which finds it undefined.
  #record: Adoptable<RecordT> | undefined = undefined
  /** The citation of the newest revision seen. */
  #citable: ThingCited
  #agerank: Agerank | undefined = undefined
  #readAt: EpochMillis | undefined = undefined

  readonly #subscribers = new Set<() => void>()
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(VX.listener.parse(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  // --

  // == [Construction]: constructor, loggableFieldnames, adopt

  // A sparse live record is cited, not adopted: the shell stands in for its record until a whole one comes.
  /** A Thing begun from `begun`, which it adopts where that is whole, a tombstone or the void sentinel.
   * Begun from a sparse live record, it adopts the shell under the lives that record names above it, and cites the record.
   */
  protected constructor(begun: SeenThing<RecordT>) {
    super()
    this.#citable = citedOf(begun)
    this.adopt((BaseThing.isSparse(begun) ? Shell.inParentLivesOf(begun) : begun) as Adoptable<RecordT>)
  }

  // `adopt` reads it while `super` runs, before a subclass's fields exist: a subclass overrides the getter.
  /** The names of the record fields a spread, a log line and `JSON.stringify` show: the Thing fields, unless a subclass names more. Never name an opaque field. */
  protected get loggableFieldnames(): readonly string[] { return ThingFieldnames }

  /** Make `record` the one this Thing models, of whatever life: each of its fields becomes a prop, set again, and a field it lacks is removed. */
  protected adopt(record: Adoptable<RecordT>): void {
    Object.freeze(record)
    const was = this.#record
    this.#record = record
    const loggable = this.loggableFieldnames
    const dropped = Object.keys(was ?? {}).filter((ckey) => ! Object.hasOwn(record, ckey))
    for (const ckey of dropped) { Reflect.deleteProperty(this, ckey) }
    for (const [ckey, val] of Object.entries(record)) {
      if (ScopeFieldnames.has(ckey)) {
        if (was === undefined) { Helpers.tattooProp(this, ckey, val, { configurable: false }) }
      } else if (loggable.includes(ckey)) {
        Helpers.tattooProp(this, ckey, val)
      } else {
        Helpers.adorn(this, ckey, val, { writable: false })
      }
    }
    if (BaseThing.cmp(this.#citable, record) > 0) { this.#citable = citedOf(record) }
  }
  // --

  // == [Feed]: citable, agerank, read_at, receive

  /** What a write over this Thing cites: the citation of the newest revision seen, sparse or whole. */
  get citable(): ThingCited { return this.#citable }

  /** How far this Thing has been seen, as {@link Agerank} spells it, or undefined until it first receives a record. */
  get agerank(): Agerank | undefined { return this.#agerank }

  /** When the newest revision seen was last seen, in epoch milliseconds, or undefined until it first receives a record. */
  get read_at(): EpochMillis | undefined { return this.#readAt }

  /** Take `proposed`, an event of this Thing, and return the events that are news: none, and nothing changed, unless its record is news.
   * News is a record that raises the agerank: from a later life, newer than any revision seen, a whole record newer than any
   * whole one seen, or the newest revision seen again in a later span of 65.536 seconds than it was last seen in.
   * The events are `proposed` with its ageranks, then any `life`, then any `aged`, each frozen. A whole record, a tombstone
   * or the void sentinel is adopted; a sparse live record moves only `citable`, `agerank` and `read_at`.
   * A `life` or `aged` event returns none. Refuses an event of another Thing.
   */
  receive(proposed: VaultEvent<RecordT>): readonly VaultEvent<RecordT>[] {
    Checks.event.parseConsistent(proposed, pick(this, ['userid', 'banklabel', 'labelpath']))
    if (proposed.eventkind !== 'item') { return NoEvents }
    const { read_tc } = Checks.item.parse(proposed)
    const { val, liveness } = proposed
    const agerankWas = this.#agerank
    const agerank = raisedOf(agerankWas, { lifepath: val.lifepath, revseq: val.revseq, time: timeOf(read_tc) }, liveness !== 'soon')
    if (agerank === undefined) { return NoEvents }
    // Adopted first, so that an adopt that throws leaves this Thing as it was. Read before it, since adopt may move citable.
    const readAt = this.#readAtAfter(val, readAtOf(read_tc))
    if (liveness !== 'soon') { this.adopt(val) }
    this.#agerank = agerank
    this.#readAt  = readAt
    if (BaseThing.cmp(this.#citable, val) > 0) { this.#citable = citedOf(val) }
    return eventsOf(proposed, agerankWas, agerank)
  }

  // The time belongs to the newest revision, as the agerank's does: a newer one brings its own, the same one the later.
  /** The `read_at` after `seen` is read at `readAt`: moved where `seen` is the newest revision seen, or newer */
  #readAtAfter(seen: Pick<ThingCited, 'lifepath' | 'revseq'>, readAt: EpochMillis): EpochMillis {
    const order = BaseThing.cmp(this.#citable, seen)
    if ((order > 0) || (this.#readAt === undefined)) { return readAt }
    return (order === 0) ? Math.max(this.#readAt, readAt) : this.#readAt
  }
  // --

  // == [Shapes]: scope, stamp, pickle

  /** This Thing's scope, in the form its kind uses. */
  abstract get scope(): ScopeT

  /** This Thing's stamp: the fields fixed for its life, which every ctx under it binds. */
  abstract get stamp(): StampT

  /** The record this Thing models, frozen: the last it adopted, which is the shell for a Thing begun from a sparse record until a whole one comes. */
  pickle(): PickleT { return this.#record as PickleT }
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

// == [Helpers]: ScopeFieldnames, NoEvents, citedOf

/** The names of the scope fields, set once, as a Thing begins. */
const ScopeFieldnames: ReadonlySet<string> = new Set(['userid', 'banklabel', 'labelpath'])

/** What `receive` returns for an event that is not news. */
const NoEvents: readonly never[] = Object.freeze([])

/** The citation of `seen`, frozen */
function citedOf(seen: Sparse<ThingRecord>): ThingCited { return Object.freeze(pick(seen, ['revtok', 'revseq', 'lifepath', 'am'])) }
// --

// == [Checks]: SeenChecks, Checks

// A lifepath as deep as its labelpath is what lets two ageranks of one Thing compare as strings: each lifeseq and revseq
// is ten characters and the time eight, so each `/` and `|` falls at one place.
// ReadTcPattern is read only as a check runs: thing-classifier imports this module, so the pattern may not be defined
// yet while this module loads.
/** The checks of a record a Thing is begun from or receives, and of when it was read. */
export const SeenChecks = Validator.Checkers('bad_record', ({ custom }) => ({
  /** Check the scope and citation of a record or a void sentinel, keeping the rest: a lifeseq for each label, its own odd exactly for a tombstone. */
  seenCited: ThingChecks.scopedCited.loose()
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
  /** Check a `read_tc`: a UUID version 7. */
  readTc:    custom<ReadTc>((val) => (typeof val === 'string') && ReadTcPattern.test(val), Phrases.ReadTcShape),
}))

/** The checks of an event a Thing receives: its kind and scope, then an item's record, liveness and `read_tc`. */
const Checks = Validator.Checkers('bad_record', ({ obj, oneof }) => ({
  event:  obj({ ...ThingChecks.thingScope.shape, eventkind: oneof(vaultEventkindVals) }),
  item:   obj({
    ...ThingChecks.thingScope.shape,
    modelkind: ThingChecks.modelkind,
    liveness:  oneof(livenessVals),
    val:       SeenChecks.seenCited,
    read_tc:   SeenChecks.readTc,
  })
    .refine(({ labelpath, modelkind }) => Labelpath.modelkindOf(labelpath) === modelkind, Phrases.EventModelkind)
    .refine(({ val, ...scope }) => BaseThing.haveSameScope(val, scope), Phrases.EventOfOtherThing)
    .refine(({ val, liveness }) => itemSeenOf(val as SeenThing).liveness === liveness, Phrases.EventLiveness),
}))
// --

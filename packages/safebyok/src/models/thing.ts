import { deepFreeze, isEqual, pick } from 'es-toolkit'
import { Helpers, VX } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { EpochMillis } from '../shapes/primitives'
import type { ShellOf } from '../shapes/shapes-sealers'
import { type Sparse, type ThingCited, type ThingRecord, type Tombstone, Shell } from '../shapes/shapes-thing'
import { type Agekind, type Agerank, type SeenThing, type VaultEvent, SeenChecks } from '../shapes/shapes-vault-event'
import { agekindOf, eventsOf, nextAgerankOf } from '../storage/agerank'
import { readAtOf } from '../storage/thing-classifier'

// == [Adoptable]: Adoptable

/** A record a Thing of `RecordT`'s kind models: a whole live record, a tombstone, or the void sentinel. */
export type Adoptable<RecordT extends ThingRecord> = RecordT | Tombstone<RecordT> | ShellOf<RecordT>
// --

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(record, opts[, friend])`, which checks what it is given and begins from that very record.
// A subclass whose `PickleT` leaves out a tombstone or the void sentinel must begin from a whole live record, and never
// receive either: `pickle` answers what was adopted, typed as the subclass says.
/** A model of the stored Thing at one labelpath, across its lives, which reads as the record it last adopted.
 * Each field of that record is read-only. Its Thing fields are its own enumerable props: a spread, `{ ...thing }`, or
 * `JSON.stringify` shows nothing secret and nothing opaque. A kind's body is read by a subclass's getters off the record adopted.
 * A body field the record lacks reads as undefined: after a tombstone or the shell, a Thing answers none of its last live record's body. Its scope fields never change.
 * Its type names the Thing fields and what a subclass declares; narrow {@link pickle} for the rest of a kind's fields.
 * What Thing itself holds is records as the vaultDB stores them, and what is derived from them: never a cleartext, a key or a lease.
 * It always models a record, at worst the shell, and its {@link receive} says which item events of the Thing are news.
 * A subclass checks what it begins from before calling `super`, and has no member under a record field's name but its body's getters. One that never receives may freeze itself last.
 * A listener can {@link subscribe} to the changes a subclass tells of.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT, PickleT extends Adoptable<RecordT> = RecordT> extends BaseThing {
  // == [Props]: #record, #citable, #agerank, #readAt, #subscribers, #subscribe

  // Set by the constructor's adopt.
  #record: Adoptable<RecordT> | undefined = undefined
  /** The Thing fields of the newest revision seen. */
  #citable: Sparse<ThingRecord>
  #agerank: Agerank | undefined = undefined
  #readAt: EpochMillis | undefined = undefined

  readonly #subscribers = new Set<() => void>()
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(VX.listener.parse(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  // --

  // == [Construction]: constructor, adopt

  // A sparse live record is cited, not adopted: the shell stands in for its record until a whole one comes.
  /** A Thing begun from `begun`, which it adopts where that is whole, a tombstone or the void sentinel.
   * Begun from a sparse live record, it adopts the shell under the lives that record names above it, and cites the record.
   */
  protected constructor(begun: SeenThing<RecordT>) {
    super()
    const { userid, banklabel, labelpath } = begun
    Helpers.tattoo(this, { userid, banklabel, labelpath }, { configurable: false })
    this.#citable = citedOf(begun)
    this.adopt((BaseThing.isSparse(begun) ? Shell.inParentLivesOf(begun) : begun) as Adoptable<RecordT>)
  }

  // The scope fields are the constructor's: `receive` refuses a record of another scope before it adopts one.
  // A record from an adapter is frozen already; one that reaches a Thing another way is frozen here.
  /** Make `record` the one this Thing models, of whatever life, its Thing fields shown as read-only props. */
  protected adopt(record: Adoptable<RecordT>): void {
    this.#record = deepFreeze(record)
    const { label, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am } = record
    Helpers.tattoo(this, { label, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am })
    if (BaseThing.cmp(this.#citable, record) > 0) { this.#citable = citedOf(record) }
  }
  // --

  // == [Feed]: citable, agerank, agekind, read_at, receive

  /** What a write over this Thing cites: the Thing fields of the newest revision seen, sparse or whole. */
  get citable(): Sparse<ThingRecord> { return this.#citable }

  /** How far this Thing has been seen, as {@link Agerank} spells it, or undefined until it first receives a record. */
  get agerank(): Agerank | undefined { return this.#agerank }

  // A Thing bare in a later life still holds an earlier life's record.
  /** Whether the newest revision seen has been seen whole ({@link Agekind}), or undefined until this Thing first receives a record. Check it before reading the record. */
  get agekind(): Agekind | undefined { return (this.#agerank === undefined) ? undefined : agekindOf(this.#agerank) }

  /** When the newest revision seen was last seen, in epoch milliseconds, or undefined until it first receives a record. */
  get read_at(): EpochMillis | undefined { return this.#readAt }

  /** Take `proposed`, an event of this Thing, and return the events that are news: none, and nothing changed, unless its record is news.
   * News is a record that leaves the agerank greater than it was: from a later life, newer than any revision seen, a whole record newer than any
   * whole one seen, or the newest revision seen again in a later tcchunk, a span of 65.536 seconds, than it was last seen in.
   * The events are `proposed` with its ageranks, then any `life`, then any `aged`, each frozen. A whole record, a tombstone
   * or the void sentinel is adopted, unless it equals the record held, which stays the same object; a sparse live record moves only `citable`, `agerank` and `read_at`.
   * A `life` or `aged` event returns none. Refuses an event of another Thing.
   */
  receive(proposed: VaultEvent<RecordT>): readonly VaultEvent<RecordT>[] {
    SeenChecks.event.parseConsistent(proposed, pick(this, ['userid', 'banklabel', 'labelpath']))
    if (proposed.eventkind !== 'item') { return NoEvents }
    const { read_tc } = SeenChecks.item.parse(proposed)
    const { val, liveness } = proposed
    const agerankWas = this.#agerank
    const agerank = nextAgerankOf(agerankWas, val, read_tc, liveness !== 'soon')
    if (agerank === undefined) { return NoEvents }
    // Adopted first, so that an adopt that throws leaves this Thing as it was. Read before it, since adopt may move citable.
    const readAt = this.#readAtAfter(val, readAtOf(read_tc))
    if ((liveness !== 'soon') && ! isEqual(this.#record, val)) { this.adopt(val) }
    this.#agerank = agerank
    this.#readAt  = readAt
    if (BaseThing.cmp(this.#citable, val) > 0) { this.#citable = citedOf(val) }
    return eventsOf(proposed, agerankWas, agerank)
  }

  // The time belongs to the newest revision, as the agerank's tcchunk does: a newer one brings its own, the same one the later.
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

// == [Helpers]: NoEvents, citedOf

/** What `receive` returns for an event that is not news. */
const NoEvents: readonly never[] = Object.freeze([])

/** The Thing fields of `seen`, frozen */
function citedOf(seen: Sparse<ThingRecord>): Sparse<ThingRecord> { return Object.freeze(BaseThing.sparseOf(seen)) }
// --

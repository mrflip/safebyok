import { deepFreeze, isEqual, pick } from 'es-toolkit'
import { Helpers, VX } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { LiveOf, ShellOf } from '../shapes/shapes-sealers'
import type { BulletproofCallback, Sparse, ThingRecord, Tombstone } from '../shapes/shapes-thing'
import { type Agekind, type Agerank, type VaultEvent, SeenChecks } from '../shapes/shapes-vault-event'
import { VacantAgerank, agekindOf, eventsOf, nextAgerankOf } from '../storage/agerank'
import * as Throwers from '../refusals/throwers'

// == [Adoptable]: Adoptable

/** A record a Thing of `RecordT`'s kind models: a whole record, live or a tombstone, or the void sentinel. */
export type Adoptable<RecordT extends ThingRecord> = RecordT | Tombstone<RecordT> | ShellOf<RecordT>
// --

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(begun, opts[, friend])`, which checks what it is given, constructs the Thing at its
// shell, and has it receive `begun` where that is an item event.
/** A model of the stored Thing at one labelpath, across its lives, which reads as the record it last adopted.
 * Each field of that record is read-only. Its Thing fields are its own enumerable props: a spread, `{ ...thing }`, or
 * `JSON.stringify` shows nothing secret and nothing opaque. A kind's body is read by a subclass's getters off the record adopted.
 * After a tombstone, a Thing answers the tombstone's body, never its last live record's; over the shell, which has none, each body field reads as undefined. Its scope fields never change.
 * Its type names the Thing fields and what a subclass declares; narrow {@link pickle} for the rest of a kind's fields.
 * What Thing itself holds is records as the vaultDB stores them, and what is derived from them: never a cleartext, a key or a lease.
 * It always models a record, at worst the shell, which it holds until it first receives one, and its {@link receive} says which item events of the Thing are news.
 * A subclass has no member under a record field's name but its body's getters.
 * A listener can {@link subscribe} to it, and is told each time {@link receive} returns news.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT, PickleT extends Adoptable<RecordT> = Adoptable<RecordT>> extends BaseThing {
  // == [Props]: #record, #citable, #agerank, #bulletproofCallback, #subscribers, #subscribe

  // Set by the constructor's adopt.
  #record: Adoptable<RecordT> | undefined = undefined
  /** The Thing fields of the newest revision seen. */
  #citable: Sparse<ThingRecord>
  #agerank: Agerank = VacantAgerank

  /** Wraps each subscriber as it subscribes: what one throws goes where the maker said, or reaches `receive`'s caller where it said nothing. */
  readonly #bulletproofCallback: BulletproofCallback
  /** Each subscriber, beside its wrapped form, which is what is called. */
  readonly #subscribers = new Map<() => void, () => void>()
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.set(VX.listener.parse(listener), this.#bulletproofCallback(listener))
    return () => { this.#subscribers.delete(listener) }
  }
  // --

  // == [Construction]: constructor, adopt

  /** A Thing at `shell`, the shell at its labelpath, which has received nothing, each subscriber wrapped by `bulletproofCallback` where given. */
  protected constructor(shell: ShellOf<RecordT>, bulletproofCallback: BulletproofCallback = callAsIs) {
    super()
    this.#bulletproofCallback = bulletproofCallback
    const { userid, banklabel, labelpath } = shell
    Helpers.tattoo(this, { userid, banklabel, labelpath }, { configurable: false })
    this.#citable = citedOf(shell)
    this.adopt(shell)
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

  // == [Feed]: citable, agerank, agekind, receive

  /** What a write over this Thing cites: the Thing fields of the newest revision seen, whole or a live box's sparse form. */
  get citable(): Sparse<ThingRecord> { return this.#citable }

  /** How far this Thing has been seen, as {@link Agerank} spells it: the vacant agerank until it first receives a record. */
  get agerank(): Agerank { return this.#agerank }

  // A Thing bare in a later life still holds an earlier life's record.
  /** Whether the newest revision seen has been seen whole ({@link Agekind}): `vacant` until this Thing first receives a record. Check it before reading the record. */
  get agekind(): Agekind { return agekindOf(this.#agerank) }

  /** Take `proposed`, an event of this Thing, and return the events that are news: none, and nothing changed, unless its record is news.
   * News is a record that leaves the agerank greater than it was: from a later life, newer than any revision seen, a whole record newer than any
   * whole one seen, or the newest revision seen again in a later tcchunk, a span of 65.536 seconds, than it was last seen in.
   * The events are `proposed` with its ageranks, then any `life`, then any `aged`, each frozen. A whole record, a tombstone
   * or the void sentinel is adopted, unless it equals the record held, which stays the same object; a live box's sparse form moves only `citable` and `agerank`.
   * Each subscriber is told once the news is taken in. A `life` or `aged` event returns none. Refuses an event of another Thing, and a record in any other form.
   */
  receive(proposed: VaultEvent<RecordT>): readonly VaultEvent<RecordT>[] {
    SeenChecks.event.parseConsistent(proposed, pick(this, ['userid', 'banklabel', 'labelpath']))
    if (proposed.eventkind !== 'item') { return NoEvents }
    const { read_tc } = SeenChecks.item.parse(proposed)
    const { val, liveness } = proposed
    const agerankWas = this.#agerank
    const agerank = nextAgerankOf(agerankWas, val, read_tc, liveness !== 'soon')
    if (agerank === undefined) { return NoEvents }
    // Adopted first, so that an adopt that throws leaves this Thing as it was.
    if ((liveness !== 'soon') && ! isEqual(this.#record, val)) { this.adopt(val) }
    this.#agerank = agerank
    if (BaseThing.cmp(this.#citable, val) > 0) { this.#citable = citedOf(val) }
    this.#tellSubscribers()
    return eventsOf(proposed, agerankWas, agerank)
  }
  // --

  // == [Shapes]: scope, stamp, pickle

  /** This Thing's scope, in the form its kind uses. */
  abstract get scope(): ScopeT

  /** This Thing's stamp: the fields fixed for its life, which every ctx under it binds. */
  abstract get stamp(): StampT

  /** The record this Thing models, frozen: the last it adopted. */
  pickle(): PickleT { return this.#record as PickleT }
  // --

  // == [Guards]: demandLive

  // TypeScript cannot narrow a record of the type parameter by its `am`.
  /** The live record this Thing models, refusing the shell or a tombstone. */
  protected demandLive(): LiveOf<RecordT> {
    const record = this.#record
    if (record?.am !== 'a') { throw Throwers.thingNotLive(this.labelpath) }
    return record as LiveOf<RecordT>
  }
  // --

  // == [Subscribers]: subscribe, #tellSubscribers, dropSubscribers

  /** Subscribe a listener to this Thing's news, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument each time {@link receive} returns news: read the Thing again. Its record, {@link pickle}, is the same object until a newer one is adopted.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** Call each subscriber. */
  #tellSubscribers(): void {
    for (const told of this.#subscribers.values()) { told() }
  }

  /** Let go of every subscriber: none is told of anything after. */
  protected dropSubscribers(): void { this.#subscribers.clear() }
  // --
}

// == [Helpers]: NoEvents, callAsIs, citedOf

/** What `receive` returns for an event that is not news. */
const NoEvents: readonly never[] = Object.freeze([])

/** The {@link BulletproofCallback} of a Thing whose maker gave none: `callback` as it is. */
function callAsIs<ArgsT extends unknown[]>(callback: (...args: ArgsT) => void): (...args: ArgsT) => void { return callback }

/** The Thing fields of `seen`, frozen */
function citedOf(seen: Sparse<ThingRecord>): Sparse<ThingRecord> { return Object.freeze(BaseThing.sparseOf(seen)) }
// --

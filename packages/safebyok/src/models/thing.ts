import { deepFreeze, pick } from 'es-toolkit'
import { Helpers, VX } from 'safebyok-big/internals'
import { BaseThing } from './base-thing'
import type { LiveOf, ShellOf } from '../shapes/shapes-sealers'
import type { BulletproofCallback, ThingRecord, Tombstone } from '../shapes/shapes-thing'
import { type VaultEvent, SeenChecks } from '../shapes/shapes-vault-event'
import * as Throwers from '../refusals/throwers'

// == [Adoptable]: Adoptable

/** A record a Thing of `RecordT`'s kind models: a whole record, live or a tombstone, or the void sentinel. */
export type Adoptable<RecordT extends ThingRecord> = RecordT | Tombstone<RecordT> | ShellOf<RecordT>
// --

// TypeScript cannot type a static `make` here that returns the subclass while its constructor is private, so each
// subclass declares its own: `make(begun, opts[, friend])`, which checks what it is given, constructs the Thing at its
// shell, and has it receive `begun` where that is an item event.
/** A model of the stored Thing at one labelpath, across its lives: it reads as the record it holds, the shell until it adopts one, and knows nothing else.
 * Its Thing fields are its own read-only enumerable props, so a spread, `{ ...thing }`, or `JSON.stringify` shows nothing secret and nothing opaque.
 * A subclass reads its kind's body off the record with getters, and has no other member under a record field's name: over the shell each reads as
 * undefined, after a tombstone as the tombstone's. Its scope fields and its modelkind never change. Narrow {@link pickle} for the rest of a kind's fields.
 * It holds records as the vaultDB has them, never a cleartext, a key or a lease. A listener can {@link subscribe} to hear of each record it adopts.
 */
export abstract class Thing<RecordT extends ThingRecord, ScopeT, StampT, PickleT extends Adoptable<RecordT> = Adoptable<RecordT>> extends BaseThing {
  // == [Props]: #record, #bulletproofCallback, #subscribers, #subscribe

  // Set by the constructor's adopt.
  #record: Adoptable<RecordT> | undefined = undefined

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
    const { userid, banklabel, labelpath, modelkind } = shell
    Helpers.tattoo(this, { userid, banklabel, labelpath, modelkind }, { configurable: false })
    this.adopt(shell)
  }

  // The scope fields and the modelkind are the constructor's: `receive` refuses a record of another scope before it adopts one.
  // A record from an adapter is frozen already; one that reaches a Thing another way is frozen here.
  /** Make `record` the one this Thing models, of whatever life, its Thing fields shown as read-only props. */
  protected adopt(record: Adoptable<RecordT>): void {
    this.#record = deepFreeze(record)
    const { label, banktok, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am } = record
    Helpers.tattoo(this, { label, banktok, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am })
  }
  // --

  // == [Receiving]: receive, take

  /** Take the record of `proposed`, an item event of this Thing, and publish to each subscriber where it is adopted. Returns whether it was.
   * {@link take} says which records are adopted, and what refuses.
   */
  receive(proposed: VaultEvent<RecordT>): boolean {
    const isAdopted = this.take(proposed)
    if (isAdopted) { this.publish() }
    return isAdopted
  }

  // A car moves how far its Thing has been seen between the two halves of a receive, so that a subscriber finds the car past the record.
  /** Adopt the record of `proposed` where it is whole, a tombstone or the void sentinel, and newer than the record held, and return whether it did. No subscriber is told: call {@link publish} after.
   * A live box's sparse form, a record no newer, and a `life` or `aged` event change nothing. Refuses an event of another Thing, and a record in any other form.
   */
  take(proposed: VaultEvent<RecordT>): boolean {
    SeenChecks.event.parseConsistent(proposed, pick(this, ['userid', 'banklabel', 'labelpath', 'modelkind']))
    if (proposed.eventkind !== 'item') { return false }
    SeenChecks.item.parse(proposed)
    const { val, liveness } = proposed
    if ((liveness === 'soon') || (BaseThing.cmp(this.pickle(), val) <= 0)) { return false }
    this.adopt(val)
    return true
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

  // == [Subscribers]: subscribe, publish, dropSubscribers

  /** Subscribe a listener to this Thing's news, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it.
   * The listener is called with no argument each time this Thing adopts a record: read the Thing again. Its record, {@link pickle}, is the same object until a newer one is adopted.
   */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }

  /** Call each subscriber, as {@link receive} does once a record is adopted. */
  publish(): void {
    for (const told of this.#subscribers.values()) { told() }
  }

  /** Let go of every subscriber: none is told of anything after. */
  protected dropSubscribers(): void { this.#subscribers.clear() }
  // --
}

// == [Helpers]: callAsIs

/** The {@link BulletproofCallback} of a Thing whose maker gave none: `callback` as it is. */
function callAsIs<ArgsT extends unknown[]>(callback: (...args: ArgsT) => void): (...args: ArgsT) => void { return callback }
// --

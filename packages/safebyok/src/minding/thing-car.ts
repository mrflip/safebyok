/** `ThingCar`, which a VaultMinder keeps for each Thing: the Thing, how far it has been seen, and the refusal it last raised at a record. */

import { pick } from 'es-toolkit'
import { Clock, type Errors } from 'safebyok-big/internals'
import type { EpochMillis } from '../shapes/primitives'
import type { MaskedRow } from '../shapes/shapes-masked-view'
import type { Sparse, ThingCited, ThingRecord, VoidSentinel } from '../shapes/shapes-thing'
import { type Agekind, type Agerank, type ReadTc, type VaultEvent, type VaultItemEvent, SeenChecks } from '../shapes/shapes-vault-event'
import { type CarBank, type ReceivingThing, type ThingCarOpts, ThingCarChecks } from '../shapes/shapes-vault-minder'
import { BaseThing } from '../models/base-thing'
import { maskedOf } from '../helpers/mask-ciphertexts'
import { VaultTSQ } from './vault-tsq'
import { VacantReadTc, agekindOf, eventsOf, heldAgerankOf, nextAgerankOf, readAtOf } from '../storage/agerank'
import * as Throwers from '../refusals/throwers'

// == [ThingCar]: ThingCar

/** A Thing, and how far it has been seen: what a write over it cites, its agerank, and when its newest revision was read.
 * It decides which records of the Thing are news, and hands the Thing those it holds whole. It keeps the refusal the Thing last raised, for a devtool.
 */
export class ThingCar<ThingT extends ReceivingThing = ReceivingThing> {
  // == [Props]: thing, #lastErr, #erredAt, #citable, #agerank, #readTc

  /** The Thing, the same object for as long as the car lives. */
  readonly thing: ThingT
  #lastErr: Errors.VaultError | null = null
  #erredAt: EpochMillis | null = null
  /** The Thing fields of the newest revision seen. */
  #citable: Sparse<ThingRecord>
  #agerank: Agerank
  #readTc:  ReadTc = VacantReadTc
  // --

  // == [Construction]: make, constructor

  // A refused first record leaves the car all the same, its Thing at the shell: the car keeps the refusal.
  /** Make the car of `begun`: a Thing, or the Thing `opts.bank` makes at the shell or at an item event's record, which the car then receives.
   * Hand it the shell and call {@link receive} for the events of the first record: here they are dropped.
   */
  static make<ThingT extends ReceivingThing>(begun: ThingT | VoidSentinel | VaultItemEvent, opts: ThingCarOpts<ThingT>): ThingCar<ThingT> {
    ThingCarChecks.makeArgs.parse({ begun, opts })
    const car = new ThingCar(thingOf(begun, opts.bank))
    if (isItemEvent(begun)) {
      try { car.receive(begun) } catch { /* kept as the car's lastErr */ }
    }
    return car
  }

  // A Thing handed in may hold a record already: the car starts from it, seen whole at the VacantReadTc, so that it never
  // calls news an older record the Thing would decline.
  private constructor(thing: ThingT) {
    this.thing = thing
    const held = thing.pickle()
    this.#citable = citedOf(held)
    this.#agerank = heldAgerankOf(held)
    Object.freeze(this)
  }
  // --

  // == [Bookkeeping]: lastErr, erred_at, citable, agerank, agekind, read_tc, read_at

  /** The refusal the Thing raised at the last record it was handed, or null where it took that record. For a devtool, never for an app's own logic. */
  get lastErr(): Errors.VaultError | null { return this.#lastErr }

  /** When the Thing last refused a record, or null where it has refused none. */
  get erred_at(): EpochMillis | null { return this.#erredAt }

  /** What a write over the Thing cites: the Thing fields of the newest revision seen, whole or a live box's sparse form, frozen. */
  get citable(): Sparse<ThingRecord> { return this.#citable }

  /** How far the Thing has been seen, as {@link Agerank} spells it: the vacant agerank until a record is taken. */
  get agerank(): Agerank { return this.#agerank }

  // A Thing bare in a later life still holds an earlier life's record.
  /** Whether the newest revision seen has been seen whole ({@link Agekind}): `vacant` until a record is taken. Check it before reading the Thing's record. */
  get agekind(): Agekind { return agekindOf(this.#agerank) }

  /** When the newest revision the Thing took as news was last read: the `VacantReadTc` until it takes one. */
  get read_tc(): ReadTc { return this.#readTc }

  /** The time of {@link read_tc}, in epoch milliseconds, or zero until the Thing takes a record. */
  get read_at(): EpochMillis { return readAtOf(this.#readTc) }
  // --

  // == [Receiving]: receive, #take, #readTcAfter

  /** Take `event`, an event of the Thing, and return the events that are news: none, and nothing changed, unless its record is news.
   * News is a record that leaves the agerank greater than it was: from a later life, newer than any revision seen, a whole record newer than any
   * whole one seen, or the newest revision seen again in a later tcchunk, a span of 65.536 seconds, than it was last seen in.
   * The events are `event` with its ageranks, then any `life`, then any `aged`, each frozen. A record that is news is handed to the Thing,
   * unless it is a live box's sparse form. A `life` or `aged` event returns none.
   * Refuses an event of another Thing, and a record in any other form. What it or the Thing refuses is kept as {@link lastErr} and thrown; an event taken clears it.
   */
  receive(event: VaultEvent): readonly VaultEvent[] {
    let events: readonly VaultEvent[]
    try {
      events = this.#take(event)
    } catch (err) {
      const refusal = Throwers.refusalOfThrown(err)
      this.#lastErr = refusal
      this.#erredAt = Clock.nowMillis()
      throw refusal
    }
    this.#lastErr = null
    return events
  }

  // The Thing takes the record first, so that one it refuses leaves the car as it was, and publishes last, so that a
  // subscriber finds the car past the record.
  /** The events of `proposed` that are news, this car moved past it */
  #take(proposed: VaultEvent): readonly VaultEvent[] {
    SeenChecks.event.parseConsistent(proposed, pick(this.thing, ['modelkind', 'userid', 'banklabel', 'labelpath']))
    if (proposed.eventkind !== 'item') { return NoEvents }
    const { read_tc } = SeenChecks.item.parse(proposed)
    const { val, liveness } = proposed
    const agerankWas = this.#agerank
    const agerank    = nextAgerankOf(agerankWas, val, read_tc, liveness !== 'soon')
    if (agerank === undefined) { return NoEvents }
    const isAdopted = (liveness !== 'soon') && this.thing.take(proposed)
    this.#readTc  = this.#readTcAfter(val, read_tc)
    this.#agerank = agerank
    if (BaseThing.cmp(this.#citable, val) > 0) { this.#citable = citedOf(val) }
    if (isAdopted) { this.thing.publish() }
    return eventsOf(proposed, agerankWas, agerank)
  }

  // The time belongs to the newest revision, as the agerank's tcchunk does: a newer one brings its own, the same one the later, an older one leaves it.
  /** The `read_tc` after `seen` is read at `read_tc`: moved where `seen` is the newest revision seen, or newer */
  #readTcAfter(seen: Pick<ThingCited, 'lifepath' | 'revseq'>, read_tc: ReadTc): ReadTc {
    const order = BaseThing.cmp(this.#citable, seen)
    if ((this.agekind === 'vacant') || (order > 0)) { return read_tc }
    return ((order === 0) && (read_tc > this.#readTc)) ? read_tc : this.#readTc
  }
  // --

  // == [A devtool's view]: inspectable

  // The record is no devtool's to read whole: a gate's has each wayin's wrapped bankKey, which an offline guess at a
  // passphrase is checked against.
  /** The Thing's record, each ciphertext masked, for a devtool, as a vault TSQ item settled on it would show, dated by {@link read_tc} and with the refusal kept.
   * For experimenting, never for an app's own logic: what it answers may change without notice.
   */
  inspectable(): MaskedRow {
    return {
      queryKey:        [...VaultTSQ.itemQueryKeyOf(this.thing)],
      status:          'success',
      fetchStatus:     'idle',
      dataUpdatedAt:   this.read_at,
      isInvalidated:   false,
      lastRefusalkind: this.#lastErr?.refusalkind ?? null,
      val:             maskedOf(this.thing.pickle()),
    }
  }
  // --
}
// --

// == [Helpers]: NoEvents, thingOf, isItemEvent, isShell, citedOf

/** What `receive` returns for an event that is not news. */
const NoEvents: readonly never[] = Object.freeze([])

/** The Thing `begun` is, or the one `bank` makes at the shell `begun` is or names */
function thingOf<ThingT extends ReceivingThing>(begun: ThingT | VoidSentinel | VaultItemEvent, bank: CarBank<ThingT>): ThingT {
  if (isItemEvent(begun)) { return bank.makeThing(BaseThing.shellOf(begun.val)) }
  if (isShell(begun)) { return bank.makeThing(begun) }
  return begun
}

/** True of an item event, among the forms a car is made from, which make's check has told apart */
function isItemEvent(begun: unknown): begun is VaultItemEvent {
  return (typeof begun === 'object') && (begun !== null) && ('eventkind' in begun) && (begun.eventkind === 'item')
}

// A Thing holding the shell reads as the shell, so a shell is one that is no Thing.
/** True of the shell, among the forms a car is made from */
function isShell(begun: unknown): begun is VoidSentinel { return (! (begun instanceof BaseThing)) && BaseThing.isVoidSentinel(begun) }

/** The Thing fields of `seen`, frozen */
function citedOf(seen: Sparse<ThingRecord>): Sparse<ThingRecord> { return Object.freeze(BaseThing.sparseOf(seen)) }
// --

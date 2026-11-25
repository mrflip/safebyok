/** `ThingCar`, which a VaultMinder keeps at each labelpath: the Thing, the refusal it last raised at a record, and when its last news was read. */

import { Clock, type Errors } from 'safebyok-big/internals'
import type { EpochMillis } from '../shapes/primitives'
import type { VoidSentinel } from '../shapes/shapes-thing'
import type { ReadTc, VaultEvent, VaultItemEvent } from '../shapes/shapes-vault-event'
import { type CarWorld, type ReceivingThing, type ThingCarOpts, ThingCarChecks } from '../shapes/shapes-vault-minder'
import { BaseThing } from '../models/base-thing'
import { VacantReadTc } from '../storage/agerank'
import * as Throwers from '../refusals/throwers'

// == [ThingCar]: ThingCar

/** A Thing, the refusal it last raised at a record, and when the last record it took as news was read.
 * A devtool reads it, and nothing it keeps changes what the Thing answers.
 */
export class ThingCar<ThingT extends ReceivingThing = ReceivingThing> {
  // == [Props]: thing, #lastErr, #erredAt, #readTc

  /** The Thing, the same object for as long as the car lives. */
  readonly thing: ThingT
  #lastErr: Errors.VaultError | null = null
  #erredAt: EpochMillis | null = null
  #readTc:  ReadTc = VacantReadTc
  // --

  // == [Construction]: make, constructor

  // A refused first record leaves the car all the same, its Thing at the shell: the car keeps the refusal.
  /** Make the car of `begun`: a Thing, or the Thing `opts.world` makes at the shell or at an item event's record, which the car then receives.
   * Hand it the shell and call {@link receive} for the events of the first record: here they are dropped.
   */
  static make<ThingT extends ReceivingThing>(begun: ThingT | VoidSentinel | VaultItemEvent, opts: ThingCarOpts<ThingT>): ThingCar<ThingT> {
    ThingCarChecks.makeArgs.parse({ begun, opts })
    const car = new ThingCar(thingOf(begun, opts.world))
    if (isItemEvent(begun)) {
      try { car.receive(begun) } catch { /* kept as the car's lastErr */ }
    }
    return car
  }

  private constructor(thing: ThingT) {
    this.thing = thing
    Object.freeze(this)
  }
  // --

  // == [Bookkeeping]: lastErr, erred_at, read_tc

  /** The refusal the Thing raised at the last record it was handed, or null where it took that record. For a devtool, never for an app's own logic. */
  get lastErr(): Errors.VaultError | null { return this.#lastErr }

  /** When the Thing last refused a record, or null where it has refused none. */
  get erred_at(): EpochMillis | null { return this.#erredAt }

  /** When the last record the Thing took as news was read: the `VacantReadTc` until it takes one. */
  get read_tc(): ReadTc { return this.#readTc }
  // --

  // == [Receiving]: receive

  // The Thing's receive checks the event, so the car reads its read_tc only once the Thing has taken it.
  /** Have the Thing receive `event`, returning the events it returns: keep its refusal, and throw it, or clear the refusal kept, and keep when the record was read where it was news. */
  receive(event: VaultEvent): readonly VaultEvent[] {
    let events: readonly VaultEvent[]
    try {
      events = this.thing.receive(event)
    } catch (err) {
      const refusal = Throwers.refusalOfThrown(err)
      this.#lastErr = refusal
      this.#erredAt = Clock.nowMillis()
      throw refusal
    }
    this.#lastErr = null
    if (events.length > 0) { this.#readTc = event.read_tc }
    return events
  }
  // --
}
// --

// == [Helpers]: thingOf, isItemEvent, isShell

/** The Thing `begun` is, or the one `world` makes at the shell `begun` is or names */
function thingOf<ThingT extends ReceivingThing>(begun: ThingT | VoidSentinel | VaultItemEvent, world: CarWorld<ThingT>): ThingT {
  if (isItemEvent(begun)) { return world.makeThing(BaseThing.shellOf(begun.val)) }
  if (isShell(begun)) { return world.makeThing(begun) }
  return begun
}

/** True of an item event, among the forms a car is made from, which make's check has told apart */
function isItemEvent(begun: unknown): begun is VaultItemEvent {
  return (typeof begun === 'object') && (begun !== null) && ('eventkind' in begun) && (begun.eventkind === 'item')
}

/** True of the shell, among the forms a car is made from */
function isShell(begun: unknown): begun is VoidSentinel { return BaseThing.isVoidSentinel(begun) }
// --

/** A giver's bank over a box minder of the new core, for a Device to hand the giver. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type BoxCar, type MinderFriend, type MinderGetAsk, ThingMinder } from 'safebyok'
import { Checkers } from 'safebyok-big/storage'
import type { GiverBank } from './react-giver'

// == [Checks]: Checks

const Checks = Checkers('bad_record', ({ custom }) => ({
  boxMinder: custom<ThingMinder>((val) => (val instanceof ThingMinder) && (val.modelkind === 'box'), 'Expected a ThingMinder of boxes'),
  bank:      custom<Pick<MinderFriend, 'makeGetAsk'>>((val) => (val instanceof Object) && (typeof (val as Partial<MinderFriend>).makeGetAsk === 'function'), 'Expected a bank'),
}))
// --

// == [The bank]: giverBankOfMinder

// The minder is of boxes, so each car it answers or tells of is a box's. A bank's get ask has `ifAbsent` as given and its
// own `track`, as the minder takes it.
/** The giver's bank over `boxMinder`, a box minder from `hello` until `goodbye`, getting each box by `bank`'s get ask for it.
 * A get waits for nothing the minder holds timely; anything else it asks of the vaultDB.
 */
export function giverBankOfMinder(boxMinder: ThingMinder, bank: Pick<MinderFriend, 'makeGetAsk'>): GiverBank<BoxCar> {
  Checks.boxMinder.parse(boxMinder)
  Checks.bank.parse(bank)
  return Object.freeze({
    userid:        boxMinder.userid,
    banklabel:     boxMinder.banklabel,
    getBoxCar:     async (labelpath: string) => (await boxMinder.get(bank.makeGetAsk({ labelpath, ifAbsent: 'nil' }) as MinderGetAsk)) as BoxCar,
    listenBoxCars: (listener: (labelpath: string, car: BoxCar) => void) => boxMinder.listen((answer) => {
      // A removed car has none: the bank object that removed it is ending, and the bridge resets its entries.
      if (answer.car !== undefined) { listener(answer.ask.labelpath, answer.car as BoxCar) }
    }),
  })
}
// --

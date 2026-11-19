/** A giver's bank over a bank's minder in the new core, for a Device to hand the giver. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type BoxCar, Checkers, Labelpath, ThingMinder } from 'safebyok'
import type { GiverBank } from './react-giver'

// == [Checks]: Checks, BoxLabelpath, isBoxLabelpath

const Checks = Checkers('bad_record', ({ custom }) => ({
  minder:       custom<ThingMinder>((val) => val instanceof ThingMinder, 'Expected a ThingMinder'),
  boxLabelpath: custom<BoxLabelpath>((val) => (typeof val === 'string') && isBoxLabelpath(val), 'Expected the labelpath of a box'),
}))

/** The labelpath of a box: the root box's, or one under it. */
type BoxLabelpath = 'box' | `box/${string}`

/** True when `labelpath` is a box's. */
function isBoxLabelpath(labelpath: string): labelpath is BoxLabelpath { return Labelpath.isOfModelkind(labelpath, 'box') }
// --

// == [The bank]: giverBankOfMinder

/** The giver's bank over the boxes `minder` minds, from its `hello` until its `goodbye`.
 * A get answers at once from a car the minder holds timely, and asks the vaultDB for any other. It gets only a box's labelpath.
 */
export function giverBankOfMinder(minder: ThingMinder): GiverBank<BoxCar> {
  Checks.minder.parse(minder)
  return Object.freeze({
    userid:        minder.userid,
    banklabel:     minder.banklabel,
    getBoxCar:     async (labelpath: string) => minder.get({ ...minder.scope, labelpath: Checks.boxLabelpath.parse(labelpath) }),
    peekBoxCar:    (labelpath: string) => minder.at({ ...minder.scope, labelpath: Checks.boxLabelpath.parse(labelpath) }),
    listenBoxCars: (listener: (labelpath: string, car: BoxCar) => void) => minder.listen((answer) => {
      const { labelpath } = answer.ask
      // A removed car has none: the bank object that removed it is ending, and the bridge resets its entries.
      if ((answer.car === undefined) || (! isBoxLabelpath(labelpath))) { return }
      // The minder's listen is not typed by kind: a car at a box's labelpath is a box's.
      listener(labelpath, answer.car as BoxCar)
    }),
  })
}
// --

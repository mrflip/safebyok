/** A giver's bank over a bank's minder in the new core, for a Device to hand the giver. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type BoxCar, type BoxLabelpath, Checkers, Labelpath, ThingFormat, ThingMinder } from 'safebyok'
import type { GiverBank, GiverEvent } from './shapes-giver'

// == [Checks]: Checks

const Checks = Checkers('bad_record', ({ custom }) => ({
  minder:       custom<ThingMinder>((val) => val instanceof ThingMinder, 'Expected a ThingMinder'),
  boxLabelpath: custom<BoxLabelpath>((val) => (typeof val === 'string') && Labelpath.isBox(val), 'Expected the labelpath of a box'),
}))
// --

// == [The bank]: giverBankOfMinder

/** The giver's bank over the boxes `minder` minds, from its `hello` until its `goodbye`.
 * A get answers at once from a car the minder holds timely, and asks the vaultDB for any other. It gets only a box's labelpath.
 */
export function giverBankOfMinder(minder: ThingMinder): GiverBank<BoxCar> {
  Checks.minder.parse(minder)
  return Object.freeze({
    getBoxCar:     async (labelpath: string) => minder.get({ ...minder.scope, labelpath: Checks.boxLabelpath.parse(labelpath) }),
    listenBoxCars: (listener: (event: GiverEvent<BoxCar>) => void) => minder.listen((event) => {
      if (ThingMinder.isThingEvent(event) && (event.modelkind === 'box')) { listener(event) }
    }, ThingFormat),
  })
}
// --

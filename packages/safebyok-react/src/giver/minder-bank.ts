/** A giver's bank over a vault in the new core, or over a bank's minder alone, for a Device to hand the giver. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type BoxCar, type BoxLabelpath, Bank, Checkers, Labelpath, ThingFormat, ThingMinder, Vault } from 'safebyok'
import type { GiverBank, GiverEvent } from './shapes-giver'

// == [Checks]: Checks

const Checks = Checkers('bad_record', ({ custom }) => ({
  vault:        custom<Vault>((val) => val instanceof Vault, 'Expected a Vault'),
  minder:       custom<ThingMinder>((val) => val instanceof ThingMinder, 'Expected a ThingMinder'),
  boxLabelpath: custom<BoxLabelpath>((val) => (typeof val === 'string') && Labelpath.isBox(val), 'Expected the labelpath of a box'),
}))
// --

// == [The bank]: giverBankOfVault, giverBankOfMinder

/** The giver's bank over `vault`: its boxes, through its minder, and the form verbs of its bank.
 * Its `birth` makes another Bank object on the same device, and refuses `gate_made_elsewhere` where a live bank is already stored.
 */
export function giverBankOfVault(vault: Vault): GiverBank<BoxCar> {
  const { bank, minder } = Checks.vault.parse(vault)
  return Object.freeze({
    ...giverBankOfMinder(minder),
    birth:             (cleartexts) => Bank.birth(bank.device, cleartexts),
    unlock:            (cleartexts) => bank.unlock(cleartexts),
    replacePassphrase: (cleartexts) => bank.replacePassphrase(cleartexts),
    addPasskey:        (cleartexts) => bank.addPasskey(cleartexts),
    revokePasskey:     (cleartexts) => bank.revokePasskey(cleartexts),
    dismissUnlock:     () => { bank.dismissUnlock() },
  } satisfies GiverBank<BoxCar>)
}

/** The box reads of a giver's bank over the boxes `minder` minds, from its `hello` until its `goodbye`.
 * A get answers at once from a car the minder holds timely, and asks the vaultDB otherwise. It takes only a box's labelpath.
 */
export function giverBankOfMinder(minder: ThingMinder): Pick<GiverBank<BoxCar>, 'getBoxCar' | 'listenBoxCars'> {
  Checks.minder.parse(minder)
  return Object.freeze({
    getBoxCar:     async (labelpath: string) => minder.get({ ...minder.scope, labelpath: Checks.boxLabelpath.parse(labelpath) }),
    listenBoxCars: (listener: (event: GiverEvent<BoxCar>) => void) => minder.listen((event) => {
      if (ThingMinder.isThingEvent(event) && (event.modelkind === 'box')) { listener(event) }
    }, ThingFormat),
  })
}
// --

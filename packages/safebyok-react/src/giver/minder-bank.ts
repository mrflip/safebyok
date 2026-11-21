/** A giver's bank over a vault in the new core, or over a bank's minder alone, for a Device to hand the giver. */

// eslint-disable-next-line import-x/no-extraneous-dependencies -- the giver is not yet exported, so nothing built reaches safebyok, which stays private until it is published
import { type BoxLabelpath, type BoxRecord, type Tombstone, Bank, Checkers, Labelpath, MinderEventFormat, ThingMinder, Vault } from 'safebyok'
import type { GiverBank, GiverEvent } from './shapes-giver'

// == [Checks]: Checks

const Checks = Checkers('bad_record', ({ custom }) => ({
  vault:        custom<Vault>((val) => val instanceof Vault, 'Expected a Vault'),
  minder:       custom<ThingMinder>((val) => val instanceof ThingMinder, 'Expected a ThingMinder'),
  boxLabelpath: custom<BoxLabelpath>((val) => (typeof val === 'string') && Labelpath.isBox(val), 'Expected the labelpath of a box'),
}))
// --

// == [The bank]: giverBankOfVault, giverBankOfMinder

/** The giver's bank over `vault`: its boxes, through its minder, and the gatings of its bank's form verbs.
 * Its birth gating makes another Bank object on the same device, and refuses `gate_made_elsewhere` where a live bank is already stored.
 */
export function giverBankOfVault(vault: Vault): GiverBank<BoxRecord | Tombstone<BoxRecord>> {
  const { bank, minder } = Checks.vault.parse(vault)
  return Object.freeze({
    ...giverBankOfMinder(minder),
    birthGating:             (cleartexts) => Bank.birthGating(bank.device, cleartexts),
    unlockGating:            (cleartexts) => bank.unlockGating(cleartexts),
    replacePassphraseGating: (cleartexts) => bank.replacePassphraseGating(cleartexts),
    addPasskeyGating:        (cleartexts) => bank.addPasskeyGating(cleartexts),
    revokePasskeyGating:     (cleartexts) => bank.revokePasskeyGating(cleartexts),
    dismissUnlock:           () => { bank.dismissUnlock() },
  } satisfies GiverBank<BoxRecord | Tombstone<BoxRecord>>)
}

/** The box reads of a giver's bank over the boxes `minder` minds, from its `hello` until its `goodbye`.
 * A get answers at once from an item the minder has timely, and asks the vaultDB otherwise. It is given only a box's labelpath.
 * Its listener hears each event of a box's item and its soon, the item's falling behind and a refused get included, and none of a listing.
 */
export function giverBankOfMinder(minder: ThingMinder): Pick<GiverBank<BoxRecord | Tombstone<BoxRecord>>, 'getBoxRecord' | 'isBoxRecordBehind' | 'listenBoxRecords'> {
  Checks.minder.parse(minder)
  return Object.freeze({
    getBoxRecord:      async (labelpath: string) => minder.get({ ...minder.scope, labelpath: Checks.boxLabelpath.parse(labelpath) }),
    isBoxRecordBehind: (labelpath: string) => Checks.boxLabelpath.safeParse(labelpath).success && minder.isBehindAt({ ...minder.scope, labelpath }),
    listenBoxRecords:  (listener: (event: GiverEvent) => void) => minder.listen((event) => {
      if ((event.eventkind !== 'list') && (event.modelkind === 'box')) { listener(event) }
    }, MinderEventFormat),
  })
}
// --

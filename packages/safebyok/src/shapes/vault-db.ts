/** What a VaultDB's verbs take and answer: the expectations a write is proven against, a vault's capacity, and the answers of a vault read. Each `parse` refuses 'bad_record'. */

import type * as Z from 'zod'
import { Validator } from '../checks/validator'
import { BoxDamaged, BoxRecord, type BoxSparse } from './box'
import { VaultSparse } from './vault'
import { revision_tok } from './fields'

// == [Expectations]: VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion

/** The vault and the `gate_epoch` an update of the vault record was proven against: it lands only while the stored vault record has both.
 * A `gate_epoch` of 0 names a novel vault's record, which the vault's first gate is written over.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export type VaultRecordExpectation = Z.infer<typeof VaultRecordExpectation>

/** The vault a box read means to read in: {@link VaultDB.getBox} finds the box only while the stored vault record has this `vault_tok`.
 *
 * @example { vault_tok: vaultRecord.vault_tok }
 */
export type BoxGetExpectation = Z.infer<typeof BoxGetExpectation>

/** The vault a box write was sealed for, and the revision the writer read, null for none: {@link VaultDB.putBox} lands only while both are stored (for null, while no box is).
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: prev?.revision_tok ?? null }
 */
export type BoxExpectation = Z.infer<typeof BoxExpectation>

/** The vault and the `gate_epoch` a vault deletion was proven against: {@link VaultDB.delVault} lands only while the stored vault record has both.
 * A `gate_epoch` of null checks the `vault_tok` alone. It is for {@link VaultDB.delDamagedVault},
 * whose vault record fails its checks and shows no `gate_epoch` to name.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export type VaultDelExpectation = Z.infer<typeof VaultDelExpectation>

/** The vault a box deletion lands in, and the revision the deleter read: null for a box listed damaged with no revision a read could take.
 * The revision decides only what {@link VaultDB.delBox} reports, never whether it removes.
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok }
 */
export type BoxDelExpectation = Z.infer<typeof BoxDelExpectation>

/** The report of a box deletion that landed: what it found under its boxlabel, in the same atomic step as the removal.
 *
 * * `deleted`: the revision its {@link BoxDelExpectation} named (for null, a record holding none a
 *   read could take).
 * * `deleted_other`: any other record (written over meanwhile, say), removed all the same.
 * * `absent`: nothing to remove.
 *
 * @example { outcome: 'deleted_other' }
 */
export type BoxDeletion = Z.infer<typeof BoxDeletion>

/** The checks of each expectation a verb is handed, and of the {@link BoxDeletion} a box deletion answers. Each `parse` refuses 'bad_record'.
 * An expectation keeps only the fields it compares, so a whole record handed as one is read for
 * those alone.
 */
export const { VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion } = Validator('bad_record', ({ obj, uint, oneof }) => {
  const VaultRecordExpectation = VaultSparse.pick({ vault_tok: true, gate_epoch: true })
  const BoxGetExpectation = VaultSparse.pick({ vault_tok: true })
  return {
    VaultRecordExpectation,
    BoxGetExpectation,
    BoxExpectation:        BoxGetExpectation.extend({ revision_tok: revision_tok.nullable() }),
    VaultDelExpectation:   VaultRecordExpectation.extend({ gate_epoch: uint.nullable() }),
    BoxDelExpectation:     BoxGetExpectation.extend({ revision_tok: revision_tok.nullable() }),
    BoxDeletion:           obj({ outcome: oneof(['deleted', 'deleted_other', 'absent']) }),
  }
})
// --

// == [Capacity]: Capacity

/** How much room a vault has: boxes against the most it holds, and bytes against the most its storage holds of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`. Its
 * `parse` refuses 'bad_record'.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const { Capacity } = Validator('bad_record', ({ obj, union, int, uint, lit }) => {
  // A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
  // safe integer, as Bank.make keeps a declared limit: past this check, no limit is infinite.
  const roomLimit = union([int.positive(), lit(Infinity)]).transform((most) => Math.min(most, Number.MAX_SAFE_INTEGER))
  const room      = obj({ used: uint, max: roomLimit })
  return { Capacity: obj({ boxes: room, bytes: room }) }
})
export type Capacity = Z.infer<typeof Capacity>
// --

// == [Read answers]: StoredBox, BoxListing, StoredVault, ListedBox, StoredRevision, StoredVaultAnswer, ListingAnswer, StoredVaultTok

/** One box row as read, for {@link splitStoredBoxes}: the boxlabel the row is filed under, and its record exactly as stored.
 * Take `boxlabel` from the row's scopepath or column, never from its record: a damaged box is
 * still named by it, and so deleted or written over. Hand `box` up as read, whole or without its
 * two ciphered fields, with no cast: the split judges it.
 *
 * @example { boxlabel: Scopepath.boxscope(scopepath).boxlabel, box: storedRow }
 */
export type StoredBox = { boxlabel: string, box: unknown }

/** A vault's box listing, as a read of storage hands it up: the sound boxes and the damaged apart, each sorted by boxlabel. A vault read hands it back beside the vault record's fields. */
export type BoxListing = Readonly<{
  boxes:        readonly BoxSparse[]
  damagedBoxes: readonly BoxDamaged[]
}>

/** One vault as `doGetVault` and `doEnsureVault` answer it, read in one atomic step: its vault record exactly as stored, and its box rows split by {@link splitStoredBoxes}, or as a server's `getVaultRecords` relays them.
 * The base class checks all of it again, taking an adapter's word only that a box is damaged. The
 * adapter's types keep out nothing: the checks do.
 *
 * @example { vault: storedRow ?? null, ...splitStoredBoxes(boxRows) }
 */
export type StoredVault = BoxListing & {
  /** The row in the vault record's place, exactly as read and with no cast: a vault record, damaged or not, a tombstone where a store keeps one there, or null for none. */
  vault: unknown
}

/** The checks of what an adapter hands up from a vault read, each refusing 'bad_record'.
 * `ListedBox` is a box whole or without its two ciphered fields, so a projecting backend is checked
 * as one handing whole records. `StoredRevision` is the one field of a damaged box the listing
 * keeps, where the record holds it as text: the revision a write over it names. `StoredVaultAnswer`
 * and `ListingAnswer` are the two halves of a {@link StoredVault} as an adapter answered it: its
 * vault record as stored, and its listing, each sound box an object to judge, each damaged one a
 * {@link BoxDamaged}.
 */
export const { ListedBox, StoredRevision, StoredVaultAnswer, ListingAnswer } = Validator('bad_record', ({ obj, arr, unk }) => ({
  ListedBox:         BoxRecord.partial({ box_key_wrapped: true, whisper_ciphered: true }),
  StoredRevision:    obj({ revision_tok }),
  StoredVaultAnswer: obj({ vault: unk }).loose(),
  ListingAnswer:     obj({ boxes: arr(obj({ boxlabel: unk }).loose()), damagedBoxes: arr(BoxDamaged) }).loose(),
}))

/** The one field of a stored vault record a deletion needs, as the record's own check has it, every other field dropped unread. */
export const { StoredVaultTok } = Validator('bad_record', () => ({
  StoredVaultTok: VaultSparse.pick({ vault_tok: true }),
}))
// --

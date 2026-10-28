/** What a VaultDB's verbs take and answer: the expectations a write is proven against, a vault's capacity, and the answers of a vault read. Each `parse` refuses 'bad_record'. */

import type * as Z from 'zod'
import { Checker, Checkers, objCheck } from '../checks/validator'
import type { BoxSparse, BoxDamaged } from './box'
import * as BX from './box'
import * as VX from './vault'
import * as FX from './fields'

// == [Expectations]: vaultRecordExpectation, boxGetExpectation, boxExpectation, vaultDelExpectation, boxDelExpectation, boxDeletion

/** The vault and the `gate_epoch` an update of the vault record was proven against: it lands only while the stored vault record has both.
 * A `gate_epoch` of 0 names a novel vault's record, which the vault's first gate is written over.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export type VaultRecordExpectation = Z.infer<typeof vaultRecordExpectation>

/** The vault a box read means to read in: {@link VaultDB.getBox} finds the box only while the stored vault record has this `vault_tok`.
 *
 * @example { vault_tok: vaultRecord.vault_tok }
 */
export type BoxGetExpectation = Z.infer<typeof boxGetExpectation>

/** The vault a box write was sealed for, and the revision the writer read, null for none: {@link VaultDB.putBox} lands only while both are stored (for null, while no box is).
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: prev?.revision_tok ?? null }
 */
export type BoxExpectation = Z.infer<typeof boxExpectation>

/** The vault and the `gate_epoch` a vault deletion was proven against: {@link VaultDB.delVault} lands only while the stored vault record has both.
 * A `gate_epoch` of null checks the `vault_tok` alone. It is for {@link VaultDB.delDamagedVault},
 * whose vault record fails its checks and shows no `gate_epoch` to name.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export type VaultDelExpectation = Z.infer<typeof vaultDelExpectation>

/** The vault a box deletion lands in, and the revision the deleter read: null for a box listed damaged with no revision a read could take.
 * The revision decides only what {@link VaultDB.delBox} reports, never whether it removes.
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok }
 */
export type BoxDelExpectation = Z.infer<typeof boxDelExpectation>

/** The report of a box deletion that landed: what it found under its boxlabel, in the same atomic step as the removal.
 *
 * * `deleted`: the revision its {@link BoxDelExpectation} named (for null, a record holding none a
 *   read could take).
 * * `deleted_other`: any other record (written over meanwhile, say), removed all the same.
 * * `absent`: nothing to remove.
 *
 * @example { outcome: 'deleted_other' }
 */
export type BoxDeletion = Z.infer<typeof boxDeletion>

/** The checks of each expectation a verb is handed, and of the {@link BoxDeletion} a box deletion answers. Each `parse` refuses 'bad_record'.
 * An expectation keeps only the fields it compares, so a whole record handed as one is read for
 * those alone.
 */
export const { vaultRecordExpectation, boxGetExpectation, boxExpectation, vaultDelExpectation, boxDelExpectation, boxDeletion } = Checkers('bad_record', ({ obj, uint, oneof, revision_tok }) => {
  const vaultRecordExpectation = VX.vaultSparse.pick({ vault_tok: true, gate_epoch: true })
  const boxGetExpectation = VX.vaultSparse.pick({ vault_tok: true })
  return {
    vaultRecordExpectation,
    boxGetExpectation,
    boxExpectation:        boxGetExpectation.extend({ revision_tok: revision_tok.nullable() }),
    vaultDelExpectation:   vaultRecordExpectation.extend({ gate_epoch: uint.nullable() }),
    boxDelExpectation:     boxGetExpectation.extend({ revision_tok: revision_tok.nullable() }),
    boxDeletion:           obj({ outcome: oneof(['deleted', 'deleted_other', 'absent']) }),
  }
}, [FX])
// --

// == [Capacity]: capacity

/** How much room a vault has: boxes against the most it holds, and bytes against the most its storage holds of one vault.
 * A vault reckons it from its last read; a VaultDB from storage, in `getCapacity` and a
 * `vault_full`'s `meta.capacity`. Either is an estimate: storage checks again on every write, and
 * its answer wins. A limit storage reports as `Infinity` reads as `Number.MAX_SAFE_INTEGER`. Its
 * `parse` refuses 'bad_record'.
 *
 * @example { boxes: { used: 12, max: 100 }, bytes: { used: 48_000, max: 1_000_000 } }
 */
export const capacity = objCheck(({ obj, union, int, uint, lit }) => {
  // A storage adapter's `Infinity`, its way of saying it sets no limit, is kept as the largest
  // safe integer, as Bank.make keeps a declared limit: past this check, no limit is infinite.
  const roomLimit = union([int.positive(), lit(Infinity)]).transform((most) => Math.min(most, Number.MAX_SAFE_INTEGER))
  const room      = obj({ used: uint, max: roomLimit })
  return { boxes: room, bytes: room }
})
export type Capacity = Z.infer<typeof capacity>
// --

// == [Read answers]: StoredBox, BoxListing, StoredVault, listedBox, storedRevision, storedVaultAnswer, listingAnswer, storedVaultTok

/** One box row as read, for {@link splitStoredBoxes}: the boxlabel the row is filed under, and its record exactly as stored.
 * Take `boxlabel` from the row's scopepath or column, never from its record: a damaged box is
 * still named by it, and so deleted or written over. Hand `box` up as read, whole or without its
 * two ciphered fields: the split judges it, and a damaged row is listed as damaged. Its type is
 * the input of a {@link BoxRecord} or {@link BoxSparse}, which says what a row should hold, so
 * cast the row once where you read it from storage; the split's check is what backs that cast.
 *
 * @example { boxlabel: Scopepath.boxscope(scopepath).boxlabel, box: storedRow as StoredBox['box'] }
 */
export type StoredBox = { boxlabel: string, box: Z.input<typeof BX.boxRecord> | Z.input<typeof BX.boxSparse> }

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
 * `listedBox` is a box whole or without its two ciphered fields, so a projecting backend is checked
 * as one handing whole records. `storedRevision` is the one field of a damaged box the listing
 * keeps, where the record holds it as text: the revision a write over it names. `storedVaultAnswer`
 * and `listingAnswer` are the two halves of a {@link StoredVault} as an adapter answered it: its
 * vault record as stored, and its listing, each sound box an object to judge, each damaged one a
 * {@link BoxDamaged}.
 */
export const { listedBox, storedRevision, storedVaultAnswer, listingAnswer } = Checkers('bad_record', ({ obj, arr, unk, revision_tok }) => ({
  listedBox:         BX.boxRecord.partial({ box_key_wrapped: true, whisper_ciphered: true }),
  storedRevision:    obj({ revision_tok }),
  storedVaultAnswer: obj({ vault: unk }).loose(),
  listingAnswer:     obj({ boxes: arr(obj({ boxlabel: unk }).loose()), damagedBoxes: arr(BX.boxDamaged) }).loose(),
}), [FX])

/** The one field of a stored vault record a deletion needs, as the record's own check has it, every other field dropped unread. */
export const storedVaultTok = Checker(() => VX.vaultSparse.pick({ vault_tok: true }))
// --

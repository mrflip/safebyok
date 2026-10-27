/** What a VaultDB's verbs take and answer: the expectations a write is proven against, a vault's capacity, and the answers of a vault read. Each `parse` refuses 'bad_record'. */

import type * as Z from 'zod'
import { Validator } from '../checks/validator'
import { BoxDamaged, BoxRecord, type BoxSparse } from './box'
import { VaultSparse } from './vault'
import { revision_tok } from './fields'

// == [Expectations]: VaultRecordExpectation, BoxGetExpectation, BoxExpectation, VaultDelExpectation, BoxDelExpectation, BoxDeletion

/** What an update of the vault record was proven against: the vault, and the `gate_epoch` the writer read.
 * The update lands only while the standing vault record still has both. A `gate_epoch` of 0 is a
 * novel vault's record, which the vault's first gate is written over.
 *
 * @example { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch }
 */
export type VaultRecordExpectation = Z.infer<typeof VaultRecordExpectation>

/** The vault a box read means to read in: it finds the box only while the standing vault record has this `vault_tok`.
 * Otherwise it refuses `vault_mismatch`, reading nothing more: none stand, a tombstone stands, or
 * the vault was deleted and made anew under another `vault_tok`. So a box from another life of the
 * scope is never handed to a reader holding the key of this one.
 *
 * @example { vault_tok: vaultRecord.vault_tok }
 */
export type BoxGetExpectation = Z.infer<typeof BoxGetExpectation>

/** What a box write was sealed for and read: the vault, and the revision the writer read.
 * The write lands only while the standing vault record has this `vault_tok` (else
 * `vault_mismatch`). It also needs the standing box at this `revision_tok`, or no box at all for
 * null (else `stale_write`).
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: prev?.revision_tok ?? null }
 */
export type BoxExpectation = Z.infer<typeof BoxExpectation>

/** The vault a deletion means to remove whole: it lands only while the standing vault record has this `vault_tok` and `gate_epoch`.
 * So a delete proven against a gate another device has since changed refuses as stale: an old
 * passphrase in a stale tab cannot delete the vault. A `gate_epoch` of null means "check the
 * `vault_tok` alone": it is for `delDamagedVault`, whose vault record fails its checks and shows
 * no `gate_epoch` to name.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export type VaultDelExpectation = Z.infer<typeof VaultDelExpectation>

/** What a box deletion was aimed at: the vault, and the `revision_tok` the deleter read.
 * The `revision_tok` is null for a box listed as damaged with no revision a read could take.
 * The deletion lands only while the standing vault record has this `vault_tok`. It then removes
 * whatever box stands under the boxlabel: within the right vault, a deletion wins over any write.
 * The revision decides only what the {@link BoxDeletion} reports.
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok }
 */
export type BoxDelExpectation = Z.infer<typeof BoxDelExpectation>

/** What a box deletion that landed found under its boxlabel, from the same atomic step as the removal.
 *
 * * `deleted`: the revision its {@link BoxDelExpectation} named (for null, a record holding none a
 *   read could take).
 * * `deleted_other`: any other record (written over meanwhile, say), removed all the same.
 * * `absent`: nothing to remove.
 *
 * @example { outcome: 'deleted_other' }
 */
export type BoxDeletion = Z.infer<typeof BoxDeletion>

/** The checks for each expectation a verb is handed, each sliced from the vault record, and for the {@link BoxDeletion} a box deletion answers. Each refuses 'bad_record', which a verb re-throws as its own refusal.
 * An expectation names what it compares and drops the rest, so a whole record handed as one is
 * read for those fields alone.
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

// == [Read answers]: StoredBox, BoxListing, VaultReadResponse, ListedBox, StoredRevision, ReadAnswer, ListingAnswer, StoredVaultTok

/** One box row as a VaultDB's `doGetVault` and `doEnsureVault` read it, as {@link splitStoredBoxes} takes it: the boxlabel the row is filed under, and its record exactly as stored.
 * Take `boxlabel` from the row's scopepath or column, never from its record: a damaged box is
 * still named by it, and so deleted or written over. Hand `box` up as read, whole or without its
 * two ciphered fields, with no cast: it is typed `unknown`, as it may be damaged, and the split
 * judges it.
 *
 * @example { boxlabel: Scopepath.boxscope(scopepath).boxlabel, box: storedRow }
 */
export type StoredBox = { boxlabel: string, box: unknown }

/** A vault's box listing, as a read of storage hands it up: the sound boxes and the damaged apart, each sorted by boxlabel. A vault read hands it back beside the vault record's fields. */
export type BoxListing = Readonly<{
  boxes:        readonly BoxSparse[]
  damagedBoxes: readonly BoxDamaged[]
}>

/** One vault as a VaultDB's `doGetVault` and `doEnsureVault` answer it, read in one atomic step: its vault record exactly as stored, and its boxes split into the sound and the damaged.
 * `vault` is what storage holds in the vault record's place, exactly as read: a vault record, one
 * damaged, a tombstone (where a store keeps one there), or null for none. So it is typed `unknown`,
 * and an adapter hands its row up with no cast. `boxes` and `damagedBoxes` are what
 * {@link splitStoredBoxes} makes of the box rows, or what a server's `getVaultRecords` relays. The
 * base class checks all of it again: the vault record as a read of it, each sound box as the split
 * judges one, and each damaged box's boxlabel, revision and damage, taking its word that the box
 * is damaged. The adapter's types keep out nothing: the checks do.
 *
 * @example { vault: storedRow ?? null, ...splitStoredBoxes(boxRows) }
 */
export type VaultReadResponse = BoxListing & { vault: unknown }

/** A box as `doGetVault` may hand it up, whole or with its two ciphered fields left out, so a projecting backend is checked as one handing whole records; the one field of a damaged box the listing keeps, when the record holds it as text, what a write over it names; and a vault read's answer, an object holding its vault record as stored, and its listing, each sound box an object to judge, each damaged one a {@link BoxDamaged}. */
export const { ListedBox, StoredRevision, ReadAnswer, ListingAnswer } = Validator('bad_record', ({ obj, arr, unk }) => ({
  ListedBox:      BoxRecord.partial({ box_key_wrapped: true, whisper_ciphered: true }),
  StoredRevision: obj({ revision_tok }),
  ReadAnswer:     obj({ vault: unk }).loose(),
  ListingAnswer:  obj({ boxes: arr(obj({ boxlabel: unk }).loose()), damagedBoxes: arr(BoxDamaged) }).loose(),
}))

/** The one field of a stored vault record a deletion needs, as the record's own check has it, every other field dropped unread. */
export const { StoredVaultTok } = Validator('bad_record', () => ({
  StoredVaultTok: VaultSparse.pick({ vault_tok: true }),
}))
// --

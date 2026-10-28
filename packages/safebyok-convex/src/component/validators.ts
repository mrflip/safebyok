import { zodToConvex, zodToConvexFields } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { Validators } from 'safebyok'
import type { $brand } from 'zod/v4/core' // eslint-disable-line @typescript-eslint/no-unused-vars -- named for the emitted declarations, which carry the core's brand on a salt

/** Convex validators for safebyok's stored records, each made from the core's Zod validator its doc block names by convex-helpers' `zodToConvex`.
 * Convex takes only its own validators for a function's arguments and returns and for a table's
 * schema, so each is converted here from the core's, and a test holds each to the core's field for
 * field. They check what Convex can: which fields, their types, which are optional, and each
 * literal, a record's `format` among them. What Convex has no check for converts to the looser
 * check it has: each name and token is any text, each epoch and count any number, a box's sidecar
 * any value, and a vault record's rule tying `gate` to `gate_epoch` is left out. The finer rules
 * are the client's, checked by the core's records on every write and every read.
 *
 * Their types are the core's, a salt the core brands keeping its {@link $brand}; a box's alone is
 * Convex's reading of its fields, as {@link BoxRecord} says.
 *
 * A new record format in the core widens the `format` its record converts to: an additive deploy,
 * shipped with this package.
 */

/** An encrypted value as a record holds it: its cipherIv and its ciphertext, each base64url text. The core's `Ciphered`.
 *
 * @example { cipher_iv_b64: 'q83vEjRWeJA', ciphertext_b64: 'yL3cKX0...' }
 */
export const Ciphered = zodToConvex(Validators.Ciphered)

/** What names one vault: the host application's label, the user, and the vault's own label. The core's `VaultScope`.
 *
 * @example { applabel: 'acme', user_id: 'user_2fJ8...', vaultlabel: 'main' }
 */
export const VaultScope = zodToConvex(Validators.VaultScope)

/** What names one box: its vault's scope and its boxlabel. The core's `boxscope`.
 *
 * @example { applabel: 'acme', user_id: 'user_2fJ8...', vaultlabel: 'main', boxlabel: 'anthropic_api_key' }
 */
export const Boxscope = zodToConvex(Validators.boxscope)

/** A vault's gate: its ways in, each the vaultKey wrapped under a wayinKey: a `passphrase`, and a `passkey` or null. The core's `GateRecord`.
 *
 * @example { passphrase: passphraseWayin, passkey: null }
 */
export const Gate = zodToConvex(Validators.GateRecord)

/** A vault's record: its scope and identity, its two epochs, and its gate, nested, null while the vault is novel (`gate_epoch` 0). The core's `VaultRecord`.
 * Nothing in it opens without a passphrase or passkey. That `gate_epoch` is 0 exactly when `gate`
 * is null is the client's to check, as the core's record does on every write and read.
 */
export const VaultRecord = zodToConvex(Validators.VaultRecord)

/** The vault record a vault is first stored as, which `ensureVault` takes: a novel vault's, `gate_epoch` 0 and no gate. The core's `VaultDraft`.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at, vault_epoch: 0, gate_epoch: 0, gate: null }
 */
export const NovelVaultRecord = zodToConvex(Validators.VaultDraft)

/** One box: its whisper ciphered under its own boxKey, that boxKey wrapped under the vaultKey, and the visible fields. The core's `BoxRecord`.
 * The sidecar is the app's own JSON object, any value to Convex, always written, `{}` for none.
 * Times are epoch milliseconds. It converts field by field, as does {@link BoxSparse}, so that its
 * type is Convex's own reading of its fields: whole, its type would be the core's, whose sidecar is
 * any JSON, a type too deep for Convex's to compare.
 */
export const BoxRecord = v.object(zodToConvexFields(Validators.BoxRecord.shape))

/** A box's sparse shape, as a listing returns it: every field but the two ciphered ones, `format` kept, so the client validates it as a whole record. The core's `BoxSparse`. */
export const BoxSparse = v.object(zodToConvexFields(Validators.BoxSparse.shape))

/** A vault as one query or mutation reads it: its vault record, as `vault`, and every box without its two ciphered fields, in boxlabel order.
 * The client splits the boxes into the sound and the damaged, with `splitStoredBoxes`: the
 * component holds no judgment of a box's damage, which is safebyok's.
 *
 * @example { vault: vaultRecord, boxes: [boxSparse] }
 */
export const VaultAnswer = v.object({
  vault: VaultRecord,
  boxes: v.array(BoxSparse),
})

/** What an update of the vault record was proven against: it lands only while the stored vault record has this `vault_tok` and `gate_epoch`. The core's `VaultRecordExpectation`.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export const VaultRecordExpectation = zodToConvex(Validators.VaultRecordExpectation)

/** What a box read means to read in: the box is read only while the scope's vault record has this `vault_tok`. The core's `BoxGetExpectation`.
 * So a reader holding the key of one vault is never handed a box of another life of the scope.
 *
 * @example { vault_tok: vaultRecord.vault_tok }
 */
export const BoxGetExpectation = zodToConvex(Validators.BoxGetExpectation)

/** What a box write was sealed for and read: the vault record it lands beside, and the box it replaces. The core's `BoxExpectation`.
 * It lands only while the scope's vault record has this `vault_tok`, and the stored box this
 * `revision_tok`, or, for null, there is no box.
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: null } // a box that was not there
 */
export const BoxExpectation = zodToConvex(Validators.BoxExpectation)

/** How full a vault is, from its tally: its boxes, and their bytes as Convex counts a document, against the component's limits. The core's `Capacity`.
 * Each `max` is a number or `Infinity`, as the core takes it; the component's own limits are finite.
 *
 * @example { boxes: { used: 12, max: 8000 }, bytes: { used: 48_000, max: 7_339_008 } }
 */
export const Capacity = zodToConvex(Validators.Capacity)

/** What a box get answers, from its one query's snapshot: `got`, with the box, or the refusal that got nothing.
 * `got: true` carries the box under the boxlabel exactly as stored (`box_stored`; null for none).
 * `vault_mismatch`, when the scope's vault record is not the one expected, or none is stored, carries
 * nothing of it.
 *
 * @example { got: true, box_stored: stored }
 * @example { got: false, refusalkind: 'vault_mismatch' }
 */
export const GetBoxAnswer = v.union(
  v.object({ got: v.literal(true), box_stored: v.nullable(BoxRecord) }),
  v.object({ got: v.literal(false), refusalkind: v.literal('vault_mismatch') }),
)

/** What a box write answers, from its one transaction: `landed`, or the kind of refusal that wrote nothing.
 * A write that landed carries the box as stored. `stale_write` carries the box stored under the
 * boxlabel as a read returns it (`box_stored`, whole; null for none). `vault_mismatch`, when the
 * scope's vault record is not the one the box was sealed for, carries nothing of it.
 * `vault_full`, for a write the vault has no room for, carries its {@link Capacity} as it found it.
 *
 * @example { landed: true, box_stored: stored }
 * @example { landed: false, refusalkind: 'stale_write', box_stored: winner }
 * @example { landed: false, refusalkind: 'vault_mismatch' }
 * @example { landed: false, refusalkind: 'vault_full', capacity }
 */
export const PutBoxAnswer = v.union(
  v.object({ landed: v.literal(true), box_stored: BoxRecord }),
  v.object({ landed: v.literal(false), refusalkind: v.literal('stale_write'), box_stored: v.nullable(BoxRecord) }),
  v.object({ landed: v.literal(false), refusalkind: v.literal('vault_mismatch') }),
  v.object({ landed: v.literal(false), refusalkind: v.literal('vault_full'), capacity: Capacity }),
)

/** What an update of the vault record answers, from its one transaction: `landed` with the vault record as stored, or the stored vault record that it did not land over.
 * A landed update carries it as stored, its `vault_epoch` moved up by one (`vault_stored`).
 * A miss carries what is stored as a read returns it (`vault_stored`; null for none).
 *
 * @example { landed: true, vault_stored: stored }
 * @example { landed: false, vault_stored: winner }
 */
export const PutVaultRecordAnswer = v.union(
  v.object({ landed: v.literal(true), vault_stored: VaultRecord }),
  v.object({ landed: v.literal(false), vault_stored: v.nullable(VaultRecord) }),
)

/** What a vault delete was meant for: it lands only while the scope's vault record has this `vault_tok` and `gate_epoch`. The core's `VaultDelExpectation`.
 * So a stale session never deletes a vault made anew elsewhere, nor one whose gate has changed.
 * A null `gate_epoch` is for deleting a vault whose record is damaged, and expects the `vault_tok` alone.
 *
 * @example { vault_tok: vaultRecord.vault_tok, gate_epoch: vaultRecord.gate_epoch }
 */
export const VaultDelExpectation = zodToConvex(Validators.VaultDelExpectation)

/** What a deleted vault leaves in its scope: its counter, which the next vault made there carries on. The core's `VaultTombstone`.
 *
 * @example { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }
 */
export const VaultTombstone = zodToConvex(Validators.VaultTombstone)

/** What a box delete was meant for: the vault, and the `revision_tok` its writer read, or null for a box listed damaged with none. The core's `BoxDelExpectation`.
 * It lands only while the scope's vault record has this `vault_tok`, whatever revision is stored, so a
 * stale session never deletes from a vault made anew elsewhere. The revision only says whether
 * what it removed was the one meant, as a {@link BoxDeletion}.
 *
 * @example { vault_tok: vaultRecord.vault_tok, revision_tok: listed.revision_tok }
 */
export const BoxDelExpectation = zodToConvex(Validators.BoxDelExpectation)

/** What a box delete that landed removed: `deleted`, the revision it named; `deleted_other`, another; `absent`, nothing. The core's `BoxDeletion`.
 * Another is a box written over meanwhile, or one where it named none.
 *
 * @example { outcome: 'deleted' }
 */
export const BoxDeletion = zodToConvex(Validators.BoxDeletion)

/** One box's place in a {@link VaultSignature}: `[boxlabel, revision_tok]`.
 * Convex has no fixed-length tuple validator, so any list of strings passes: a client only
 * compares one signature with the next.
 */
const BoxRevision = v.array(v.string())

/** The vault's change signature: it changes exactly when a write lands in the vault, and holds nothing a listing does not show.
 * It is the vault record's `vault_tok` and `gate_epoch`, null while there is none, and each box's
 * `[boxlabel, revision_tok]`, in boxlabel order.
 *
 * @example { vault_tok: 'b3f1...', gate_epoch: 2, boxes: [['anthropic_api_key', '9c4e...']] }
 */
export const VaultSignature = v.object({
  vault_tok:        v.nullable(v.string()),
  gate_epoch:       v.nullable(v.number()),
  boxes:            v.array(BoxRevision),
})

import { v } from 'convex/values'

/** Convex validators for safebyok's stored records, field for field with the core's Zod records of the same names.
 * They check what Convex can: which fields, their types, which are optional, and each record's
 * `format`. Every name is any text here, and a box's sidecar any object Convex holds. The finer
 * rules, the name floor and a sidecar's values being JSON among them, are the client's, checked by the
 * core's records on every write and every read. The vault's own validators the server never sees.
 *
 * A new record format widens its `format` union: an additive deploy, shipped with this package.
 */

/** An encrypted value as a record holds it: its cipherIv and its ciphertext, each base64url text.
 * Every encrypted field of every record is this one shape.
 *
 * @example { cipher_iv_b64: 'q83vEjRWeJA', ciphertext_b64: 'yL3cKX0...' }
 */
export const Ciphered = v.object({
  cipher_iv_b64:  v.string(),
  ciphertext_b64: v.string(),
})

/** What names one vault: the host application's label, the user, and the vault's own label.
 *
 * @example { applabel: 'acme', user_id: 'user_2fJ8...', vaultlabel: 'main' }
 */
export const VaultScope = v.object({
  applabel:   v.string(),
  user_id:    v.string(),
  vaultlabel: v.string(),
})

/** The VaultProps formats this package stores. */
export const VaultPropsFormat = v.union(v.literal('safebyok-vault-v6'))

/** The formats of a BoxRecord this package stores. */
export const BoxFormat = v.union(v.literal('safebyok-box-v8'))

/** A passphrase's way into a vault: how its passphraseKey is derived, and the vaultKey wrapped under that key.
 *
 * @example { wayinkind: 'passphrase', key_deriver_label: 'argon2id_web_v1', salt_b64: 'q83v...', vault_key_wayin_wrapped: { cipher_iv_b64, ciphertext_b64 } }
 */
export const PassphraseWayin = v.object({
  wayinkind:               v.literal('passphrase'),
  key_deriver_label:       v.string(),
  salt_b64:                v.string(),
  device_id:               v.string(),
  registered_at:           v.number(),
  vault_key_wayin_wrapped: Ciphered,
})

/** A passkey's way into a vault: the WebAuthn credential and PRF salt to ask, and the vaultKey wrapped under the key its answer makes.
 *
 * @example { wayinkind: 'passkey', credential_id: 'AXk3...', prf_salt_b64: 'q83v...', vault_key_wayin_wrapped: { cipher_iv_b64, ciphertext_b64 } }
 */
export const PasskeyWayin = v.object({
  wayinkind:               v.literal('passkey'),
  credential_id:           v.string(),
  prf_salt_b64:            v.string(),
  device_id:               v.string(),
  registered_at:           v.number(),
  vault_key_wayin_wrapped: Ciphered,
})

/** A vault's props: its scope and identity, and its ways in, each the vaultKey wrapped under a wayinKey.
 * A vault with a gate (`gate_epoch` 1 or more) has a `passphrase`, and a `passkey` or null. A
 * gateless one (`gate_epoch` 0) has null for both. Nothing in it opens without a passphrase or passkey.
 */
export const VaultProps = v.object({
  format:           VaultPropsFormat,
  applabel:         v.string(),
  user_id:          v.string(),
  vaultlabel:       v.string(),
  vault_tok:        v.string(),
  vault_epoch:      v.number(),
  gate_epoch:       v.number(),
  passphrase:       v.nullable(PassphraseWayin),
  passkey:          v.nullable(PasskeyWayin),
  registered_at:    v.number(),
})

/** The vault props a vault is first stored as, which `ensureVault` takes: `gate_epoch` 0, and no way in.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, gate_epoch: 0, passphrase: null, passkey: null, registered_at }
 */
export const GatelessVaultProps = v.object({
  format:           VaultPropsFormat,
  applabel:         v.string(),
  user_id:          v.string(),
  vaultlabel:       v.string(),
  vault_tok:        v.string(),
  vault_epoch:      v.number(),
  gate_epoch:       v.literal(0),
  passphrase:       v.null(),
  passkey:          v.null(),
  registered_at:    v.number(),
})

/** One box: its whisper ciphered under its own boxKey, that boxKey wrapped under the vaultKey, and the visible fields.
 * The sidecar is the app's own JSON object, as a Convex object, always written, `{}` for none. Times are epoch milliseconds.
 */
export const BoxRecord = v.object({
  format:                 BoxFormat,
  boxlabel:               v.string(),
  revision_tok:           v.string(),
  box_key_wrapped:        Ciphered,
  whisper_ciphered:       Ciphered,
  whisper_codec:          v.literal('json_v1'),
  whisper_schema_version: v.literal(1),
  sidecar:                v.record(v.string(), v.any()),
  registered_at:          v.number(),
  written_at:             v.number(),
})

/** A box as a listing returns it: every field but the two ciphered ones, `format` kept, so the client validates it as a whole record. */
export const ListedBox = BoxRecord.omit('box_key_wrapped', 'whisper_ciphered')

/** A vault as one query or mutation reads it: its vault props, and every box without its two ciphered fields, in boxlabel order.
 *
 * @example { vaultProps, boxes: [listedBox] }
 */
export const VaultAnswer = v.object({
  vaultProps: VaultProps,
  boxes:      v.array(ListedBox),
})

/** What an update of the vault props was proven against: it lands only while the standing vault props have this `vault_tok` and `gate_epoch`.
 *
 * @example { vault_tok: standing.vault_tok, gate_epoch: standing.gate_epoch }
 */
export const VaultPropsExpectation = v.object({
  vault_tok:        v.string(),
  gate_epoch:       v.number(),
})

/** What a box write was sealed for and read: the vault props it lands beside, and the box it replaces.
 * It lands only while the scope's vault props have this `vault_tok`, and the standing box this
 * `revision_tok`, or, for null, there is no box.
 *
 * @example { vault_tok: vaultProps.vault_tok, revision_tok: null } // a box that was not there
 */
export const BoxExpectation = v.object({
  vault_tok:    v.string(),
  revision_tok: v.nullable(v.string()),
})

/** How much of one limit a vault has used, against the most the component holds of one vault. */
const Room = v.object({ used: v.number(), max: v.number() })

/** How full a vault is, from its tally: its boxes, and their bytes as Convex counts a document, against the component's limits.
 *
 * @example { boxes: { used: 12, max: 8000 }, bytes: { used: 48_000, max: 7_339_008 } }
 */
export const Capacity = v.object({ boxes: Room, bytes: Room })

/** What a box write answers, from its one transaction: `landed`, or the kind of refusal that wrote nothing.
 * A write that landed carries the box as stored. `stale_write` carries the box standing under the
 * boxlabel as a read returns it (`box_stored`, whole; null for none). `vault_mismatch`, when the
 * scope's vault props are not the ones the box was sealed for, carries nothing of them.
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

/** What an update of the vault props answers, from its one transaction: `landed` with the vault props as stored, or the vault props standing that it did not land over.
 * A landed update carries them as stored, their `vault_epoch` moved up by one (`vault_props_stored`).
 * A miss carries what stands as a read returns it (`vault_props_stored`; null for none).
 *
 * @example { landed: true, vault_props_stored: stored }
 * @example { landed: false, vault_props_stored: winner }
 */
export const PutVaultPropsAnswer = v.union(
  v.object({ landed: v.literal(true), vault_props_stored: VaultProps }),
  v.object({ landed: v.literal(false), vault_props_stored: v.nullable(VaultProps) }),
)

/** What a vault delete was meant for: it lands only while the scope's vault props have this `vault_tok` and `gate_epoch`.
 * So a stale session never deletes a vault made anew elsewhere, nor one whose gate has changed.
 * A null `gate_epoch` is for deleting a vault whose props are damaged, and expects the `vault_tok` alone.
 *
 * @example { vault_tok: vaultProps.vault_tok, gate_epoch: vaultProps.gate_epoch }
 */
export const VaultDelExpectation = v.object({
  vault_tok:  v.string(),
  gate_epoch: v.nullable(v.number()),
})

/** The format a {@link Tombstone} carries. */
export const TombstoneFormat = v.union(v.literal('safebyok-tombstone-v1'))

/** What a deleted vault leaves in its scope: its counter, which the next vault made there carries on.
 *
 * @example { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }
 */
export const Tombstone = v.object({
  format:       TombstoneFormat,
  applabel:     v.string(),
  user_id:      v.string(),
  vaultlabel:   v.string(),
  vault_epoch:  v.number(),
})

/** What a box delete was meant for: the vault, and the `revision_tok` its writer read, or null for a box listed damaged with none.
 * It lands only while the scope's vault props have this `vault_tok`, whatever revision stands, so a
 * stale session never deletes from a vault made anew elsewhere. The revision only says whether
 * what it removed was the one meant, as a {@link BoxDeletion}.
 *
 * @example { vault_tok: vaultProps.vault_tok, revision_tok: listed.revision_tok }
 */
export const BoxDelExpectation = v.object({
  vault_tok:    v.string(),
  revision_tok: v.nullable(v.string()),
})

/** What a box delete that landed removed: `deleted`, the revision it named; `deleted_other`, another; `absent`, nothing.
 * Another is a box written over meanwhile, or one where it named none.
 *
 * @example { outcome: 'deleted' }
 */
export const BoxDeletion = v.object({
  outcome: v.union(v.literal('deleted'), v.literal('deleted_other'), v.literal('absent')),
})

/** One box's place in a {@link VaultSignature}: `[boxlabel, revision_tok]`.
 * Convex has no fixed-length tuple validator, so any list of strings passes: a client only
 * compares one signature with the next.
 */
const BoxRevision = v.array(v.string())

/** The vault's change signature: it changes exactly when a write lands in the vault, and holds nothing a listing does not show.
 * It is the vault props' `vault_tok` and `gate_epoch`, null while there are none, and each box's
 * `[boxlabel, revision_tok]`, in boxlabel order.
 *
 * @example { vault_tok: 'b3f1...', gate_epoch: 2, boxes: [['anthropic_api_key', '9c4e...']] }
 */
export const VaultSignature = v.object({
  vault_tok:        v.nullable(v.string()),
  gate_epoch:       v.nullable(v.number()),
  boxes:            v.array(BoxRevision),
})

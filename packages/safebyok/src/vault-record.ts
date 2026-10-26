/** The vault record: the one record per vault every device syncs, its gate nested in it, and the shapes sliced from it. Each `parse` refuses 'bad_record', quoting none of it. */

import type * as Z from 'zod'
import { Validator } from './checks/validator'
import * as Phrases from './phrases'
import { prf_salt_b64, salt_b64, vault_key_wayin_wrapped, vault_tok } from './types/type-aliases'

// == [Formats]: VaultFormat, TombstoneFormat

/** The `format` a {@link VaultRecord} carries, and the first part of every wayin's ctx. */
export const VaultFormat = 'safebyok-vault-v6'

/** The `format` a {@link VaultTombstone} carries, which tells it from a vault record stored in the same place. */
export const TombstoneFormat = 'safebyok-tombstone-v1'
// --

// == [The records]: PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GateRecord, VaultRecord, VaultSparse, VaultStamp, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse

/** The vault's stored records and the shapes sliced from them: each wayin, the gate holding them, the vault record holding the gate, and the tombstone a deletion leaves. Each `parse` refuses 'bad_record', quoting none of it.
 * Each record is strict: a field this version does not know is damage. A VaultDB reads each back
 * through these, and refuses what fails as 'damaged_vault'. Each shape is the record's own fields,
 * picked or left out, never a parallel list; a part's shapes nest as the part does.
 *
 * @example VaultRecord.safeParse(await myBackend.readRow(id)).success   // false for a row that is no vault record
 * @example VaultSparse.parse(omit(record, ['gate']))                    // the record without its gate
 */
export const { PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GateRecord, VaultRecord, VaultSparse, VaultStamp, VaultStampPicked, VaultStampButFormat, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse } = Validator('bad_record', ({ obj, str, uint, int, lit, discrim, applabel, user_id, vaultlabel, epochMillis }) => {
  const PassphraseWayinRecord = obj({
    wayinkind:               lit('passphrase'),
    /** Which keyDeriverSpec made the passphraseKey: `argon2id_web_v1`, or a host's own label. */
    key_deriver_label:       str.min(1),
    /** This wayin's passphraseSalt: fresh for every passphrase the vault takes. */
    salt_b64,
    /** The sealing device's random id for the vault, from its device record: never drawn from the device itself. */
    device_id:               str.min(1),
    /** When this wayin was sealed: a new passphrase stamps it afresh. */
    registered_at:           epochMillis,
    /** The vaultKey, wrapped under the passphraseKey: unwrapping it is the passphrase check. */
    vault_key_wayin_wrapped,
  }).strict()

  const PasskeyWayinRecord = obj({
    wayinkind:               lit('passkey'),
    /** The WebAuthn credential's id, base64url, as `PublicKeyCredential.id` gives it: which passkey to ask. */
    credential_id:           str.min(1),
    /** The salt the passkey's PRF is evaluated over: {@link PasskeySaltBytes} random bytes, fresh for every wayin. */
    prf_salt_b64,
    /** The adding device's random id for the vault, from its device record: never drawn from the device itself. */
    device_id:               str.min(1),
    /** When this wayin was added. */
    registered_at:           epochMillis,
    /** The vaultKey, wrapped under the passkeyKey: unwrapping it is the passkey check. */
    vault_key_wayin_wrapped,
  }).strict()

  const WayinRecord = discrim('wayinkind', [PassphraseWayinRecord, PasskeyWayinRecord])

  const GateRecord = obj({
    /** The vault's passphrase wayin, which every gate has. */
    passphrase:              PassphraseWayinRecord,
    /** The vault's passkey wayin, or null when it has none: at most one. */
    passkey:                 PasskeyWayinRecord.nullable(),
  }).strict()

  // The record's fields, before its one rule across them: what every shape is sliced from, since
  // Zod slices no object that carries a refinement.
  const vaultRecordFields = obj({
    format:                  lit(VaultFormat),
    applabel,
    user_id,
    vaultlabel,
    /** A random token minted when the vault is made, never changed, and bound into every encryption. */
    vault_tok,
    /** When the vault was made; never changed. */
    registered_at:           epochMillis,
    /** A counter the store bumps on every write of the vault record and on the vault's deletion, and carries on into a new life of the scope.
     * It only goes up; a device that has seen a higher one than storage shows knows storage was rolled back.
     * No box write moves it, and a writer's own value is ignored: the store decides.
     */
    vault_epoch:             uint,
    /** A counter that moves up by one at every write of the gate: 0 while the vault is novel, with no gate, and 1 or more once it has one. */
    gate_epoch:              uint,
    /** The vault's ways in, or null while it is novel. */
    gate:                    GateRecord.nullable(),
  }).strict()

  const VaultRecord = vaultRecordFields.refine((record) => (record.gate === null) === (record.gate_epoch === 0), { error: Phrases.GateEpochAndGate, path: ['gate_epoch'] })

  const VaultSparse = vaultRecordFields.omit({ gate: true })
  const VaultStamp = vaultRecordFields.pick({ format: true, applabel: true, user_id: true, vaultlabel: true, vault_tok: true, registered_at: true })
  // The stamp picked from whatever carries it, a vault record, a Vault object or its sparse shape: a ctx takes its fields alone.
  const VaultStampPicked = VaultStamp.strip()
  const VaultStampButFormat = VaultStamp.omit({ format: true }).strip()
  const VaultTombstone = vaultRecordFields.pick({ applabel: true, user_id: true, vaultlabel: true }).extend({ format: lit(TombstoneFormat), vault_epoch: int.positive() }).strict()

  const PassphraseWayinSparse = PassphraseWayinRecord.omit({ key_deriver_label: true, salt_b64: true, vault_key_wayin_wrapped: true })
  const PasskeyWayinSparse = PasskeyWayinRecord.omit({ vault_key_wayin_wrapped: true })
  const GateSparse = GateRecord.extend({ passphrase: PassphraseWayinSparse, passkey: PasskeyWayinSparse.nullable() })

  return { PassphraseWayinRecord, PasskeyWayinRecord, WayinRecord, GateRecord, VaultRecord, VaultSparse, VaultStamp, VaultStampPicked, VaultStampButFormat, VaultTombstone, GateSparse, PassphraseWayinSparse, PasskeyWayinSparse }
})

/** A passphrase wayin as stored: the vaultKey wrapped under the passphraseKey the passphrase and this wayin's passphraseSalt make.
 * Every other field is visible, and bound into that wrap, so a wayin altered or moved to another
 * vault refuses to open. A gate holds exactly one, as its `passphrase`.
 */
export type PassphraseWayinRecord = Z.infer<typeof PassphraseWayinRecord>

/** A passkey wayin as stored: the vaultKey wrapped under the passkeyKey made from the authenticator's PRF answer over this wayin's salt.
 * The authenticator holds the secret. Every other field is visible, and bound into that wrap. A
 * gate holds at most one, as its `passkey`.
 */
export type PasskeyWayinRecord = Z.infer<typeof PasskeyWayinRecord>

/** One wayin as stored, a {@link PassphraseWayinRecord} or a {@link PasskeyWayinRecord}, told apart by `wayinkind`; `Wayin.make` reads one. */
export type WayinRecord = Z.infer<typeof WayinRecord>

/** A vault's ways in as stored, its gate: the passphrase's wayin, and the passkey's or null.
 * The vault record holds it as its `gate`, null while the vault is novel. Each wayin wraps the one
 * vaultKey, and none opens without its proof.
 *
 * @example { passphrase: passphraseWayinRecord, passkey: null }
 */
export type GateRecord = Z.infer<typeof GateRecord>

/** The one record per vault that every device syncs: its stamp, its two epochs, and its gate. None of it opens without a proof.
 * The stamp (`format`, the scope, `vault_tok`, `registered_at`) is fixed for the vault's life.
 * `vault_epoch` moves at every write of the record; `gate_epoch` at every write of the gate. A
 * novel vault, as `VaultDB.ensureVault` first stores it, has `gate_epoch` 0 and `gate` null; its
 * first gate is written over it at `gate_epoch` 1, expecting 0. The record's check holds
 * `gate_epoch` 0 exactly when `gate` is null. The gate rides in the record, though a shape that
 * wants no gate leaves it out ({@link VaultSparse}), since the record and its gate are written in
 * one compare-and-write.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at, vault_epoch: 0, gate_epoch: 0, gate: null }
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at, vault_epoch: 3, gate_epoch: 2, gate: { passphrase, passkey: null } }
 */
export type VaultRecord = Z.infer<typeof VaultRecord>

/** A vault record as storage may hold it, which may fail its check: to the compiler a {@link VaultRecord} as written, to a reader the outcome a damaged one is.
 * It names what a VaultDB's `doGetVault` may hand up as `vault`, beside a sound record, a
 * tombstone, and null: present, dead, broken, missing. The base class's check tells them apart.
 */
export type DamagedVaultRecord = Z.input<typeof VaultRecord>

/** A vault record without its gate: its stamp and both epochs. What a log line, a refusal's meta, `demandConsistentWith` and `Box.make` take, wherever the gate is not needed.
 *
 * @example { format: 'safebyok-vault-v6', applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at, vault_epoch: 3, gate_epoch: 2 }
 */
export type VaultSparse = Z.infer<typeof VaultSparse>

/** The fields of a vault record fixed for the vault's life: its `format`, scope, `vault_tok` and `registered_at`, never an epoch, which counts.
 *
 * @example { format: 'safebyok-vault-v6', applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at }
 */
export type VaultStamp = Z.infer<typeof VaultStamp>

/** A vault's stamp as what lies in it binds it: every field of its {@link VaultStamp} but the format, so a new vault format leaves each box and lease open.
 * Its `parse` picks those fields from whatever carries them, a vault record or a Vault object, and
 * refuses 'bad_record' for one missing any; `VaultStampPicked` picks the whole stamp alike.
 *
 * @example { applabel: 'acme', user_id: 'u1', vaultlabel: 'main', vault_tok: 'Qm9vdA', registered_at }
 */
export type VaultStampButFormat = Z.infer<typeof VaultStampButFormat>

/** What a thing carries of the vault it was made under, as `vault.demandConsistentWith` judges it: the vault's `vault_tok`, and whichever of its scope and epochs the thing carries.
 * A Box, a Lease, a Gate, a Proving, a snapshot and a vault record are each one. A field the
 * thing has of its own beside these, a box's `format` or `registered_at`, is no part of it.
 *
 * @example vault.demandConsistentWith({ vault_tok: box.vault_tok, gate_epoch: box.gate_epoch })
 */
export type VaultMadeUnder = Pick<VaultSparse, 'vault_tok'> & Partial<Pick<VaultSparse, 'applabel' | 'user_id' | 'vaultlabel' | 'vault_epoch' | 'gate_epoch'>>

/** A vault record whose gate is made: what {@link isGated} tells apart, and what every gating but a vault's first works on. */
export type GatedVaultRecord = VaultRecord & { gate: GateRecord }

/** A novel vault record, as `bank.ensureVault` drafts it and `VaultDB.ensureVault` first stores it: no gate, and `gate_epoch` 0.
 *
 * @example { format: 'safebyok-vault-v6', ...scope, vault_tok, registered_at: now, vault_epoch: 0, gate_epoch: 0, gate: null }
 */
export type VaultDraft = VaultRecord & { gate: null, gate_epoch: 0 }

/** What a deleted vault leaves in its scope: its counter, which the next life of the scope carries on.
 * `vault_epoch` is the deleted vault's plus one. Every write refuses over a tombstone as it does
 * over no vault, a deletion included: it holds no `vault_tok` for an expectation to name. The next
 * `ensureVault` of the scope replaces it with a new life.
 *
 * @example { format: 'safebyok-tombstone-v1', ...scope, vault_epoch: 4 }
 */
export type VaultTombstone = Z.infer<typeof VaultTombstone>

/** A passphrase wayin without its wrap, its salt or its key deriver's label: what a guess at the passphrase needs is left out. */
export type PassphraseWayinSparse = Z.infer<typeof PassphraseWayinSparse>

/** A passkey wayin without its wrap: what to ask the authenticator with, and when and by which device it was added. */
export type PasskeyWayinSparse = Z.infer<typeof PasskeyWayinSparse>

/** A gate as a host may see it while the vault is locked: each wayin as its sparse shape. */
export type GateSparse = Z.infer<typeof GateSparse>

/** True for a vault record whose gate is made, as opposed to a novel one's: its `gate` there to read.
 *
 * @example if (isGated(record)) { offerUnlock(record.gate.passphrase) } else { offerNewPassphrase() }
 */
export const isGated = <RecordT extends Pick<VaultRecord, 'gate'>>(record: RecordT): record is RecordT & { gate: GateRecord } => record.gate !== null

/** `record` without its gate, frozen: its {@link VaultSparse}, every other field as it stands.
 *
 * @example vaultSparseOf(record).gate_epoch === record.gate_epoch   // true, and no gate to read
 */
export const vaultSparseOf = (record: VaultRecord): VaultSparse => {
  const { gate: _gate, ...sparse } = record
  return Object.freeze(sparse)
}

/** `gate` as a host may see it, frozen through: its {@link GateSparse}, each wayin without what a guess at the passphrase would start from or what opens the vault.
 *
 * @example gateSparseOf(record.gate).passphrase   // { wayinkind: 'passphrase', device_id, registered_at }: no salt, key deriver label or wrap
 */
export const gateSparseOf = (gate: GateRecord): GateSparse => {
  const { key_deriver_label: _deriver, salt_b64: _salt, vault_key_wayin_wrapped: _passphraseWrap, ...passphrase } = gate.passphrase
  if (gate.passkey === null) { return Object.freeze({ passphrase: Object.freeze(passphrase), passkey: null }) }
  const { vault_key_wayin_wrapped: _passkeyWrap, ...passkey } = gate.passkey
  return Object.freeze({ passphrase: Object.freeze(passphrase), passkey: Object.freeze(passkey) })
}
// --

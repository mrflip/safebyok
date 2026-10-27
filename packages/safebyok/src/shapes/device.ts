/** What a device keeps of a vault: its lease, and its device record. Each `parse` refuses 'bad_record', and each record is strict. */

import type * as Z from 'zod'
import { Validator } from '../checks/validator'
import { device_id, vault_key_lease_wrapped, vault_tok } from './fields'

// == [Lease]: LeaseFormat, LeaseRecord, LeaseStamp, LeaseSparse

/** The `format` a {@link LeaseRecord} carries, in its stamp. */
export const LeaseFormat = 'safebyok-lease-v1'

/** A lease as this device keeps it: the non-extractable leaseKey, and the vaultKey wrapped under it. What a `Lease` is made from.
 * It has no JSON form, so only structured-clone storage (IndexedDB) or memory holds it. Nothing in
 * it ever goes to the backend. Its `parse` refuses 'bad_record'; it is strict, as every stored
 * record is.
 */
export const { LeaseRecord } = Validator('bad_record', ({ obj, int, lit, custom, applabel, user_id, vaultlabel, epochMillis }) => ({
  LeaseRecord: obj({
    format:            lit(LeaseFormat),
    applabel,
    user_id,
    vaultlabel,
    vault_tok,
    /** The vault record's `gate_epoch` when this lease was granted: a mismatch voids it. */
    gate_epoch:        int.positive(),
    /** This browser's leaseKey, a CryptoKey, never its bytes: non-extractable, usable only to unwrap what it wrapped. */
    lease_key:         custom<CryptoKey>((val) => val instanceof CryptoKey, "a CryptoKey handle"),
    /** The vaultKey, wrapped under the leaseKey. */
    vault_key_lease_wrapped,
    /** The instant from which the lease no longer counts, and the vault asks for a proof. */
    ask_passphrase_at: epochMillis,
  }).strict(),
}))
export type LeaseRecord = Z.infer<typeof LeaseRecord>

/** A lease's stamp: its record but for its key material, every field fixed for its life, as a lease is made once and never changed. Its `parse` takes it from a lease or its record, and refuses 'bad_record'.
 * A lease is granted under one `gate_epoch`, so its stamp holds that epoch, as a reference to the
 * gate it was granted under. Its wrap's ctx holds the whole of it, beside its vault's stamp.
 *
 * @example { format: 'safebyok-lease-v1', ...scope, vault_tok: 'Qm9vdA', gate_epoch: 2, ask_passphrase_at: 1_900_000_000_000 }
 */
export const { LeaseStamp } = Validator('bad_record', () => ({ LeaseStamp: LeaseRecord.omit({ lease_key: true, vault_key_lease_wrapped: true }).strip() }))
export type LeaseStamp = Z.infer<typeof LeaseStamp>

/** A lease's sparse shape: the same fields as its {@link LeaseStamp}, as a lease is made once and never changed, named for what a log line or a listing shows. A Lease's own fields are these. */
export type LeaseSparse = LeaseStamp
// --

// == [Device record]: DeviceRecordFormat, DeviceRecord

/** The `format` a {@link DeviceRecord} carries. */
export const DeviceRecordFormat = 'safebyok-device-v1'

/** What this device keeps of one scope, locked or not, across the vault's lives there: its own id, and the highest `vault_epoch` it has seen. Nothing in it is secret.
 * A vault served below `highest_vault_epoch` was rolled back, and the bank refuses it as
 * 'vault_behind'. The DeviceDB raises it, never lowers it: a write of a lower epoch keeps the
 * higher, and the first `device_id` stored stays. `bank.clearCachedVault` erases it. Its `parse`
 * refuses 'bad_record', and hands back the record frozen.
 *
 * It is strict, and a record that fails its check reads as none, so a field added to it bumps its
 * `format`: a device whose safebyok predates the field discards the record, and with it the
 * `highest_vault_epoch` that guards it against a rolled-back vault, until its next read raises it
 * again. `deviceRecordOf` builds one from a parsed scope.
 *
 * @example { format: 'safebyok-device-v1', ...scope, device_id: 'Zm9vYmFy', highest_vault_epoch: 3 }
 */
export const { DeviceRecord } = Validator('bad_record', ({ obj, uint, lit, applabel, user_id, vaultlabel }) => ({
  DeviceRecord: obj({
    format:              lit(DeviceRecordFormat),
    applabel,
    user_id,
    vaultlabel,
    /** This device's random id for the scope, minted the first time it births the vault there, and carried by every wayin it seals. */
    device_id,
    /** The highest `vault_epoch` this device has seen the scope's vault at, in any of its lives. */
    highest_vault_epoch: uint,
  }).strict().readonly(),
}))
export type DeviceRecord = Z.infer<typeof DeviceRecord>
// --

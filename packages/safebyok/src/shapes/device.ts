/** What a device keeps of a vault: its lease, what a lease is granted, and its device record, each `parse` refusing 'bad_record', each record strict; and the IndexedDB device store's options. */

import type * as Z from 'zod'
import * as Phrases from '../phrases'
import { Checker, objCheck } from '../checks/validator'
import * as FX from './fields'

// == [Lease]: LeaseFormat, isLeaseKey, leaseRecord, leaseStamp, LeaseSparse, leaseGrant

/** The `format` a {@link LeaseRecord} carries, in its stamp. */
export const LeaseFormat = 'safebyok-lease-v1'

/** True when `val` is a leaseKey as `makeLeaseKey` makes one: a non-extractable AES-GCM CryptoKey whose usages are within `wrapKey` and `unwrapKey`, among them `unwrapKey`.
 * A device store hands back what it kept by structured clone, so a key that is extractable, of
 * another algorithm, or for another use was not written by this package: its record reads as none.
 *
 * @example isLeaseKey(await makeLeaseKey())   // true
 * @example isLeaseKey(await makeVaultKey())   // false: extractable
 */
export const isLeaseKey = (val: unknown): val is CryptoKey => (
  val instanceof CryptoKey
    && ! val.extractable
    && val.algorithm.name === 'AES-GCM'
    && val.usages.includes('unwrapKey')
    && val.usages.every((usage) => usage === 'wrapKey' || usage === 'unwrapKey')
)

/** A lease as this device keeps it: the non-extractable leaseKey, and the vaultKey wrapped under it. What a `Lease` is made from.
 * It has no JSON form, so only structured-clone storage (IndexedDB) or memory holds it. Nothing in
 * it ever goes to the backend. Its `parse` is strict, and refuses 'bad_record'.
 */
export const leaseRecord = objCheck(({ int, lit, custom, applabel, user_id, vaultlabel, epochMillis, vault_tok, vault_key_lease_wrapped }) => ({
  format:            lit(LeaseFormat),
  applabel,
  user_id,
  vaultlabel,
  vault_tok,
  /** The vault record's `gate_epoch` when this lease was granted: a mismatch voids it. */
  gate_epoch:        int.positive(),
  /** This browser's leaseKey, a CryptoKey, never its bytes: non-extractable AES-GCM, usable only to wrap and unwrap, as {@link isLeaseKey} says. One kept otherwise reads as no lease. */
  lease_key:         custom<CryptoKey>(isLeaseKey, Phrases.LeaseKeyExpected),
  /** The vaultKey, wrapped under the leaseKey. */
  vault_key_lease_wrapped,
  /** The instant from which the lease no longer counts, and the vault asks for cleartext again. */
  ask_passphrase_at: epochMillis,
}), 'bad_record', [FX])
export type LeaseRecord = Z.infer<typeof leaseRecord>

/** A lease's stamp: its record but for its key material, every field fixed for its life, as a lease is made once and never changed. Its `parse` takes it from a lease or its record, and refuses 'bad_record'.
 * A lease is granted under one `gate_epoch`, so its stamp holds that epoch, as a reference to the
 * gate it was granted under. Its wrap's ctx holds the whole of it, beside its vault's stamp.
 *
 * @example { format: 'safebyok-lease-v1', ...scope, vault_tok: 'Qm9vdA', gate_epoch: 2, ask_passphrase_at: 1_900_000_000_000 }
 */
export const leaseStamp = Checker(() => leaseRecord.omit({ lease_key: true, vault_key_lease_wrapped: true }).strip())
export type LeaseStamp = Z.infer<typeof leaseStamp>

/** A lease's sparse shape, as a log line or a listing shows it: the same fields as its {@link LeaseStamp}. A Lease's own fields are these. */
export type LeaseSparse = LeaseStamp

/** What `sealLeaseRecord` grants, the scope, the vault record it was proven against, and the deadline, held to what its record will hold. It refuses 'bad_record'. */
export const leaseGrant = Checker(() => leaseRecord.pick({ applabel: true, user_id: true, vaultlabel: true, vault_tok: true, gate_epoch: true, ask_passphrase_at: true }))
// --

// == [Device record]: DeviceRecordFormat, deviceRecord

/** The `format` a {@link DeviceRecord} carries. */
export const DeviceRecordFormat = 'safebyok-device-v1'

/** What this device keeps of one scope, locked or not, across the vault's lives there: its own id, and the highest `vault_epoch` it has seen. Nothing in it is secret.
 * A vault served below `highest_vault_epoch` was rolled back, and the bank refuses it as
 * 'vault_behind'. The DeviceDB raises it, never lowers it: a write of a lower epoch keeps the
 * higher, and the first `device_id` stored stays. `bank.clearCachedVault` erases it. Its `parse`
 * is strict, refuses 'bad_record', and hands back the record frozen. A record that fails it reads
 * as none. `deviceRecordOf` builds one from a parsed scope.
 *
 * @example { format: 'safebyok-device-v1', ...scope, device_id: 'Zm9vYmFy', highest_vault_epoch: 3 }
 */
// A field added here bumps the format: a device whose safebyok predates the field discards the
// record, and with it the `highest_vault_epoch` that guards it against a rolled-back vault, until
// its next read raises it again.
export const deviceRecord = Checker(({ obj, uint, lit, applabel, user_id, vaultlabel, device_id }) => obj({
  format:              lit(DeviceRecordFormat),
  applabel,
  user_id,
  vaultlabel,
  /** This device's random id for the scope, minted the first time it births the vault there, and carried by every wayin it seals. */
  device_id,
  /** The highest `vault_epoch` this device has seen the scope's vault at, in any of its lives. */
  highest_vault_epoch: uint,
}).strict().readonly(), 'bad_record', [FX])
export type DeviceRecord = Z.infer<typeof deviceRecord>
// --

// == [IndexedDB options]: DefaultDbName, idbOpts

/** The IndexedDB database a device store keeps its records in when its options name none. */
const DefaultDbName = 'safebyok'

/** The check of `IdbOpts`: `dbName`, defaulted, and nothing else. Its `parse` refuses 'bad_option'. safebyok-indexeddb's options extend it. */
export const idbOpts = objCheck(({ str }) => ({ dbName: str.min(1).default(DefaultDbName) }), 'bad_option')
// --

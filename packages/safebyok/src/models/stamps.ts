/** The stamps a bank binds into every ctx under it, and the lease's stamp and record that carry it. */

import type * as Z from 'zod'
import { CX, GX, Phrases, Validator } from 'safebyok-big/internals'
import { thingRecord, wayins } from '../storage/shapes-thing'

// == [The stamps]: bankScope, bankStamp, gateStamp, citedGate, stampedGate, BankScope, BankStamp, GateStamp, CitedGate, StampedGate

/** The checks of a bank's scope and stamp, of a gate's stamp and citation, and of a gate as a stored wayin's proving accepts it.
 * Anything carrying a stamp's fields passes, such as a Bank, a Gate or its Thing, and the rest is dropped.
 */
export const { bankScope, bankStamp, gateStamp, citedGate, stampedGate } = Validator.Checkers('bad_option', ({ obj }) => {
  const bankStamp = thingRecord.pick({ userid: true, banklabel: true, lifeseq: true, born_at: true })
  const gateStamp = thingRecord.pick({ userid: true, banklabel: true, labelpath: true, lifeseq: true, born_at: true })
  return {
    bankScope:   thingRecord.pick({ userid: true, banklabel: true }),
    bankStamp,
    gateStamp,
    citedGate:   gateStamp.extend(thingRecord.pick({ revtok: true }).shape),
    stampedGate: obj({ bankStamp, stamp: gateStamp, wayins }),
  }
})

/** A bank's scope: its user and its `banklabel`. */
export type BankScope   = Z.infer<typeof bankScope>
/** A bank's stamp: its scope, and the lifeseq and `born_at` of its life. Every ctx under the bank binds it first. */
export type BankStamp   = Z.infer<typeof bankStamp>
/** A gate's stamp: its scope, and the lifeseq and `born_at` of its life. A wayin's wrapped bankKey is bound to it. */
export type GateStamp   = Z.infer<typeof gateStamp>
/** A gate's stamp and the revision in hand: what a lease is granted under. */
export type CitedGate   = Z.infer<typeof citedGate>
/** A gate as a stored wayin's proving accepts it: its bank's stamp, its own stamp, and its wayins. */
export type StampedGate = Z.infer<typeof stampedGate>
// --

// == [The lease's forms]: LeaseFormat, leaseStamp, leaseRecord, LeaseStamp, LeaseSparse, LeaseRecord

/** The `fmt` a lease carries, as `Lease` checks it. */
export const LeaseFormat = 7102

/** The checks of a lease's stamp and its record.
 * The stamp cites the gate the lease was granted under, and is bound into the wrap of its bankKey.
 * The record adds the leaseKey and the bankKey wrapped under it.
 */
export const { leaseStamp, leaseRecord } = Validator.Checkers('bad_record', ({ obj, lit, custom, epochMillis, bank_key_lease_wrapped }) => {
  const leaseStamp  = obj({
    fmt: lit(LeaseFormat), ...bankStamp.shape,
    gatelabelpath: gateStamp.shape.labelpath, gate_lifeseq: gateStamp.shape.lifeseq, gate_revtok: citedGate.shape.revtok,
    proved_at: epochMillis, wayinkind: GX.wayinkind,
  })
  const leaseRecord = leaseStamp.extend({
    lease_key:              custom<CryptoKey>(GX.isLeaseKey, Phrases.LeaseKeyExpected),
    bank_key_lease_wrapped: bank_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [CX])

/** A lease's stamp, as {@link leaseStamp} checks it. */
export type LeaseStamp  = Z.infer<typeof leaseStamp>
/** The parts of a lease that are safe to show: its {@link LeaseStamp}. */
export type LeaseSparse = LeaseStamp
/** A lease's record, as a device caches it: its stamp, its leaseKey handle, and the bankKey wrapped under it. */
export type LeaseRecord = Z.infer<typeof leaseRecord>
// --

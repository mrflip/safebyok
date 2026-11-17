/** The bank and gate stamps that every ctx under a bank binds, a box's stamp, and the lease's stamp and record. */

import type * as Z from 'zod'
import { CX, GX, Phrases, Validator } from 'safebyok-big/internals'
import { LabelpathOfOtherKind } from '../phrases'
import { BoxThingFormat, isLabelpathOfKind, thingRecord, wayins } from '../storage/shapes-thing'

// == [The stamps]: bankScope, bankStamp, gateStamp, gateCited, stampedGate, boxStamp, BankScope, BankStamp, GateStamp, GateCited, StampedGate, BoxStamp

/** The checks of a bank's scope and stamp, a gate's stamp and citation, a {@link StampedGate}, and a box's stamp.
 * Anything carrying a stamp's fields passes, such as a Bank, a Gate or its Thing, and its other fields are dropped.
 */
export const { bankScope, bankStamp, gateStamp, gateCited, stampedGate, boxStamp } = Validator.Checkers('bad_option', ({ obj, lit }) => {
  const bankStamp = thingRecord.pick({ userid: true, banklabel: true, lifeseq: true, born_at: true })
  const gateStamp = thingRecord.pick({ userid: true, banklabel: true, labelpath: true, lifeseq: true, born_at: true })
  return {
    bankScope:   thingRecord.pick({ userid: true, banklabel: true }),
    bankStamp,
    gateStamp,
    gateCited:   gateStamp.extend(thingRecord.pick({ revtok: true }).shape),
    stampedGate: obj({ bankStamp, stamp: gateStamp, wayins }),
    // Every Thing field, so a box's revision and its record have the same stamp. The shell has no revision, and refuses.
    boxStamp:    thingRecord.extend({
      labelpath: thingRecord.shape.labelpath.refine((given) => isLabelpathOfKind(given, 'box'), LabelpathOfOtherKind),
      fmt:       lit(BoxThingFormat),
    }),
  }
})

/** A bank's scope: its user and its `banklabel`. */
export type BankScope   = Z.infer<typeof bankScope>
/** A bank's stamp: its scope, and the lifeseq and `born_at` of its life. Every ctx under the bank binds it first. */
export type BankStamp   = Z.infer<typeof bankStamp>
/** A gate's stamp: its scope, and the lifeseq and `born_at` of its life. A wayin's wrapped bankKey is bound to it. */
export type GateStamp   = Z.infer<typeof gateStamp>
/** A gate's stamp and its revision's `revtok`: the gate revision a lease is granted for. @see {@link gateStamp} */
export type GateCited   = Z.infer<typeof gateCited>
/** A gate's stamp, its bank's stamp, and its wayins: what a proving of a stored wayin takes. */
export type StampedGate = Z.infer<typeof stampedGate>
/** A box's stamp: its Thing fields, without its sidecar or its sealed whisper. The seal of its whisper is bound to it. */
export type BoxStamp    = Z.infer<typeof boxStamp>
// --

// == [The lease's forms]: LeaseFormat, leaseStamp, leaseRecord, LeaseStamp, LeaseSparse, LeaseRecord

/** The `fmt` a lease carries. */
export const LeaseFormat = 7102

/** The checks of a lease's stamp and its record.
 * The stamp cites the gate the lease was granted under, and is bound into the wrap of its bankKey.
 * The record adds the leaseKey and the bankKey wrapped under it.
 */
export const { leaseStamp, leaseRecord } = Validator.Checkers('bad_record', ({ obj, lit, custom, epochMillis, bank_key_lease_wrapped }) => {
  const leaseStamp  = obj({
    fmt: lit(LeaseFormat), ...bankStamp.shape,
    gate_labelpath: gateStamp.shape.labelpath, gate_lifeseq: gateStamp.shape.lifeseq, gate_revtok: gateCited.shape.revtok,
    proved_at: epochMillis, wayinkind: GX.wayinkind,
  })
  const leaseRecord = leaseStamp.extend({
    lease_key:              custom<CryptoKey>(GX.isLeaseKey, Phrases.LeaseKeyExpected),
    bank_key_lease_wrapped: bank_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [CX])

/** A lease's stamp: see {@link leaseStamp}. */
export type LeaseStamp  = Z.infer<typeof leaseStamp>
/** The parts of a lease that are safe to show: its {@link LeaseStamp}. */
export type LeaseSparse = LeaseStamp
/** A lease's record: its stamp, its leaseKey handle, and the bankKey wrapped under it. */
export type LeaseRecord = Z.infer<typeof leaseRecord>
// --

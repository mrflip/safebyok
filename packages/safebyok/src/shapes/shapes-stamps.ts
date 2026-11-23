/** The bank and gate stamps that every ctx under a bank binds, a box's stamp, and the lease's stamp and record. */

import type * as Z from 'zod'
import { CX, GX, Phrases, Validator } from 'safebyok-big/internals'
import { PerKindChecks, ThingChecks, ThingFormat } from './shapes-thing'

// == [The stamps]: PlainChecks, BankScope, BankStamp, GateStamp, StampedGate, BoxStamp

/** The checks of the bank's and gate's stamps and a box's stamp. */
const PlainChecks = Validator.Checkers('bad_record', ({ obj, lit }) => {
  const bankStamp = ThingChecks.sparse.pick({ userid: true, banklabel: true, lifeseq: true, born_at: true }).extend({ lifetok: PerKindChecks.bankThing.shape.lifetok })
  const gateStamp = ThingChecks.sparse.pick({ userid: true, banklabel: true, labelpath: true, lifeseq: true, born_at: true })
  return {
    bankScope:   ThingChecks.bankScope,
    bankStamp,
    gateStamp,
    stampedGate: obj({ bankStamp, stamp: gateStamp, wayins: PerKindChecks.wayins }),
    // Every Thing field, so a box's revision and its record have the same stamp. The shell has no revision, and refuses.
    boxStamp:    ThingChecks.sparse.extend({
      labelpath: PerKindChecks.boxLabelpath,
      fmt:       lit(ThingFormat),
    }),
  }
})

/** A bank's scope: its user and its `banklabel`. */
export type BankScope   = Z.infer<typeof StampChecks.bankScope>
/** A bank's stamp: its scope, and the lifeseq, `born_at` and `lifetok` of its life. Every ctx under the bank binds it first. */
export type BankStamp   = Z.infer<typeof StampChecks.bankStamp>
/** A gate's stamp: its scope, and the lifeseq and `born_at` of its life. A wayin's wrapped bankKey is bound to it. */
export type GateStamp   = Z.infer<typeof StampChecks.gateStamp>
/** A gate's stamp, its bank's stamp, and its wayins: what a proving of a stored wayin is given. */
export type StampedGate = Z.infer<typeof StampChecks.stampedGate>
/** A box's stamp: its Thing fields, not its sidecar or its sealed whisper.
 * Its whisper's seal is bound to it: the whisper unseals only within the revision it was sealed in.
 */
export type BoxStamp    = Z.infer<typeof StampChecks.boxStamp>
// --

// == [The lease's forms]: LeaseFormat, LeaseChecks, StampChecks, LeaseStamp, LeaseSparse, LeaseRecord, LeaseLoggable

/** The `fmt` a lease carries, the same as every Thing's. It is bound into the wrap of the lease's bankKey. */
export const LeaseFormat = ThingFormat

/** The checks of a lease's stamp and record. */
const LeaseChecks = Validator.Checkers('bad_record', ({ obj, lit, custom, epochMillis, bank_key_lease_wrapped }) => {
  const { userid, banklabel, lifeseq, born_at, lifetok } = PlainChecks.bankStamp.shape
  const leaseStamp  = obj({
    fmt: lit(LeaseFormat), userid, banklabel, bank_lifeseq: lifeseq, bank_born_at: born_at, bank_lifetok: lifetok,
    gate_labelpath: PlainChecks.gateStamp.shape.labelpath, gate_lifeseq: PlainChecks.gateStamp.shape.lifeseq, gate_revtok: ThingChecks.sparse.shape.revtok,
    born_at: epochMillis, proved_at: epochMillis, wayinkind: GX.wayinkind,
  })
  const leaseRecord = leaseStamp.extend({
    lease_key:              custom<CryptoKey>(GX.isLeaseKey, Phrases.LeaseKeyExpected),
    bank_key_lease_wrapped: bank_key_lease_wrapped.readonly(),
  }).strict().readonly()
  return { leaseStamp, leaseRecord }
}, [CX])

/** The checks of a bank's scope and stamp, a gate's stamp, a {@link StampedGate}, a box's stamp, and a lease's stamp and record.
 * Anything carrying a stamp's fields passes, such as a Bank, a Gate or its Thing, and its other fields are dropped.
 * The lease's stamp has its bank's stamp under `bank_` names, cites the gate the lease was granted under, and is bound into the wrap of its bankKey.
 * Its `born_at` is that of the lease it renews, or its `proved_at` where it renews none.
 * The record adds the leaseKey and the bankKey wrapped under it.
 * Also `LeaseFormat`, the `fmt` a lease carries.
 */
export const StampChecks = Object.freeze({ ...PlainChecks, ...LeaseChecks, LeaseFormat })

/** A lease's stamp: see {@link StampChecks}. */
export type LeaseStamp  = Z.infer<typeof StampChecks.leaseStamp>
/** The parts of a lease that are safe to show: its {@link LeaseStamp}. */
export type LeaseSparse = LeaseStamp
/** A lease's record: its stamp, its leaseKey handle, and the bankKey wrapped under it. */
export type LeaseRecord = Z.infer<typeof StampChecks.leaseRecord>
// Picked field by field, so that a field added to the stamp joins the loggable only when chosen.
/** What a log wants of a lease: its scope, the bank and gate it was granted under, when, by which wayin, and whether it is evicted.
 * It has nothing secret and nothing opaque, and is no stamp: a ctx binds the {@link LeaseStamp}.
 */
export type LeaseLoggable = Readonly<Pick<LeaseStamp, 'fmt' | 'userid' | 'banklabel' | 'wayinkind' | 'born_at' | 'proved_at' | 'gate_labelpath' | 'gate_lifeseq' | 'bank_lifeseq' | 'bank_born_at'> & {
  /** The lease's labelpath, such as `lease/gate`. */
  labelpath: `lease/${string}`
  /** The revtok of the gate's revision it was granted under, cut short by `maskUuid`. */
  gate_revtok: string
  /** The lifetok of its bank's life, cut short by `maskUuid`. */
  bank_lifetok: string
  /** True once the lease's keys are dropped. */
  isEvicted: boolean
}>
// --

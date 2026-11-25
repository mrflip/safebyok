/** The bank and gate stamps that every ctx under a bank binds, a box's stamp, and the lease's stamp and record. */

import type * as Z from 'zod'
import { CX, GX, Phrases as BigPhrases, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type Lifepath, Labelpath, Lifeseq, VoidLifeseq } from './primitives'
import type { TombstoneOf } from './shapes-sealers'
import { PerKindChecks, ThingChecks, ThingFormat, isLabelLast, isParityRight } from './shapes-thing'

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

// == [The lease's forms]: LeaseFormat, LeaseLabelpath, leaseLabelpathOf, leaseScopeOf, LeaseLifeRoot, leaseLifepathOf, isLifepathOwn, isOfItsGate, LeaseChecks, StampChecks, LeaseStamp, LeaseSparse, LeaseRecord, LeaseTombstone, LeaseLoggable

/** The `fmt` a lease carries, the same as every Thing's. It is bound into the wrap of the lease's bankKey. */
export const LeaseFormat = ThingFormat

/** A lease's labelpath: `lease/` and the label of the gate it was granted under. It is no Thing's labelpath. */
export type LeaseLabelpath = `lease/${string}`

/** A {@link LeaseLabelpath}: `lease/` and one segment. */
const LeaseLabelpathPattern = /^lease\/[^/]+$/

/** The labelpath of a lease granted under the gate at `gateLabelpath`: `lease/gate` for the main gate, `lease/passkeys` for `gate/passkeys`. */
export function leaseLabelpathOf(gateLabelpath: Labelpath): LeaseLabelpath { return `lease/${Labelpath.labelOf(gateLabelpath)}` }

/** The scope a deviceDB files the lease of the gate at `gateScope` under: the gate's bank, and the lease's labelpath, which names the gate. */
export function leaseScopeOf({ userid, banklabel, labelpath }: { userid: string, banklabel: string, labelpath: Labelpath }): LeaseScope {
  return { userid, banklabel, labelpath: leaseLabelpathOf(labelpath) }
}

// A lease has no life above its own, but its lifepath keeps one lifeseq for each segment of its labelpath, as a
// Thing's does: the first is this placeholder, so a lease's life never resets with its gate's or its bank's.
/** The placeholder lifeseq at the head of every lease's lifepath, life 0's: `0000000000`. */
export const LeaseLifeRoot: Lifeseq = Lifeseq.ofLifenum(0)

/** The lifepath of a lease of life `lifeseq`: {@link LeaseLifeRoot}, then `lifeseq`. */
export function leaseLifepathOf(lifeseq: Lifeseq): Lifepath { return `${LeaseLifeRoot}/${lifeseq}` }

/** True when a lease's lifepath is {@link LeaseLifeRoot} and then its own lifeseq. */
function isLifepathOwn({ lifeseq, lifepath }: { lifeseq: string, lifepath: string }): boolean { return lifepath === leaseLifepathOf(lifeseq) }

/** True when a live lease's labelpath is the one its gate's labelpath gives it. */
function isOfItsGate({ labelpath, gate_labelpath }: { labelpath: string, gate_labelpath: Labelpath }): boolean { return labelpath === leaseLabelpathOf(gate_labelpath) }

/** The checks of a lease's stamp, of the lease record a deviceDB stores, live or a tombstone, and of its shell. */
const LeaseChecks = Validator.Checkers('bad_record', ({ obj, lit, uint, discrim, union, custom, epochMillis, bank_key_lease_wrapped }) => {
  const { userid, banklabel, lifeseq, born_at, lifetok } = PlainChecks.bankStamp.shape
  const leaseStamp  = obj({
    fmt: lit(LeaseFormat), userid, banklabel, bank_lifeseq: lifeseq, bank_born_at: born_at, bank_lifetok: lifetok,
    gate_labelpath: PlainChecks.gateStamp.shape.labelpath, gate_lifeseq: PlainChecks.gateStamp.shape.lifeseq, gate_revtok: ThingChecks.sparse.shape.revtok,
    born_at: epochMillis, proved_at: epochMillis, wayinkind: GX.wayinkind,
  })
  const leaseKeys   = {
    lease_key:              custom<CryptoKey>(GX.isLeaseKey, BigPhrases.LeaseKeyExpected),
    bank_key_lease_wrapped: bank_key_lease_wrapped.readonly(),
  }
  // A lease's Thing fields: a Thing's, at a lease's labelpath. Its born_at is its stamp's.
  const thingFields = {
    ...ThingChecks.sparse.shape,
    labelpath: custom<LeaseLabelpath>((val) => (typeof val === 'string') && LeaseLabelpathPattern.test(val), Phrases.LeaseLabelpathShape),
    fmt:       lit(LeaseFormat),
  }
  const live        = obj({ ...thingFields, ...leaseStamp.shape, ...leaseKeys, am: lit('a'), ends_at: epochMillis, gate_revseq: uint }).strict()
    .refine(isLabelLast,   Phrases.LabelNotLast)
    .refine(isLifepathOwn, Phrases.LeaseLifepathOwn)
    .refine(isParityRight, Phrases.LifeseqParity)
    .refine(isOfItsGate,   Phrases.LeaseLabelpathOfOtherGate)
  const tombstone   = obj({ ...thingFields, am: lit('x') }).strict()
    .refine(isLabelLast,   Phrases.LabelNotLast)
    .refine(isLifepathOwn, Phrases.LeaseLifepathOwn)
    .refine(isParityRight, Phrases.LifeseqParity)
  // What a next revision or a tombstone is made from: a lease's Thing fields, whatever else it has. A Lease passes.
  const sparse      = obj(thingFields)
    .refine(isLabelLast,   Phrases.LabelNotLast)
    .refine(isLifepathOwn, Phrases.LeaseLifepathOwn)
    .refine(isParityRight, Phrases.LifeseqParity)
  const liveSparse  = sparse.refine(({ am }) => am === 'a', Phrases.LeaseTombstoneOfLiveOnly)
  // The shell stands for no lease stored: its Thing fields alone, at the void revision.
  const shell       = obj({
    ...thingFields,
    revtok:     lit(SX.VoidRevisionTok),
    revseq:     lit(SX.VoidRevisionSeq),
    am:         lit('x'),
    lifeseq:    ThingChecks.voidLifeseq,
    lifepath:   lit(leaseLifepathOf(VoidLifeseq)),
    born_at:    lit(SX.VoidTime),
    written_at: lit(SX.VoidTime),
  })
    .refine(isLabelLast,   Phrases.LabelNotLast)
  return {
    leaseStamp,
    leaseScope:         obj({ userid, banklabel, labelpath: thingFields.labelpath }),
    liveLeaseRecord:    live.readonly(),
    leaseTombstone:     tombstone.readonly(),
    leaseRecord:        discrim('am', [live, tombstone]).readonly(),
    liveLeaseSparse:    liveSparse,
    leaseShell:         shell.readonly(),
    leaseSparseOrShell: union([sparse, shell]),
  }
}, [CX])

/** The checks of a bank's scope and stamp, a gate's stamp, a {@link StampedGate}, a box's stamp, and a lease's stamp, record and shell.
 * Anything carrying a stamp's fields passes, such as a Bank, a Gate or its Thing, and its other fields are dropped.
 * The lease's stamp has its bank's stamp under `bank_` names, cites the gate the lease was granted under, and is bound into the wrap of its bankKey.
 * Its `born_at` is that of the lease it renews, or its `proved_at` where it renews none.
 * A lease record is what a deviceDB stores for a gate, Thing-shaped at `lease/<gate label>`, its lifepath `0000000000/` and its lifeseq.
 * Live, it adds the stamp, the leaseKey, the bankKey wrapped under it, when the lease ends and the gate revision it cites; a tombstone has its Thing fields alone.
 * Also `LeaseFormat`, the `fmt` a lease carries.
 */
export const StampChecks = Object.freeze({ ...PlainChecks, ...LeaseChecks, LeaseFormat })

/** The scope a lease record is filed under, one for each gate: its bank's `userid` and `banklabel`, and its labelpath, `lease/<gate label>`. */
export type LeaseScope     = Z.infer<typeof StampChecks.leaseScope>
/** A lease's stamp: see {@link StampChecks}. */
export type LeaseStamp     = Z.infer<typeof StampChecks.leaseStamp>
/** The parts of a lease that are safe to show: its {@link LeaseStamp}. */
export type LeaseSparse    = LeaseStamp
/** A gate's lease as a deviceDB stores it, live (its life even) or a tombstone (odd), with every Thing field. See {@link StampChecks}. */
export type LeaseRecord    = Z.infer<typeof StampChecks.leaseRecord>
/** A lease record's tombstone, which a lock stores in place of the live record: its Thing fields, and no keys. */
export type LeaseTombstone = TombstoneOf<LeaseRecord>
// Picked field by field, so that a field added to the stamp joins the loggable only when chosen.
/** What a log wants of a lease: its scope, the bank and gate it was granted under, when, by which wayin, and whether it is evicted.
 * It has nothing secret and nothing opaque, and is no stamp: a ctx binds the {@link LeaseStamp}.
 */
export type LeaseLoggable = Readonly<Pick<LeaseStamp, 'fmt' | 'userid' | 'banklabel' | 'wayinkind' | 'born_at' | 'proved_at' | 'gate_labelpath' | 'gate_lifeseq' | 'bank_lifeseq' | 'bank_born_at'> & {
  /** The lease's labelpath, such as `lease/gate`. */
  labelpath: LeaseLabelpath
  /** The revtok of the gate's revision it was granted under, cut short by `maskUuid`. */
  gate_revtok: string
  /** The lifetok of its bank's life, cut short by `maskUuid`. */
  bank_lifetok: string
  /** True once the lease's keys are dropped. */
  isEvicted: boolean
}>
// --

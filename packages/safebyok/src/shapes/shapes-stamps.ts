/** The stamps a ctx binds (a Thing's, a wayin's and a lease's), the lives of a bank and its gate, and the lease record. */

import type * as Z from 'zod'
import { CX, GX, Phrases as BigPhrases, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type Lifepath, Labelpath, Lifeseq, VoidLifeseq } from './primitives'
import type { TombstoneOf } from './shapes-sealers'
import { PerKindChecks, ThingChecks, ThingFormat, isLabelLast, isParityRight } from './shapes-thing'

// == [The stamps]: PlainChecks, BankScope, BankLife, GateLife, GateStamp, BoxStamp, WayinStamp, ProvableGate

// A ctx binds one stamp, and no field twice: a field another holds forced equal (a label, the last segment of a labelpath) is left off.
/** The checks of a bank's and a gate's lives, and of a gate's, a box's and a wayin's stamps. */
const PlainChecks = Validator.Checkers('bad_record', ({ obj, lit, oneof }) => {
  const { userid, banklabel, lifeseq, lifepath, born_at, banktok } = ThingChecks.sparse.shape
  // Every Thing field but `label` and `lifeseq`, the last segments of its labelpath and lifepath.
  const thingStamp = ThingChecks.sparse.omit({ label: true, lifeseq: true })
  const gateLife   = obj({ userid, banklabel, labelpath: PerKindChecks.gateLabelpath, lifepath, born_at, banktok })
  return {
    bankScope:    ThingChecks.bankScope,
    bankLife:     obj({ userid, banklabel, lifeseq, born_at, banktok }),
    gateLife,
    gateStamp:    thingStamp.extend({ modelkind: lit('gate'), labelpath: PerKindChecks.gateLabelpath }),
    boxStamp:     thingStamp.extend({ modelkind: lit('box'), labelpath: PerKindChecks.boxLabelpath }),
    wayinStamp:   gateLife.extend({ modelkind: lit('wayin'), label: oneof(['main', 'passkey0']) }),
    provableGate: obj({ life: gateLife, wayins: PerKindChecks.wayins }),
  }
})

/** A bank's scope: its `userid` and `banklabel`. */
export type BankScope    = Z.infer<typeof StampChecks.bankScope>
/** A bank's life, as its gate's record has it: its scope, and the lifeseq, `born_at` and `banktok` of the life. It is bound into nothing as it is. */
export type BankLife     = Z.infer<typeof StampChecks.bankLife>
/** One life of a gate: its scope, its lifepath and `born_at`, and its `banktok`. A wayin's stamp and a lease's stamp each include it, under their own field names. */
export type GateLife     = Z.infer<typeof StampChecks.gateLife>
/** A gate's stamp: every Thing field of one revision but its `label` and `lifeseq`, which its labelpath and lifepath carry. Nothing is sealed under it. */
export type GateStamp    = Z.infer<typeof StampChecks.gateStamp>
/** A box's stamp: every Thing field of one revision but its `label` and `lifeseq`, which its labelpath and lifepath carry; not its sidecar or its sealed whisper.
 * Its whisper's seal is bound to it: the whisper unseals only within the revision it was sealed in.
 */
export type BoxStamp     = Z.infer<typeof StampChecks.boxStamp>
/** A wayin's stamp: its gate's life, its own `label`, and the modelkind `wayin`. Its wrapped bankKey is bound to it, with the rest of the wayin as the header.
 * The gate's revision is not in it, so a gate verb leaves every other wayin as it was.
 */
export type WayinStamp   = Z.infer<typeof StampChecks.wayinStamp>
/** A gate's life and its wayins: what a proving of a stored wayin is given. */
export type ProvableGate = Z.infer<typeof StampChecks.provableGate>
// --

// == [The lease's forms]: LeaseFormat, LeaseLabelpath, LeaseLifeRoot, leaseLifepathOf, isLifepathOwn, isOfItsGate, LeaseChecks, StampChecks, LeaseStamp, LeaseSparse, LeaseRecord, LeaseTombstone, LeaseLoggable

/** The `fmt` a lease carries, the same as every Thing's. It is bound into the wrap of the lease's bankKey. */
export const LeaseFormat = ThingFormat

/** A lease's labelpath: `lease/` and its own label, such as `lease/main`, the label of the gate it is for. It is no Thing's labelpath. */
export type LeaseLabelpath = `lease/${string}`

/** A {@link LeaseLabelpath}: `lease/` and one segment. */
const LeaseLabelpathPattern = /^lease\/[^/]+$/

/** The helpers of a {@link LeaseLabelpath}. */
export const LeaseLabelpath = Object.freeze({
  /** The labelpath of the lease for the gate at `gateLabelpath`: `lease/main` for the gate of the bank labelled `main`. */
  of(gateLabelpath: Labelpath): LeaseLabelpath { return `lease/${Labelpath.labelOf(PerKindChecks.gateLabelpath.parse(gateLabelpath))}` },
})

// A lease has no life above its own, but its lifepath keeps one lifeseq for each segment of its labelpath, as a
// Thing's does: the first is this placeholder, so a lease's life never resets with its gate's or its bank's.
/** The placeholder lifeseq at the head of every lease's lifepath, life 0's: `0000000000`. */
export const LeaseLifeRoot: Lifeseq = Lifeseq.ofLifenum(0)

/** The lifepath of a lease of life `lifeseq`: {@link LeaseLifeRoot}, then `lifeseq`. */
export function leaseLifepathOf(lifeseq: Lifeseq): Lifepath { return `${LeaseLifeRoot}/${lifeseq}` }

/** True when a lease's lifepath is {@link LeaseLifeRoot} and then its own lifeseq. */
function isLifepathOwn({ lifeseq, lifepath }: { lifeseq: string, lifepath: string }): boolean { return lifepath === leaseLifepathOf(lifeseq) }

/** True when a live lease's labelpath is the one {@link LeaseLabelpath.of} gives its gate's labelpath. */
function isOfItsGate({ labelpath, gate_labelpath }: { labelpath: string, gate_labelpath: Labelpath }): boolean { return labelpath === LeaseLabelpath.of(gate_labelpath) }

/** The checks of a lease's stamp, of the lease record a deviceDB has, live or a tombstone, and of its shell. */
const LeaseChecks = Validator.Checkers('bad_record', ({ obj, lit, uint, discrim, union, custom, epochMillis, bank_key_lease_wrapped }) => {
  const { userid, banklabel, banktok, revtok } = ThingChecks.sparse.shape
  const { labelpath, lifepath, born_at } = PlainChecks.gateLife.shape
  const leaseStamp  = obj({
    modelkind: lit('lease'), userid, banklabel, banktok, gate_labelpath: labelpath, gate_lifepath: lifepath, gate_born_at: born_at, gate_revtok: revtok,
    fmt: lit(LeaseFormat), born_at: epochMillis, proved_at: epochMillis, wayinkind: GX.wayinkind,
  })
  const leaseKeys   = {
    lease_key:              custom<CryptoKey>(GX.isLeaseKey, BigPhrases.LeaseKeyExpected),
    bank_key_lease_wrapped: bank_key_lease_wrapped.readonly(),
  }
  // A lease's Thing fields: a Thing's, of the modelkind `lease`, at a lease's labelpath. Its born_at and banktok are its stamp's.
  const thingFields = {
    ...ThingChecks.sparse.shape,
    modelkind: lit('lease'),
    labelpath: custom<LeaseLabelpath>((val) => (typeof val === 'string') && LeaseLabelpathPattern.test(val), Phrases.LeaseLabelpathShape),
    fmt:       lit(LeaseFormat),
  }
  const live        = obj({ ...thingFields, ...leaseStamp.shape, ...leaseKeys, am: lit('a'), ends_at: epochMillis, gate_revseq: uint }).strict()
    .refine(isLabelLast,   Phrases.LabelNotLast)
    .refine(isLifepathOwn, Phrases.LeaseLifepathOwn)
    .refine(isParityRight, Phrases.LifeseqParity)
    // Only once every field passes: LeaseLabelpath.of refuses, by throwing, a gate_labelpath that is no gate's.
    .refine(isOfItsGate,   { error: Phrases.LeaseLabelpathOfOtherGate, when: ({ issues }) => issues.length === 0 })
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
    banktok:    lit(SX.VoidLifeTok),
    am:         lit('x'),
    lifeseq:    ThingChecks.voidLifeseq,
    lifepath:   lit(leaseLifepathOf(VoidLifeseq)),
    born_at:    lit(SX.VoidTime),
    written_at: lit(SX.VoidTime),
  })
    .refine(isLabelLast,   Phrases.LabelNotLast)
  return {
    leaseStamp,
    leaseScope:         obj({ modelkind: thingFields.modelkind, userid, banklabel, labelpath: thingFields.labelpath }),
    liveLeaseRecord:    live.readonly(),
    leaseTombstone:     tombstone.readonly(),
    leaseRecord:        discrim('am', [live, tombstone]).readonly(),
    liveLeaseSparse:    liveSparse,
    leaseShell:         shell.readonly(),
    leaseSparseOrShell: union([sparse, shell]),
  }
}, [CX])

/** The checks of a bank's scope and life, a gate's life and stamp, a box's and a wayin's stamps, a {@link ProvableGate}, and a lease's stamp, record and shell.
 * Anything carrying a stamp's fields passes, such as a Gate or its Thing, and its other fields are dropped.
 * The lease's stamp has its bank's `banktok`, cites the life and revision of the gate it was granted under in `gate_` names, and is bound into the wrap of its bankKey.
 * Its `born_at` is that of the lease it renews, or its `proved_at` where it renews none.
 * A lease record is what a deviceDB has for a gate, Thing-shaped at its own `lease/<label>`, of the modelkind `lease`, its lifepath `0000000000/` and its lifeseq.
 * Live, it adds the stamp, the leaseKey, the bankKey wrapped under it, when the lease ends and the revseq of the gate revision it cites; a tombstone has its Thing fields alone.
 * Also `LeaseFormat`, the `fmt` a lease carries.
 */
export const StampChecks = Object.freeze({ ...PlainChecks, ...LeaseChecks, LeaseFormat })

/** The scope a lease record is filed under, one for each gate: the modelkind `lease`, its bank's `userid` and `banklabel`, and its own labelpath, `lease/<label>`. */
export type LeaseScope     = Z.infer<typeof StampChecks.leaseScope>
/** A lease's stamp: see {@link StampChecks}. */
export type LeaseStamp     = Z.infer<typeof StampChecks.leaseStamp>
/** The parts of a lease that are safe to show: its {@link LeaseStamp}. */
export type LeaseSparse    = LeaseStamp
/** A gate's lease as a deviceDB stows it, live (its life even) or a tombstone (odd), with every Thing field. See {@link StampChecks}. */
export type LeaseRecord    = Z.infer<typeof StampChecks.leaseRecord>
/** A lease record's tombstone, which a lock stows in place of the live record: its Thing fields, and no keys. */
export type LeaseTombstone = TombstoneOf<LeaseRecord>
// Picked field by field, so that a field added to the stamp joins the loggable only when chosen.
/** The fields of a lease a log may show: its scope, the bank and gate it was granted under, when, by which wayin, and whether it is evicted.
 * It has nothing secret and nothing opaque, and is no stamp: a ctx binds the {@link LeaseStamp}.
 */
export type LeaseLoggable = Readonly<Pick<LeaseStamp, 'fmt' | 'userid' | 'banklabel' | 'wayinkind' | 'born_at' | 'proved_at' | 'gate_labelpath' | 'gate_lifepath' | 'gate_born_at'> & {
  /** The lease's labelpath, such as `lease/main`. */
  labelpath: LeaseLabelpath
  /** The revtok of the gate's revision it was granted under, cut short by `maskUuid`. */
  gate_revtok: string
  /** The banktok of its bank's life, cut short by `maskUuid`. */
  banktok: string
  /** True once the lease's keys are dropped. */
  isEvicted: boolean
}>
// --

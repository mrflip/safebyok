import { pick } from 'es-toolkit'
import { SX } from 'safebyok-big/internals'
import { type Banklabel, type EpochMillis, type Lifepath, type Revtok, type Userid, Labelpath, Lifeseq, VoidLifeseq } from '../shapes/primitives'
import type { ShellOf } from '../shapes/shapes-sealers'
import { type BankRecord, type BoxRecord, type GateRecord, type Sparse, type ThingCited, type ThingRecord, type ThingScope, type Thingkind, Shell, ThingChecks } from '../shapes/shapes-thing'
import type { SeenThing } from '../shapes/shapes-vault-event'
import { BoxChecks, ThingkindChecks } from '../shapes/shapes-thingkinds'

// == [Kinds]: KindRecords, RecordOfKind, Kinded, MembersOfKind, LiveOfKind, TombstoneOfKind, VoidSentinelOfKind, WholeOfKind

/** The record of each kind of Thing, by its modelkind. */
export type KindRecords = { bank: BankRecord, gate: GateRecord, box: BoxRecord }

/** The record of the kind `KindT`, or of any kind for null. */
export type RecordOfKind<KindT extends Thingkind | null> = KindT extends Thingkind ? KindRecords[KindT] : ThingRecord

/** A class whose records are of the kind `KindT`, or of any kind for null. */
export type Kinded<KindT extends Thingkind | null> = { readonly modelkind: KindT }

// A member of ValT that is neither wider nor narrower than RecordT, nor wide enough for its shell, is another kind's
// record: a BoxRecord, asked about as a gate. Each branch is ValT or never, so TypeScript reads the result as a ValT, as a
// type predicate requires.
/** The members of `ValT` that a record of `RecordT`'s kind, or its shell, may be. */
export type MembersOfKind<ValT, RecordT extends Sparse<ThingRecord>> = ValT extends unknown
  ? (ValT extends RecordT ? ValT : (RecordT extends ValT ? ValT : (ShellOf<RecordT> extends ValT ? ValT : never)))
  : never

/** `ValT`, narrowed to a live Thing of the kind `KindT`: its Thing fields, and whole where `ValT` says so. Only a box may be sparse. */
export type LiveOfKind<KindT extends Thingkind | null, ValT> = MembersOfKind<ValT, RecordOfKind<KindT>> & Sparse<RecordOfKind<KindT>> & Readonly<{ am: 'a' }>

/** `ValT`, narrowed to a tombstone of the kind `KindT`, or its shell: its Thing fields, and whole where `ValT` says so. */
export type TombstoneOfKind<KindT extends Thingkind | null, ValT> = MembersOfKind<ValT, RecordOfKind<KindT>> & Sparse<RecordOfKind<KindT>> & Readonly<{ am: 'x' }>

/** `ValT`, narrowed to the void sentinel of the kind `KindT`. */
export type VoidSentinelOfKind<KindT extends Thingkind | null, ValT> = MembersOfKind<ValT, RecordOfKind<KindT>> & ShellOf<RecordOfKind<KindT>>

/** `ValT`, narrowed to a whole record of the kind `KindT`. */
export type WholeOfKind<KindT extends Thingkind | null, ValT> = MembersOfKind<ValT, RecordOfKind<KindT>> & RecordOfKind<KindT>
// --

// Each guard reads its kind from `this`, so a subclass that sets `modelkind` answers for its own kind with no code of its
// own. Called detached, a guard has no `this` and throws: pass one as `(rec) => Gate.isTombstone(rec)`.
/** The fields every kind of Thing has, and the guards of a Thing's record.
 * Each guard answers for its class's `modelkind`: `Gate.isTombstone(rec)` only of a gate, `Thing.isTombstone(rec)` of any kind.
 */
export abstract class BaseThing implements Sparse<ThingRecord> {
  // == [Props]: userid, banklabel, labelpath, label, fmt, lifepath, lifeseq, revtok, revseq, born_at, written_at, am

  /** The user's id. With `banklabel` and `labelpath`, it says where this Thing is stored. */
  declare readonly userid:     Userid
  declare readonly banklabel:  Banklabel
  declare readonly labelpath:  Labelpath
  /** The last label of `labelpath`. */
  declare readonly label:      string
  declare readonly fmt:        Sparse<ThingRecord>['fmt']
  /** The lifeseqs of this Thing's life and of each life above it, root first. */
  declare readonly lifepath:   Lifepath
  /** This Thing's life, as a lifeseq. A Thing born again has the next. */
  declare readonly lifeseq:    Lifeseq
  /** This revision's token. Every write makes a new one. */
  declare readonly revtok:     Revtok
  /** This revision's sequence number, 0 at the Thing's birth. */
  declare readonly revseq:     number
  declare readonly born_at:    EpochMillis
  /** When this revision was written, in epoch milliseconds. */
  declare readonly written_at: EpochMillis
  /** `'a'` while live, `'x'` for a tombstone. */
  declare readonly am:         Sparse<ThingRecord>['am']
  // --

  // == [Kind]: modelkind

  // The rule wants a getter, which a subclass's field could not override.
  /** The kind of Thing this class models, or null for any kind. */
  static readonly modelkind: Thingkind | null = null // eslint-disable-line @typescript-eslint/class-literal-property-style
  // --

  // == [Guards]: isLive, isTombstone, isGone, isVoidSentinel, isWhole, isSparse

  /** True when `val` is a live Thing of this class's kind: whole, or a live box's sparse form. */
  static isLive<KindT extends Thingkind | null, ValT>(this: Kinded<KindT>, val: ValT): val is LiveOfKind<KindT, ValT> {
    const report = ThingChecks.scopedLive.safeParse(val)
    return report.success && isOfKind(this.modelkind, report.data.labelpath)
  }

  /** True when `val` is a tombstone of this class's kind, the void sentinel among them. */
  static isTombstone<KindT extends Thingkind | null, ValT>(this: Kinded<KindT>, val: ValT): val is TombstoneOfKind<KindT, ValT> {
    const report = ThingChecks.scopedTombstone.safeParse(val)
    return report.success && isOfKind(this.modelkind, report.data.labelpath)
  }

  /** True when `val` is the tombstone of a deleted Thing of this class's kind: any tombstone but the void sentinel. */
  static isGone<KindT extends Thingkind | null, ValT>(this: Kinded<KindT>, val: ValT): val is TombstoneOfKind<KindT, ValT> {
    const report = ThingChecks.scopedTombstone.safeParse(val)
    return report.success && isOfKind(this.modelkind, report.data.labelpath) && (! isVoidCited(report.data))
  }

  /** True when `val` is a void sentinel of this class's kind: a tombstone at the shell's revision, its revseq -1 and its revtok and lifeseq the void ones. */
  static isVoidSentinel<KindT extends Thingkind | null, ValT>(this: Kinded<KindT>, val: ValT): val is VoidSentinelOfKind<KindT, ValT> {
    return isVoidSentinelOfKind(this.modelkind, val)
  }

  // The void sentinel is a whole tombstone, though no record check accepts it: a store must never treat a shell as a record.
  /** True when `record` is whole, with its body, and of this class's kind. The void sentinel is whole. */
  static isWhole<KindT extends Thingkind | null, ValT extends Sparse<ThingRecord>>(this: Kinded<KindT>, record: ValT): record is WholeOfKind<KindT, ValT> {
    return isWholeOfKind(this.modelkind, record)
  }

  // Not a type predicate: TypeScript would read a false answer about a whole live record to mean it is no record at all.
  /** True when `record` is a live box's sparse form, its Thing fields alone, and of this class's kind. A bank or a gate has none. */
  static isSparse<KindT extends Thingkind | null>(this: Kinded<KindT>, record: Sparse<ThingRecord>): boolean {
    return BoxChecks.sparse.safeParse(record).success && isOfKind(this.modelkind, record.labelpath)
  }
  // --

  // == [Reading records]: shellOf, haveSameScope, cmp, sparseOf, nextLifeOf

  // The shell is built at `seen`'s labelpath, so it is of `seen`'s kind, which TypeScript cannot follow through `Shell`.
  /** The shell a Thing of `seen` is made at: `seen` itself where it is the void sentinel, else the shell under the lives it names above it. */
  static shellOf<RecordT extends ThingRecord>(seen: SeenThing<RecordT>): ShellOf<RecordT> {
    return (isVoidSentinelOfKind(null, seen) ? seen : Shell.inParentLivesOf(seen)) as ShellOf<RecordT>
  }

  /** True when `ante` and `post` are at one labelpath of one bank. */
  static haveSameScope(ante: ThingScope, post: ThingScope): boolean {
    return (ante.labelpath === post.labelpath) && (ante.userid === post.userid) && (ante.banklabel === post.banklabel)
  }

  // The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0, and the parent's later
  // lifeseq orders it after. Lifeseqs are fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings, and
  // the shell's '-' sorts below them all.
  /** Compare two revisions: by life, then revision. Returns: positive (`post` newer), negative (`ante` newer), zero (the same).
   * The output is **not** restricted to -1, 0, 1: it may be any integer.
   */
  static cmp(ante: Pick<ThingCited, 'lifepath' | 'revseq'>, post: Pick<ThingCited, 'lifepath' | 'revseq'>): number {
    if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
    return post.revseq - ante.revseq
  }

  /** The Thing fields of `record`, without its body. */
  static sparseOf<SparseT extends Sparse<ThingRecord>>(record: SparseT): Sparse<SparseT> { return pick(record, ThingFieldnames) }

  /** The lifeseq and lifepath of the life after the life of `thing`, under the same lives above it. */
  static nextLifeOf({ lifeseq, lifepath }: Pick<Sparse<ThingRecord>, 'lifeseq' | 'lifepath'>): Pick<Sparse<ThingRecord>, 'lifeseq' | 'lifepath'> {
    const nextLifeseq = Lifeseq.ofLifenum(Lifeseq.lifenumOf(lifeseq) + 1)
    return { lifeseq: nextLifeseq, lifepath: `${lifepath.slice(0, lifepath.lastIndexOf('/') + 1)}${nextLifeseq}` }
  }
  // --
}

// == [Helpers]: ThingFieldnames, isOfKind, isVoidCited, isVoidSentinelOfKind, isWholeOfKind

/** The name of each Thing field, which every kind of Thing has. */
export const ThingFieldnames = Object.keys(ThingChecks.sparse.shape) as (keyof Sparse<ThingRecord>)[]

/** True when the sound `labelpath` is of `modelkind`, or `modelkind` is null */
function isOfKind(modelkind: Thingkind | null, labelpath: Labelpath): boolean {
  return (modelkind === null) || (Labelpath.modelkindOf(labelpath) === modelkind)
}

/** True when the citation is the shell's in all three of its marks: the void revseq, revtok and lifeseq */
function isVoidCited({ revseq, revtok, lifepath }: Pick<ThingCited, 'revseq' | 'revtok' | 'lifepath'>): boolean {
  return (revseq === SX.VoidRevisionSeq) && (revtok === SX.VoidRevisionTok) && (Lifeseq.ofLifepath(lifepath) === VoidLifeseq)
}

/** True when `val` is a tombstone of `modelkind` at the shell's revision */
function isVoidSentinelOfKind(modelkind: Thingkind | null, val: unknown): boolean {
  const report = ThingChecks.scopedTombstone.safeParse(val)
  return report.success && isOfKind(modelkind, report.data.labelpath) && isVoidCited(report.data)
}

/** True when `record` is whole and of `modelkind`, or is its void sentinel */
function isWholeOfKind(modelkind: Thingkind | null, record: Sparse<ThingRecord>): boolean {
  if (isVoidSentinelOfKind(modelkind, record)) { return true }
  return isOfKind(modelkind, record.labelpath) && ThingkindChecks.ofLabelpath(record.labelpath).record.safeParse(record).success
}
// --

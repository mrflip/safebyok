/** The plain values the lean core's signatures name: aliases of `string` and `number`, so that a signature says which.
 * `Lifeseq` and `Labelpath` also name the plain string helpers of their values.
 */

import { type CX, Validator } from 'safebyok-big/internals'
import type { Thingkind } from './shapes-thing'

// == [Scope]: Userid, Banklabel, Labelpath, BoxLabelpath, MaxLabelsUnder
/** The id of a user, as the host gives it (`userid`). */
export type Userid = string
/** A bank's label, chosen by the host (`banklabel`). */
export type Banklabel = string
/** Where a Thing is stored in its bank: its modelkind, then at most one label after a `/` (`bank`, `gate`, `box/aa`). */
export type Labelpath = string
/** The labelpath of a box: the root box's, or one under it. */
export type BoxLabelpath = 'box' | `box/${string}`

/** The most labels a labelpath of each kind has after its modelkind: none for the bank, one for a gate or a box. */
const MaxLabelsUnder = { bank: 0, gate: 1, box: 1 } as const satisfies Record<Thingkind, number>

/** The helpers for a {@link Labelpath}, and where the main gate and the root box are stored. */
export const Labelpath = Object.freeze({
  /** Where the main gate is stored in its bank, and its key in a `track`. */
  MainGate: 'gate',
  /** Where the root box is stored in its bank, and its key in a `track`. */
  RootBox:  'box',
  /** The modelkind a sound labelpath starts with. */
  modelkindOf(labelpath: Labelpath): Thingkind { return labelpath.split('/', 1)[0] as Thingkind },
  /** True when `labelpath` is `modelkind` followed by at most as many valid labels as that kind nests, each after a `/`. */
  isOfModelkind(labelpath: Labelpath, modelkind: Thingkind): boolean {
    const [head, ...labels] = labelpath.split('/')
    return (head === modelkind) && (labels.length <= MaxLabelsUnder[modelkind]) && labels.every((label) => Validator.Kit.label.safeParse(label).success)
  },
  /** True when `labelpath` is a box's: the root box's, or one under it. */
  isBox(labelpath: Labelpath): labelpath is BoxLabelpath { return Labelpath.isOfModelkind(labelpath, 'box') },
  /** The label of a Thing: the last segment of its labelpath, which for a root is its modelkind. */
  labelOf(labelpath: Labelpath): string { return labelpath.slice(labelpath.lastIndexOf('/') + 1) },
  /** The labelpath of a Thing's parent: its labelpath less its own label, `''` for a root. */
  parentOf(labelpath: Labelpath): Labelpath { return labelpath.slice(0, Math.max(0, labelpath.lastIndexOf('/'))) },
  /** The labelpaths of the Things above a Thing, nearest first: its parent's, then its parent's parent's, up to its root's. None for a root. */
  ancestorsOf(labelpath: Labelpath): Labelpath[] {
    const ancestors: Labelpath[] = []
    for (let above = Labelpath.parentOf(labelpath); above !== ''; above = Labelpath.parentOf(above)) { ancestors.push(above) }
    return ancestors
  },
})
// --

// == [Lives]: Lifeseq, Lifepath, Lifenum, Revtok, Lifetok, VoidLifeseq, Revseq
/** One life of a Thing, in base-32 digits (`0-9a-v`) padded to ten, so that lifeseqs sort in the order of the lives. The shell's is `-000000001`. */
export type Lifeseq = string
/** The lifeseq of each life from a root's down to a Thing's own, joined by `/`. */
export type Lifepath = string
/** A life's number: -1 for the shell, then 0, 1, 2 and up, each even one a live life and each odd one a tombstone's. It is the number a {@link Lifeseq} spells. */
export type Lifenum = number
/** A fresh token for each revision of a Thing (`revtok`). */
export type Revtok = string
/** A token minted when a bank is born, for each later revision of that life, and the tombstone that ends it, to keep (`lifetok`).
 * It tells one birth of a bank under its banklabel from another, where storage was emptied and the bank born again at life 0 with the same lifepath.
 * A vaultDB refuses a write of the bank over a live bank that changes it.
 */
export type Lifetok = string

/** How many base-32 digits a stored lifeseq has. */
const LifeseqDigits = 10

/** The shell's lifeseq, for life -1. It is never stored, and sorts below every life's. */
export const VoidLifeseq = '-000000001'

/** The helpers for a {@link Lifeseq}. */
export const Lifeseq = Object.freeze({
  /** The lifeseq of life `lifenum`: its base-32 digits (`0-9a-v`) padded to 10, which sort in the order of the lives. Life -1's is the shell's. */
  ofLifenum(lifenum: Lifenum): Lifeseq { return paddedSeqOf(lifenum) },
  /** The lifenum of `lifeseq`, the number of the life it names: -1 for the shell's. */
  lifenumOf(lifeseq: Lifeseq): Lifenum { return Number.parseInt(lifeseq, 32) },
  /** True when `lifeseq` is a tombstone's: an odd life, the shell's among them. */
  isTombstone(lifeseq: Lifeseq): boolean { return Math.abs(Lifeseq.lifenumOf(lifeseq) % 2) === 1 },
  /** The Thing's own lifeseq: the last of its lifepath. */
  ofLifepath(lifepath: Lifepath): Lifeseq { return lifepath.slice(lifepath.lastIndexOf('/') + 1) },
  /** The lifeseqs of a Thing's ancestors: its lifepath less its own lifeseq, `''` for a root. */
  leadingOf(lifepath: Lifepath): string { return lifepath.slice(0, Math.max(0, lifepath.lastIndexOf('/'))) },
})

/** The helpers for a revision's `revseq`. */
export const Revseq = Object.freeze({
  /** `revseq` as fixed-width text, which sorts in revision order like a {@link Lifeseq}. The shell's -1 is `-000000001`. */
  padded(revseq: number): string { return paddedSeqOf(revseq) },
})

/** `seqnum` in base-32 digits padded to ten, or `-000000001` for -1, so the strings sort as the numbers do. */
function paddedSeqOf(seqnum: number): string {
  return (seqnum === -1) ? VoidLifeseq : seqnum.toString(32).padStart(LifeseqDigits, '0')
}
// --

// == [Device]: DeviceTok, EpochMillis
/** A device's UUID, from the host (`device_tok`). */
export type DeviceTok = string
/** An instant: whole UTC epoch milliseconds, as `Date.now()` gives. */
export type EpochMillis = CX.EpochMillis
// --

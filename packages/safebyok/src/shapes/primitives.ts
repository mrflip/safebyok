/** The plain values this package's signatures name: aliases of `string` and `number`, so that a signature says which.
 * `Lifeseq` and `Labelpath` also name the plain string helpers of their values.
 */

import { type CX, Validator } from 'safebyok-big/internals'

// == [Scope]: Userid, Banklabel, Labelpath, BoxLabelpath
/** The id of a user, as the host gives it (`userid`). */
export type Userid = string
/** A bank's label, chosen by the host (`banklabel`). */
export type Banklabel = string
/** Where a Thing is stored in its bank, among the Things of its kind: a gate at its bank's banklabel (`main`), and a box at `box`, or at one label under it after a `/` (`box/aa`). */
export type Labelpath = string
/** The labelpath of a box: the root box's, or one under it. */
export type BoxLabelpath = 'box' | `box/${string}`

/** The helpers for a {@link Labelpath}, and where the root box is stored. */
export const Labelpath = Object.freeze({
  /** Where the root box is stored in its bank. */
  RootBox:  'box',
  /** Where the gate of the bank labelled `banklabel` is stored: at the banklabel. */
  gateOf(banklabel: Banklabel): Labelpath { return banklabel },
  /** True when `labelpath` is one label alone, as a gate's is. */
  isLabel(labelpath: Labelpath): boolean { return Validator.Kit.label.safeParse(labelpath).success },
  /** True when `labelpath` may be a box's: `box`, the root box's, or `box/` and one label. It says nothing of what kind a Thing stored there is. */
  isBox(labelpath: Labelpath): labelpath is BoxLabelpath {
    const [head, ...labels] = labelpath.split('/')
    return (head === Labelpath.RootBox) && (labels.length <= 1) && labels.every((label) => Labelpath.isLabel(label))
  },
  /** The label of a Thing: the last segment of its labelpath, which for a root is the whole labelpath. */
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

// == [Lives]: Lifeseq, Lifepath, Lifenum, Revtok, Banktok, VoidLifeseq, Revseq
/** One life of a Thing, in base-32 digits (`0-9a-v`) padded to ten, so that lifeseqs sort in the order of the lives. The shell's is `-000000001`. */
export type Lifeseq = string
/** The lifeseq of each life from a root's down to a Thing's own, joined by `/`. */
export type Lifepath = string
/** A life's number: -1 for the shell, then 0, 1, 2 and up, each even one a live life and each odd one a tombstone's. It is the number a {@link Lifeseq} spells. */
export type Lifenum = number
/** A fresh token for each revision of a Thing (`revtok`). */
export type Revtok = string
/** A token minted when a bank is born, which each later revision of that life and the tombstone that ends it carry (`banktok`).
 * It tells one birth of a bank under its banklabel from another, where storage was emptied and the bank born again at life 0 with the same lifepath.
 * It is stored in the bank's gate: a vaultDB refuses a write of a gate over a live gate that changes it.
 */
export type Banktok = string

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

// == [Device]: Devicetok, EpochMillis
/** This device's token for the signed-in user, a UUID recorded in each wayin it builds: the host's `devicetok`, or the one its deviceDB stores for the user. */
export type Devicetok = string
/** An instant: whole UTC epoch milliseconds, as `Date.now()` gives. */
export type EpochMillis = CX.EpochMillis
// --

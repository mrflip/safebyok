/** The plain values the lean core's signatures name: aliases of `string` and `number`, so that a signature says which. */

import type { CX } from 'safebyok-big/internals'

// == [Scope]: Userid, Banklabel, Labelpath
/** The id of a user, as the host gives it (`userid`). */
export type Userid = string
/** A bank's label, chosen by the host (`banklabel`). */
export type Banklabel = string
/** Where a Thing is stored in its bank: its modelkind, then at most one label after a `/` (`bank`, `gate`, `box/aa`). */
export type Labelpath = string
// --

// == [Lives]: Lifeseq, Lifepath, Lifenum, Revtok
/** One life of a Thing, in base-32 digits (`0-9a-v`) padded to ten, so that lifeseqs sort in the order of the lives. The shell's is `-000000001`. */
export type Lifeseq = string
/** The lifeseq of each life from a root's down to a Thing's own, joined by `/`. */
export type Lifepath = string
/** A life's number: -1 for the shell, then 0, 1, 2 and up, each even one a live life and each odd one a tombstone's. It is the number a {@link Lifeseq} spells. */
export type Lifenum = number
/** A fresh token for each revision of a Thing (`revtok`). */
export type Revtok = string
// --

// == [Device]: DeviceTok, EpochMillis
/** A UUID the host keeps for a device (`device_tok`). */
export type DeviceTok = string
/** An instant: whole UTC epoch milliseconds, as `Date.now()` gives. */
export type EpochMillis = CX.EpochMillis
// --

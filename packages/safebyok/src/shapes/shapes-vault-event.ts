/** The events a feed of vault records tells, and the agerank that orders what it has seen of each Thing. */

import type { Banklabel, Labelpath, Userid } from './primitives'
import type { Sparse, ThingRecord, Thingkind, VoidSentinel } from './shapes-thing'

// == [Kinds]: recordkindVals, Recordkind, lifekindVals, Lifekind, agekindVals, Agekind, vaultEventkindVals, VaultEventkind

/** The kinds of record a feed sees:
 * - `soon` -- a sparse live record
 * - `full` -- a whole live record
 * - `gone` -- a tombstone
 * - `void` -- nothing stored
 */
export const recordkindVals = ['soon', 'full', 'gone', 'void'] as const
/** The kind of record a feed saw: `soon`, `full`, `gone` or `void` ({@link recordkindVals}). */
export type Recordkind = typeof recordkindVals[number]

/** The ends of a life: `born` for a live life, `died` for a tombstone's or the void's. */
export const lifekindVals = ['born', 'died'] as const
/** Whether a Thing's new life is live (`born`) or a tombstone's (`died`). */
export type Lifekind = typeof lifekindVals[number]

/** How a Thing's agerank stands:
 * - `here` -- the whole record of its highest revision known has been seen
 * - `bare` -- a revision is known of, and no whole record of that life has been seen
 * - `cold` -- a whole record has been seen, behind a later revision known of
 */
export const agekindVals = ['here', 'bare', 'cold'] as const
/** How a Thing's agerank stands: `here`, `bare` or `cold` ({@link agekindVals}). */
export type Agekind = typeof agekindVals[number]

/** The kinds of event a feed tells: a record seen (`item`), a new life (`life`), or an agerank left behind (`aged`). */
export const vaultEventkindVals = ['item', 'life', 'aged'] as const
/** The kind of a {@link VaultEvent}: `item`, `life` or `aged` ({@link vaultEventkindVals}). */
export type VaultEventkind = typeof vaultEventkindVals[number]
// --

// == [Agerank]: Agerank, SeenThing

/** How far a feed has seen a Thing: its lifepath, the highest revision known of in that life, and the highest whole one seen, -1 for none.
 * Joined by `|`, each revseq as `Revseq.padded` spells it, so that two of one Thing compare as strings in the order they were reached.
 */
export type Agerank = string

/** A record a feed is given: a Thing, whole or sparse, live or a tombstone, or the void sentinel for nothing stored. */
export type SeenThing = ThingRecord | Sparse<ThingRecord> | VoidSentinel
// --

// == [Events]: VaultEvent, VaultEventOf, VaultItemEvent, VaultLifeEvent, VaultAgedEvent

/** An event a feed tells of a Thing: a record seen, a new life, or an agerank left behind, as its `eventkind` says. */
export type VaultEvent = VaultItemEvent | VaultLifeEvent | VaultAgedEvent

/** The fields every {@link VaultEvent} carries: its kind, the scope of the Thing it is about, and the Thing's agerank after and before. */
export type VaultEventOf<EventkindT extends VaultEventkind> = Readonly<{
  /** The kind of event: narrow a {@link VaultEvent} on it. */
  eventkind:  EventkindT
  userid:     Userid
  banklabel:  Banklabel
  labelpath:  Labelpath
  /** The kind of Thing at `labelpath`. */
  modelkind:  Thingkind
  /** The Thing's agerank once the record was taken, or undefined from a feed that keeps none. */
  agerank:    Agerank | undefined
  /** The Thing's agerank before the record was taken, or undefined for none. */
  agerankWas: Agerank | undefined
}>

/** A record seen, taken because it raised the Thing's agerank. */
export type VaultItemEvent = VaultEventOf<'item'> & Readonly<{
  recordkind: Recordkind
  /** The caller's own record object, not a copy, or null for `void`. */
  record:     ThingRecord | Sparse<ThingRecord> | null
}>

/** A new life of the Thing, told after the record that brought it. */
export type VaultLifeEvent = VaultEventOf<'life'> & Readonly<{
  lifekind:   Lifekind
  agerank:    Agerank
}>

/** The Thing's agerank, once a record was taken, reads `bare` or `cold`: a record of a revision known of has not been seen. */
export type VaultAgedEvent = VaultEventOf<'aged'> & Readonly<{
  agekind:    Exclude<Agekind, 'here'>
  /** How the agerank stood before, or undefined for none. */
  agekindWas: Agekind | undefined
  agerank:    Agerank
}>
// --

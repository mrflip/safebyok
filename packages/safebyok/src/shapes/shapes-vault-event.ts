/** `VaultEvent`, the notice a vaultDB's watcher gets, and `Agerank`, which orders the records seen of a Thing. */

import type { Banklabel, Labelpath, Userid } from './primitives'
import type { Sparse, ThingRecord, Thingkind, VoidSentinel } from './shapes-thing'

// == [Kinds]: recordkindVals, Recordkind, lifekindVals, Lifekind, agekindVals, Agekind, vaultEventkindVals, VaultEventkind

/** Kinds of record:
 * - `soon` -- a sparse live record
 * - `full` -- a whole live record
 * - `gone` -- a tombstone, whole or sparse
 * - `void` -- nothing stored
 */
export const recordkindVals = ['soon', 'full', 'gone', 'void'] as const
/** A record's kind: one of {@link recordkindVals}. */
export type Recordkind = typeof recordkindVals[number]

/** Kinds of life:
 * - `born` -- the Thing is live
 * - `died` -- the Thing is a tombstone, or nothing is stored
 */
export const lifekindVals = ['born', 'died'] as const
/** A life's kind: one of {@link lifekindVals}. */
export type Lifekind = typeof lifekindVals[number]

/** Whether the newest revision seen of a Thing has been seen whole:
 * - `here` -- it has
 * - `bare` -- no whole record of its life has been seen
 * - `cold` -- only an older whole record has been seen
 */
export const agekindVals = ['here', 'bare', 'cold'] as const
/** Whether the newest revision seen of a Thing has been seen whole: one of {@link agekindVals}. */
export type Agekind = typeof agekindVals[number]

/** Kinds of {@link VaultEvent}:
 * - `item` -- a record of the Thing
 * - `life` -- the first life seen of the Thing, or a new one
 * - `aged` -- the newest revision seen of the Thing has not been seen whole
 */
export const vaultEventkindVals = ['item', 'life', 'aged'] as const
/** A {@link VaultEvent}'s kind: one of {@link vaultEventkindVals}. */
export type VaultEventkind = typeof vaultEventkindVals[number]
// --

// == [Agerank]: Agerank, SeenThing

/** The newest life and revisions seen of a Thing, as a string: of two for one Thing, the greater is the newer.
 * It joins with `|` the lifepath, the newest revision seen in that life, and the newest whole one (-1 for none), each revseq as `Revseq.padded` writes it.
 */
export type Agerank = string

/** A record for a `FeedSorter`: a Thing, whole or sparse, live or a tombstone, or the void sentinel for nothing stored. */
export type SeenThing = ThingRecord | Sparse<ThingRecord> | VoidSentinel
// --

// == [Events]: VaultEvent, VaultEventOf, VaultItemEvent, VaultLifeEvent, VaultAgedEvent

/** An event about one Thing: a record, a new life, or a newer revision not yet seen whole. Narrow it on `eventkind`. */
export type VaultEvent = VaultItemEvent | VaultLifeEvent | VaultAgedEvent

/** The fields every {@link VaultEvent} has. */
export type VaultEventOf<EventkindT extends VaultEventkind> = Readonly<{
  /** The event's kind: narrow a {@link VaultEvent} on it. */
  eventkind:  EventkindT
  userid:     Userid
  banklabel:  Banklabel
  labelpath:  Labelpath
  /** The kind of Thing at `labelpath`. */
  modelkind:  Thingkind
  /** The Thing's agerank with this event's record seen, or undefined where no ageranks are kept, as in a vaultDB's watch. */
  agerank:    Agerank | undefined
  /** The Thing's agerank before this event's record, or undefined for none. */
  agerankWas: Agerank | undefined
}>

/** A record of the Thing. Where ageranks are kept, the record raised the Thing's agerank. */
export type VaultItemEvent = VaultEventOf<'item'> & Readonly<{
  recordkind: Recordkind
  /** The record, or null for `void`. From a `FeedSorter`, it is the very object it was given. */
  record:     ThingRecord | Sparse<ThingRecord> | null
}>

/** The first life seen of the Thing, or a new one, right after the `item` event of the record that showed it. */
export type VaultLifeEvent = VaultEventOf<'life'> & Readonly<{
  lifekind:   Lifekind
  agerank:    Agerank
}>

/** The newest revision seen of the Thing has not been seen whole: its `agekind` is `bare` or `cold`. */
export type VaultAgedEvent = VaultEventOf<'aged'> & Readonly<{
  agekind:    Exclude<Agekind, 'here'>
  /** The agekind before this event's record, or undefined for none. */
  agekindWas: Agekind | undefined
  agerank:    Agerank
}>
// --

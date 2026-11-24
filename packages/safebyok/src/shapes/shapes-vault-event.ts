/** `VaultEvent`, the notice a vaultDB's watcher gets and the event a `SortedVaultDB`'s listener hears, and `Agerank`, which orders the records seen of a Thing. */

import type { Banklabel, Labelpath, Lifetok, Userid } from './primitives'
import type { LiveOf, ShellOf } from './shapes-sealers'
import type { Sparse, ThingRecord, Thingkind, Tombstone } from './shapes-thing'
import type { ReadTc } from '../storage/vault-db'

// == [Kinds]: livenessVals, Liveness, lifekindVals, Lifekind, agekindVals, Agekind, vaultEventkindVals, VaultEventkind

/** Liveness of a record seen:
 * - `soon` -- a sparse live record
 * - `full` -- a whole live record
 * - `gone` -- a tombstone, whole or sparse
 * - `void` -- nothing stored
 */
export const livenessVals = ['soon', 'full', 'gone', 'void'] as const
/** A record's liveness: one of {@link livenessVals}. */
export type Liveness = typeof livenessVals[number]

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

/** The newest life and revisions seen of a Thing, and when the newest revision was last seen, as a string: of two for one Thing, the greater is the newer.
 * It joins with `|` the lifepath, the newest revision seen in that life, the newest whole one (-1 for none), each revseq
 * as `Revseq.padded` writes it, and the time: the first eight hexadecimal digits of the `read_tc` the newest revision was
 * last seen at, in units of 65.536 seconds.
 */
export type Agerank = string

/** A record seen of a Thing of `RecordT`'s kind: whole or sparse, live or a tombstone, or the void sentinel for nothing stored. */
export type SeenThing<RecordT extends ThingRecord = ThingRecord> = RecordT | Sparse<RecordT> | ShellOf<RecordT>
// --

// == [Events]: VaultEvent, VaultEventOf, VaultItemEvent, ItemSeen, VaultLifeEvent, VaultAgedEvent

/** An event about one Thing: a record, a new life, or a newer revision not yet seen whole. Narrow it on `eventkind`. An `item` event's record is of `RecordT`'s kind. */
export type VaultEvent<RecordT extends ThingRecord = ThingRecord> = VaultItemEvent<RecordT> | VaultLifeEvent | VaultAgedEvent

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
  /** The lifetok of the bank's life, where the event's source knew it: from a `SortedVaultDB`, the answer's `banktok`, or the one the notice or the event rung carried, else the bank's as last read. Undefined in a vaultDB's raw watch where the datastore did not hand over the bank. */
  banktok:    Lifetok | undefined
  /** Who dispatched this event's record: a `SortedVaultDB` names the vaultDB it wraps, or the device database that rang what its `receive` was handed. Undefined in a vaultDB's raw watch. */
  sourcelabel: string | undefined
  /** When this event's record was read, shared by every event of one dispatch. Undefined only where a vaultDB's watch does not say. */
  read_tc:    ReadTc | undefined
}>

/** A record of the Thing. Where ageranks are kept, the record raised the Thing's agerank. Narrow it on `liveness` to know what `val` holds.
 * The newest revision seen again in a later span of time raises only the agerank's time: the event's `agerankWas` and `agerank` then differ only in their last field.
 */
export type VaultItemEvent<RecordT extends ThingRecord = ThingRecord> = VaultEventOf<'item'> & ItemSeen<RecordT>

/** The record of `RecordT`'s kind an `item` event saw, as `val`, beside its `liveness`. From a Thing's `receive`, `val` is the very object it was given.
 * - `full` -- a whole live record
 * - `soon` -- a sparse live record
 * - `gone` -- a tombstone, whole or sparse
 * - `void` -- the void sentinel, for nothing stored
 */
export type ItemSeen<RecordT extends ThingRecord = ThingRecord> =
  | Readonly<{ liveness: 'full', val: LiveOf<RecordT> }>
  | Readonly<{ liveness: 'soon', val: Sparse<LiveOf<RecordT>> }>
  | Readonly<{ liveness: 'gone', val: Tombstone<RecordT> }>
  | Readonly<{ liveness: 'void', val: ShellOf<RecordT> }>

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

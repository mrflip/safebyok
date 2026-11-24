/** `VaultEvent`, the notice a vaultDB's watcher gets and the event a `VaultMinder`'s listener hears, `Agerank`, which orders the records seen of a Thing, and the checks of what a Thing is begun from or receives. */

import { Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type Banklabel, type Lifetok, type Userid, Labelpath } from './primitives'
import type { LiveOf, ShellOf, SparseOf } from './shapes-sealers'
import { type ThingRecord, type Thingkind, type Tombstone, ThingChecks, isLifepathDeep, isParityRight } from './shapes-thing'
import { BaseThing } from '../models/base-thing'
import { itemSeenOf } from '../storage/agerank'

// == [Kinds]: livenessVals, Liveness, lifekindVals, Lifekind, agekindVals, Agekind, vaultEventkindVals, VaultEventkind

/** Liveness of a record seen:
 * - `soon` -- a live box's sparse form
 * - `full` -- a whole live record
 * - `gone` -- a whole tombstone
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
 * as `Revseq.padded` writes it, and the tcchunk: the first eight hexadecimal digits of the `read_tc` the newest revision
 * was last seen at, a span of 65.536 seconds.
 */
export type Agerank = string

/** A record seen of a Thing of `RecordT`'s kind: whole, live or a tombstone, a live box's sparse form, or the void sentinel for nothing stored. */
export type SeenThing<RecordT extends ThingRecord = ThingRecord> = RecordT | SparseOf<RecordT> | ShellOf<RecordT>
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
  /** The lifetok of the bank's life, where the event's source knew it: from a `VaultMinder`, the answer's `banktok`, or the one the notice or the event rung carried, else the bank's as last read. Undefined in a vaultDB's raw watch where the datastore did not hand over the bank. */
  banktok:    Lifetok | undefined
  /** Who dispatched this event's record: a `VaultMinder` names the vaultDB it wraps, or the device database that rang what its `receive` was handed. Undefined in a vaultDB's raw watch. */
  sourcelabel: string | undefined
  /** When this event's record was read, shared by every event of one dispatch. Undefined only where a vaultDB's watch does not say. */
  read_tc:    ReadTc | undefined
}>

/** A record of the Thing. Where ageranks are kept, the record left the Thing's agerank greater than it was. Narrow it on `liveness` to know what `val` holds.
 * The newest revision seen again in a later tcchunk moves only the agerank's tcchunk: the event's `agerankWas` and `agerank` then differ only in their last field.
 */
export type VaultItemEvent<RecordT extends ThingRecord = ThingRecord> = VaultEventOf<'item'> & ItemSeen<RecordT>

/** The record of `RecordT`'s kind an `item` event saw, as `val`, beside its `liveness`. From a Thing's `receive`, `val` is the very object it was given.
 * - `full` -- a whole live record
 * - `soon` -- a live box's sparse form: a bank or a gate has none
 * - `gone` -- a whole tombstone
 * - `void` -- the void sentinel, for nothing stored
 */
export type ItemSeen<RecordT extends ThingRecord = ThingRecord> =
  | Readonly<{ liveness: 'full', val: LiveOf<RecordT> }>
  | Readonly<{ liveness: 'soon', val: SparseOf<RecordT> }>
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

// == [Checks]: ReadTc, ReadTcPattern, isSeenForm, SeenChecks

/** When the datastore was read, as a UUID version 7: lowercase hex of a fixed width, so that two compare as text in the order of their reads.
 * Compare two of them as strings, never with the device's clock.
 */
export type ReadTc = string

/** A UUID version 7, as text: the shape of every {@link ReadTc}. */
export const ReadTcPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** True when `val` is in a form a Thing receives: whole, live or a tombstone, the void sentinel, or a live box's sparse form. */
export function isSeenForm(val: SeenThing): boolean { return BaseThing.isWhole(val) || BaseThing.isSparse(val) }

// The lifepath's depth is what lets two ageranks of one Thing compare as text: every lifepath of the Thing then has as
// many lifeseqs, each ten characters, so the fields after it line up.
/** The checks of what a Thing is begun from or receives: a record, its `read_tc`, and the event it comes in. */
export const SeenChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom }) => {
  /** Check the scope and citation of a record or a void sentinel, keeping the rest: a lifeseq for each label, its own odd exactly for a tombstone. */
  const seenCited = ThingChecks.scopedCited.loose()
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity)
  /** Check a `read_tc`: a UUID version 7. */
  const readTc = custom<ReadTc>((val) => (typeof val === 'string') && ReadTcPattern.test(val), Phrases.ReadTcShape)
  return {
    seenCited,
    readTc,
    /** Check an event's kind and scope. */
    event: obj({ ...ThingChecks.thingScope.shape, eventkind: oneof(vaultEventkindVals) }),
    /** Check an `item` event: its scope and modelkind, and its record, liveness and `read_tc`, each consistent with the others. */
    item:  obj({
      ...ThingChecks.thingScope.shape,
      modelkind: ThingChecks.modelkind,
      liveness:  oneof(livenessVals),
      val:       seenCited,
      read_tc:   readTc,
    })
      .refine(({ labelpath, modelkind }) => Labelpath.modelkindOf(labelpath) === modelkind, Phrases.EventModelkind)
      .refine(({ val, ...scope }) => BaseThing.haveSameScope(val, scope), Phrases.EventOfOtherThing)
      .refine(({ val }) => isSeenForm(val as SeenThing), Phrases.SeenFormUnknown)
      .refine(({ val, liveness }) => itemSeenOf(val as SeenThing).liveness === liveness, Phrases.EventLiveness),
  }
})
// --

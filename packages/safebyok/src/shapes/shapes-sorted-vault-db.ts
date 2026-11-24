/** The shapes of a `SortedVaultDB`'s options, listener and once verbs' arguments, with their checks and the check of a SortedVaultDB itself. */

import { type Errors, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type CitedOf, type DelAskDraft, type PutAskDraft, AskChecks } from './shapes-asks'
import { type ThingRecord, type VoidSentinel, ThingChecks, isLifepathDeep, isParityRight } from './shapes-thing'
import { type SeenThing, type VaultEvent, SeenChecks, livenessVals, vaultEventkindVals } from './shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import type { Adoptable, Thing } from '../models/thing'
import type { SortedVaultDB } from '../storage/sorted-vault-db'
import type { VaultDB } from '../storage/vault-db'

// == [Shapes]: ReceivingThing, ThingMaker, SortedVaultDBOpts, SortedVaultDBListener, PutOnceArgs, DelOnceArgs

/** What a {@link SortedVaultDB} reads of each Thing it keeps. */
export type ReceivingThing = Pick<Thing<ThingRecord, unknown, unknown, Adoptable<ThingRecord>>, 'receive' | 'agerank' | 'agekind' | 'citable' | 'read_at' | 'pickle'>

/** Make the Thing a {@link SortedVaultDB} keeps at a labelpath, from `seen`, the first record it learns of there. */
export type ThingMaker<ThingT extends ReceivingThing = ReceivingThing> = (seen: SeenThing) => ThingT

/** Options for `SortedVaultDB.make`. */
export interface SortedVaultDBOpts<ThingT extends ReceivingThing = ReceivingThing> {
  /** The vaultDB to wrap. */
  vaultDB: VaultDB
  /** Makes the Thing kept at each labelpath, once, from the first record learned of there: a device's world's `makeThing`. */
  makeThing: ThingMaker<ThingT>
}

/** What listens to a {@link SortedVaultDB}: it hears each event that is news, and is told of trouble. */
export type SortedVaultDBListener = Readonly<{
  /** Hear `event`, of a record that is news. */
  hear: (event: VaultEvent) => void
  /** Be told of `news`, trouble no caller is waiting on: a record that fails its checks, or what `hear` threw. */
  onBadNews: (news: Errors.VaultError) => void
}>

/** What `SortedVaultDB.putOnce` writes: a put ask's draft, whose `cited` defaults to the citable of the Thing at the record's labelpath. */
export type PutOnceArgs<RecordT extends ThingRecord = ThingRecord> = Readonly<Omit<PutAskDraft<RecordT>, 'cited' | 'track' | 'banktok'> & { cited?: CitedOf<RecordT> }>

/** What `SortedVaultDB.delOnce` writes: the tombstone, and the revision it cites, by default the citable of the Thing at its labelpath. */
export type DelOnceArgs<RecordT extends ThingRecord = ThingRecord> = Readonly<Omit<DelAskDraft<RecordT>, 'cited' | 'track' | 'banktok'> & { cited?: CitedOf<RecordT> }>
// --

// == [Checks]: SortedVaultDBChecks, SortedVaultDBMembernames, isSortedVaultDB

/** The checks of `SortedVaultDB.make`'s arguments, of a listener, and of what a device database rang, handed to `receive`. */
export const SortedVaultDBChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn }) => ({
  makeArgs:  obj({ scope: ThingChecks.bankScope, opts: obj({ vaultDB: ThingChecks.vaultDBShape, makeThing: fn<ThingMaker>() }) }),
  listener:  obj({ hear: fn(), onBadNews: fn() }),
  /** An event rung: its kind and scope, who dispatched it, when it was read, and its bank's lifetok if any. Its `val` is checked apart, and the rest is not read. */
  rungEvent: obj({
    ...ThingChecks.thingScope.shape,
    eventkind:   oneof(vaultEventkindVals),
    sourcelabel: ThingChecks.label,
    read_tc:     SeenChecks.readTc,
    banktok:     AskChecks.loggableAsk.shape.banktok,
  }),
  /** The liveness of an `item` event rung, which says which check its `val` gets. */
  rungItem:  obj({ liveness: oneof(livenessVals) }),
  /** The `val` of a `void` event rung: the void sentinel, its lifepath as deep as its labelpath. */
  rungVoid:  custom<VoidSentinel>((val) => BaseThing.isVoidSentinel(val), Phrases.VoidSentinelExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
  /** The `val` of any other `item` event rung: a Thing's fields, sparse or whole, never the void sentinel; its lifepath as deep as its labelpath, its own lifeseq odd exactly for a tombstone. */
  rungThing: ThingChecks.sparse
    .refine((val) => ! BaseThing.isVoidSentinel(val), Phrases.ThingFieldsExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
}))

/** The members of {@link SortedVaultDB} that are functions. */
const SortedVaultDBMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'listen', 'receive', 'thingAt', 'sweep',
  'tryGetOnce', 'getOnce', 'tryListOnce', 'listOnce', 'tryPutOnce', 'putOnce', 'tryDelOnce', 'delOnce', 'makeGetAsk', 'makeListAsk', 'makePutAsk', 'makeDelAsk',
] as const satisfies readonly (keyof SortedVaultDB)[]

/** True for an object with a function for each member of {@link SortedVaultDB}. */
export function isSortedVaultDB(val: unknown): val is SortedVaultDB {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return SortedVaultDBMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

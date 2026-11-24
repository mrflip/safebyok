/** The shapes of a `VaultMinder`'s options, listener and once verbs' arguments, with their checks and the check of a VaultMinder itself. */

import { type Errors, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type CitedOf, type DelAskDraft, type PutAskDraft, AskChecks } from './shapes-asks'
import type { EpochMillis } from './primitives'
import { type ThingRecord, type VoidSentinel, ThingChecks, isLifepathDeep, isParityRight } from './shapes-thing'
import { type SeenThing, type VaultEvent, SeenChecks, isSeenForm, livenessVals, vaultEventkindVals } from './shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import type { Adoptable, Thing } from '../models/thing'
import type { VaultMinder } from '../minding/vault-minder'
import type { VaultDB } from '../storage/vault-db'

// == [Shapes]: ReceivingThing, ThingMaker, ThingCar, VaultMinderOpts, VaultMinderListener, PutOnceArgs, DelOnceArgs

/** What a {@link VaultMinder} reads of each Thing it keeps. */
export type ReceivingThing = Pick<Thing<ThingRecord, unknown, unknown, Adoptable<ThingRecord>>, 'receive' | 'agerank' | 'agekind' | 'citable' | 'read_at' | 'pickle'>

/** Make the Thing a {@link VaultMinder} keeps at `shell`'s labelpath, holding `shell`: it then receives the first record learned of there. */
export type ThingMaker<ThingT extends ReceivingThing = ReceivingThing> = (shell: VoidSentinel) => ThingT

/** The Thing a {@link VaultMinder} keeps at a labelpath, and the refusal it last raised at a record. For a devtool: it changes no answer. */
export type ThingCar<ThingT extends ReceivingThing = ReceivingThing> = Readonly<{
  /** The Thing, the same object for as long as the VaultMinder lives. */
  thing:    ThingT
  /** The refusal the Thing raised at the last record it was handed, or null where it took that record. */
  lastErr:  Errors.VaultError | null
  /** When the Thing last refused a record, or null where it has refused none. */
  erred_at: EpochMillis | null
}>

/** Options for `VaultMinder.make`. */
export interface VaultMinderOpts<ThingT extends ReceivingThing = ReceivingThing> {
  /** The vaultDB to wrap. */
  vaultDB: VaultDB
  /** Makes the Thing kept at each labelpath, once, holding the shell there: a device's world's `makeThing`. */
  makeThing: ThingMaker<ThingT>
}

/** What listens to a {@link VaultMinder}: it hears each event that is news, and is told of trouble. */
export type VaultMinderListener = Readonly<{
  /** Hear `event`, of a record that is news. */
  hear: (event: VaultEvent) => void
  /** Be told of `news`, trouble no caller is waiting on: a record that fails its checks, or what `hear` threw. */
  onBadNews: (news: Errors.VaultError) => void
}>

/** What `VaultMinder.putOnce` writes: a put ask's draft, whose `cited` defaults to the citable of the Thing at the record's labelpath. */
export type PutOnceArgs<RecordT extends ThingRecord = ThingRecord> = Readonly<Omit<PutAskDraft<RecordT>, 'cited' | 'track' | 'banktok'> & { cited?: CitedOf<RecordT> }>

/** What `VaultMinder.delOnce` writes: the tombstone, and the revision it cites, by default the citable of the Thing at its labelpath. */
export type DelOnceArgs<RecordT extends ThingRecord = ThingRecord> = Readonly<Omit<DelAskDraft<RecordT>, 'cited' | 'track' | 'banktok'> & { cited?: CitedOf<RecordT> }>
// --

// == [Checks]: VaultMinderChecks, VaultMinderMembernames, isVaultMinder

/** The checks of `VaultMinder.make`'s arguments, of a listener, and of what a device database rang, handed to `receive`. */
export const VaultMinderChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn }) => ({
  makeArgs:  obj({ scope: ThingChecks.bankScope, opts: obj({ vaultDB: ThingChecks.vaultDBShape, makeThing: fn<ThingMaker>() }) }),
  listener:  obj({ hear: fn(), onBadNews: fn() }),
  /** An event rung: its kind and scope, who dispatched it, when it was read, and its bank's lifetok, the void one where its source knew none. Its `val` is checked apart, and the rest is not read. */
  rungEvent: obj({
    ...ThingChecks.thingScope.shape,
    eventkind:   oneof(vaultEventkindVals),
    sourcelabel: ThingChecks.label,
    read_tc:     SeenChecks.readTc,
    banktok:     AskChecks.anyBanktok,
  }),
  /** The liveness of an `item` event rung, which says which check its `val` gets. */
  rungItem:  obj({ liveness: oneof(livenessVals) }),
  /** The `val` of a `void` event rung: the void sentinel, its lifepath as deep as its labelpath. */
  rungVoid:  custom<VoidSentinel>((val) => BaseThing.isVoidSentinel(val), Phrases.VoidSentinelExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity),
  /** The `val` of any other `item` event rung: a whole record, live or a tombstone, or a live box's sparse form, never the void sentinel; its lifepath as deep as its labelpath, its own lifeseq odd exactly for a tombstone. */
  rungThing: ThingChecks.sparse.loose()
    .refine((val) => ! BaseThing.isVoidSentinel(val), Phrases.ThingFieldsExpected)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight, Phrases.LifeseqParity)
    .refine((val) => isSeenForm(val as SeenThing), Phrases.SeenFormUnknown),
}))

/** The members of {@link VaultMinder} that are functions. */
const VaultMinderMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'tryGetWorld', 'listen', 'receive', 'thingAt', 'carAt', 'sweep',
  'tryGetWorldOnce', 'tryGetOnce', 'getOnce', 'tryListOnce', 'listOnce', 'tryPutOnce', 'putOnce', 'tryDelOnce', 'delOnce', 'makeGetAsk', 'makeListAsk', 'makePutAsk', 'makeDelAsk',
] as const satisfies readonly (keyof VaultMinder)[]

/** True for an object with a function for each member of {@link VaultMinder}. */
export function isVaultMinder(val: unknown): val is VaultMinder {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return VaultMinderMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

/** The shapes of a `VaultMinder`'s options, listener and once verbs' arguments, with their checks and the check of a VaultMinder itself. */

import { type Errors, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type CitedOf, type DelAskDraft, type PutAskDraft, AskChecks } from './shapes-asks'
import { type ThingRecord, type ThingScope, type VoidSentinel, ThingChecks, isLifepathDeep, isParityRight } from './shapes-thing'
import { type SeenThing, type VaultEvent, SeenChecks, isSeenForm, livenessVals, vaultEventkindVals } from './shapes-vault-event'
import { BaseThing } from '../models/base-thing'
import type { Adoptable, Thing } from '../models/thing'
import type { ThingCar } from '../minding/thing-car'
import type { VaultMinder } from '../minding/vault-minder'
import type { VaultDB } from '../storage/vault-db'

// == [Shapes]: ReceivingThing, ThingMaker, CarBank, ThingCarOpts, VaultMinderOpts, VaultMinderListener, PutOnceArgs, DelOnceArgs

/** What a {@link ThingCar} asks of the Thing it carries. */
export type ReceivingThing = Pick<Thing<ThingRecord, unknown, unknown, Adoptable<ThingRecord>>, 'receive' | 'take' | 'publish' | 'pickle' | 'modelkind' | 'userid' | 'banklabel' | 'labelpath'>

/** Make the Thing at `shell`'s labelpath, holding `shell`, which has received nothing. */
export type ThingMaker<ThingT extends ReceivingThing = ReceivingThing> = (shell: VoidSentinel) => ThingT

/** What a {@link ThingCar} reaches of its bank: the maker of the Thing it carries. A device's `Bank` is one. */
export type CarBank<ThingT extends ReceivingThing = ReceivingThing> = Readonly<{ makeThing: ThingMaker<ThingT> }>

/** The options of `ThingCar.make`, beside the Thing, shell or item event it is made from. */
export type ThingCarOpts<ThingT extends ReceivingThing = ReceivingThing> = Readonly<{
  /** Makes the car's Thing where it is handed none: a device's bank. */
  bank: CarBank<ThingT>
}>

/** Options for `VaultMinder.make`. */
export interface VaultMinderOpts<ThingT extends ReceivingThing = ReceivingThing> {
  /** The vaultDB to wrap. */
  vaultDB: VaultDB
  /** Makes the Thing kept at each labelpath, once, holding the shell there: a device's bank. */
  bank:   CarBank<ThingT>
}

/** What listens to a {@link VaultMinder}: it hears each event that is news, and is told of trouble. */
export type VaultMinderListener = Readonly<{
  /** Hear `event`, of a record that is news. */
  hear: (event: VaultEvent) => void
  /** Be told of `news`, trouble no caller is waiting on: a record that fails its checks, or what `hear` threw. `scope` is the record's, or null where the trouble is of no one record. */
  onBadNews: (news: Errors.VaultError, scope: ThingScope | null) => void
}>

/** What `VaultMinder.putOnce` writes: a put ask's draft, whose `cited` defaults to the citable of the Thing at the record's labelpath. */
export type PutOnceArgs<RecordT extends ThingRecord = ThingRecord> = Readonly<Omit<PutAskDraft<RecordT>, 'cited' | 'track' | 'banktok'> & { cited?: CitedOf<RecordT> }>

/** What `VaultMinder.delOnce` writes: the tombstone, and the revision it cites, by default the citable of the Thing at its labelpath. */
export type DelOnceArgs<RecordT extends ThingRecord = ThingRecord> = Readonly<Omit<DelAskDraft<RecordT>, 'cited' | 'track' | 'banktok'> & { cited?: CitedOf<RecordT> }>
// --

// == [Checks]: ThingCarChecks, VaultMinderChecks, VaultMinderMembernames, isVaultMinder

/** The checks of `ThingCar.make`'s arguments, and of the bank a car or a VaultMinder makes Things with. */
export const ThingCarChecks = Validator.Checkers('bad_record', ({ obj, custom, union, fn }) => {
  const bank = obj({ makeThing: fn<ThingMaker>() })
  return {
    bank,
    makeArgs: obj({
      begun: union([custom<ReceivingThing>((val) => val instanceof BaseThing, Phrases.ThingExpected), SeenChecks.begun]),
      opts:  obj({ bank }),
    }),
  }
})

/** The checks of `VaultMinder.make`'s arguments, of a listener, of `connect`'s arguments, and of what a device database rang, handed to `receive`. */
export const VaultMinderChecks = Validator.Checkers('bad_record', ({ obj, oneof, custom, fn }) => ({
  makeArgs:    obj({ scope: ThingChecks.bankScope, opts: obj({ vaultDB: ThingChecks.vaultDBShape, bank: ThingCarChecks.bank }) }),
  listener:    obj({ hear: fn(), onBadNews: fn() }),
  connectArgs: obj({ onEnded: fn().optional() }),
  /** An event rung: its kind and scope, who dispatched it, when it was read, and its bank's banktok, the void one where its source knew none. Its `val` is checked apart, and the rest is not read. */
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
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'tryGetBank', 'tryStats', 'listen', 'receive', 'thingAt', 'carAt', 'connect', 'disconnect',
  'tryGetBankOnce', 'tryStatsOnce', 'tryGetOnce', 'getOnce', 'tryListOnce', 'listOnce', 'tryPutOnce', 'putOnce', 'tryDelOnce', 'delOnce', 'makeGetAsk', 'makeListAsk', 'makePutAsk', 'makeDelAsk',
] as const satisfies readonly (keyof VaultMinder)[]

/** True for an object with a function for each member of {@link VaultMinder}. */
export function isVaultMinder(val: unknown): val is VaultMinder {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return VaultMinderMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

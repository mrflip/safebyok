/** The asks a vaultDB is given: their checks, their builders, and the loggable part of each. */

import type * as Z from 'zod'
import { CX, EX, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type Banktok, Labelpath, Lifeseq } from './primitives'
import {
  type BoxRecord, type GateRecord, type ThingCited, type ThingRecord, type ThingScope, type Thingkind,
  PerKindChecks, Shell, ThingChecks, isLabelpathOfKind, policiesByModelkind,
} from './shapes-thing'
import type { ShellOf } from './shapes-sealers'
import * as Throwers from '../refusals/throwers'

// == [Asks]: RawChecks, loggableAsk, AskChecks, Track, VoidTrack, GetAsk, ListAsk, WriteAsk, BirthCited, BirthBankAsk, BankRoots, RootModelkinds, rootLabelpathsOf, rootScopesOf, GetBankAsk, ActualRoots, StatsAsk, ThingWatchScope, checkedWriteAsk, checkedBirthBankAsk, birthPutsOf, checkWriteInvariants

type Kinded   = { modelkind: Thingkind, labelpath: Labelpath }
type Flagged  = Kinded & { op: string, ifAbsent: string, ifPresent: string, options?: { policies: readonly EX.StoragePolicy[] } | undefined }

/** True unless a del changes its fixed flags, or names a storage policy. */
function isDelFixed({ op, ifAbsent, ifPresent, options }: Flagged): boolean {
  return (op !== 'del') || ((ifAbsent === 'fail') && (ifPresent === 'repl') && (options === undefined))
}
/** True when each storage policy an ask names is one its kind has. */
function isPolicyOwn({ modelkind, options }: Flagged): boolean {
  const owned: readonly string[] = policiesByModelkind[modelkind]
  return (options?.policies ?? []).every((policy) => owned.includes(policy))
}

/** The checks of an ask, a watch's scope and its arguments. */
const RawChecks = Validator.Checkers('bad_record', ({ obj, arr, lit, unk, oneof, user_id, fn }) => {
  const { banklabel } = ThingChecks
  const scopeFields     = ThingChecks.thingScope.shape
  const thingWatchScope = ThingChecks.bankScope
  const thingOptions    = obj({
    /** The storage policies the write must meet, each over the prior Thing. */
    policies: arr(oneof(EX.storagePolicyVals)),
  }).strict()
  // A root the sender knows none stored of is tracked at the void revision.
  const trackPair       = obj({ revseq: ThingChecks.thingCited.shape.revseq, lifepath: ThingChecks.thingCited.shape.lifepath }).strict()
  const track           = obj({ gate: trackPair, root: trackPair }).strict()
  // The sender's, not the datastore's: a vaultDB neither compares it with the actual bank nor refuses on it. A get may
  // be sent before its sender knows the bank, at sign-in or before a birth, and carries the void banktok then.
  const anyBanktok      = PerKindChecks.banktok
  const banktok         = anyBanktok.refine((given) => given !== SX.VoidLifeTok, Phrases.BanktokVoid)
  return {
    thingOptions,
    track,
    /** Check a banktok, the void banktok among them. */
    anyBanktok,
    getAsk:          obj({ ...scopeFields, op: lit('get'), ifAbsent: SX.ifAbsent, track, banktok: anyBanktok }).strict()
      .refine(isLabelpathOfKind, Phrases.LabelpathOfOtherKind),
    listAsk:         obj({ ...scopeFields, op: lit('list'), track, banktok }).strict()
      .refine(isLabelpathOfKind, Phrases.LabelpathOfOtherKind),
    writeAsk:        obj({
      ...scopeFields, op: oneof(['put', 'del']), cited: unk, record: unk, ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, options: thingOptions.optional(), track, banktok,
    }).strict()
      .refine(isLabelpathOfKind, Phrases.LabelpathOfOtherKind)
      .refine(isDelFixed,        Phrases.DelFlagsFixed)
      .refine(isPolicyOwn,       Phrases.PolicyNotOwn),
    birthBankAsk:    obj({ userid: user_id, banklabel, op: lit('birth'), cited: obj({ gate: unk, root: unk }).strict(), gate: unk, root: unk, track, banktok }).strict(),
    getBankAsk:      obj({ userid: user_id, banklabel, op: lit('getbank'), track, banktok: anyBanktok }).strict(),
    statsAsk:        obj({ userid: user_id, banklabel, op: lit('stats'), track, banktok: anyBanktok }).strict(),
    thingWatchScope,
    watchArgs:       obj({ scope: thingWatchScope, onNotice: fn(), onBadNews: fn(), onEnded: fn().optional() }),
  }
})

/** The part of an ask that is safe to log: its scope, its flags, and what each record cites, never a gate's wayins.
 * Each field is optional, so a refusal of a malformed ask still carries the sound part of it.
 */
const loggableAsk = Validator.objStrip(({ obj, arr, oneof, union, user_id, label }) => {
  const citedFields = ThingChecks.thingCited.partial()
  // A birth cites each root: tried first, since a write's citation would pass a pair's check stripped bare.
  const rootsCited  = obj({ gate: citedFields, root: citedFields })
  const trackFields = obj({ revseq: ThingChecks.thingCited.shape.revseq, lifepath: ThingChecks.thingCited.shape.lifepath }).partial()
  return {
    op:        oneof(['get', 'list', 'put', 'del', 'birth', 'getbank', 'stats']).optional(),
    modelkind: oneof(ThingChecks.thingkindVals).optional(),
    userid:    user_id.optional(),
    banklabel: label.optional(),
    labelpath: ThingChecks.thingScope.shape.labelpath.optional(),
    ifAbsent:  SX.anyIfAbsent.optional(),
    ifPresent: SX.ifPresent.optional(),
    options:   obj({ policies: arr(oneof(EX.storagePolicyVals)) }).optional(),
    cited:     union([rootsCited, citedFields]).optional(),
    record:    citedFields.optional(),
    gate:      citedFields.optional(),
    root:      citedFields.optional(),
    track:     obj({ gate: trackFields, root: trackFields }).partial().optional(),
    banktok:   PerKindChecks.banktok.optional(),
  }
}, 'bad_record')

/** The checks of a vaultDB ask, its records aside, of a watch's scope and handlers, and of the part of an ask that is safe to log.
 * A write or birth ask's records are checked by {@link checkedWriteAsk} and {@link checkedBirthBankAsk}.
 * Every ask carries `banktok`, the banktok its sender has of the bank's life: a vaultDB checks its form, and compares it with nothing stored. Only a get, of a Thing or of the bank, and an ask for stats may carry the void banktok.
 */
export const AskChecks = Object.freeze({ ...RawChecks, loggableAsk })

/** The revseq and lifepath the ask's sender has of its bank's gate and its root box, each at the void revision where it knows none stored.
 * The answer's `tracked` says, for each, whether it is still the actual one; a root tracked at the void revision is `'same'` where none is stored.
 */
export type Track           = Readonly<Z.infer<typeof AskChecks.track>>
/** The revseq and lifepath a track gives a root its sender knows none stored of. */
const VoidTrackPair = Object.freeze({ revseq: Shell.Cited.revseq, lifepath: Shell.Cited.lifepath })
/** The track of a sender that knows none of the bank's roots stored: each at the void revision. */
export const VoidTrack: Track = Object.freeze({ gate: VoidTrackPair, root: VoidTrackPair })
/** An ask for the Thing at its scope. */
export type GetAsk          = Readonly<Z.infer<typeof AskChecks.getAsk>>
/** An ask for the children of the live Thing at its scope. A parent that is not live refuses it. */
export type ListAsk         = Readonly<Z.infer<typeof AskChecks.listAsk>>
// Any other field may be undefined, as a Thing's body is over the shell or in a live box's sparse form, so that a Thing may be cited as it stands.
/** A write's citation of a Thing of `RecordT`'s kind: {@link ThingCited}, and optionally any other of its fields. */
export type CitedOf<RecordT extends ThingRecord> = ThingCited & { [FieldT in Exclude<keyof RecordT, keyof ThingCited>]?: RecordT[FieldT] | undefined }
/** The flags of a write ask, its modelkind and records aside. */
export type WriteAskFlags = Readonly<Omit<Z.infer<typeof AskChecks.writeAsk>, 'modelkind' | 'cited' | 'record'>>
/** A write ask of a gate: see {@link WriteAsk}. */
export type GateWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'gate', cited: CitedOf<GateRecord>, record: GateRecord }>
/** A write ask of a box: see {@link WriteAsk}. */
export type BoxWriteAsk  = WriteAskFlags & Readonly<{ modelkind: 'box',  cited: CitedOf<BoxRecord>,  record: BoxRecord }>
/** An ask to write `record` over the Thing it `cited`: a `put` of a live record, or a `del` with a tombstone. With no `RecordT`, a write of any kind.
 * The datastore compares the {@link ThingCited} fields of `cited` with the prior Thing. Any other field of `cited` is read only by a storage policy, as testimony.
 * `modelkind` says which kind of Thing both are.
 */
export type WriteAsk<RecordT extends ThingRecord = ThingRecord> = Extract<GateWriteAsk | BoxWriteAsk, { record: RecordT }>
/** A bank's two roots: its gate and its root box. */
export type BankRoots       = Readonly<{ gate: GateRecord, root: BoxRecord }>
/** The modelkind of each of a bank's roots, by its ckey in {@link BankRoots}. */
export const RootModelkinds = Object.freeze({ gate: 'gate', root: 'box' } as const satisfies Record<keyof BankRoots, Thingkind>)
/** Where each of a bank's roots is stored, by its ckey in {@link BankRoots}: its gate at its banklabel, its root box at `box`.
 * Refuses a banklabel that is no bank's, as `bad_record`.
 */
export function rootLabelpathsOf({ banklabel }: Pick<ThingScope, 'banklabel'>): Readonly<Record<keyof BankRoots, Labelpath>> {
  return { gate: Labelpath.gateOf(ThingChecks.banklabel.parse(banklabel)), root: Labelpath.RootBox }
}
/** The scope of each of a bank's roots, by its ckey in {@link BankRoots}: its gate at its banklabel, its root box at `box`.
 * Refuses a banklabel that is no bank's, as `bad_record`.
 */
export function rootScopesOf({ userid, banklabel }: ThingWatchScope): Readonly<{ [RootT in keyof BankRoots]: ThingScope & Readonly<{ modelkind: typeof RootModelkinds[RootT] }> }> {
  const labelpaths = rootLabelpathsOf({ banklabel })
  return {
    gate: { modelkind: RootModelkinds.gate, userid, banklabel, labelpath: labelpaths.gate },
    root: { modelkind: RootModelkinds.root, userid, banklabel, labelpath: labelpaths.root },
  }
}
/** What a birth's two puts cite, by root: each root as its sender found it, the shell where none is stored, or its tombstone. */
export type BirthCited      = Readonly<{ gate: CitedOf<GateRecord>, root: CitedOf<BoxRecord> }>
/** An ask to write a bank's roots in one step, its gate and its root box, each over the root it `cited`: the bank's first life, or its next after its end. */
export type BirthBankAsk    = Readonly<Omit<Z.infer<typeof AskChecks.birthBankAsk>, keyof BankRoots | 'cited'> & BankRoots & { cited: BirthCited }>
/** An ask for a bank's two roots, read in one step. */
export type GetBankAsk      = Readonly<Z.infer<typeof AskChecks.getBankAsk>>
/** A bank's two roots as one step read them: each the whole actual record, live or a tombstone, or the shell where none is stored. */
export type ActualRoots     = Readonly<{ gate: GateRecord | ShellOf<GateRecord>, root: BoxRecord | ShellOf<BoxRecord> }>
/** An ask for a bank's storage stats, read in one step. */
export type StatsAsk        = Readonly<Z.infer<typeof AskChecks.statsAsk>>
/** Any ask a vaultDB answers: a get, a list, a put or del, a birth, a get of the bank, or an ask for stats. */
export type AnyAsk          = GetAsk | ListAsk | WriteAsk | BirthBankAsk | GetBankAsk | StatsAsk
/** The two puts of a bank's birth, one for each root. */
export type BirthPuts       = readonly [GateWriteAsk, BoxWriteAsk]
/** The scope of a watch: a bank. */
export type ThingWatchScope = Readonly<Z.infer<typeof AskChecks.thingWatchScope>>
// Unspecified for a missing or incompatible row: notes/wontfix.md.
/** For each Thing an ask tracks, `'same'` if the actual Thing is at the revseq and lifepath tracked, else the actual Thing. */
export type Tracked         = Readonly<{ gate: GateRecord | 'same', root: BoxRecord | 'same' }>

/** Check a write `ask`, and its records by their kind and against each other, throwing `bad_record`. Returns it typed. */
export function checkedWriteAsk(ask: unknown): WriteAsk {
  const writeAsk = withRecordsChecked(AskChecks.writeAsk.parse(ask))
  if ((writeAsk.op === 'put') !== (writeAsk.record.am === 'a')) { throw Throwers.opNotOfRecord(writeAsk) }
  checkWriteInvariants(writeAsk)
  return writeAsk
}

/** Check the records of `ask` by the kind its modelkind names. Its flags are already checked. */
function withRecordsChecked({ cited, record, ...flags }: Z.infer<typeof AskChecks.writeAsk>): WriteAsk {
  if (flags.modelkind === 'gate') { return { ...flags, modelkind: 'gate', cited: PerKindChecks.gateCited.parse(cited), record: PerKindChecks.gateThing.parse(record) } }
  return { ...flags, modelkind: 'box', cited: PerKindChecks.boxCited.parse(cited), record: PerKindChecks.boxThing.parse(record) }
}

/** Check a birth `ask`: each of its two records and what each cites, as the put {@link birthPutsOf} makes of them. Throws `bad_record`, and returns it typed. */
export function checkedBirthBankAsk(ask: unknown): BirthBankAsk {
  const { cited, gate, root, ...flags } = AskChecks.birthBankAsk.parse(ask)
  const birthCited   = { gate: PerKindChecks.gateCited.parse(cited.gate), root: PerKindChecks.boxCited.parse(cited.root) }
  const birthBankAsk = { ...flags, cited: birthCited, gate: PerKindChecks.gateThing.parse(gate), root: PerKindChecks.boxThing.parse(root) }
  for (const put of birthPutsOf(birthBankAsk)) { checkedWriteAsk(put) }
  return birthBankAsk
}

/** The two puts of a bank's birth, each writing a root over the root its ask cites, with the birth's track and banktok.
 * The gate's put returns a live gate (`passed`). The root's put refuses over a live box.
 */
export function birthPutsOf({ userid, banklabel, cited, gate, root, track, banktok }: BirthBankAsk): BirthPuts {
  const flags = { userid, banklabel, op: 'put', ifAbsent: 'add', ifPresent: 'fail', track, banktok } as const
  const labelpaths = rootLabelpathsOf({ banklabel })
  return [
    { ...flags, labelpath: labelpaths.gate, modelkind: RootModelkinds.gate, cited: cited.gate, record: gate, ifPresent: 'get' },
    { ...flags, labelpath: labelpaths.root, modelkind: RootModelkinds.root, cited: cited.root, record: root },
  ]
}

/** Refuse a write whose record does not follow from the Thing it cites. */
function checkWriteInvariants(ask: WriteAsk): void {
  const { cited, record, userid, banklabel, labelpath } = ask
  if (record.revseq !== cited.revseq + 1)                                                           { throw Throwers.revseqNotNext(ask) }
  if ((record.revtok === cited.revtok) || (record.revtok === SX.VoidRevisionTok))                   { throw Throwers.revtokNotNew(ask) }
  if (! Validator.isConsistent(record, { userid, banklabel, labelpath }))                           { throw Throwers.recordOfOtherScope(ask) }
  if ((record.am === 'x') && (cited.am === 'x'))                                                    { throw Throwers.tombstoneOverTombstone(ask) }
  if (Lifeseq.leadingOf(record.lifepath) !== Lifeseq.leadingOf(cited.lifepath))                     { throw Throwers.leadingLifeseqsMoved(ask) }
  const isLifeFlipped = (record.am !== cited.am)
  if (Lifeseq.lifenumOf(record.lifeseq) !== Lifeseq.lifenumOf(Lifeseq.ofLifepath(cited.lifepath)) + (isLifeFlipped ? 1 : 0)) { throw Throwers.lifeseqNotNext(ask) }
  // A live record over a live one leaves the prior Thing's born_at unchanged: AdapterVaultDB checks that, against the Thing it has.
  if (isLifeFlipped && (record.am === 'a') && (record.born_at !== record.written_at))               { throw Throwers.bornAtNotNow(ask) }
  if ((ask.modelkind === 'gate') && ask.options?.policies.includes('replace_passphrase') && ((ask.cited.wayins?.main ?? null) === null)) { throw Throwers.testimonyMissing(ask) }
}
// --

// == [Ask builders]: GetAskDraft, ListAskDraft, PutAskDraft, DelAskDraft, getAskOf, listAskOf, putAskOf, delAskOf, scopeGiven
// The one place an ask's flags are defaulted. A builder fills in the op and the default flags, and takes the scope
// from its draft, or from the record a write's draft carries. It checks nothing: what it was given that is wrong goes
// through as given, for the verb's checks to refuse in its answer.

/** The storage policies a write names. */
export type ThingOptions = Readonly<Z.infer<typeof AskChecks.thingOptions>>

/** The draft of a get ask: a Thing's scope, its `ifAbsent` (default `'nil'`), and what its sender tracks and has of the bank's life.
 * {@link getAskOf} fills in what it leaves out, to make the {@link GetAsk}.
 */
export type GetAskDraft  = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track: Track, banktok: Banktok }>
/** The draft of a list ask: the parent's scope, and what its sender tracks and has of the bank's life.
 * {@link listAskOf} fills in the rest, to make the {@link ListAsk}.
 */
export type ListAskDraft = ThingScope & Readonly<{ track: Track, banktok: Banktok }>
/** The draft of a put ask: the records, the flags (default `ifAbsent: 'add'`, `ifPresent: 'repl'`), the storage policies, and what its sender tracks and has of the bank's life.
 * {@link putAskOf} fills in what it leaves out, to make the {@link WriteAsk}.
 */
export type PutAskDraft<RecordT extends ThingRecord = ThingRecord> = Readonly<{
  cited: CitedOf<RecordT>, record: RecordT, ifAbsent?: EX.PutIfAbsent, ifPresent?: EX.IfPresent, options?: ThingOptions, track: Track, banktok: Banktok,
}>
/** The draft of a del ask: the records, and what its sender tracks and has of the bank's life.
 * A del's flags are fixed, so the draft has none; {@link delAskOf} fills them in to make the {@link WriteAsk}.
 */
export type DelAskDraft<RecordT extends ThingRecord = ThingRecord> = Readonly<{ cited: CitedOf<RecordT>, record: RecordT, track: Track, banktok: Banktok }>

/** The get ask for the Thing at `ask`'s scope. */
export function getAskOf(ask: GetAskDraft): GetAsk {
  if (! CX.isPlainBag(ask)) { return ask }
  const { modelkind, userid, banklabel, labelpath, ifAbsent = 'nil', track, banktok } = ask
  return { modelkind, userid, banklabel, labelpath, op: 'get', ifAbsent, track, banktok }
}

/** The list ask for the children of the Thing at `ask`'s scope. */
export function listAskOf(ask: ListAskDraft): ListAsk {
  if (! CX.isPlainBag(ask)) { return ask }
  const { modelkind, userid, banklabel, labelpath, track, banktok } = ask
  return { modelkind, userid, banklabel, labelpath, op: 'list', track, banktok }
}

/** The put ask writing `ask.record` over `ask.cited`, at the record's scope. */
export function putAskOf<RecordT extends ThingRecord>(ask: PutAskDraft<RecordT>): WriteAsk<RecordT> {
  if (! CX.isPlainBag(ask)) { return ask }
  const { ifAbsent = 'add', ifPresent = 'repl', ...given } = ask
  // A field the put does not accept goes through, for the verb's strict check to refuse.
  return { ...given, ...scopeGiven(ask.record), op: 'put', ifAbsent, ifPresent } as unknown as WriteAsk<RecordT>
}

/** The del ask writing the tombstone `ask.record` over `ask.cited`, at the record's scope. */
export function delAskOf<RecordT extends ThingRecord>(ask: DelAskDraft<RecordT>): WriteAsk<RecordT> {
  if (! CX.isPlainBag(ask)) { return ask }
  // A field the del does not accept goes through, for the verb's strict check to refuse.
  return { ...ask, ...scopeGiven(ask.record), op: 'del', ifAbsent: 'fail', ifPresent: 'repl' } as unknown as WriteAsk<RecordT>
}

/** The scope fields of `record`, as given: none when it is not a bag. */
function scopeGiven(record: unknown): Partial<Record<keyof ThingScope, unknown>> {
  if (! CX.isPlainBag(record)) { return {} }
  const { modelkind, userid, banklabel, labelpath } = record
  return { modelkind, userid, banklabel, labelpath }
}
// --

// == [Loggable asks]: LoggableAsk, loggableAskOf

/** The part of a vaultDB ask that is safe to log. */
export type LoggableAsk = Readonly<Z.infer<typeof AskChecks.loggableAsk>>

/** The loggable part of `ask`, or `{}` for an ask that does not parse. */
export function loggableAskOf(ask: unknown): LoggableAsk {
  const loggableReport = AskChecks.loggableAsk.safeParse(ask)
  return loggableReport.success ? loggableReport.data : {}
}
// --

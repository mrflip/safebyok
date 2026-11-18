/** The asks a vaultDB is given: their checks, their builders, and the loggable part of each. */

import type * as Z from 'zod'
import { CX, EX, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { bornAtNotNow, lifepathNotKept, lifeseqNotNext, opNotOfRecord, recordOfOtherScope, revseqNotNext, revtokNotNew, testimonyMissing, tombstoneOverTombstone } from '../refusals/throwers'
import type { Labelpath } from './primitives'
import {
  type BankThing, type BoxThing, type GateThing, type Thing, type ThingCited, type ThingScope, type Thingkind,
  KindChecks, MainGateLabelpath, RootBoxLabelpath, ShellCited, bankCited, bankThing, boxCited, boxThing, gateCited, gateThing, leadingLifeseqsOf, lifenumOfLifeseq, lifeseqOfLifepath,
  modelkindOf, thingCited, thingRecord, thingScope, thingkindVals,
} from './shapes-thing'

// == [Asks]: AskChecks, Track, GetAsk, ListAsk, WriteAsk, BirthBankAsk, BankRoots, ThingWatchScope, BankRecord, WorldRecord, checkedWriteAsk, checkedBirthBankAsk, birthPutsOf, checkWriteInvariants

type Kinded   = { modelkind: Thingkind, labelpath: Labelpath }
type Flagged  = Kinded & { op: string, ifAbsent: string, ifPresent: string, options?: { policies: readonly EX.StoragePolicy[] } | undefined }

/** True when an ask's modelkind is its labelpath's. */
function isModelkindOwn({ modelkind, labelpath }: Kinded): boolean { return modelkindOf(labelpath) === modelkind }
/** True unless a del changes its fixed flags, or names a storage policy. */
function isDelFixed({ op, ifAbsent, ifPresent, options }: Flagged): boolean {
  return (op !== 'del') || ((ifAbsent === 'fail') && (ifPresent === 'repl') && (options === undefined))
}
/** True when each storage policy an ask names is one its kind has. */
function isPolicyOwn({ modelkind, options }: Flagged): boolean {
  const owned: readonly string[] = KindChecks[modelkind].policies
  return (options?.policies ?? []).every((policy) => owned.includes(policy))
}

/** The checks of a vaultDB ask, its records aside, and of a watch's scope and handlers.
 * A write or birth ask's records are checked by {@link checkedWriteAsk} and {@link checkedBirthBankAsk}.
 */
export const AskChecks = Validator.Checkers('bad_record', ({ obj, arr, lit, unk, oneof, label, user_id, fn }) => {
  const modelkind       = oneof(thingkindVals)
  const thingWatchScope = thingScope.pick({ userid: true, banklabel: true })
  const thingOptions    = obj({
    /** The storage policies the write must keep, each over the Thing stored. */
    policies: arr(oneof(EX.storagePolicyVals)),
  }).strict()
  const trackPair       = obj({ revseq: thingRecord.shape.revseq, lifepath: thingRecord.shape.lifepath }).strict()
  const trackShape      = obj({ bank: trackPair, [MainGateLabelpath]: trackPair, [RootBoxLabelpath]: trackPair }).strict()
  const track           = trackShape.optional()
  return {
    thingOptions,
    trackShape,
    getAsk:          thingScope.extend({ op: lit('get'), modelkind, ifAbsent: SX.ifAbsent, track }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    listAsk:         thingScope.extend({ op: lit('list'), modelkind, ifAbsent: SX.ifAbsent, track }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    writeAsk:        thingScope.extend({
      op: oneof(['put', 'del']), modelkind, cited: unk, record: unk, ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, options: thingOptions.optional(), track,
    }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn)
      .refine(isDelFixed,     Phrases.DelFlagsFixed)
      .refine(isPolicyOwn,    Phrases.PolicyNotOwn),
    birthBankAsk:    obj({ userid: user_id, banklabel: label, op: lit('birth'), bank: unk, gate: unk, root: unk, track }).strict(),
    thingWatchScope,
    watchArgs:       obj({ scope: thingWatchScope, onNotice: fn(), onBadNews: fn() }),
  }
})
/** The checks of a watch's scope (a bank) and of its arguments. */
export const { thingWatchScope, watchArgs, trackShape } = AskChecks

/** The revseq and lifepath the ask's sender has of its bank, its main gate and its root box. The answer's `tracked` says, for each, whether it is still the one stored. */
export type Track           = Readonly<Z.infer<typeof AskChecks.trackShape>>
/** An ask for the Thing at its scope. */
export type GetAsk          = Readonly<Z.infer<typeof AskChecks.getAsk>>
/** An ask for the children of the Thing at its scope. Its `ifAbsent` is the parent's. */
export type ListAsk         = Readonly<Z.infer<typeof AskChecks.listAsk>>
/** A write's citation of a Thing of `RecordT`'s kind: {@link ThingCited}, and optionally any other of its fields. */
export type CitedOf<RecordT extends Thing> = ThingCited & Partial<Omit<RecordT, keyof ThingCited>>
/** The flags of a write ask, its modelkind and records aside. */
type WriteAskFlags = Readonly<Omit<Z.infer<typeof AskChecks.writeAsk>, 'modelkind' | 'cited' | 'record'>>
/** A write ask of the bank: see {@link WriteAsk}. */
export type BankWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'bank', cited: CitedOf<BankThing>, record: BankThing }>
/** A write ask of a gate: see {@link WriteAsk}. */
export type GateWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'gate', cited: CitedOf<GateThing>, record: GateThing }>
/** A write ask of a box: see {@link WriteAsk}. */
export type BoxWriteAsk  = WriteAskFlags & Readonly<{ modelkind: 'box',  cited: CitedOf<BoxThing>,  record: BoxThing }>
/** An ask to write `record` over the Thing it `cited`: a `put` of a live record, or a `del` with a tombstone. With no `RecordT`, a write of any kind.
 * The store compares the {@link ThingCited} fields of `cited` with the Thing stored. Any other field of `cited` is read only by a storage policy, as testimony.
 * `modelkind` says which kind of Thing both are.
 */
export type WriteAsk<RecordT extends Thing = Thing> = Extract<BankWriteAsk | GateWriteAsk | BoxWriteAsk, { record: RecordT }>
/** A bank's three roots: the bank, its main gate and its root box. */
export type BankRoots       = Readonly<{ bank: BankThing, gate: GateThing, root: BoxThing }>
/** An ask to write a new bank's first Things in one step: the bank, its main gate and its root box. */
export type BirthBankAsk    = Readonly<Omit<Z.infer<typeof AskChecks.birthBankAsk>, keyof BankRoots> & BankRoots>
/** Any ask a vaultDB answers: a get, a list, a put or del, or a birth. */
export type AnyAsk          = GetAsk | ListAsk | WriteAsk | BirthBankAsk
/** The three puts of a bank's birth, one for each root. */
export type BirthPuts       = readonly [BankWriteAsk, GateWriteAsk, BoxWriteAsk]
/** The scope of a watch: a bank. */
export type ThingWatchScope = Readonly<Z.infer<typeof thingWatchScope>>
/** A bank's record: its Thing. */
export type BankRecord      = BankThing
/** The `world` of a vaultDB answer: the bank's record, with its main gate's Thing as `maingate`. */
export type WorldRecord     = BankRecord & Readonly<{ maingate: GateThing }>
// Unspecified for a missing or damaged row: notes/wontfix.md.
/** For each Thing an ask tracks, `'same'` if it is stored at the revseq and lifepath tracked, else the Thing stored. */
export type Tracked         = Readonly<{ bank: BankRecord | 'same', [MainGateLabelpath]: GateThing | 'same', [RootBoxLabelpath]: BoxThing | 'same' }>

/** Check a write `ask`, and its records by their kind and against each other, throwing `bad_record`. Returns it typed. */
export function checkedWriteAsk(ask: unknown): WriteAsk {
  const checked = withRecordsChecked(AskChecks.writeAsk.parse(ask))
  if ((checked.op === 'put') !== (checked.record.am === 'a')) { throw opNotOfRecord(checked) }
  checkWriteInvariants(checked)
  return checked
}

/** Check the records of `ask` by the kind its modelkind names. Its flags are already checked. */
function withRecordsChecked({ cited, record, ...flags }: Z.infer<typeof AskChecks.writeAsk>): WriteAsk {
  if (flags.modelkind === 'bank') { return { ...flags, modelkind: 'bank', cited: bankCited.parse(cited), record: bankThing.parse(record) } }
  if (flags.modelkind === 'gate') { return { ...flags, modelkind: 'gate', cited: gateCited.parse(cited), record: gateThing.parse(record) } }
  return { ...flags, modelkind: 'box', cited: boxCited.parse(cited), record: boxThing.parse(record) }
}

/** Check a birth `ask`: each of its three records, as the put {@link birthPutsOf} makes of it. Throws `bad_record`, and returns it typed. */
export function checkedBirthBankAsk(ask: unknown): BirthBankAsk {
  const parsed  = AskChecks.birthBankAsk.parse(ask)
  const checked = { ...parsed, bank: bankThing.parse(parsed.bank), gate: gateThing.parse(parsed.gate), root: boxThing.parse(parsed.root) }
  for (const put of birthPutsOf(checked)) { checkedWriteAsk(put) }
  return checked
}

/** The three puts of a bank's birth, each writing a root over the shell.
 * The bank's put returns a live bank (`passed`). The gate's and the root's put refuse over a live Thing.
 */
export function birthPutsOf({ userid, banklabel, bank, gate, root }: BirthBankAsk): BirthPuts {
  const flags = { userid, banklabel, op: 'put', ifAbsent: 'add', ifPresent: 'fail' } as const
  return [
    { ...flags, labelpath: 'bank', modelkind: 'bank', cited: ShellCited, record: bank, ifPresent: 'get' },
    { ...flags, labelpath: 'gate', modelkind: 'gate', cited: ShellCited, record: gate },
    { ...flags, labelpath: 'box',  modelkind: 'box',  cited: ShellCited, record: root },
  ]
}

/** Refuse a write whose record does not follow from the Thing it cites. */
function checkWriteInvariants(ask: WriteAsk): void {
  const { cited, record, userid, banklabel, labelpath } = ask
  if (record.revseq !== cited.revseq + 1)                                                           { throw revseqNotNext(ask) }
  if ((record.revtok === cited.revtok) || (record.revtok === SX.VoidRevisionTok))                   { throw revtokNotNew(ask) }
  if (! Validator.isConsistent(record, { userid, banklabel, labelpath }))                           { throw recordOfOtherScope(ask) }
  if ((record.am === 'x') && (cited.am === 'x'))                                                    { throw tombstoneOverTombstone(ask) }
  if (leadingLifeseqsOf(record.lifepath) !== leadingLifeseqsOf(cited.lifepath))                     { throw lifepathNotKept(ask) }
  const isLifeFlipped = (record.am !== cited.am)
  if (lifenumOfLifeseq(record.lifeseq) !== lifenumOfLifeseq(lifeseqOfLifepath(cited.lifepath)) + (isLifeFlipped ? 1 : 0)) { throw lifeseqNotNext(ask) }
  // A live record over a live one keeps the stored born_at: the store checks that, against the Thing it has.
  if (isLifeFlipped && (record.am === 'a') && (record.born_at !== record.written_at))               { throw bornAtNotNow(ask) }
  if ((ask.modelkind === 'gate') && ask.options?.policies.includes('replace_passphrase') && (ask.cited.wayins?.main === undefined)) { throw testimonyMissing(ask) }
}
// --

// == [Ask builders]: GetAskDraft, ListAskDraft, PutAskDraft, DelAskDraft, getAskOf, listAskOf, putAskOf, delAskOf, scopeGiven, trackGiven, modelkindGiven
// The one place an ask's flags are defaulted. A builder fills in the op, the modelkind and the default flags, and checks
// nothing: what it was given that is wrong goes through as given, for the verb's checks to refuse in its answer.

/** The storage policies a write names. */
type ThingOptions = Readonly<Z.infer<typeof AskChecks.thingOptions>>

/** The draft of a get ask: a Thing's scope, its `ifAbsent` (default `'nil'`), and what its sender tracks.
 * {@link getAskOf} fills in what it leaves out, to make the {@link GetAsk}.
 */
export type GetAskDraft  = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track?: Track }>
/** The draft of a list ask: the parent's scope, its `ifAbsent` (default `'fail'`), and what its sender tracks.
 * {@link listAskOf} fills in what it leaves out, to make the {@link ListAsk}.
 */
export type ListAskDraft = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track?: Track }>
/** The draft of a put ask: the records, the flags (default `ifAbsent: 'add'`, `ifPresent: 'repl'`), the storage policies, and what its sender tracks.
 * {@link putAskOf} fills in what it leaves out, to make the {@link WriteAsk}.
 */
export type PutAskDraft<RecordT extends Thing = Thing> = Readonly<{
  cited: CitedOf<RecordT>, record: RecordT, ifAbsent?: EX.PutIfAbsent, ifPresent?: EX.IfPresent, options?: ThingOptions, track?: Track,
}>
/** The draft of a del ask: the records, and what its sender tracks.
 * A del's flags are fixed, so the draft has none; {@link delAskOf} fills them in to make the {@link WriteAsk}.
 */
export type DelAskDraft<RecordT extends Thing = Thing> = Readonly<{ cited: CitedOf<RecordT>, record: RecordT, track?: Track }>

/** The get ask for the Thing at `ask`'s scope. */
export function getAskOf(ask: GetAskDraft): GetAsk {
  if (! CX.isPlainBag(ask)) { return ask }
  const { userid, banklabel, labelpath, ifAbsent = 'nil', track } = ask
  return { userid, banklabel, labelpath, op: 'get', modelkind: modelkindGiven(labelpath), ifAbsent, ...trackGiven(track) } as GetAsk
}

/** The list ask for the children of the Thing at `ask`'s scope. */
export function listAskOf(ask: ListAskDraft): ListAsk {
  if (! CX.isPlainBag(ask)) { return ask }
  const { userid, banklabel, labelpath, ifAbsent = 'fail', track } = ask
  return { userid, banklabel, labelpath, op: 'list', modelkind: modelkindGiven(labelpath), ifAbsent, ...trackGiven(track) } as ListAsk
}

/** The put ask writing `ask.record` over `ask.cited`, at the record's scope. */
export function putAskOf<RecordT extends Thing>(ask: PutAskDraft<RecordT>): WriteAsk<RecordT> {
  if (! CX.isPlainBag(ask)) { return ask }
  const { ifAbsent = 'add', ifPresent = 'repl', ...given } = ask
  const scope = scopeGiven(ask.record)
  // A field the put does not accept goes through, for the verb's strict check to refuse.
  return { ...given, ...scope, op: 'put', modelkind: modelkindGiven(scope.labelpath), ifAbsent, ifPresent } as unknown as WriteAsk<RecordT>
}

/** The del ask writing the tombstone `ask.record` over `ask.cited`, at the record's scope. */
export function delAskOf<RecordT extends Thing>(ask: DelAskDraft<RecordT>): WriteAsk<RecordT> {
  if (! CX.isPlainBag(ask)) { return ask }
  const scope = scopeGiven(ask.record)
  // A field the del does not accept goes through, for the verb's strict check to refuse.
  return { ...ask, ...scope, op: 'del', modelkind: modelkindGiven(scope.labelpath), ifAbsent: 'fail', ifPresent: 'repl' } as unknown as WriteAsk<RecordT>
}

/** The scope fields of `record`, as given: none when it is not a bag. */
function scopeGiven(record: unknown): Partial<Record<keyof ThingScope, unknown>> {
  if (! CX.isPlainBag(record)) { return {} }
  const { userid, banklabel, labelpath } = record
  return { userid, banklabel, labelpath }
}

/** The track given, as a field to spread into an ask: none when none is given. */
function trackGiven(track: unknown): { track?: unknown } { return (track === undefined) ? {} : { track } }

/** The modelkind `labelpath` starts with, or undefined when it is not a string. */
function modelkindGiven(labelpath: unknown): Thingkind | undefined { return (typeof labelpath === 'string') ? modelkindOf(labelpath) : undefined }
// --

// == [Loggable asks]: loggableAsk, LoggableAsk, loggableAskOf

/** The part of an ask that is safe to log: its scope, its flags, and what each record cites, never a gate's wayins.
 * Each field is optional, so a refusal of a malformed ask still carries the sound part of it.
 */
export const loggableAsk = Validator.objStrip(({ obj, arr, oneof, user_id, label }) => {
  const citedFields = thingCited.partial()
  const trackFields = obj({ revseq: thingRecord.shape.revseq, lifepath: thingRecord.shape.lifepath }).partial()
  return {
    op:        oneof(['get', 'list', 'put', 'del', 'birth']).optional(),
    modelkind: oneof(thingkindVals).optional(),
    userid:    user_id.optional(),
    banklabel: label.optional(),
    labelpath: thingScope.shape.labelpath.optional(),
    ifAbsent:  SX.anyIfAbsent.optional(),
    ifPresent: SX.ifPresent.optional(),
    options:   obj({ policies: arr(oneof(EX.storagePolicyVals)) }).optional(),
    cited:     citedFields.optional(),
    record:    citedFields.optional(),
    bank:      citedFields.optional(),
    gate:      citedFields.optional(),
    root:      citedFields.optional(),
    track:     obj({ bank: trackFields, [MainGateLabelpath]: trackFields, [RootBoxLabelpath]: trackFields }).partial().optional(),
  }
}, 'bad_record')

/** The part of a vaultDB ask that is safe to log. */
export type LoggableAsk = Readonly<Z.infer<typeof loggableAsk>>

/** The loggable part of `ask`, or `{}` for an ask that does not parse. */
export function loggableAskOf(ask: unknown): LoggableAsk {
  const parsed = loggableAsk.safeParse(ask)
  return parsed.success ? parsed.data : {}
}
// --

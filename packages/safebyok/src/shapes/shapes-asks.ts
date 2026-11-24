/** The asks a vaultDB is given: their checks, their builders, and the loggable part of each. */

import type * as Z from 'zod'
import { CX, EX, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type Lifetok, Labelpath, Lifeseq } from './primitives'
import {
  type BankRecord, type BoxRecord, type GateRecord, type ThingCited, type ThingRecord, type ThingScope, type Thingkind,
  PerKindChecks, Shell, ThingChecks, policiesByModelkind,
} from './shapes-thing'
import * as Throwers from '../refusals/throwers'

// == [Asks]: RawChecks, loggableAsk, AskChecks, Track, GetAsk, ListAsk, WriteAsk, BirthBankAsk, BankRoots, ThingWatchScope, WorldRecord, checkedWriteAsk, checkedBirthBankAsk, birthPutsOf, checkWriteInvariants

type Kinded   = { modelkind: Thingkind, labelpath: Labelpath }
type Flagged  = Kinded & { op: string, ifAbsent: string, ifPresent: string, options?: { policies: readonly EX.StoragePolicy[] } | undefined }

/** True when an ask's modelkind is its labelpath's. */
function isModelkindOwn({ modelkind, labelpath }: Kinded): boolean { return Labelpath.modelkindOf(labelpath) === modelkind }
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
const RawChecks = Validator.Checkers('bad_record', ({ obj, arr, lit, unk, oneof, label, user_id, fn }) => {
  const modelkind       = oneof(ThingChecks.thingkindVals)
  const thingWatchScope = ThingChecks.thingScope.pick({ userid: true, banklabel: true })
  const thingOptions    = obj({
    /** The storage policies the write must meet, each over the Thing stored. */
    policies: arr(oneof(EX.storagePolicyVals)),
  }).strict()
  const trackPair       = obj({ revseq: ThingChecks.sparse.shape.revseq, lifepath: ThingChecks.sparse.shape.lifepath }).strict()
  const trackShape      = obj({ bank: trackPair, [Labelpath.MainGate]: trackPair, [Labelpath.RootBox]: trackPair }).strict()
  const track           = trackShape.optional()
  // The sender's, not the datastore's: a vaultDB neither compares it with the bank stored nor refuses on it.
  const banktok         = PerKindChecks.storedLifetok.shape.lifetok.optional()
  return {
    thingOptions,
    trackShape,
    getAsk:          ThingChecks.thingScope.extend({ op: lit('get'), modelkind, ifAbsent: SX.ifAbsent, track, banktok }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    listAsk:         ThingChecks.thingScope.extend({ op: lit('list'), modelkind, ifAbsent: SX.ifAbsent, track, banktok }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    writeAsk:        ThingChecks.thingScope.extend({
      op: oneof(['put', 'del']), modelkind, cited: unk, record: unk, ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, options: thingOptions.optional(), track, banktok,
    }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn)
      .refine(isDelFixed,     Phrases.DelFlagsFixed)
      .refine(isPolicyOwn,    Phrases.PolicyNotOwn),
    birthBankAsk:    obj({ userid: user_id, banklabel: label, op: lit('birth'), bank: unk, gate: unk, root: unk, track, banktok }).strict(),
    thingWatchScope,
    watchArgs:       obj({ scope: thingWatchScope, onNotice: fn(), onBadNews: fn() }),
  }
})

/** The part of an ask that is safe to log: its scope, its flags, and what each record cites, never a gate's wayins.
 * Each field is optional, so a refusal of a malformed ask still carries the sound part of it.
 */
const loggableAsk = Validator.objStrip(({ obj, arr, oneof, user_id, label }) => {
  const citedFields = ThingChecks.thingCited.partial()
  const trackFields = obj({ revseq: ThingChecks.sparse.shape.revseq, lifepath: ThingChecks.sparse.shape.lifepath }).partial()
  return {
    op:        oneof(['get', 'list', 'put', 'del', 'birth']).optional(),
    modelkind: oneof(ThingChecks.thingkindVals).optional(),
    userid:    user_id.optional(),
    banklabel: label.optional(),
    labelpath: ThingChecks.thingScope.shape.labelpath.optional(),
    ifAbsent:  SX.anyIfAbsent.optional(),
    ifPresent: SX.ifPresent.optional(),
    options:   obj({ policies: arr(oneof(EX.storagePolicyVals)) }).optional(),
    cited:     citedFields.optional(),
    record:    citedFields.optional(),
    bank:      citedFields.optional(),
    gate:      citedFields.optional(),
    root:      citedFields.optional(),
    track:     obj({ bank: trackFields, [Labelpath.MainGate]: trackFields, [Labelpath.RootBox]: trackFields }).partial().optional(),
    banktok:   PerKindChecks.storedLifetok.shape.lifetok.optional(),
  }
}, 'bad_record')

/** The checks of a vaultDB ask, its records aside, of a watch's scope and handlers, and of the part of an ask that is safe to log.
 * A write or birth ask's records are checked by {@link checkedWriteAsk} and {@link checkedBirthBankAsk}.
 * Any ask may carry `banktok`, the lifetok its sender has of the bank's life: a vaultDB checks its shape, and nothing more.
 */
export const AskChecks = Object.freeze({ ...RawChecks, loggableAsk })

/** The revseq and lifepath the ask's sender has of its bank, its main gate and its root box. The answer's `tracked` says, for each, whether it is still the one stored. */
export type Track           = Readonly<Z.infer<typeof AskChecks.trackShape>>
/** An ask for the Thing at its scope. */
export type GetAsk          = Readonly<Z.infer<typeof AskChecks.getAsk>>
/** An ask for the children of the Thing at its scope. Its `ifAbsent` is the parent's. */
export type ListAsk         = Readonly<Z.infer<typeof AskChecks.listAsk>>
// Any other field may be undefined, as a Thing's body is over the shell or a sparse tombstone, so that a Thing may be cited as it stands.
/** A write's citation of a Thing of `RecordT`'s kind: {@link ThingCited}, and optionally any other of its fields. */
export type CitedOf<RecordT extends ThingRecord> = ThingCited & { [FieldT in Exclude<keyof RecordT, keyof ThingCited>]?: RecordT[FieldT] | undefined }
/** The flags of a write ask, its modelkind and records aside. */
export type WriteAskFlags = Readonly<Omit<Z.infer<typeof AskChecks.writeAsk>, 'modelkind' | 'cited' | 'record'>>
/** A write ask of the bank: see {@link WriteAsk}. */
export type BankWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'bank', cited: CitedOf<BankRecord>, record: BankRecord }>
/** A write ask of a gate: see {@link WriteAsk}. */
export type GateWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'gate', cited: CitedOf<GateRecord>, record: GateRecord }>
/** A write ask of a box: see {@link WriteAsk}. */
export type BoxWriteAsk  = WriteAskFlags & Readonly<{ modelkind: 'box',  cited: CitedOf<BoxRecord>,  record: BoxRecord }>
/** An ask to write `record` over the Thing it `cited`: a `put` of a live record, or a `del` with a tombstone. With no `RecordT`, a write of any kind.
 * The store compares the {@link ThingCited} fields of `cited` with the Thing stored. Any other field of `cited` is read only by a storage policy, as testimony.
 * `modelkind` says which kind of Thing both are.
 */
export type WriteAsk<RecordT extends ThingRecord = ThingRecord> = Extract<BankWriteAsk | GateWriteAsk | BoxWriteAsk, { record: RecordT }>
/** A bank's three roots: the bank, its main gate and its root box. */
export type BankRoots       = Readonly<{ bank: BankRecord, gate: GateRecord, root: BoxRecord }>
/** An ask to write a new bank's first Things in one step: the bank, its main gate and its root box. */
export type BirthBankAsk    = Readonly<Omit<Z.infer<typeof AskChecks.birthBankAsk>, keyof BankRoots> & BankRoots>
/** Any ask a vaultDB answers: a get, a list, a put or del, or a birth. */
export type AnyAsk          = GetAsk | ListAsk | WriteAsk | BirthBankAsk
/** The three puts of a bank's birth, one for each root. */
export type BirthPuts       = readonly [BankWriteAsk, GateWriteAsk, BoxWriteAsk]
/** The scope of a watch: a bank. */
export type ThingWatchScope = Readonly<Z.infer<typeof AskChecks.thingWatchScope>>
/** The `world` of a vaultDB answer: the bank's record, with its main gate's Thing as `maingate`. */
export type WorldRecord     = BankRecord & Readonly<{ maingate: GateRecord }>
// Unspecified for a missing or damaged row: notes/wontfix.md.
/** For each Thing an ask tracks, `'same'` if it is stored at the revseq and lifepath tracked, else the Thing stored. */
export type Tracked         = Readonly<{ bank: BankRecord | 'same', [Labelpath.MainGate]: GateRecord | 'same', [Labelpath.RootBox]: BoxRecord | 'same' }>

/** Check a write `ask`, and its records by their kind and against each other, throwing `bad_record`. Returns it typed. */
export function checkedWriteAsk(ask: unknown): WriteAsk {
  const writeAsk = withRecordsChecked(AskChecks.writeAsk.parse(ask))
  if ((writeAsk.op === 'put') !== (writeAsk.record.am === 'a')) { throw Throwers.opNotOfRecord(writeAsk) }
  checkWriteInvariants(writeAsk)
  return writeAsk
}

/** Check the records of `ask` by the kind its modelkind names. Its flags are already checked. */
function withRecordsChecked({ cited, record, ...flags }: Z.infer<typeof AskChecks.writeAsk>): WriteAsk {
  if (flags.modelkind === 'bank') { return { ...flags, modelkind: 'bank', cited: PerKindChecks.bankCited.parse(cited), record: PerKindChecks.bankThing.parse(record) } }
  if (flags.modelkind === 'gate') { return { ...flags, modelkind: 'gate', cited: PerKindChecks.gateCited.parse(cited), record: PerKindChecks.gateThing.parse(record) } }
  return { ...flags, modelkind: 'box', cited: PerKindChecks.boxCited.parse(cited), record: PerKindChecks.boxThing.parse(record) }
}

/** Check a birth `ask`: each of its three records, as the put {@link birthPutsOf} makes of it. Throws `bad_record`, and returns it typed. */
export function checkedBirthBankAsk(ask: unknown): BirthBankAsk {
  const { bank, gate, root, ...flags } = AskChecks.birthBankAsk.parse(ask)
  const birthBankAsk = { ...flags, bank: PerKindChecks.bankThing.parse(bank), gate: PerKindChecks.gateThing.parse(gate), root: PerKindChecks.boxThing.parse(root) }
  for (const put of birthPutsOf(birthBankAsk)) { checkedWriteAsk(put) }
  return birthBankAsk
}

/** The three puts of a bank's birth, each writing a root over the shell.
 * The bank's put returns a live bank (`passed`). The gate's and the root's put refuse over a live Thing.
 */
export function birthPutsOf({ userid, banklabel, bank, gate, root }: BirthBankAsk): BirthPuts {
  const flags = { userid, banklabel, op: 'put', ifAbsent: 'add', ifPresent: 'fail' } as const
  return [
    { ...flags, labelpath: 'bank', modelkind: 'bank', cited: Shell.Cited, record: bank, ifPresent: 'get' },
    { ...flags, labelpath: 'gate', modelkind: 'gate', cited: Shell.Cited, record: gate },
    { ...flags, labelpath: 'box',  modelkind: 'box',  cited: Shell.Cited, record: root },
  ]
}

/** Refuse a write whose record does not follow from the Thing it cites. */
function checkWriteInvariants(ask: WriteAsk): void {
  const { cited, record, userid, banklabel, labelpath } = ask
  if (record.revseq !== cited.revseq + 1)                                                           { throw Throwers.revseqNotNext(ask) }
  if ((record.revtok === cited.revtok) || (record.revtok === SX.VoidRevisionTok))                   { throw Throwers.revtokNotNew(ask) }
  if (! Validator.isConsistent(record, { userid, banklabel, labelpath }))                           { throw Throwers.recordOfOtherScope(ask) }
  if ((record.am === 'x') && (cited.am === 'x'))                                                    { throw Throwers.tombstoneOverTombstone(ask) }
  if (Lifeseq.leadingOf(record.lifepath) !== Lifeseq.leadingOf(cited.lifepath))                     { throw Throwers.lifepathNotKept(ask) }
  const isLifeFlipped = (record.am !== cited.am)
  if (Lifeseq.lifenumOf(record.lifeseq) !== Lifeseq.lifenumOf(Lifeseq.ofLifepath(cited.lifepath)) + (isLifeFlipped ? 1 : 0)) { throw Throwers.lifeseqNotNext(ask) }
  // A live record over a live one leaves the stored born_at unchanged: AdapterVaultDB checks that, against the Thing it has.
  if (isLifeFlipped && (record.am === 'a') && (record.born_at !== record.written_at))               { throw Throwers.bornAtNotNow(ask) }
  if ((ask.modelkind === 'gate') && ask.options?.policies.includes('replace_passphrase') && (ask.cited.wayins?.main === undefined)) { throw Throwers.testimonyMissing(ask) }
}
// --

// == [Ask builders]: GetAskDraft, ListAskDraft, PutAskDraft, DelAskDraft, getAskOf, listAskOf, putAskOf, delAskOf, scopeGiven, optionalsGiven, modelkindGiven
// The one place an ask's flags are defaulted. A builder fills in the op, the modelkind and the default flags, and checks
// nothing: what it was given that is wrong goes through as given, for the verb's checks to refuse in its answer.

/** The storage policies a write names. */
export type ThingOptions = Readonly<Z.infer<typeof AskChecks.thingOptions>>

/** The draft of a get ask: a Thing's scope, its `ifAbsent` (default `'nil'`), and what its sender tracks and has of the bank's life.
 * {@link getAskOf} fills in what it leaves out, to make the {@link GetAsk}.
 */
export type GetAskDraft  = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track?: Track, banktok?: Lifetok }>
/** The draft of a list ask: the parent's scope, its `ifAbsent` (default `'fail'`), and what its sender tracks and has of the bank's life.
 * {@link listAskOf} fills in what it leaves out, to make the {@link ListAsk}.
 */
export type ListAskDraft = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track?: Track, banktok?: Lifetok }>
/** The draft of a put ask: the records, the flags (default `ifAbsent: 'add'`, `ifPresent: 'repl'`), the storage policies, and what its sender tracks and has of the bank's life.
 * {@link putAskOf} fills in what it leaves out, to make the {@link WriteAsk}.
 */
export type PutAskDraft<RecordT extends ThingRecord = ThingRecord> = Readonly<{
  cited: CitedOf<RecordT>, record: RecordT, ifAbsent?: EX.PutIfAbsent, ifPresent?: EX.IfPresent, options?: ThingOptions, track?: Track, banktok?: Lifetok,
}>
/** The draft of a del ask: the records, and what its sender tracks and has of the bank's life.
 * A del's flags are fixed, so the draft has none; {@link delAskOf} fills them in to make the {@link WriteAsk}.
 */
export type DelAskDraft<RecordT extends ThingRecord = ThingRecord> = Readonly<{ cited: CitedOf<RecordT>, record: RecordT, track?: Track, banktok?: Lifetok }>

/** The get ask for the Thing at `ask`'s scope. */
export function getAskOf(ask: GetAskDraft): GetAsk {
  if (! CX.isPlainBag(ask)) { return ask }
  const { userid, banklabel, labelpath, ifAbsent = 'nil', track, banktok } = ask
  return { userid, banklabel, labelpath, op: 'get', modelkind: modelkindGiven(labelpath), ifAbsent, ...optionalsGiven({ track, banktok }) } as GetAsk
}

/** The list ask for the children of the Thing at `ask`'s scope. */
export function listAskOf(ask: ListAskDraft): ListAsk {
  if (! CX.isPlainBag(ask)) { return ask }
  const { userid, banklabel, labelpath, ifAbsent = 'fail', track, banktok } = ask
  return { userid, banklabel, labelpath, op: 'list', modelkind: modelkindGiven(labelpath), ifAbsent, ...optionalsGiven({ track, banktok }) } as ListAsk
}

/** The put ask writing `ask.record` over `ask.cited`, at the record's scope. */
export function putAskOf<RecordT extends ThingRecord>(ask: PutAskDraft<RecordT>): WriteAsk<RecordT> {
  if (! CX.isPlainBag(ask)) { return ask }
  const { ifAbsent = 'add', ifPresent = 'repl', ...given } = ask
  const scope = scopeGiven(ask.record)
  // A field the put does not accept goes through, for the verb's strict check to refuse.
  return { ...given, ...scope, op: 'put', modelkind: modelkindGiven(scope.labelpath), ifAbsent, ifPresent } as unknown as WriteAsk<RecordT>
}

/** The del ask writing the tombstone `ask.record` over `ask.cited`, at the record's scope. */
export function delAskOf<RecordT extends ThingRecord>(ask: DelAskDraft<RecordT>): WriteAsk<RecordT> {
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

/** The fields of `given` that are not undefined, to spread into an ask. */
function optionalsGiven(given: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(given).filter(([, val]) => val !== undefined))
}

/** The modelkind `labelpath` starts with, or undefined when it is not a string. */
function modelkindGiven(labelpath: unknown): Thingkind | undefined { return (typeof labelpath === 'string') ? Labelpath.modelkindOf(labelpath) : undefined }
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

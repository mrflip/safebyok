/** The shapes of a Thing, the record every kind is stored as in a vaultDB, and of the asks a vaultDB is asked. */

import { pick } from 'es-toolkit'
import type * as Z from 'zod'
import { exactOptional } from 'zod'
import { BX, type Consts, CX, EX, Errors, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'

// == [Lifeseqs]: ShellLifeseq, ShellLifepath, lifeseqOf, seqOfLifeseq, isGoneLifeseq, lifeseqOfLifepath, leadingLifeseqsOf

/** How many base-32 digits a stored lifeseq has. */
const LifeseqDigits = 10

/** The shell's lifeseq, life -1: never stored, so the one lifeseq that is not 10 digits. */
export const ShellLifeseq = '-1'
/** A root's shell lifepath: the shell's lifeseq alone. */
export const ShellLifepath = ShellLifeseq

/** The lifeseq of life `seq`: its base-32 digits, `0-9a-v`, padded to 10, so that lifeseqs sort as their lives do. */
export function lifeseqOf(seq: number): string { return seq.toString(32).padStart(LifeseqDigits, '0') }

/** The life `lifeseq` names: -1 for the shell's. */
export function seqOfLifeseq(lifeseq: string): number { return Number.parseInt(lifeseq, 32) }

/** True when `lifeseq` is a tombstone's: an odd life, the shell's among them. */
export function isGoneLifeseq(lifeseq: string): boolean { return Math.abs(seqOfLifeseq(lifeseq) % 2) === 1 }

/** The Thing's own lifeseq: the last of its lifepath. */
export function lifeseqOfLifepath(lifepath: string): string { return lifepath.slice(lifepath.lastIndexOf('/') + 1) }

/** The lifeseqs of a Thing's ancestors: its lifepath less its own lifeseq, `''` for a root. */
function leadingLifeseqsOf(lifepath: string): string { return lifepath.slice(0, Math.max(0, lifepath.lastIndexOf('/'))) }
// --

// == [Kinds]: thingkindVals, Thingkind, BankThingFormat, GateThingFormat, BoxThingFormat, MainGateLabelpath, modelkindOf, isLabelpathOfKind

/** The kinds of Thing: the modelkind at the base of each labelpath. */
export const thingkindVals = ['bank', 'gate', 'box'] as const satisfies readonly Consts.Modelkind[]
/** A kind of Thing, one of {@link thingkindVals}. */
export type Thingkind = typeof thingkindVals[number]

/** The `fmt` of the bank's Thing: its own, so that it is never read as big's bank row (3001). */
export const BankThingFormat = 3101
/** The `fmt` of a gate's Thing: its own, so that it is never read as big's gate row (4001). */
export const GateThingFormat = 4101
/** The `fmt` of a box's Thing: its own, so that it is never read as big's box row (5003). */
export const BoxThingFormat = 5103

/** Where the main gate is stored in its bank, and its key in a `track`. */
export const MainGateLabelpath = 'gate'

/** How many labels each kind's labelpath has under its root: none under the bank, one under the main gate or the root box. */
const MaxLabelsUnder = { bank: 0, gate: 1, box: 1 } as const satisfies Record<Thingkind, number>

/** The modelkind a sound labelpath starts with. */
export function modelkindOf(labelpath: string): Thingkind { return labelpath.split('/', 1)[0] as Thingkind }

/** True when `labelpath` is one of `modelkind`'s: the modelkind, then as many labels as the kind nests, each after a `/`. */
export function isLabelpathOfKind(labelpath: string, modelkind: Thingkind): boolean {
  const [head, ...labels] = labelpath.split('/')
  return (head === modelkind) && (labels.length <= MaxLabelsUnder[modelkind]) && labels.every((label) => Validator.Kit.label.safeParse(label).success)
}

/** True when `labelpath` is one of some kind of Thing's. */
function isLabelpath(labelpath: string): boolean { return thingkindVals.some((modelkind) => isLabelpathOfKind(labelpath, modelkind)) }
// --

// == [Thing]: thingScope, thingCited, thingRecord, sealed, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSparse, Sealed, Sparse, BoxSparse, sparseOf, ShellCited, childShellCited

const LifeseqPattern       = /^[0-9a-v]{10}$/
const LifepathPattern      = /^[0-9a-v]{10}(?:\/[0-9a-v]{10})*$/
const ShellLifepathPattern = /^(?:[0-9a-v]{10}\/)*-1$/

type Labelled = { labelpath: string, label: string }
type Lived    = { lifepath: string, am: string }
type Revised  = { revtok: string, revseq: number, lifepath: string }

/** True when a Thing's label is the last segment of its labelpath, a root's its modelkind. */
function isLabelLast({ labelpath, label }: Labelled): boolean { return labelpath.slice(labelpath.lastIndexOf('/') + 1) === label }
/** True when a Thing's lifeseq is the last of its lifepath. */
function isLifeseqOwn({ lifepath, lifeseq }: Lived & { lifeseq: string }): boolean { return lifeseqOfLifepath(lifepath) === lifeseq }
/** True when a Thing's lifepath has one lifeseq for each segment of its labelpath. */
function isLifepathDeep({ lifepath, labelpath }: Lived & Labelled): boolean { return lifepath.split('/').length === labelpath.split('/').length }
/** True when a Thing's own lifeseq is odd exactly when it is a tombstone. */
function isParityRight({ am, lifepath }: Lived): boolean { return (am === 'x') === isGoneLifeseq(lifeseqOfLifepath(lifepath)) }
/** True unless the Thing is the main gate, deleted: the main gate is never deleted. */
function isMainGateLive({ labelpath, am }: Lived & Labelled): boolean { return (labelpath !== MainGateLabelpath) || (am === 'a') }
/** The fields of `shape`, each optional but never undefined, as `Partial` reads them under exactOptionalPropertyTypes. */
function exactPartialOf<ShapeT extends Z.ZodRawShape>(shape: ShapeT): { [FieldT in keyof ShapeT]: Z.ZodExactOptional<ShapeT[FieldT]> } {
  // Object.fromEntries loses the fieldnames' types: the cast restores them.
  return Object.fromEntries(Object.entries(shape).map(([fieldname, check]) => [fieldname, exactOptional(check)])) as { [FieldT in keyof ShapeT]: Z.ZodExactOptional<ShapeT[FieldT]> }
}

/** True when a citation is the shell in all three of its marks, or in none. */
function isShellWhole({ revtok, revseq, lifepath }: Revised): boolean {
  const isShell = (revseq === SX.VoidRevisionSeq)
  return (isShell === (revtok === SX.VoidRevisionTok)) && (isShell === (lifeseqOfLifepath(lifepath) === ShellLifeseq))
}

/** The checks of a Thing's fields, and of each kind as a Thing, as proposed and as cited. */
export const { thingScope, thingCited, thingRecord, sealed, wayins, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSparse } = Validator.Checkers('bad_record', ({ obj, str, int, uint, lit, union, discrim, user_id, label, epochMillis }) => {
  const labelpath    = str.refine(isLabelpath, Phrases.LabelpathShape)
  const lifeseq      = str.regex(LifeseqPattern, Phrases.LifeseqShape)
  const lifepath     = str.regex(LifepathPattern, Phrases.LifepathShape)
  const am           = SX.am.exclude(['d'])
  const thingScope   = obj({ userid: user_id, banklabel: label, labelpath })
  const revisioned   = { revtok: str.min(1), revseq: uint, am, lifeseq, lifepath, born_at: epochMillis, written_at: epochMillis }
  // Just what the act tables compare. A write may cite the shell, so its revseq and life may be the shell's -1.
  const thingCited   = obj({
    revtok:   revisioned.revtok,
    revseq:   int.min(SX.VoidRevisionSeq),
    am,
    lifepath: union([lifepath, str.regex(ShellLifepathPattern, Phrases.LifepathShape)]),
  })
  const thingRecord  = obj({ ...thingScope.shape, label, fmt: uint, ...revisioned })
  const emptyBag     = obj({}).strict()
  // The store checks only the shape of a sealed part: what is inside is the sealer's.
  const sealed       = obj({
    /** The part's own key, fresh for each seal, wrapped under the bankKey. */
    key_wrapped:    CX.ciphered,
    /** The cleartext, ciphered under the part's key. */
    ciphered:       CX.ciphered,
    /** How the cleartext was turned into text before it was ciphered. */
    codectag:       label,
    /** The tag for the schema of the cleartext. */
    schematag:      label,
  }).strict()
  // A record has no optional part: a gate with no passkey has `passkey0: null`.
  const wayins       = obj({ main: BX.wayins.shape.main, passkey0: BX.wayins.shape.passkey0.unwrap().nullable() }).strict()

  // A stored record is strict: a field this version does not know is damage, or a newer format.
  const bankBase     = obj({
    ...thingRecord.shape,
    labelpath:      lit('bank'),
    label:          lit('bank'),
    fmt:            lit(BankThingFormat),
  }).strict()
  const gateBase     = obj({
    ...thingRecord.shape,
    labelpath:      labelpath.refine((given) => isLabelpathOfKind(given, 'gate'), Phrases.LabelpathOfOtherKind),
    fmt:            lit(GateThingFormat),
    wayins,
    /** Reserved: always empty, and read by nothing. */
    auth:           emptyBag,
    /** Reserved: always empty, and read by nothing. */
    sigs:           emptyBag,
    /** Reserved: always empty, and read by nothing. */
    meta:           emptyBag,
  }).strict()
  const boxLive      = obj({
    ...thingRecord.shape,
    labelpath:      labelpath.refine((given) => isLabelpathOfKind(given, 'box'), Phrases.LabelpathOfOtherKind),
    fmt:            lit(BoxThingFormat),
    am:             lit('a'),
    sidecar:        CX.sidecar,
    whisper_sealed: sealed,
  }).strict()
  // A tombstone seals an empty whisper, and has no sidecar.
  const boxGone      = obj({ ...boxLive.omit({ sidecar: true }).shape, am: lit('x') }).strict()

  const bankThing    = bankBase
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const gateThing    = gateBase
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isMainGateLive, Phrases.MainGateDeleted)
  const boxThing     = discrim('am', [boxLive, boxGone])
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A citation must carry what ThingCited names; any other field of its kind it carries must check.
  const bankCited    = obj({ ...exactPartialOf(bankBase.shape), ...thingCited.shape }).strict()
    .refine(isShellWhole,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const gateCited    = obj({ ...exactPartialOf(gateBase.shape), ...thingCited.shape }).strict()
    .refine(isShellWhole,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  // A box's shell, as a bank gives it, carries the shell's lifeseq.
  const lifeseqOrShell = union([lifeseq, lit(ShellLifeseq)])
  const boxCited     = obj({ ...exactPartialOf(boxLive.shape), lifeseq: exactOptional(lifeseqOrShell), ...thingCited.shape }).strict()
    .refine(isShellWhole,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A shape made of a record's fields strips. The shell has no record, so its revseq, lifeseq and lifepath may be its -1.
  const boxSparse    = obj({
    ...thingRecord.shape,
    labelpath:      boxLive.shape.labelpath,
    fmt:            lit(BoxThingFormat),
    revseq:         thingCited.shape.revseq,
    lifeseq:        lifeseqOrShell,
    lifepath:       thingCited.shape.lifepath,
  })
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isShellWhole,   Phrases.SparseHalfShell)
  return { thingScope, thingCited, thingRecord, sealed, wayins, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSparse }
})

/** Where a Thing is stored: its user, its bank, and its labelpath under the bank. */
export type ThingScope   = Readonly<Z.infer<typeof thingScope>>
/** What a write cites of the Thing it expects to find, the shell's included: its revision, its life and its liveness, just what the store compares. */
export type ThingCited   = Readonly<Z.infer<typeof thingCited>>
/** The fields every kind of Thing has, which the store reads. The rest of a record is its body. */
export type ThingRecord  = Readonly<Z.infer<typeof thingRecord>>
/** The bank, as a Thing. */
export type BankThing    = Readonly<Z.infer<typeof bankThing>>
/** A gate, as a Thing: the main gate, at `gate`. */
export type GateThing    = Readonly<Z.infer<typeof gateThing>>
/** A box, as a Thing: live, with its sidecar and sealed whisper, or a tombstone, with a sealed empty whisper. */
export type BoxThing     = Readonly<Z.infer<typeof boxThing>>
/** Any Thing stored in a vaultDB. */
export type Thing        = BankThing | GateThing | BoxThing
/** One sealed part of a record, at `<part>_sealed`: a fresh key wrapped under the bankKey, the cleartext ciphered under that key, and the tags its unseal reads. */
export type Sealed       = Readonly<Z.infer<typeof sealed>>
/** A gate's wayins: `main`, its passphrase wayin, and `passkey0`, its passkey wayin or null for none. */
export type Wayins       = Readonly<Z.infer<typeof wayins>>
/** A box's Thing fields, without its body: live, a tombstone, or the shell. */
export type BoxSparse    = Readonly<Z.infer<typeof boxSparse>>

/** A record's Thing fields, without its body: what a listing gives of each Thing. */
export type Sparse<RecordT extends ThingRecord> = Pick<RecordT, keyof ThingRecord>

const ThingFieldnames = Object.keys(thingRecord.shape) as (keyof ThingRecord)[]

/** `record`'s Thing fields, without its body. */
export function sparseOf<RecordT extends Thing>(record: RecordT): Sparse<RecordT> { return pick(record, ThingFieldnames) }

/** What a root's birth cites: the shell, the void sentinel for no Thing stored. */
export const ShellCited: ThingCited = Object.freeze({
  revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifepath: ShellLifepath,
})

/** What the birth of a child of the Thing at `parentLifepath` cites: the shell, at the parent's lifepath then `-1`. */
export function childShellCited(parentLifepath: string): ThingCited {
  return Object.freeze({ ...ShellCited, lifepath: `${parentLifepath}/${ShellLifeseq}` })
}
// --

// == [Each kind's checks]: KindChecks, kindChecksOf

/** The checks of each kind of Thing stored in a vaultDB: the record proposed, cited and stored, and the storage policies it may name. */
export const KindChecks = {
  bank: { record: bankThing, cited: bankCited, stored: bankThing.refusingAs('damaged_row'), policies: [] },
  gate: { record: gateThing, cited: gateCited, stored: gateThing.refusingAs('damaged_row'), policies: EX.storagePolicyVals },
  box:  { record: boxThing,  cited: boxCited,  stored: boxThing.refusingAs('damaged_row'),  policies: [] },
} as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, policies: readonly EX.StoragePolicy[] }>

/** The checks of the kind of Thing at `labelpath`, a sound one. */
export function kindChecksOf(labelpath: string): typeof KindChecks[Thingkind] { return KindChecks[modelkindOf(labelpath)] }
// --

// == [Asks]: AskChecks, Track, GetThingAsk, ListThingsAsk, WriteThingAsk, BirthBankAsk, BankRoots, ThingWatchScope, BankRecord, WorldRecord, checkedGetThingAsk, checkedListThingsAsk, checkedWriteThingAsk, checkedBirthBankAsk, birthPutsOf, checkWriteInvariants

type Kinded   = { modelkind: Thingkind, labelpath: string }
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

/** The checks of a vaultDB ask, its records aside, and of a watch's scope and handlers. */
const AskChecks = Validator.Checkers('bad_option', ({ obj, arr, lit, unk, oneof, label, user_id, fn }) => {
  const modelkind       = oneof(thingkindVals)
  const thingWatchScope = thingScope.pick({ userid: true, banklabel: true })
  const thingOptions    = obj({
    /** The storage policies the write must keep, each over the Thing stored. */
    policies: arr(oneof(EX.storagePolicyVals)),
  }).strict()
  const trackPair       = obj({ revseq: thingRecord.shape.revseq, lifepath: thingRecord.shape.lifepath }).strict()
  const trackShape      = obj({ bank: trackPair, [MainGateLabelpath]: trackPair }).strict()
  const track           = trackShape.optional()
  return {
    thingOptions,
    trackShape,
    getThingAsk:     thingScope.extend({ op: lit('get'), modelkind, ifAbsent: SX.ifAbsent, track }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    listThingsAsk:   thingScope.extend({ op: lit('list'), modelkind, ifAbsent: SX.ifAbsent, track }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    writeThingAsk:   thingScope.extend({
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
/** The check of a watch's scope, a bank, and of a watch's arguments. */
export const { thingWatchScope, watchArgs } = AskChecks

/** The revseq and lifepath an ask's sender holds of its bank and of its main gate. The answer's `tracked` says which of the two it holds as stored. */
export type Track           = Readonly<Z.infer<typeof AskChecks.trackShape>>
/** An ask for the Thing at its scope. */
export type GetThingAsk     = Readonly<Z.infer<typeof AskChecks.getThingAsk>>
/** An ask for the children of the Thing at its scope. Its `ifAbsent` is the parent's. */
export type ListThingsAsk   = Readonly<Z.infer<typeof AskChecks.listThingsAsk>>
/** What a write cites of a Thing of `RecordT`'s kind: what {@link ThingCited} names, and any other of its fields. */
export type CitedOf<RecordT extends Thing> = ThingCited & Partial<Omit<RecordT, keyof ThingCited>>
/** The flags of a write ask, its modelkind and records aside. */
type WriteAskFlags = Readonly<Omit<Z.infer<typeof AskChecks.writeThingAsk>, 'modelkind' | 'cited' | 'record'>>
/** A write ask of the bank: see {@link WriteThingAsk}. */
export type BankWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'bank', cited: CitedOf<BankThing>, record: BankThing }>
/** A write ask of a gate: see {@link WriteThingAsk}. */
export type GateWriteAsk = WriteAskFlags & Readonly<{ modelkind: 'gate', cited: CitedOf<GateThing>, record: GateThing }>
/** A write ask of a box: see {@link WriteThingAsk}. */
export type BoxWriteAsk  = WriteAskFlags & Readonly<{ modelkind: 'box',  cited: CitedOf<BoxThing>,  record: BoxThing }>
/** An ask to write `record` over the Thing it `cited`: `put` a live record, or `del` with a tombstone.
 * `cited` carries what {@link ThingCited} names, which the store compares with the Thing stored. Any other field of the
 * record it carries is read only by a storage policy, as testimony. Its `modelkind` narrows its records.
 */
export type WriteThingAsk = BankWriteAsk | GateWriteAsk | BoxWriteAsk
/** The write ask of `RecordT`'s kind. */
export type WriteAskOf<RecordT extends Thing> = Extract<WriteThingAsk, { record: RecordT }>
/** A bank's three roots: the bank, its main gate and its root box. */
export type BankRoots       = Readonly<{ bank: BankThing, gate: GateThing, root: BoxThing }>
/** An ask to write a new bank's first Things in one step: the bank, its main gate and its root box. */
export type BirthBankAsk    = Readonly<Omit<Z.infer<typeof AskChecks.birthBankAsk>, keyof BankRoots> & BankRoots>
/** The puts a bank's birth amounts to, one for each of its roots. */
export type BirthPuts       = readonly [BankWriteAsk, GateWriteAsk, BoxWriteAsk]
/** The scope a watch hears: a bank. */
export type ThingWatchScope = Readonly<Z.infer<typeof thingWatchScope>>
/** A bank's record: its Thing, as stored. */
export type BankRecord      = BankThing
/** The world a vaultDB answers beside a Thing: its bank's record, with its main gate's Thing as `maingate`. */
export type WorldRecord     = BankRecord & Readonly<{ maingate: GateThing }>
// Unspecified for a missing or damaged row: notes/wontfix.md.
/** What an answer says of each Thing its ask tracks: `'same'` where it is stored at the revseq and lifepath tracked, else as stored. */
export type Tracked         = Readonly<{ bank: BankRecord | 'same', [MainGateLabelpath]: GateThing | 'same' }>

/** `ask`, checked, or throw `bad_option` */
export function checkedGetThingAsk(ask: unknown): GetThingAsk { return AskChecks.getThingAsk.parse(ask) }

/** `ask`, checked, or throw `bad_option` */
export function checkedListThingsAsk(ask: unknown): ListThingsAsk { return AskChecks.listThingsAsk.parse(ask) }

/** `ask`, with its records checked by their kind and against each other, or throw `bad_option` or `bad_record` */
export function checkedWriteThingAsk(ask: unknown): WriteThingAsk {
  const checked = withRecordsChecked(AskChecks.writeThingAsk.parse(ask))
  if ((checked.op === 'put') !== (checked.record.am === 'a')) { throw opNotOfRecord(checked) }
  checkWriteInvariants(checked)
  return checked
}

/** `ask`, its flags checked, with its records checked by the kind its modelkind names. */
function withRecordsChecked({ cited, record, ...flags }: Z.infer<typeof AskChecks.writeThingAsk>): WriteThingAsk {
  if (flags.modelkind === 'bank') { return { ...flags, modelkind: 'bank', cited: bankCited.parse(cited), record: bankThing.parse(record) } }
  if (flags.modelkind === 'gate') { return { ...flags, modelkind: 'gate', cited: gateCited.parse(cited), record: gateThing.parse(record) } }
  return { ...flags, modelkind: 'box', cited: boxCited.parse(cited), record: boxThing.parse(record) }
}

/** `ask`, with each of its three records checked as the put {@link birthPutsOf} makes of it, or throw `bad_option` or `bad_record` */
export function checkedBirthBankAsk(ask: unknown): BirthBankAsk {
  const parsed  = AskChecks.birthBankAsk.parse(ask)
  const checked = { ...parsed, bank: bankThing.parse(parsed.bank), gate: gateThing.parse(parsed.gate), root: boxThing.parse(parsed.root) }
  for (const put of birthPutsOf(checked)) { checkedWriteThingAsk(put) }
  return checked
}

/** The puts a bank's birth amounts to: each root, written over the shell at its kind's root.
 * The bank's put passes over a live bank; the gate's and the root's refuse over a live Thing.
 */
export function birthPutsOf({ userid, banklabel, bank, gate, root }: BirthBankAsk): BirthPuts {
  const flags = { userid, banklabel, op: 'put', ifAbsent: 'add', ifPresent: 'fail' } as const
  return [
    { ...flags, labelpath: 'bank', modelkind: 'bank', cited: ShellCited, record: bank, ifPresent: 'get' },
    { ...flags, labelpath: 'gate', modelkind: 'gate', cited: ShellCited, record: gate },
    { ...flags, labelpath: 'box',  modelkind: 'box',  cited: ShellCited, record: root },
  ]
}

/** Refuse a write whose record does not follow from the one it cites. */
function checkWriteInvariants(ask: WriteThingAsk): void {
  const { cited, record, userid, banklabel, labelpath } = ask
  if (record.revseq !== cited.revseq + 1)                                                           { throw revseqNotNext(ask) }
  if ((record.revtok === cited.revtok) || (record.revtok === SX.VoidRevisionTok))                   { throw revtokNotNew(ask) }
  if (! Validator.isConsistent(record, { userid, banklabel, labelpath }))                           { throw recordOfOtherScope(ask) }
  if ((record.am === 'x') && (cited.am === 'x'))                                                    { throw tombstoneOverTombstone(ask) }
  if (leadingLifeseqsOf(record.lifepath) !== leadingLifeseqsOf(cited.lifepath))                     { throw lifepathNotKept(ask) }
  const isLifeFlipped = (record.am !== cited.am)
  if (seqOfLifeseq(record.lifeseq) !== seqOfLifeseq(lifeseqOfLifepath(cited.lifepath)) + (isLifeFlipped ? 1 : 0)) { throw lifeseqNotNext(ask) }
  // A live record over a live one keeps the stored born_at: the store checks that, against the Thing it has.
  if (isLifeFlipped && (record.am === 'a') && (record.born_at !== record.written_at))               { throw bornAtNotNow(ask) }
  if ((ask.modelkind === 'gate') && ask.options?.policies.includes('replace_passphrase') && (ask.cited.wayins?.main === undefined)) { throw testimonyMissing(ask) }
}
// --

// == [Write throwers]: opNotOfRecord, revseqNotNext, revtokNotNew, recordOfOtherScope, tombstoneOverTombstone, lifepathNotKept, lifeseqNotNext, bornAtNotNow, testimonyMissing
// Each refuses a write ask, and its meta carries the loggable part of the ask.

/** A `bad_option` refusal: a put's record is a tombstone, or a del's is live. */
function opNotOfRecord(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_option', Phrases.OpNotOfRecord, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's revseq is not one past the cited one's. */
function revseqNotNext(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RevseqNotNext, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's revtok is the cited one's, or the void one. */
function revtokNotNew(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RevtokNotNew, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record is not at the scope the ask names. */
function recordOfOtherScope(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RecordOfOtherScope, { meta: { ask: loggableAskOf(ask) } }) }

// A del is the only write of a tombstone, so this is the act table's dubdel, found before anything is fetched. Its refusal
// kind is the one big's act tables give dubdel.
/** An `absent_vault` refusal, act `dubdel`: a del cites a tombstone. */
function tombstoneOverTombstone(ask: WriteThingAsk): Errors.VaultError {
  return new Errors.VaultError('absent_vault', Phrases.TombstoneOverTombstone, { meta: { ask: loggableAskOf(ask), act: 'dubdel' } })
}

/** A `bad_record` refusal: the record changes a leading lifeseq of the lifepath it cites. */
function lifepathNotKept(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.LifepathNotKept, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's lifeseq is not the cited one, or the next one when am flips. */
function lifeseqNotNext(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.LifeseqNotNext, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: a birth's born_at is not its written_at. */
function bornAtNotNow(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.BornAtNotNow, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: a replace_passphrase write does not cite the gate's wayins. */
function testimonyMissing(ask: WriteThingAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.TestimonyMissing, { meta: { ask: loggableAskOf(ask) } }) }
// --

// == [Ask builders]: GetAskArgs, ListAskArgs, PutAskArgs, DelAskArgs, getAskOf, listAskOf, putAskOf, delAskOf, scopeGiven, trackGiven, modelkindGiven
// The one place an ask's flags are defaulted. A builder fills in the op, the modelkind and the default flags, and checks
// nothing: what it was given that is wrong goes through as given, for the verb's checks to refuse in its answer.

/** The storage policies a write names. */
type ThingOptions = Readonly<Z.infer<typeof AskChecks.thingOptions>>

/** The args of {@link getAskOf}: a Thing's scope, its `ifAbsent` (default `'nil'`), and what its sender tracks. */
export type GetAskArgs  = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track?: Track }>
/** The args of {@link listAskOf}: the parent's scope, its `ifAbsent` (default `'fail'`), and what its sender tracks. */
export type ListAskArgs = ThingScope & Readonly<{ ifAbsent?: EX.IfAbsent, track?: Track }>
/** The args of {@link putAskOf}: the records, the flags (default `ifAbsent: 'add'`, `ifPresent: 'repl'`), the storage policies, and what its sender tracks. */
export type PutAskArgs<RecordT extends Thing = Thing> = Readonly<{
  cited: CitedOf<RecordT>, record: RecordT, ifAbsent?: EX.PutIfAbsent, ifPresent?: EX.IfPresent, options?: ThingOptions, track?: Track,
}>
/** The args of {@link delAskOf}: the records, and what its sender tracks. Its flags are fixed. */
export type DelAskArgs<RecordT extends Thing = Thing> = Readonly<{ cited: CitedOf<RecordT>, record: RecordT, track?: Track }>

/** The get ask for the Thing at `args`'s scope. */
export function getAskOf(args: GetAskArgs): GetThingAsk {
  if (! CX.isPlainBag(args)) { return args }
  const { userid, banklabel, labelpath, ifAbsent = 'nil', track } = args
  return { userid, banklabel, labelpath, op: 'get', modelkind: modelkindGiven(labelpath), ifAbsent, ...trackGiven(track) } as GetThingAsk
}

/** The list ask for the children of the Thing at `args`'s scope. */
export function listAskOf(args: ListAskArgs): ListThingsAsk {
  if (! CX.isPlainBag(args)) { return args }
  const { userid, banklabel, labelpath, ifAbsent = 'fail', track } = args
  return { userid, banklabel, labelpath, op: 'list', modelkind: modelkindGiven(labelpath), ifAbsent, ...trackGiven(track) } as ListThingsAsk
}

/** The put ask writing `args.record` over `args.cited`, at the record's scope. */
export function putAskOf<RecordT extends Thing>(args: PutAskArgs<RecordT>): WriteAskOf<RecordT> {
  if (! CX.isPlainBag(args)) { return args }
  const { ifAbsent = 'add', ifPresent = 'repl', ...given } = args
  const scope = scopeGiven(args.record)
  // A field the put does not accept goes through, for the verb's strict check to refuse.
  return { ...given, ...scope, op: 'put', modelkind: modelkindGiven(scope.labelpath), ifAbsent, ifPresent } as unknown as WriteAskOf<RecordT>
}

/** The del ask writing the tombstone `args.record` over `args.cited`, at the record's scope. */
export function delAskOf<RecordT extends Thing>(args: DelAskArgs<RecordT>): WriteAskOf<RecordT> {
  if (! CX.isPlainBag(args)) { return args }
  const scope = scopeGiven(args.record)
  // A field the del does not accept goes through, for the verb's strict check to refuse.
  return { ...args, ...scope, op: 'del', modelkind: modelkindGiven(scope.labelpath), ifAbsent: 'fail', ifPresent: 'repl' } as unknown as WriteAskOf<RecordT>
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
 * Each field is optional, so that a refusal of an ask that is not whole carries what of it was sound.
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
    track:     obj({ bank: trackFields, [MainGateLabelpath]: trackFields }).partial().optional(),
  }
}, 'bad_option')

/** The part of a vaultDB ask that is safe to log. */
export type LoggableAsk = Readonly<Z.infer<typeof loggableAsk>>

/** The loggable part of `ask`, or nothing for an ask that will not parse. */
export function loggableAskOf(ask: unknown): LoggableAsk {
  const parsed = loggableAsk.safeParse(ask)
  return parsed.success ? parsed.data : {}
}
// --

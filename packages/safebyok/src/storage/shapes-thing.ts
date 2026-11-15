/** The shapes of a Thing, the record a vaultDB stores every kind as, and of the asks a vaultDB takes. */

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

// == [Kinds]: thingkindVals, Thingkind, BankThingFormat, GateThingFormat, BoxThingFormat, modelkindOf, isKindLabelpath

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

/** How many labels each kind's labelpath has under its root: none under the bank, one under the main gate, any number under the root box. */
const MaxLabelsUnder = { bank: 0, gate: 1, box: Infinity } as const satisfies Record<Thingkind, number>

/** The modelkind a sound labelpath starts with. */
export function modelkindOf(labelpath: string): Thingkind { return labelpath.split('/', 1)[0] as Thingkind }

/** True when `labelpath` is one of `modelkind`'s: the modelkind, then as many labels as the kind nests, each after a `/`. */
export function isKindLabelpath(modelkind: Thingkind, labelpath: string): boolean {
  const [head, ...labels] = labelpath.split('/')
  return (head === modelkind) && (labels.length <= MaxLabelsUnder[modelkind]) && labels.every((label) => Validator.Kit.label.safeParse(label).success)
}

/** True when `labelpath` is one of some kind of Thing's. */
function isLabelpath(labelpath: string): boolean { return thingkindVals.some((modelkind) => isKindLabelpath(modelkind, labelpath)) }
// --

// == [Thing]: thingScope, thingCited, thingRecord, sealed, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, Sparse, sparseOf, ShellCited, shellCitedUnder

const LifeseqPattern       = /^[\da-v]{10}$/
const LifepathPattern      = /^[\da-v]{10}(?:\/[\da-v]{10})*$/
const ShellLifepathPattern = /^(?:[\da-v]{10}\/)*-1$/

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
function isMainGateLive({ labelpath, am }: Lived & Labelled): boolean { return (labelpath !== 'gate') || (am === 'a') }
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
export const { thingScope, thingCited, thingRecord, sealed, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited } = Validator.Checkers('bad_record', ({ obj, str, int, uint, lit, union, discrim, user_id, label, epochMillis }) => {
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
  const sealed       = obj({ key_wrapped: CX.ciphered, ciphered: CX.ciphered, codectag: str, schematag: str }).strict()

  // A stored record is strict: a field this version does not know is damage, or a newer format.
  const bankBase     = obj({
    ...thingRecord.shape,
    labelpath:      lit('bank'),
    label:          lit('bank'),
    fmt:            lit(BankThingFormat),
  }).strict()
  const gateBase     = obj({
    ...thingRecord.shape,
    labelpath:      labelpath.refine((given) => isKindLabelpath('gate', given), Phrases.LabelpathOfOtherKind),
    fmt:            lit(GateThingFormat),
    wayins:         BX.wayins,
    /** Reserved: always empty, and read by nothing. */
    auth:           emptyBag,
    /** Reserved: always empty, and read by nothing. */
    sigs:           emptyBag,
    /** Reserved: always empty, and read by nothing. */
    meta:           emptyBag,
  }).strict()
  const boxLive      = obj({
    ...thingRecord.shape,
    labelpath:      labelpath.refine((given) => isKindLabelpath('box', given), Phrases.LabelpathOfOtherKind),
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
  const boxCited     = obj({ ...exactPartialOf(boxLive.shape), ...thingCited.shape }).strict()
    .refine(isShellWhole,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  return { thingScope, thingCited, thingRecord, sealed, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited }
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
/** Any Thing a vaultDB stores. */
export type Thing        = BankThing | GateThing | BoxThing

/** The record of each kind of Thing. */
type ThingOfKind = { bank: BankThing, gate: GateThing, box: BoxThing }
/** The kind of a Thing's record. */
export type ThingkindOf<RecordT extends Thing> = { [KindT in Thingkind]: RecordT extends ThingOfKind[KindT] ? KindT : never }[Thingkind]

/** A record's Thing fields, without its body: what a listing gives of each Thing. */
export type Sparse<RecordT extends ThingRecord> = Pick<RecordT, keyof ThingRecord>

const ThingFieldnames = Object.keys(thingRecord.shape) as (keyof ThingRecord)[]

/** `record`'s Thing fields, without its body. */
export function sparseOf<RecordT extends Thing>(record: RecordT): Sparse<RecordT> { return pick(record, ThingFieldnames) }

/** What a root's birth cites: the shell, the void sentinel for no Thing stored. */
export const ShellCited: ThingCited = Object.freeze({
  revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifepath: ShellLifepath,
})

/** What the birth of a Thing under the parent at `parentLifepath` cites: the shell, at the parent's lifepath then `-1`. */
export function shellCitedUnder(parentLifepath: string): ThingCited {
  return Object.freeze({ ...ShellCited, lifepath: `${parentLifepath}/${ShellLifeseq}` })
}
// --

// == [Each kind's checks]: KindChecks, kindChecksOf

/** The checks of each kind of Thing a vaultDB stores: the record proposed, cited and stored, and the storage policies it may name. */
const KindChecks = {
  bank: { record: bankThing, cited: bankCited, stored: bankThing.refusingAs('damaged_row'), policies: [] },
  gate: { record: gateThing, cited: gateCited, stored: gateThing.refusingAs('damaged_row'), policies: EX.storagePolicyVals },
  box:  { record: boxThing,  cited: boxCited,  stored: boxThing.refusingAs('damaged_row'),  policies: [] },
} as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, policies: readonly EX.StoragePolicy[] }>

/** The checks of the kind of Thing at `labelpath`, a sound one. */
export function kindChecksOf(labelpath: string): typeof KindChecks[Thingkind] { return KindChecks[modelkindOf(labelpath)] }
// --

// == [Asks]: AskChecks, GetThingAsk, ListThingsAsk, WriteThingAsk, BirthBankAsk, BankRoots, checkedGetThingAsk, checkedListThingsAsk, checkedWriteThingAsk, checkedBirthBankAsk, birthPutsOf, checkWriteInvariants, demandHeld, demandAsked

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

/** The checks of a vaultDB ask, its records aside, and of a watch's scope. */
const AskChecks = Validator.Checkers('bad_option', ({ obj, arr, lit, unk, oneof, label, user_id }) => {
  const modelkind    = oneof(thingkindVals)
  const thingOptions = obj({
    /** The storage policies the write must keep, each over the Thing stored. */
    policies: arr(oneof(EX.storagePolicyVals)),
  }).strict()
  return {
    thingOptions,
    getThingAsk:     thingScope.extend({ op: lit('get'), modelkind, ifAbsent: SX.ifAbsent }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    listThingsAsk:   thingScope.extend({ op: lit('list'), modelkind, ifAbsent: SX.ifAbsent }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn),
    writeThingAsk:   thingScope.extend({
      op: oneof(['put', 'del']), modelkind, cited: unk, record: unk, ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, options: thingOptions.optional(),
    }).strict()
      .refine(isModelkindOwn, Phrases.ModelkindNotOwn)
      .refine(isDelFixed,     Phrases.DelFlagsFixed)
      .refine(isPolicyOwn,    Phrases.PolicyNotOwn),
    birthBankAsk:    obj({ userid: user_id, banklabel: label, op: lit('birth'), bank: unk, gate: unk, root: unk }).strict(),
    thingWatchScope: thingScope.pick({ userid: true, banklabel: true }),
  }
})
/** The check of a watch's scope: a bank. */
export const { thingWatchScope } = AskChecks

/** An ask for the Thing at its scope. */
export type GetThingAsk     = Readonly<Z.infer<typeof AskChecks.getThingAsk>>
/** An ask for the children of the Thing at its scope. Its `ifAbsent` is the parent's. */
export type ListThingsAsk   = Readonly<Z.infer<typeof AskChecks.listThingsAsk>>
/** What a write cites of a Thing of `RecordT`'s kind: what {@link ThingCited} names, and any other of its fields. */
export type CitedOf<RecordT extends Thing> = ThingCited & Partial<Omit<RecordT, keyof ThingCited>>
/** A write ask of one kind of record: see {@link WriteThingAsk}. */
type WriteAskOf<RecordT extends Thing> = Readonly<Omit<Z.infer<typeof AskChecks.writeThingAsk>, 'modelkind' | 'cited' | 'record'> & {
  modelkind: ThingkindOf<RecordT>
  cited:     CitedOf<RecordT>
  record:    RecordT
}>
/** An ask to write `record` over the Thing it `cited`: `put` a live record, or `del` with a tombstone.
 * `cited` carries what {@link ThingCited} names, which the store compares with the Thing stored. Any other field of the
 * record it carries is read only by a storage policy that takes it as testimony. Its `modelkind` narrows its record.
 */
export type WriteThingAsk<RecordT extends Thing = Thing> = ThingkindOf<RecordT> extends infer KindT ? (KindT extends Thingkind ? WriteAskOf<Extract<RecordT, ThingOfKind[KindT]>> : never) : never
/** A bank's three roots: the bank, its main gate and its root box. */
export type BankRoots       = Readonly<{ bank: BankThing, gate: GateThing, root: BoxThing }>
/** An ask to write a new bank's first Things in one step: the bank, its main gate and its root box. */
export type BirthBankAsk    = Readonly<Omit<Z.infer<typeof AskChecks.birthBankAsk>, keyof BankRoots> & BankRoots>
/** The scope a watch hears: a bank. */
export type ThingWatchScope = Readonly<Z.infer<typeof thingWatchScope>>

/** `ask`, checked, or throw `bad_option` */
export function checkedGetThingAsk(ask: unknown): GetThingAsk { return AskChecks.getThingAsk.parse(ask) }

/** `ask`, checked, or throw `bad_option` */
export function checkedListThingsAsk(ask: unknown): ListThingsAsk { return AskChecks.listThingsAsk.parse(ask) }

/** `ask`, with its records checked by their kind and against each other, or throw `bad_option` or `bad_record` */
export function checkedWriteThingAsk(ask: unknown): WriteThingAsk {
  const { cited, record, ...rest } = AskChecks.writeThingAsk.parse(ask)
  const checks  = KindChecks[rest.modelkind]
  // The modelkind picked the checks, so the records are of its kind.
  const checked = { ...rest, cited: checks.cited.parse(cited), record: checks.record.parse(record) } as WriteThingAsk
  demandAsked((checked.op === 'put') === (checked.record.am === 'a'), Phrases.OpNotOfRecord)
  checkWriteInvariants(checked)
  return checked
}

/** `ask`, with each of its three records checked as the put {@link birthPutsOf} makes of it, or throw `bad_option` or `bad_record` */
export function checkedBirthBankAsk(ask: unknown): BirthBankAsk {
  // Each record is checked in the put made of it, just below.
  const checked = AskChecks.birthBankAsk.parse(ask) as BirthBankAsk
  for (const put of birthPutsOf(checked)) { checkedWriteThingAsk(put) }
  return checked
}

/** The puts a bank's birth amounts to: each root, written over the shell at its kind's root. */
export function birthPutsOf({ userid, banklabel, bank, gate, root }: BirthBankAsk): readonly [WriteThingAsk<BankThing>, WriteThingAsk<GateThing>, WriteThingAsk<BoxThing>] {
  const flags = { userid, banklabel, op: 'put', ifAbsent: 'add', ifPresent: 'fail' } as const
  return [
    { ...flags, labelpath: 'bank', modelkind: 'bank', cited: ShellCited, record: bank },
    { ...flags, labelpath: 'gate', modelkind: 'gate', cited: ShellCited, record: gate },
    { ...flags, labelpath: 'box',  modelkind: 'box',  cited: ShellCited, record: root },
  ]
}

/** Refuse a write whose record does not follow from the one it cites. */
function checkWriteInvariants(ask: WriteThingAsk): void {
  const { cited, record, userid, banklabel, labelpath } = ask
  const isLifeFlipped = (record.am !== cited.am)
  demandHeld(record.revseq === cited.revseq + 1,                                                      Phrases.RevseqNotNext)
  demandHeld((record.revtok !== cited.revtok) && (record.revtok !== SX.VoidRevisionTok),              Phrases.RevtokNotNew)
  demandHeld(Validator.isConsistent(record, { userid, banklabel, labelpath }),                        Phrases.RecordOfOtherScope)
  demandHeld((record.am === 'a') || (cited.am === 'a'),                                               Phrases.TombstoneOverTombstone)
  demandHeld(leadingLifeseqsOf(record.lifepath) === leadingLifeseqsOf(cited.lifepath),                Phrases.LifepathNotKept)
  demandHeld(seqOfLifeseq(record.lifeseq) === seqOfLifeseq(lifeseqOfLifepath(cited.lifepath)) + (isLifeFlipped ? 1 : 0),  Phrases.LifeseqNotNext)
  // A live record over a live one keeps the stored born_at: the store checks that, against the Thing it holds.
  if (isLifeFlipped && (record.am === 'a')) { demandHeld(record.born_at === record.written_at, Phrases.BornAtNotNow) }
  if ((ask.modelkind === 'gate') && ask.options?.policies.includes('replace_passphrase')) { demandHeld(ask.cited.wayins?.main !== undefined, Phrases.TestimonyMissing) }
}

/** Throw `bad_record`, saying `phrase`, unless `isHeld` */
function demandHeld(isHeld: boolean, phrase: string): void {
  if (! isHeld) { throw new Errors.VaultError('bad_record', phrase) }
}

/** Throw `bad_option`, saying `phrase`, unless `isHeld` */
function demandAsked(isHeld: boolean, phrase: string): void {
  if (! isHeld) { throw new Errors.VaultError('bad_option', phrase) }
}
// --

// == [Ask builders]: GetAskArgs, ListAskArgs, PutAskArgs, DelAskArgs, getAskOf, listAskOf, putAskOf, delAskOf
// The one place an ask's flags are defaulted. A builder fills in the op, the modelkind and the default flags; the verb it
// is handed to checks the whole ask.

/** The checks of what each builder takes, each filling in its defaults. */
const BuilderChecks = Validator.Checkers('bad_option', ({ obj, lit, unk }) => ({
  getAskArgs:  thingScope.extend({ ifAbsent: SX.ifAbsent.default('nil') }),
  listAskArgs: thingScope.extend({ ifAbsent: SX.ifAbsent.default('fail') }),
  putAskArgs:  obj({ cited: unk, record: unk, ifAbsent: SX.putIfAbsent.default('add'), ifPresent: SX.ifPresent.default('repl'), options: AskChecks.thingOptions.optional() }).strict(),
  delAskArgs:  obj({ cited: unk, record: unk, ifAbsent: lit('fail').default('fail'), ifPresent: lit('repl').default('repl') }).strict(),
}))

/** The records a write builder takes. */
type WriteArgsOf<ArgsT, RecordT extends Thing> = Readonly<Omit<ArgsT, 'cited' | 'record'> & { cited: CitedOf<RecordT>, record: RecordT }>

/** What {@link getAskOf} takes: a Thing's scope, and its `ifAbsent` (default `'nil'`). */
export type GetAskArgs  = Readonly<Z.input<typeof BuilderChecks.getAskArgs>>
/** What {@link listAskOf} takes: the parent's scope, and its `ifAbsent` (default `'fail'`). */
export type ListAskArgs = Readonly<Z.input<typeof BuilderChecks.listAskArgs>>
/** What {@link putAskOf} takes: the records, the flags (default `ifAbsent: 'add'`, `ifPresent: 'repl'`), and the storage policies. */
export type PutAskArgs<RecordT extends Thing = Thing> = WriteArgsOf<Z.input<typeof BuilderChecks.putAskArgs>, RecordT>
/** What {@link delAskOf} takes: the records. Its flags are fixed. */
export type DelAskArgs<RecordT extends Thing = Thing> = WriteArgsOf<Z.input<typeof BuilderChecks.delAskArgs>, RecordT>

/** The get ask for the Thing at `args`'s scope, or throw `bad_option` */
export function getAskOf(args: GetAskArgs): GetThingAsk {
  const { userid, banklabel, labelpath, ifAbsent } = BuilderChecks.getAskArgs.parse(args)
  return { userid, banklabel, labelpath, op: 'get', modelkind: modelkindOf(labelpath), ifAbsent }
}

/** The list ask for the children of the Thing at `args`'s scope, or throw `bad_option` */
export function listAskOf(args: ListAskArgs): ListThingsAsk {
  const { userid, banklabel, labelpath, ifAbsent } = BuilderChecks.listAskArgs.parse(args)
  return { userid, banklabel, labelpath, op: 'list', modelkind: modelkindOf(labelpath), ifAbsent }
}

/** The put ask writing `args.record` over `args.cited`, at the record's scope, or throw `bad_option` or `bad_record` */
export function putAskOf<RecordT extends Thing>(args: PutAskArgs<RecordT>): WriteThingAsk<RecordT> {
  const { cited: _cited, record: _record, ...flags } = BuilderChecks.putAskArgs.parse(args)
  const { userid, banklabel, labelpath } = thingScope.parse(args.record)
  // The modelkind is the record's labelpath's, and so of RecordT, which the verb's checks hold it to.
  return { ...flags, userid, banklabel, labelpath, op: 'put', modelkind: modelkindOf(labelpath), cited: args.cited, record: args.record } as WriteThingAsk<RecordT>
}

/** The del ask writing the tombstone `args.record` over `args.cited`, at the record's scope, or throw `bad_option` or `bad_record` */
export function delAskOf<RecordT extends Thing>(args: DelAskArgs<RecordT>): WriteThingAsk<RecordT> {
  const { cited: _cited, record: _record, ...flags } = BuilderChecks.delAskArgs.parse(args)
  const { userid, banklabel, labelpath } = thingScope.parse(args.record)
  // The modelkind is the record's labelpath's, and so of RecordT, which the verb's checks hold it to.
  return { ...flags, userid, banklabel, labelpath, op: 'del', modelkind: modelkindOf(labelpath), cited: args.cited, record: args.record } as WriteThingAsk<RecordT>
}
// --

// == [Loggable asks]: loggableAsk, LoggableAsk, loggableAskOf

/** The part of an ask that is safe to log: its scope, its flags, and what each record cites, never a gate's wayins.
 * Each field is optional, so that a refusal of an ask that is not whole carries what of it was sound.
 */
export const loggableAsk = Validator.objStrip(({ obj, arr, oneof, user_id, label }) => {
  const citedFields = thingCited.partial()
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

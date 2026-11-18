/** The shapes of a Thing, the record every kind is stored as in a vaultDB, and of an adapter's options. */

import { pick } from 'es-toolkit'
import type * as Z from 'zod'
import { exactOptional, uuid } from 'zod'
import { BX, type Consts, CX, EX, SX, Validator } from 'safebyok-big/internals'
import type { TombstoneOf } from './shapes-sealers'
import * as Phrases from '../phrases'
import type { AdapterVaultDB } from '../storage/adapter-vault-db'
import { type VaultDB, isVaultDB } from '../storage/vault-db'
import type { Labelpath, Lifenum, Lifepath, Lifeseq, Revtok } from './primitives'

// == [Lifeseqs]: VoidLifeseq, RootVoidLifepath, lifeseqOfLifenum, lifenumOfLifeseq, isTombstoneLifeseq, lifeseqOfLifepath, leadingLifeseqsOf

/** How many base-32 digits a stored lifeseq has. */
const LifeseqDigits = 10

/** The shell's lifeseq, for life -1. It is never stored, and sorts below every life's. */
export const VoidLifeseq = '-000000001'
/** A root's shell lifepath: the shell's lifeseq alone. */
export const RootVoidLifepath = VoidLifeseq

/** The lifeseq of life `lifenum`: its base-32 digits (`0-9a-v`) padded to 10, which sort in the order of the lives. Life -1's is the shell's. */
export function lifeseqOfLifenum(lifenum: Lifenum): Lifeseq { return (lifenum === -1) ? VoidLifeseq : lifenum.toString(32).padStart(LifeseqDigits, '0') }

/** The lifenum of `lifeseq`, the number of the life it names: -1 for the shell's. */
export function lifenumOfLifeseq(lifeseq: Lifeseq): Lifenum { return Number.parseInt(lifeseq, 32) }

/** True when `lifeseq` is a tombstone's: an odd life, the shell's among them. */
export function isTombstoneLifeseq(lifeseq: Lifeseq): boolean { return Math.abs(lifenumOfLifeseq(lifeseq) % 2) === 1 }

/** The Thing's own lifeseq: the last of its lifepath. */
export function lifeseqOfLifepath(lifepath: Lifepath): Lifeseq { return lifepath.slice(lifepath.lastIndexOf('/') + 1) }

/** The lifeseqs of a Thing's ancestors: its lifepath less its own lifeseq, `''` for a root. */
export function leadingLifeseqsOf(lifepath: Lifepath): string { return lifepath.slice(0, Math.max(0, lifepath.lastIndexOf('/'))) }
// --

// == [Kinds]: thingkindVals, Thingkind, BankThingFormat, GateThingFormat, BoxThingFormat, ThingFormats, MainGateLabelpath, RootBoxLabelpath, modelkindOf, isLabelpathOfKind

/** The kinds of Thing: the modelkind at the base of each labelpath. */
export const thingkindVals = ['bank', 'gate', 'box'] as const satisfies readonly Consts.Modelkind[]
/** A kind of Thing, one of {@link thingkindVals}. */
export type Thingkind = typeof thingkindVals[number]

/** The `fmt` of the bank's Thing, distinct from big's bank row (3001). */
export const BankThingFormat = 3101
/** The `fmt` of a gate's Thing, distinct from big's gate row (4001). */
export const GateThingFormat = 4101
/** The `fmt` of a box's Thing, distinct from big's box row (5003). */
export const BoxThingFormat = 5103

/** The `fmt` of each kind of Thing. */
export const ThingFormats = { bank: BankThingFormat, gate: GateThingFormat, box: BoxThingFormat } as const satisfies Record<Thingkind, number>

/** Where the main gate is stored in its bank, and its key in a `track`. */
export const MainGateLabelpath = 'gate'
/** Where the root box is stored in its bank, and its key in a `track`. */
export const RootBoxLabelpath = 'box'

/** The most labels a labelpath of each kind has after its modelkind: none for the bank, one for a gate or a box. */
const MaxLabelsUnder = { bank: 0, gate: 1, box: 1 } as const satisfies Record<Thingkind, number>

/** The modelkind a sound labelpath starts with. */
export function modelkindOf(labelpath: Labelpath): Thingkind { return labelpath.split('/', 1)[0] as Thingkind }

/** True when `labelpath` is `modelkind` followed by at most as many valid labels as that kind nests, each after a `/`. */
export function isLabelpathOfKind(labelpath: Labelpath, modelkind: Thingkind): boolean {
  const [head, ...labels] = labelpath.split('/')
  return (head === modelkind) && (labels.length <= MaxLabelsUnder[modelkind]) && labels.every((label) => Validator.Kit.label.safeParse(label).success)
}

/** True when `labelpath` is one of some kind of Thing's. */
function isLabelpath(labelpath: Labelpath): boolean { return thingkindVals.some((modelkind) => isLabelpathOfKind(labelpath, modelkind)) }
// --

// == [Thing]: thingScope, thingCited, scopedCited, thingRecord, storedCited, storedWayins, sealed, wayins, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSealable, boxRecord, boxRecordOrShell, StoredCited, Sealed, Wayins, Sparse, sparseOf, ShellCited, childShellCited

// A stored lifeseq is 10 base-32 digits; the void lifeseq, -000000001, is never stored. A lifepath joins lifeseqs with '/',
// and only its last may be void: a void lifepath is the void lifeseq under its parent's lifepath, or alone at a root.
const LifeseqPattern      = /^[0-9a-v]{10}$/
const AnyLifeseqPattern   = /^(?:[0-9a-v]{10}|-000000001)$/
const LifepathPattern     = /^(?:[0-9a-v]{10}\/)*[0-9a-v]{10}$/
const VoidLifepathPattern = /^(?:[0-9a-v]{10}\/)*-000000001$/
const AnyLifepathPattern  = /^(?:[0-9a-v]{10}\/)*(?:[0-9a-v]{10}|-000000001)$/

type Labelled = { labelpath: Labelpath, label: string }
type Lived    = { lifepath: Lifepath, am: string }
type Revised  = { revtok: Revtok, revseq: number, lifepath: Lifepath }

/** True when a Thing's label is the last segment of its labelpath. A root's label is its modelkind. */
function isLabelLast({ labelpath, label }: Labelled): boolean { return labelpath.slice(labelpath.lastIndexOf('/') + 1) === label }
/** True when a Thing's lifeseq is the last of its lifepath. */
function isLifeseqOwn({ lifepath, lifeseq }: Lived & { lifeseq: Lifeseq }): boolean { return lifeseqOfLifepath(lifepath) === lifeseq }
/** True when a Thing's lifepath has one lifeseq for each segment of its labelpath. */
function isLifepathDeep({ lifepath, labelpath }: Lived & Labelled): boolean { return lifepath.split('/').length === labelpath.split('/').length }
/** True when a Thing's own lifeseq is odd exactly when it is a tombstone. */
function isParityRight({ am, lifepath }: Lived): boolean { return (am === 'x') === isTombstoneLifeseq(lifeseqOfLifepath(lifepath)) }
/** True unless the Thing is a deleted main gate. */
function isMainGateLive({ labelpath, am }: Lived & Labelled): boolean { return (labelpath !== MainGateLabelpath) || (am === 'a') }
/** The fields of `shape`, each optional: it may be omitted, but not undefined. */
function exactPartialOf<ShapeT extends Z.ZodRawShape>(shape: ShapeT): { [FieldT in keyof ShapeT]: Z.ZodExactOptional<ShapeT[FieldT]> } {
  // Object.fromEntries loses the fieldnames' types: the cast restores them.
  return Object.fromEntries(Object.entries(shape).map(([fieldname, check]) => [fieldname, exactOptional(check)])) as { [FieldT in keyof ShapeT]: Z.ZodExactOptional<ShapeT[FieldT]> }
}

/** True when a citation is the shell in all three of its marks, or in none. */
function isShellCitable({ revtok, revseq, lifepath }: Revised): boolean {
  const isShell = (revseq === SX.VoidRevisionSeq)
  return (isShell === (revtok === SX.VoidRevisionTok)) && (isShell === (lifeseqOfLifepath(lifepath) === VoidLifeseq))
}

/** The checks of a Thing's fields, of each kind of Thing and its citation, and of what a write reads of the Thing stored. */
export const ThingChecks = Validator.Checkers('bad_record', ({ obj, str, int, uint, lit, oneof, union, discrim, user_id, label, epochMillis }) => {
  // A root's labelpath is its modelkind alone.
  const modelkind    = oneof(thingkindVals)
  const labelpath    = str.refine(isLabelpath, Phrases.LabelpathShape)
  const lifeseq      = str.regex(LifeseqPattern, Phrases.LifeseqShape)
  const voidLifeseq  = lit(VoidLifeseq)
  const anyLifeseq   = str.regex(AnyLifeseqPattern, Phrases.LifeseqShape)
  const lifepath     = str.regex(LifepathPattern, Phrases.LifepathShape)
  const voidLifepath = str.regex(VoidLifepathPattern, Phrases.LifepathShape)
  const anyLifepath  = str.regex(AnyLifepathPattern, Phrases.LifepathShape)
  const am           = SX.am.exclude(['d'])
  const bankScope    = obj({ userid: user_id, banklabel: label })
  const thingScope   = bankScope.extend({ labelpath })
  // A revtok is minted by crypto.randomUUID; the void revtok is the nil UUID.
  const revisioned   = { revtok: uuid(Phrases.RevtokShape), revseq: uint, am, lifeseq, lifepath, born_at: epochMillis, written_at: epochMillis }
  // Just what the act tables compare. A write may cite the shell, so its revseq and life may be the shell's -1.
  const thingCited   = obj({
    revtok:   revisioned.revtok,
    revseq:   int.min(SX.VoidRevisionSeq),
    am,
    lifepath: anyLifepath,
  })
  // A Thing's scope and citation: what every record and tombstone has, sparse or whole.
  const scopedCited  = obj({ ...thingScope.shape, ...thingCited.shape })
  const thingRecord  = obj({ ...thingScope.shape, label, fmt: uint, ...revisioned })
  // What a write reads of the Thing stored before it carries its record forward: the rest of the row goes unread.
  const storedCited  = obj({ ...thingScope.shape, revtok: revisioned.revtok, revseq: uint, am, lifepath, born_at: epochMillis })
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
  // What a write under a storage policy reads of the gate stored, beside its storedCited.
  const storedWayins = obj({ wayins })

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
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const gateCited    = obj({ ...exactPartialOf(gateBase.shape), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  // A box's shell, as a bank gives it, carries the shell's lifeseq.
  const boxCited     = obj({ ...exactPartialOf(boxLive.shape), lifeseq: exactOptional(anyLifeseq), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A box's sealable keeps only its Thing fields and sidecar, so a whisper given with it, sealed or not, is dropped. The
  // shell has no stored row, so its revseq, lifeseq and lifepath may be the shell's.
  const boxSealable  = obj({
    ...thingRecord.shape,
    labelpath:      boxLive.shape.labelpath,
    fmt:            lit(BoxThingFormat),
    revseq:         thingCited.shape.revseq,
    lifeseq:        anyLifeseq,
    lifepath:       thingCited.shape.lifepath,
    sidecar:        exactOptional(CX.sidecar),
  })
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isShellCitable,   Phrases.SealableHalfShell)

  // A bank keeps its root box whole: live once the bank is born, and its shell before.
  const boxRecord    = boxLive
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const boxShell     = obj({
    ...thingRecord.shape,
    labelpath:      boxLive.shape.labelpath,
    fmt:            lit(BoxThingFormat),
    revtok:         lit(SX.VoidRevisionTok),
    revseq:         lit(SX.VoidRevisionSeq),
    am:             lit('x'),
    lifeseq:        voidLifeseq,
    lifepath:       voidLifepath,
    born_at:        lit(SX.VoidTime),
    written_at:     lit(SX.VoidTime),
  }).strict()
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
  const boxRecordOrShell = union([boxRecord, boxShell])
  return {
    modelkind, labelpath, anyLifeseq, voidLifeseq, anyLifepath, voidLifepath, ...revisioned, bankScope, label,
    thingScope, thingCited, scopedCited, thingRecord, storedCited, storedWayins, sealed, wayins, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSealable, boxRecord,
    boxRecordOrShell,
  }
})
/** Each of {@link ThingChecks}, by name. */
export const {
  thingScope, thingCited, scopedCited, thingRecord, storedCited, storedWayins, sealed, wayins, bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSealable, boxRecord, boxRecordOrShell,
} = ThingChecks

/** Where a Thing is stored: its user, its bank, and its labelpath under the bank. */
export type ThingScope   = Readonly<Z.infer<typeof thingScope>>
/** A write's citation of the Thing it expects to find: its revision, life and liveness, the only fields the store compares. The shell may be cited. */
export type ThingCited   = Readonly<Z.infer<typeof thingCited>>
/** The fields a write reads of the Thing stored at its scope: its scope, the fields the act tables compare, and the born_at a replace keeps. */
export type StoredCited  = Readonly<Z.infer<typeof storedCited>>
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

/** A record's Thing fields, without its body: what a listing returns for each Thing. */
export type Sparse<RecordT extends ThingRecord> = Pick<RecordT, keyof ThingRecord>

const ThingFieldnames = Object.keys(thingRecord.shape) as (keyof ThingRecord)[]

/** The Thing fields of `record`, without its body. */
export function sparseOf<RecordT extends ThingRecord>(record: RecordT): Sparse<RecordT> { return pick(record, ThingFieldnames) }

/** The citation for a root's birth: the shell, the void sentinel for no Thing stored. */
export const ShellCited: ThingCited = Object.freeze({
  revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifepath: RootVoidLifepath,
})

/** The citation for the birth of a child of the Thing at `parentLifepath`: the shell, at the parent's lifepath then the shell's lifeseq. */
export function childShellCited(parentLifepath: Lifepath): ThingCited {
  return Object.freeze({ ...ShellCited, lifepath: `${parentLifepath}/${VoidLifeseq}` })
}
// --

// == [Shells]: ShellChecks, VoidSentinel, shellOf, scopedWithParentage, lifepathWithParentage
// A shell is made only from the void: each of its fixed fields defaults to the shell's, and refuses any other value.

/** True when a Thing's fmt is its kind's. */
function isFmtOwn({ labelpath, fmt }: { labelpath: Labelpath, fmt: number }): boolean { return fmt === ThingFormats[modelkindOf(labelpath)] }

/** A shell tombstone with every Thing field (and no body).
 * Its revseq is -1. Cite this when creating a new Thing (revseq 0)
 */
export type VoidSentinel = Sparse<Thing> & Readonly<{ am: 'x' }>

/** Builds a shell tombstone (stands in for a void row: never been created)
 *  It will have magic values for revseq (-1), lifeseq ('-000000001'), and am ('x').
 *  In the root case, supply a labelpath equal to the modelkind
 *  Otherwise: either an explicit labelpath/lifepath, or a label and a parent's labelpath/lifepath.
 */
export function shellOf(raw: Partial<ThingRecord>, parent?: Partial<ThingRecord>): VoidSentinel {
  const proposed = ShellChecks.shellScoped.parse(raw)
  if (ThingChecks.modelkind.safeParse(proposed.labelpath).success) { return rootShellOf(proposed) }
  const labels    = labelpathWithParentage(proposed, parent)
  const lives    = lifepathWithParentage(proposed, parent)
  const fmt      = ThingFormats[modelkindOf(labels.labelpath)]
  const shell    = ShellChecks.shell.parse({ fmt, ...proposed, ...labels, ...lives })
  demandConsistentParent(shell, parent)
  return Object.freeze(shell) as VoidSentinel
}
function rootShellOf(proposed: Partial<ThingRecord>): VoidSentinel {
  const modelkind = ThingChecks.modelkind.parse(proposed.labelpath)
  return Object.freeze(ShellChecks.shell.parse({
    fmt: ThingFormats[modelkind], label: modelkind, lifepath: RootVoidLifepath, ...proposed,
  })) as VoidSentinel
}
const ShellChecks = Validator.Checkers('bad_record', ({ obj, lit, uint, label }) => {
  const fixed = {
    revtok:     lit(SX.VoidRevisionTok).default(SX.VoidRevisionTok),
    revseq:     lit(SX.VoidRevisionSeq).default(SX.VoidRevisionSeq),
    am:         lit('x').default('x'), //
    lifeseq:    ThingChecks.voidLifeseq.default(VoidLifeseq),
    born_at:    lit(SX.VoidTime).default(SX.VoidTime),
    written_at: lit(SX.VoidTime).default(SX.VoidTime),
  }
  const shellLifepath = ThingChecks.voidLifepath
  return {
    shellScoped: obj({
      userid:    thingScope.shape.userid,
      banklabel: thingScope.shape.banklabel,
      labelpath: exactOptional(thingScope.shape.labelpath),
      label:     exactOptional(label),
      lifepath:  exactOptional(shellLifepath),
      fmt:       exactOptional(uint),
      ...fixed,
    }),
    // What a shell proposed must meet, of a record's rules.
    shell: obj({ ...thingScope.shape, label, fmt: uint, lifepath: shellLifepath, ...fixed })
      .refine(isLabelLast,    Phrases.LabelNotLast)
      .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
      .refine(isLifepathDeep, Phrases.LifepathDepth)
      .refine(isFmtOwn,       Phrases.ShellFmtOfOtherKind),
  }
})

function demandConsistentParent(partialThing: Pick<ThingRecord, 'userid' | 'banklabel' | 'labelpath' | 'lifepath'>, parent?: Partial<ThingRecord>): void {
  if (! parent) { return }
  const bankScope = ThingChecks.bankScope.parse(partialThing)
  const parentpath = parentpathOf(partialThing.labelpath)
  const parentlife = leadingLifeseqsOf(partialThing.lifepath)
  Validator.demandConsistent({ ...bankScope, labelpath: parentpath, lifepath: parentlife }, parent)
}

/** Extract labelpath and label from a record: an explicit labelpath on the record, or a label and a parent's labelpath.
 *  Caller must check that nothing in the record, or its parent, disagrees.
 */
export function labelpathWithParentage(
  raw: Partial<Pick<ThingRecord, 'labelpath' | 'label'>>, parent?: Partial<Pick<ThingRecord, 'labelpath'>>,
): Pick<ThingRecord, 'labelpath' | 'label'> {
  if (raw.labelpath) { // if raw has a labelpath, find the label of it; prefer raw so it survives to the consistent check.
    const labelpath = ThingChecks.labelpath.parse(raw.labelpath)
    const label     = raw.label ?? labelOfLabelpath(labelpath)
    return labelpathWithParentageChecker.parse({ labelpath, label })
  }
  const label      = ThingChecks.label.parse(raw.label)
  const labelpath  = ThingChecks.labelpath.parse(parent?.labelpath) + '/' + label
  return labelpathWithParentageChecker.parse({ labelpath, label })
}
const labelpathWithParentageChecker = Validator.Checker(() => thingRecord.pick({ labelpath: true, label: true }))

/** Extract lifeseq and lifepath from a record: an explicit lifepath on the record, or a lifeseq and a parent's lifepath.
 *  Caller must check that nothing in the record, or its parent, disagrees.
 */
export function lifepathWithParentage(raw: Partial<Pick<ThingRecord, 'lifepath' | 'lifeseq'>>, parent?: Partial<Pick<ThingRecord, 'lifepath'>>): Pick<ThingRecord, 'lifepath' | 'lifeseq'> {
  // if raw has a lifepath, find the lifeseq. Consistency check is done by the caller.
  if (raw.lifepath) {
    const lifeseq = lifeseqOfLifepath(raw.lifepath)
    return lifepathWithParentageChecker.parse({ lifeseq, lifepath: raw.lifepath })
  }
  // otherwise, build a lifepath from the parent's lifepath and the raw's lifeseq.
  const lifeseq  = raw.lifeseq ?? ''
  const lifepath = ThingChecks.lifepath.parse(parent?.lifepath) + '/' + lifeseq
  return lifepathWithParentageChecker.parse({ lifeseq, lifepath })
}
const lifepathWithParentageChecker = Validator.Checker(({ obj }) => obj({ lifepath: ThingChecks.anyLifepath, lifeseq: ThingChecks.anyLifeseq }))

function labelOfLabelpath(labelpath: Labelpath): string {
  return labelpath.slice(labelpath.lastIndexOf('/') + 1)
}

/** The labelpath of a Thing's parent: its labelpath less its own label, `''` for a root. */
function parentpathOf(labelpath: Labelpath): Labelpath {
  return labelpath.slice(0, Math.max(0, labelpath.lastIndexOf('/')))
}
// --

// == [Reading records]: Tombstone, isVoidSentinel, isWholeRecord, isTombstone, isGone, isSparse, haveSameScope, cmpThings

/** A tombstone of a RecordT, sparse or whole. */
export type Tombstone<RecordT extends ThingRecord> = TombstoneOf<RecordT> | (Sparse<RecordT> & Readonly<{ am: 'x' }>)

/** True when `record` is a void sentinel: its revseq is the shell's -1. */
export function isVoidSentinel(record: Sparse<Thing>): record is VoidSentinel {
  if (! isTombstone(record)) { return false }
  return record.revseq === SX.VoidRevisionSeq
}

// The void sentinel is a whole tombstone, though no record check accepts it: a store must never take a shell as a record.
/** True when `record` is whole, with its body, and not sparse. The void sentinel is whole. */
export function isWholeRecord(record: Sparse<Thing>): record is Thing {
  return isVoidSentinel(record) || kindChecksOf(record.labelpath).record.safeParse(record).success
}

// Each kind types its `am` as 'a' | 'x', so TypeScript cannot narrow to a tombstone by it.
/** True when `record` is a tombstone, sparse or whole, the void sentinel among them. */
export function isTombstone<RecordT extends Thing>(record: unknown): record is Tombstone<RecordT> {
  return tombstoneChecker.safeParse(record).success
}
/** What every tombstone has, sparse or whole: a Thing's scope and citation, marked deleted. */
const tombstoneChecker = Validator.Checker(({ lit }) => scopedCited.extend({ am: lit('x') }))

/** True when `record` is the tombstone of a deleted Thing, sparse or whole: any tombstone but the void sentinel. */
export function isGone<RecordT extends Thing>(record: unknown): record is Tombstone<RecordT> {
  return isTombstone(record) && (! isVoidSentinel(record))
}

/** True when `record` is live, and not whole. */
export function isSparse(record: Sparse<Thing>): boolean {
  return (record.am === 'a') && (! isWholeRecord(record))
}

/** True when `ante` and `post` are at one labelpath of one bank. */
export function haveSameScope(ante: ThingScope, post: ThingScope): boolean {
  return (ante.labelpath === post.labelpath) && (ante.userid === post.userid) && (ante.banklabel === post.banklabel)
}

// The lifepath decides first: a Thing born under a new life of its parent starts again at revseq 0, and the parent's later
// lifeseq orders it after. Lifeseqs are fixed-width base-32 digits, 0-9 then a-v, so lifepaths compare as strings, and
// the shell's '-' sorts below them all.
/** Compare two revisions: by life, then revision. Returns: positive (`post` newer), negative (`ante` newer), zero (the same).
 * The output is **not** restricted to -1, 0, 1: it may be any integer.
 */
export function cmpThings(ante: Pick<ThingCited, 'lifepath' | 'revseq'>, post: Pick<ThingCited, 'lifepath' | 'revseq'>): number {
  if (ante.lifepath !== post.lifepath) { return (post.lifepath > ante.lifepath) ? 1 : -1 }
  return post.revseq - ante.revseq
}
// --

// == [Each kind's checks]: KindChecks, kindChecksOf

/** The checks of each kind of Thing stored in a vaultDB: the record proposed, cited and stored, and the storage policies it may name. */
export const KindChecks = {
  bank: { record: bankThing, cited: bankCited, stored: bankThing.refusingAs('damaged_row'), policies: [] },
  gate: { record: gateThing, cited: gateCited, stored: gateThing.refusingAs('damaged_row'), policies: EX.storagePolicyVals },
  box:  { record: boxThing,  cited: boxCited,  stored: boxThing.refusingAs('damaged_row'),  policies: [] },
} as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, policies: readonly EX.StoragePolicy[] }>

/** The checks for the kind of Thing at `labelpath`, which must be sound. */
export function kindChecksOf(labelpath: Labelpath): typeof KindChecks[Thingkind] { return KindChecks[modelkindOf(labelpath)] }
// --

// == [The vaultDB]: vaultDBShape, adapterVaultDBOpts, AdapterVaultDBOpts

/** The check of a host's {@link VaultDB}, by {@link isVaultDB}. */
export const vaultDBShape = Validator.Checker(({ custom }) => custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected), 'bad_record')

/** The check of the options of a vaultDB that extends {@link AdapterVaultDB}. */
export const adapterVaultDBOpts = Validator.Checker(({ obj, bool }) => obj({
  /** False to notify no watch of the Things in an answer's `tracked` ({@link AdapterVaultDB.notifyTrackedRecords}). Default true. */
  doNotifyTracked: bool.optional(),
}).strict(), 'bad_record')

/** The options of a vaultDB that extends {@link AdapterVaultDB}. */
export type AdapterVaultDBOpts = Readonly<Z.infer<typeof adapterVaultDBOpts>>
// --

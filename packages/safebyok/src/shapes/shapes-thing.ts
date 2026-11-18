/** The shapes of a Thing, the record every kind is stored as in a vaultDB, and the checks of each. */

import { isEmptyObject, pick } from 'es-toolkit'
import type * as Z from 'zod'
import { exactOptional, uuid } from 'zod'
import { BX, type Consts, CX, EX, SX, Validator } from 'safebyok-big/internals'
import type { ShellOf, TombstoneOf } from './shapes-sealers'
import * as Phrases from '../phrases'
import { type VaultDB, isVaultDB } from '../storage/vault-db'
import { type Lifepath, type Revtok, Labelpath, Lifeseq, VoidLifeseq } from './primitives'

// == [Kinds]: thingkindVals, Thingkind, ThingFormat

/** The kinds of Thing: the modelkind at the base of each labelpath. */
export const thingkindVals = ['bank', 'gate', 'box'] as const satisfies readonly Consts.Modelkind[]
/** A kind of Thing, one of {@link thingkindVals}. */
export type Thingkind = typeof thingkindVals[number]

/** The `fmt` of every Thing, of every kind: the kind is in its labelpath. Distinct from big's rows' fmts (3001, 4001, 5003). */
export const ThingFormat = 100_501

/** True when `labelpath` is one of some kind of Thing's. */
function isLabelpath(labelpath: Labelpath): boolean { return thingkindVals.some((modelkind) => Labelpath.isOfModelkind(labelpath, modelkind)) }
// --

// == [Thing]: GenericChecks, vaultDBShape, PerKindChecks, BankChecks, GateChecks, BoxChecks, ThingChecks, ThingScope, ThingCited, StoredCited, Sealed, Wayins, Sparse, sparseOf

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
function isLifeseqOwn({ lifepath, lifeseq }: Lived & { lifeseq: Lifeseq }): boolean { return Lifeseq.ofLifepath(lifepath) === lifeseq }
/** True when a Thing's lifepath has one lifeseq for each segment of its labelpath. */
function isLifepathDeep({ lifepath, labelpath }: Lived & Labelled): boolean { return lifepath.split('/').length === labelpath.split('/').length }
/** True when a Thing's own lifeseq is odd exactly when it is a tombstone. */
function isParityRight({ am, lifepath }: Lived): boolean { return (am === 'x') === Lifeseq.isTombstone(Lifeseq.ofLifepath(lifepath)) }
/** True unless the Thing is a deleted main gate. */
function isMainGateLive({ labelpath, am }: Lived & Labelled): boolean { return (labelpath !== Labelpath.MainGate) || (am === 'a') }
/** True unless the box is a tombstone whose sidecar is not empty. */
function isGoneSidecarEmpty({ am, sidecar }: { am: string, sidecar: object }): boolean { return (am === 'a') || isEmptyObject(sidecar) }
/** The fields of `shape`, each optional: it may be omitted, but not undefined. */
function exactPartialOf<ShapeT extends Z.ZodRawShape>(shape: ShapeT): { [FieldT in keyof ShapeT]: Z.ZodExactOptional<ShapeT[FieldT]> } {
  // Object.fromEntries loses the fieldnames' types: the cast restores them.
  return Object.fromEntries(Object.entries(shape).map(([fieldname, check]) => [fieldname, exactOptional(check)])) as { [FieldT in keyof ShapeT]: Z.ZodExactOptional<ShapeT[FieldT]> }
}

/** True when a citation is the shell in all three of its marks, or in none. */
function isShellCitable({ revtok, revseq, lifepath }: Revised): boolean {
  const isShell = (revseq === SX.VoidRevisionSeq)
  return (isShell === (revtok === SX.VoidRevisionTok)) && (isShell === (Lifeseq.ofLifepath(lifepath) === VoidLifeseq))
}

/** The kind-generic checks of a Thing's fields and of its citation. */
const GenericChecks = Validator.Checkers('bad_record', ({ obj, str, int, uint, lit, oneof, user_id, label, epochMillis }) => {
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
  const sparse       = obj({ ...thingScope.shape, label, fmt: uint, ...revisioned })
  // What a write reads of the Thing stored before it carries its record forward: the rest of the row goes unread.
  const storedCited  = obj({ ...thingScope.shape, revtok: revisioned.revtok, revseq: uint, am, lifepath, born_at: epochMillis })
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
  return {
    modelkind, labelpath, anyLifeseq, voidLifeseq, anyLifepath, voidLifepath, ...revisioned, bankScope, label,
    thingScope, thingCited, scopedCited, sparse, storedCited, sealed,
  }
})

/** The checks of each kind of Thing: its record, its citation, and the parts of it a kind has. */
const PerKindChecks = Validator.Checkers('bad_record', ({ obj, lit, union }) => {
  const { labelpath, anyLifeseq, voidLifeseq, voidLifepath, sparse, thingCited, sealed } = GenericChecks
  const emptyBag     = obj({}).strict()
  // A record has no optional part: a gate with no passkey has `passkey0: null`.
  const wayins       = obj({ main: BX.wayins.shape.main, passkey0: BX.wayins.shape.passkey0.unwrap().nullable() }).strict()
  // What a write under a storage policy reads of the gate stored, beside its storedCited.
  const storedWayins = obj({ wayins })

  const bankLabelpath = lit('bank')
  const gateLabelpath = labelpath.refine((given) => Labelpath.isOfModelkind(given, 'gate'), Phrases.LabelpathOfOtherKind)
  const boxLabelpath  = labelpath.refine((given) => Labelpath.isOfModelkind(given, 'box'), Phrases.LabelpathOfOtherKind)

  // A stored record is strict: a field this version does not know is damage, or a newer format.
  const bankBase     = obj({
    ...sparse.shape,
    labelpath:      bankLabelpath,
    label:          lit('bank'),
    fmt:            lit(ThingFormat),
  }).strict()
  const gateBase     = obj({
    ...sparse.shape,
    labelpath:      gateLabelpath,
    fmt:            lit(ThingFormat),
    wayins,
    /** Reserved: always empty, and read by nothing. */
    auth:           emptyBag,
    /** Reserved: always empty, and read by nothing. */
    sigs:           emptyBag,
    /** Reserved: always empty, and read by nothing. */
    meta:           emptyBag,
  }).strict()
  // A tombstone seals an empty whisper, and its sidecar is always `{}`.
  const boxBase      = obj({
    ...sparse.shape,
    labelpath:      boxLabelpath,
    fmt:            lit(ThingFormat),
    sidecar:        CX.sidecar,
    whisper_sealed: sealed,
  }).strict()
  const boxLive      = boxBase.extend({ am: lit('a') })

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
  const boxThing     = boxBase
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isGoneSidecarEmpty, Phrases.TombstoneSidecarNotEmpty)

  // A citation must carry what ThingCited names; any other field of its kind it carries must check.
  const bankCited    = obj({ ...exactPartialOf(bankBase.shape), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const gateCited    = obj({ ...exactPartialOf(gateBase.shape), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  // A box's shell, as a bank gives it, carries the shell's lifeseq.
  const boxCited     = obj({ ...exactPartialOf(boxBase.shape), lifeseq: exactOptional(anyLifeseq), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A box's sealable keeps only its Thing fields and sidecar, so a whisper given with it, sealed or not, is dropped. The
  // shell has no stored row, so its revseq, lifeseq and lifepath may be the shell's.
  const boxSealable  = obj({
    ...sparse.shape,
    labelpath:      boxLabelpath,
    fmt:            lit(ThingFormat),
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
    ...sparse.shape,
    labelpath:      boxLabelpath,
    fmt:            lit(ThingFormat),
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
    bankLabelpath, gateLabelpath, boxLabelpath, wayins, storedWayins,
    bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSealable, boxRecord, boxRecordOrShell,
  }
})

/** The checks of the bank's Thing: its record, its citation and what is stored of it, the storage policies it may name (none), and its labelpath. */
export const BankChecks = Object.freeze({
  record: PerKindChecks.bankThing, cited: PerKindChecks.bankCited, stored: PerKindChecks.bankThing.refusingAs('damaged_row'), policies: [], labelpath: PerKindChecks.bankLabelpath,
} as const)

/** The checks of a gate's Thing: its record, its citation and what is stored of it, the storage policies it may name, and its labelpath.
 * Also its wayins, and the wayins as a write under a storage policy reads them of the gate stored.
 */
export const GateChecks = Object.freeze({
  record: PerKindChecks.gateThing, cited: PerKindChecks.gateCited, stored: PerKindChecks.gateThing.refusingAs('damaged_row'), policies: EX.storagePolicyVals, labelpath: PerKindChecks.gateLabelpath,
  wayins: PerKindChecks.wayins, storedWayins: PerKindChecks.storedWayins,
} as const)

/** The checks of a box's Thing: its record, its citation and what is stored of it, the storage policies it may name (none), and its labelpath.
 * Also its sealable, its `live` record, and its `liveOrShell` record, which a bank keeps of its root box.
 */
export const BoxChecks = Object.freeze({
  record: PerKindChecks.boxThing, cited: PerKindChecks.boxCited, stored: PerKindChecks.boxThing.refusingAs('damaged_row'), policies: [], labelpath: PerKindChecks.boxLabelpath,
  sealable: PerKindChecks.boxSealable, live: PerKindChecks.boxRecord, liveOrShell: PerKindChecks.boxRecordOrShell,
} as const)

/** The bundle of each kind of Thing, by its modelkind. */
const byModelkind = { bank: BankChecks, gate: GateChecks, box: BoxChecks } as const satisfies Record<Thingkind, { record: unknown, cited: unknown, stored: unknown, policies: readonly EX.StoragePolicy[] }>

/** The checks for the kind of Thing at `labelpath`, which must be sound. */
function ofLabelpath(labelpath: Labelpath): typeof byModelkind[Thingkind] { return byModelkind[Labelpath.modelkindOf(labelpath)] }

/** The check of a host's {@link VaultDB}, by {@link isVaultDB}. */
const vaultDBShape = Validator.Checker(({ custom }) => custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected), 'bad_record')

/** The checks of a Thing's fields, of its citation, of what a write reads of the Thing stored, and of a host's vaultDB.
 * `byModelkind` holds the bundle of each kind of Thing: {@link BankChecks}, {@link GateChecks} and {@link BoxChecks}; `ofLabelpath` gives the one for a labelpath.
 * Also `ThingFormat`, the `fmt` of every Thing, and `thingkindVals`, the kinds.
 */
export const ThingChecks = Object.freeze({ ...GenericChecks, vaultDBShape, byModelkind, ofLabelpath, ThingFormat, thingkindVals })

/** Where a Thing is stored: its user, its bank, and its labelpath under the bank. */
export type ThingScope   = Readonly<Z.infer<typeof ThingChecks.thingScope>>
/** A write's citation of the Thing it expects to find: its revision, life and liveness, the only fields the store compares. The shell may be cited. */
export type ThingCited   = Readonly<Z.infer<typeof ThingChecks.thingCited>>
/** The fields a write reads of the Thing stored at its scope: its scope, the fields the act tables compare, and the born_at a replace keeps. */
export type StoredCited  = Readonly<Z.infer<typeof ThingChecks.storedCited>>
/** The name of a Thing field: the fields every kind of Thing has, which the store reads. The rest of a record is its body. */
type ThingFieldname = keyof Z.infer<typeof ThingChecks.sparse>
/** The bank, as a Thing. */
export type BankRecord   = Readonly<Z.infer<typeof BankChecks.record>>
/** A gate, as a Thing: the main gate, at `gate`. */
export type GateRecord   = Readonly<Z.infer<typeof GateChecks.record>>
/** A box, as a Thing: with its sidecar and sealed whisper. A tombstone's sidecar is `{}`, and its whisper is sealed empty. */
export type BoxRecord    = Readonly<Z.infer<typeof BoxChecks.record>>
/** Any Thing stored in a vaultDB. */
export type ThingRecord  = BankRecord | GateRecord | BoxRecord
/** One sealed part of a record, at `<part>_sealed`: a fresh key wrapped under the bankKey, the cleartext ciphered under that key, and the tags its unseal reads. */
export type Sealed       = Readonly<Z.infer<typeof ThingChecks.sealed>>
/** A gate's wayins: `main`, its passphrase wayin, and `passkey0`, its passkey wayin or null for none. */
export type Wayins       = Readonly<Z.infer<typeof GateChecks.wayins>>

/** A record's Thing fields, without its body: what a listing returns for each Thing. */
export type Sparse<RecordT extends Sparse<ThingRecord>> = Pick<RecordT, ThingFieldname>

const ThingFieldnames = Object.keys(ThingChecks.sparse.shape) as ThingFieldname[]

/** The Thing fields of `record`, without its body. */
export function sparseOf<RecordT extends Sparse<ThingRecord>>(record: RecordT): Sparse<RecordT> { return pick(record, ThingFieldnames) }
// --

// == [Shells]: ShellChecks, VoidSentinel, Shell
// A shell is made only from the void: each of its fixed fields defaults to the shell's, and refuses any other value.

/** A shell, whole: every Thing field of a tombstone and no body, its revseq -1.
 * What a ThingMinder's cache holds for a scope that stores nothing.
 */
export type VoidSentinel = ShellOf<ThingRecord>

const ShellChecks = Validator.Checkers('bad_record', ({ obj, lit, label }) => {
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
      userid:    ThingChecks.thingScope.shape.userid,
      banklabel: ThingChecks.thingScope.shape.banklabel,
      labelpath: exactOptional(ThingChecks.thingScope.shape.labelpath),
      label:     exactOptional(label),
      lifepath:  exactOptional(shellLifepath),
      fmt:       exactOptional(lit(ThingFormat)),
      ...fixed,
    }),
    // What a shell proposed must meet, of a record's rules.
    shell: obj({ ...ThingChecks.thingScope.shape, label, fmt: lit(ThingFormat), lifepath: shellLifepath, ...fixed })
      .refine(isLabelLast,    Phrases.LabelNotLast)
      .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
      .refine(isLifepathDeep, Phrases.LifepathDepth),
  }
})

const labelpathWithParentageChecker = Validator.Checker(() => ThingChecks.sparse.pick({ labelpath: true, label: true }))
const lifepathWithParentageChecker = Validator.Checker(({ obj }) => obj({ lifepath: ThingChecks.anyLifepath, lifeseq: ThingChecks.anyLifeseq }))

function rootShellOf(proposed: Partial<Sparse<ThingRecord>>): VoidSentinel {
  const modelkind = ThingChecks.modelkind.parse(proposed.labelpath)
  return Object.freeze(ShellChecks.shell.parse({
    fmt: ThingFormat, label: modelkind, lifepath: Shell.RootVoidLifepath, ...proposed,
  }))
}

function demandConsistentParent(partialThing: Pick<Sparse<ThingRecord>, 'userid' | 'banklabel' | 'labelpath' | 'lifepath'>, parent?: Partial<Sparse<ThingRecord>>): void {
  if (! parent) { return }
  const bankScope = ThingChecks.bankScope.parse(partialThing)
  const parentpath = Labelpath.parentOf(partialThing.labelpath)
  const parentlife = Lifeseq.leadingOf(partialThing.lifepath)
  Validator.demandConsistent({ ...bankScope, labelpath: parentpath, lifepath: parentlife }, parent)
}

/** The shell: the void sentinel that stands for a Thing never created, its citation, and what builds them. */
export const Shell = Object.freeze({
  /** The shell's lifeseq, for life -1. It is never stored, and sorts below every life's. */
  VoidLifeseq,
  /** A root's shell lifepath: the shell's lifeseq alone. */
  RootVoidLifepath: VoidLifeseq,
  /** The citation for a root's birth: the shell, the void sentinel for no Thing stored. */
  Cited: Object.freeze<ThingCited>({ revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifepath: VoidLifeseq }),
  /** The citation for the birth of a child of the Thing at `parentLifepath`: the shell, at the parent's lifepath then the shell's lifeseq. */
  childCited(parentLifepath: Lifepath): ThingCited {
    return Object.freeze({ ...Shell.Cited, lifepath: `${parentLifepath}/${VoidLifeseq}` })
  },
  /** The shell of the Thing `raw` names: the tombstone that stands for it while none is stored.
   * Name a root by its labelpath alone; any other Thing by its labelpath and lifepath, or by its label under `parent`.
   * Refuses a `raw` that disagrees with `parent`.
   */
  of(raw: Partial<Sparse<ThingRecord>>, parent?: Partial<Sparse<ThingRecord>>): VoidSentinel {
    const proposed = ShellChecks.shellScoped.parse(raw)
    if (ThingChecks.modelkind.safeParse(proposed.labelpath).success) { return rootShellOf(proposed) }
    const labels    = Shell.labelpathWithParentage(proposed, parent)
    const lives    = Shell.lifepathWithParentage(proposed, parent)
    const shell    = ShellChecks.shell.parse({ fmt: ThingFormat, ...proposed, ...labels, ...lives })
    demandConsistentParent(shell, parent)
    return Object.freeze(shell)
  },
  /** The labelpath and label of `raw`: its own labelpath, or its label under `parent`'s.
   * It does not check `raw` against `parent`: the caller does.
   */
  labelpathWithParentage(
    raw: Partial<Pick<Sparse<ThingRecord>, 'labelpath' | 'label'>>, parent?: Partial<Pick<Sparse<ThingRecord>, 'labelpath'>>,
  ): Pick<Sparse<ThingRecord>, 'labelpath' | 'label'> {
    if (raw.labelpath) { // if raw has a labelpath, find the label of it; prefer raw so it survives to the consistent check.
      const labelpath = ThingChecks.labelpath.parse(raw.labelpath)
      const label     = raw.label ?? Labelpath.labelOf(labelpath)
      return labelpathWithParentageChecker.parse({ labelpath, label })
    }
    const label      = ThingChecks.label.parse(raw.label)
    const labelpath  = ThingChecks.labelpath.parse(parent?.labelpath) + '/' + label
    return labelpathWithParentageChecker.parse({ labelpath, label })
  },
  /** The lifepath and lifeseq of `raw`: its own lifepath, or its lifeseq under `parent`'s.
   * It does not check `raw` against `parent`: the caller does.
   */
  lifepathWithParentage(raw: Partial<Pick<Sparse<ThingRecord>, 'lifepath' | 'lifeseq'>>, parent?: Partial<Pick<Sparse<ThingRecord>, 'lifepath'>>): Pick<Sparse<ThingRecord>, 'lifepath' | 'lifeseq'> {
    // if raw has a lifepath, find the lifeseq. Consistency check is done by the caller.
    if (raw.lifepath) {
      const lifeseq = Lifeseq.ofLifepath(raw.lifepath)
      return lifepathWithParentageChecker.parse({ lifeseq, lifepath: raw.lifepath })
    }
    // otherwise, build a lifepath from the parent's lifepath and the raw's lifeseq.
    const lifeseq  = raw.lifeseq ?? ''
    const lifepath = ThingChecks.lifepath.parse(parent?.lifepath) + '/' + lifeseq
    return lifepathWithParentageChecker.parse({ lifeseq, lifepath })
  },
})
// --

// == [Reading records]: Tombstone, isVoidSentinel, isWholeRecord, isTombstone, isGone, isSparse, haveSameScope, cmpThings

/** A tombstone of a RecordT, sparse or whole. */
export type Tombstone<RecordT extends Sparse<ThingRecord>> = TombstoneOf<RecordT> | (Sparse<RecordT> & Readonly<{ am: 'x' }>)

/** True when `record` is a void sentinel: its revseq is the shell's -1. */
export function isVoidSentinel(record: Sparse<ThingRecord>): record is VoidSentinel {
  if (! isTombstone(record)) { return false }
  return record.revseq === SX.VoidRevisionSeq
}

// The void sentinel is a whole tombstone, though no record check accepts it: a store must never take a shell as a record.
/** True when `record` is whole, with its body, and not sparse. The void sentinel is whole. */
export function isWholeRecord(record: Sparse<ThingRecord>): record is ThingRecord {
  return isVoidSentinel(record) || ThingChecks.ofLabelpath(record.labelpath).record.safeParse(record).success
}

// Each kind types its `am` as 'a' | 'x', so TypeScript cannot narrow to a tombstone by it.
/** True when `record` is a tombstone, sparse or whole, the void sentinel among them. */
export function isTombstone<RecordT extends ThingRecord>(record: unknown): record is Tombstone<RecordT> {
  return tombstoneChecker.safeParse(record).success
}
/** What every tombstone has, sparse or whole: a Thing's scope and citation, marked deleted. */
const tombstoneChecker = Validator.Checker(({ lit }) => ThingChecks.scopedCited.extend({ am: lit('x') }))

/** True when `record` is the tombstone of a deleted Thing, sparse or whole: any tombstone but the void sentinel. */
export function isGone<RecordT extends ThingRecord>(record: unknown): record is Tombstone<RecordT> {
  return isTombstone(record) && (! isVoidSentinel(record))
}

/** True when `record` is live, and not whole. */
export function isSparse(record: Sparse<ThingRecord>): boolean {
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

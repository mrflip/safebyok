/** The shapes of a Thing, the record every kind is stored as in a vaultDB, and the checks of each. */

import { isEmptyObject } from 'es-toolkit'
import type { AllUnionFields } from 'type-fest'
import type * as Z from 'zod'
import { exactOptional, optional, uuid } from 'zod'
import { CX, EX, SX, Validator } from 'safebyok-big/internals'
import type { ShellOf, TombstoneOf } from './shapes-sealers'
import * as Phrases from '../phrases'
import { type VaultDB, isVaultDB } from '../storage/vault-db'
import { type Lifepath, type Revtok, Labelpath, Lifeseq, VoidLifeseq } from './primitives'
import { WayinChecks } from './shapes-wayin'

// == [Kinds]: thingkindVals, Thingkind, Modelkind, ThingFormat

/** The kinds of Thing: the modelkind at the base of each labelpath. */
export const thingkindVals = ['bank', 'gate', 'box'] as const
/** A kind of Thing, one of {@link thingkindVals}. */
export type Thingkind = typeof thingkindVals[number]

/** A model's `modelkind`: a kind of Thing, or one of the models that are never stored. */
export type Modelkind = Thingkind | 'device' | 'wayin' | 'lease' | 'proving'

/** The `fmt` of every Thing, of every kind: the kind is in its labelpath. Distinct from big's rows' fmts (3001, 4001, 5003), which are numbers. */
export const ThingFormat = 'a010501'

/** True when `labelpath` is one of some kind of Thing's. */
function isLabelpath(labelpath: Labelpath): boolean { return thingkindVals.some((modelkind) => Labelpath.isOfModelkind(labelpath, modelkind)) }
// --

// == [Thing]: isLifepathDeep, isParityRight, GenericChecks, vaultDBShape, PerKindChecks, policiesByModelkind, ThingChecks, ThingScope, ScopeAt, ThingCited, Sealed, Wayins, Sparse, BoxSparse, AnyThingRecord

// A stored lifeseq is 10 base-32 digits; the void lifeseq, -000000001, is never stored. A lifepath joins lifeseqs with '/',
// and every one after a void one is void: a void lifepath is the void lifeseq under its parent's lifepath (void itself
// where nothing is stored there), or alone at a root.
const LifeseqPattern      = /^[0-9a-v]{10}$/
const AnyLifeseqPattern   = /^(?:[0-9a-v]{10}|-000000001)$/
const LifepathPattern     = /^(?:[0-9a-v]{10}\/)*[0-9a-v]{10}$/
const VoidLifepathPattern = /^(?:[0-9a-v]{10}\/)*(?:-000000001\/)*-000000001$/
const AnyLifepathPattern  = /^(?:[0-9a-v]{10}\/)*(?:[0-9a-v]{10}|(?:-000000001\/)*-000000001)$/

type Labelled = { labelpath: Labelpath, label: string }
type Lived    = { lifepath: Lifepath, am: string }
type Revised  = { revtok: Revtok, revseq: number, lifepath: Lifepath }

/** True when a Thing's label is the last segment of its labelpath. A root's label is its modelkind. */
export function isLabelLast({ labelpath, label }: Labelled): boolean { return labelpath.slice(labelpath.lastIndexOf('/') + 1) === label }
/** True when a Thing's lifeseq is the last of its lifepath. */
function isLifeseqOwn({ lifepath, lifeseq }: Lived & { lifeseq: Lifeseq }): boolean { return Lifeseq.ofLifepath(lifepath) === lifeseq }
/** True when a Thing's lifepath has one lifeseq for each segment of its labelpath. */
export function isLifepathDeep({ lifepath, labelpath }: Pick<Lived & Labelled, 'lifepath' | 'labelpath'>): boolean { return lifepath.split('/').length === labelpath.split('/').length }
/** True when a Thing's own lifeseq is odd exactly when it is a tombstone. */
export function isParityRight({ am, lifepath }: Lived): boolean { return (am === 'x') === Lifeseq.isTombstone(Lifeseq.ofLifepath(lifepath)) }
/** True unless the Thing is a deleted main gate. */
function isMainGateLive({ labelpath, am }: Lived & Labelled): boolean { return (labelpath !== Labelpath.MainGate) || (am === 'a') }
/** True unless the box is a tombstone whose sidecar is not empty. */
function isGoneSidecarEmpty({ am, sidecar }: { am: string, sidecar: object }): boolean { return (am === 'a') || isEmptyObject(sidecar) }
// A citation may be the shell, or a live box's sparse form, neither of which has a body.
/** The fields of `shape`, each optional: it may be omitted, or undefined. */
function partialOf<ShapeT extends Z.ZodRawShape>(shape: ShapeT): { [FieldT in keyof ShapeT]: Z.ZodOptional<ShapeT[FieldT]> } {
  // Object.fromEntries loses the fieldnames' types: the cast restores them.
  return Object.fromEntries(Object.entries(shape).map(([fieldname, check]) => [fieldname, optional(check)])) as { [FieldT in keyof ShapeT]: Z.ZodOptional<ShapeT[FieldT]> }
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
  const revisioned   = { am, lifepath, lifeseq, revtok: uuid(Phrases.RevtokShape), revseq: uint, written_at: epochMillis, born_at: epochMillis }
  // Just what the act tables compare. A write may cite the shell, so its revseq and life may be the shell's -1.
  const thingCited   = obj({
    revtok:   revisioned.revtok,
    revseq:   int.min(SX.VoidRevisionSeq),
    am,
    lifepath: anyLifepath,
  })
  // A Thing's scope and citation: what every record, tombstone and shell has, and a live box's sparse form. Its revseq is the shell's -1
  // only beside the void revtok and lifeseq, and they only beside it.
  const scopedCited  = obj({ ...thingScope.shape, ...thingCited.shape }).refine(isShellCitable, Phrases.CitedHalfShell)
  // The fields every live Thing and every tombstone has, a live box's sparse form among them: what the record guards read.
  const scopedLive      = scopedCited.safeExtend({ am: lit('a') })
  const scopedTombstone = scopedCited.safeExtend({ am: lit('x') })
  // A checked record shows its fields in this order, for a reader's eye alone: nothing stored, compared or bound into a
  // ctx takes its order from an object's keys (STYLE.md, *Order comes from an explicit list*).
  const sparse       = obj({ ...thingScope.shape, label, ...revisioned, fmt: lit(ThingFormat) })
  // AdapterVaultDB checks only the shape of a sealed part: what is inside is the sealer's.
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
    thingScope, thingCited, scopedCited, scopedLive, scopedTombstone, sparse, sealed,
  }
})

/** The checks of each kind of Thing: its record, its citation, and the parts of it a kind has.
 * A caller outside the shapes modules reads them through each kind's bundle in shapes-thingkinds.ts: `BankChecks`, `GateChecks`, `BoxChecks`.
 */
export const PerKindChecks = Object.freeze(Validator.Checkers('bad_record', ({ obj, lit, union }) => {
  const { labelpath, anyLifeseq, voidLifeseq, voidLifepath, sparse, thingCited, sealed } = GenericChecks
  const emptyBag     = obj({}).strict()
  const { wayins }   = WayinChecks

  const bankLabelpath = lit('bank')
  const gateLabelpath = labelpath.refine((given) => Labelpath.isOfModelkind(given, 'gate'), Phrases.LabelpathOfOtherKind)
  const boxLabelpath  = labelpath.refine((given) => Labelpath.isOfModelkind(given, 'box'), Phrases.LabelpathOfOtherKind)

  // A stored record is strict: a field this version does not know is damage, or a newer format.
  const bankBase     = obj({
    ...sparse.shape,
    labelpath:      bankLabelpath,
    label:          lit('bank'),
    fmt:            lit(ThingFormat),
    /** Minted at the bank's birth, and kept by each write over the live bank (`Lifetok`). */
    lifetok:        uuid(Phrases.LifetokShape),
  }).strict()
  // A bank's lifetok alone: the check of a banktok.
  const banktok      = bankBase.shape.lifetok
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
  // A live box without its body: the only sparse form of any record. A bank, a gate and a tombstone are whole wherever they appear.
  const boxSparse    = obj({ ...sparse.shape, labelpath: boxLabelpath, am: lit('a') }).strict()
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)

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
  const bankCited    = obj({ ...partialOf(bankBase.shape), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const gateCited    = obj({ ...partialOf(gateBase.shape), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)
  // A box's shell, as a bank gives it, carries the shell's lifeseq.
  const boxCited     = obj({ ...partialOf(boxBase.shape), lifeseq: anyLifeseq.optional(), ...thingCited.shape }).strict()
    .refine(isShellCitable,   Phrases.CitedHalfShell)
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A box's sealable has only its Thing fields and sidecar, so a whisper given with it, sealed or not, is dropped. The
  // shell has no stored row, so its revseq, lifeseq and lifepath may be the shell's, and a Box over it answers an undefined sidecar.
  const boxSealable  = obj({
    ...sparse.shape,
    labelpath:      boxLabelpath,
    fmt:            lit(ThingFormat),
    revseq:         thingCited.shape.revseq,
    lifeseq:        anyLifeseq,
    lifepath:       thingCited.shape.lifepath,
    sidecar:        CX.sidecar.optional(),
  })
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isShellCitable,   Phrases.SealableHalfShell)
  // What a tombstone is sealed over: a live box's sealable.
  const boxLiveSealable = boxSealable.refine(({ am }) => am === 'a', Phrases.TombstoneOfLiveOnly)

  // A bank has its root box whole: live once the bank is born, and its shell before.
  const boxRecord    = boxLive
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
  const shellFields  = {
    ...sparse.shape,
    fmt:            lit(ThingFormat),
    revtok:         lit(SX.VoidRevisionTok),
    revseq:         lit(SX.VoidRevisionSeq),
    am:             lit('x'),
    lifeseq:        voidLifeseq,
    lifepath:       voidLifepath,
    born_at:        lit(SX.VoidTime),
    written_at:     lit(SX.VoidTime),
  }
  /** The check of the shell of a Thing whose labelpath passes `kindLabelpath`: its Thing fields alone, at the void revision */
  function shellAt(kindLabelpath: Z.ZodType<string>) {
    return obj({ ...shellFields, labelpath: kindLabelpath }).strict()
      .refine(isLabelLast,    Phrases.LabelNotLast)
      .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
      .refine(isLifepathDeep, Phrases.LifepathDepth)
  }
  // The bank is a root, its labelpath, label and lifepath fixed: the rules shellAt refines by hold of them already.
  const bankShell    = obj({ ...shellFields, labelpath: bankLabelpath, label: lit('bank'), lifepath: lit(VoidLifeseq) }).strict()
  const gateShell    = shellAt(gateLabelpath)
  const boxShell     = shellAt(boxLabelpath)
  const boxRecordOrShell = union([boxRecord, boxShell])
  return {
    bankLabelpath, gateLabelpath, boxLabelpath, wayins, banktok, bankShell, gateShell, boxShell,
    bankThing, bankCited, gateThing, gateCited, boxThing, boxCited, boxSparse, boxSealable, boxLiveSealable, boxRecord, boxRecordOrShell,
  }
}))

/** The storage policies a write may name, by the modelkind of the Thing it writes: only a gate's write may name any. */
export const policiesByModelkind = Object.freeze({ bank: [], gate: EX.storagePolicyVals, box: [] } as const satisfies Record<Thingkind, readonly EX.StoragePolicy[]>)

/** The check of a host's {@link VaultDB}, by {@link isVaultDB}. */
const vaultDBShape = Validator.Checker(({ custom }) => custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected), 'bad_record')

/** The checks of a Thing's fields, of its citation, of what a write reads of the ante Thing, and of a host's vaultDB.
 * Also `ThingFormat`, the `fmt` of every Thing, and `thingkindVals`, the kinds.
 */
export const ThingChecks = Object.freeze({ ...GenericChecks, vaultDBShape, ThingFormat, thingkindVals })

/** Where a Thing is stored: its user, its bank, and its labelpath under the bank. */
export type ThingScope   = Readonly<Z.infer<typeof ThingChecks.thingScope>>
/** A scope whose labelpath is `LabelpathT`. */
export type ScopeAt<LabelpathT extends Labelpath> = ThingScope & Readonly<{ labelpath: LabelpathT }>
/** A write's citation of the Thing it expects to find: its revision, life and liveness, the only fields AdapterVaultDB compares. The shell may be cited. */
export type ThingCited   = Readonly<Z.infer<typeof ThingChecks.thingCited>>
/** The name of a Thing field: one of the fields every kind of Thing has, which AdapterVaultDB reads. The rest of a record is its body. */
export type ThingFieldname = keyof Z.infer<typeof ThingChecks.sparse>
/** The bank, as a Thing. */
export type BankRecord   = Readonly<Z.infer<typeof PerKindChecks.bankThing>>
/** A gate, as a Thing: the main gate, at `gate`. */
export type GateRecord   = Readonly<Z.infer<typeof PerKindChecks.gateThing>>
/** A box, as a Thing: with its sidecar and sealed whisper. A tombstone's sidecar is `{}`, and its whisper is sealed empty. */
export type BoxRecord    = Readonly<Z.infer<typeof PerKindChecks.boxThing>>
/** Any Thing stored in a vaultDB. */
export type ThingRecord  = BankRecord | GateRecord | BoxRecord
/** Every field of every kind of Thing: those every kind has as they are, the rest optional, and each a union of its kinds' types. */
export type AnyThingRecord = AllUnionFields<ThingRecord>
/** One sealed part of a record, at `<part>_sealed`: a fresh key wrapped under the bankKey, the cleartext ciphered under that key, and the tags its unseal reads. */
export type Sealed       = Readonly<Z.infer<typeof ThingChecks.sealed>>
/** A gate's wayins: `main`, its passphrase wayin, and `passkey0`, its passkey wayin or null for none. */
export type Wayins       = Readonly<Z.infer<typeof PerKindChecks.wayins>>

/** A record's Thing fields, without its body. Only a live box has a sparse form ({@link BoxSparse}): of any other record, these are its Thing fields alone. */
export type Sparse<RecordT extends Sparse<ThingRecord>> = Pick<RecordT, ThingFieldname>
// Stored, a sparse box has neither body field. Typed, each may be left out or undefined, so that a Box over it, whose
// getters answer undefined, ducks as one: no other record field, of any kind or form, is optional.
/** A live box without its body, `sidecar` and `whisper_sealed`, as a listing carries it: the only sparse form of any record. */
export type BoxSparse    = Readonly<Z.infer<typeof PerKindChecks.boxSparse> & { sidecar?: BoxRecord['sidecar'] | undefined, whisper_sealed?: Sealed | undefined }>
// --

// == [Shells]: ShellChecks, VoidSentinel, Shell
// A shell is made only from the void: each of its fixed fields defaults to the shell's, and refuses any other value.

/** A shell, whole: every Thing field of a tombstone and no body, its revseq -1.
 * A write cites it to make a Thing's first revision.
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
    shell: obj({ ...ThingChecks.sparse.shape, lifepath: shellLifepath, ...fixed })
      .refine(isLabelLast,    Phrases.LabelNotLast)
      .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
      .refine(isLifepathDeep, Phrases.LifepathDepth),
  }
})

const labelpathWithParentageChecker = Validator.Checker(() => ThingChecks.sparse.pick({ labelpath: true, label: true }))
const lifepathWithParentageChecker = Validator.Checker(({ obj }) => obj({ lifepath: ThingChecks.anyLifepath, lifeseq: ThingChecks.anyLifeseq }))
const shellAncestorChecker = Validator.Checker(({ obj }) => obj({ labelpath: ThingChecks.labelpath, lifepath: ThingChecks.lifepath }))

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
  /** The citation for the birth of `seen`'s Thing: the shell, in the lives `seen`'s lifepath names for the Things above it. */
  citedInParentLivesOf(seen: Readonly<Pick<Sparse<ThingRecord>, 'lifepath'>>): ThingCited {
    const parentLifepath = Lifeseq.leadingOf(ThingChecks.lifepath.parse(seen.lifepath))
    return (parentLifepath === '') ? Shell.Cited : Shell.childCited(parentLifepath)
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
  /** The shell at `scope`, under `ancestor`, the nearest Thing stored above it, or null where none is.
   * Its lifepath is the ancestor's, then the shell's lifeseq for each level below it down to its own; with no ancestor, the shell's lifeseq at every level.
   * Refuses an `ancestor` that is not above `scope`.
   */
  under({ userid, banklabel, labelpath }: ThingScope, ancestor: Readonly<Pick<ThingRecord, 'labelpath' | 'lifepath'>> | null): VoidSentinel {
    const labels      = ThingChecks.labelpath.parse(labelpath).split('/')
    const above       = (ancestor === null) ? null : shellAncestorChecker.parse(ancestor)
    const aboveLabels = above?.labelpath.split('/') ?? []
    Validator.demandConsistent({ labelpath: labels.slice(0, aboveLabels.length).join('/') }, { labelpath: aboveLabels.join('/') })
    const lifeseqs    = [...(above ? [above.lifepath] : []), ...labels.slice(aboveLabels.length).map(() => VoidLifeseq)]
    return Shell.of({ userid, banklabel, labelpath, lifepath: lifeseqs.join('/') })
  },
  /** The shell at `seen`'s scope, in the lives `seen`'s lifepath names for the Things above it. */
  inParentLivesOf(seen: Readonly<Pick<Sparse<ThingRecord>, 'userid' | 'banklabel' | 'labelpath' | 'lifepath'>>): VoidSentinel {
    const parentpath = Labelpath.parentOf(seen.labelpath)
    return Shell.under(seen, (parentpath === '') ? null : { labelpath: parentpath, lifepath: Lifeseq.leadingOf(seen.lifepath) })
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

// == [Reading records]: Tombstone

/** A tombstone of a RecordT, whole: a tombstone has no sparse form. */
export type Tombstone<RecordT extends Sparse<ThingRecord>> = TombstoneOf<RecordT>
// --

// == [Making a Thing]: BulletproofCallback

/** `callback`, wrapped so that what it throws is dealt with in one stated way, never reaching whoever calls it. */
export type BulletproofCallback = <ArgsT extends unknown[]>(callback: (...args: ArgsT) => void) => ((...args: ArgsT) => void)
// --

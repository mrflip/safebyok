/** The shapes of a Thing, the record every kind is stored as in a vaultDB, and the checks of each. */

import { isEmptyObject } from 'es-toolkit'
import type { AllUnionFields } from 'type-fest'
import type * as Z from 'zod'
import { exactOptional, optional, uuid } from 'zod'
import { CX, EX, SX, Validator } from 'safebyok-big/internals'
import type { ShellOf, TombstoneOf } from './shapes-sealers'
import type { KindRecords } from '../models/base-thing'
import * as Phrases from '../phrases'
import { type VaultDB, isVaultDB } from '../storage/vault-db'
import { type Lifepath, type Revtok, Labelpath, Lifeseq, VoidLifeseq } from './primitives'
import { WayinChecks } from './shapes-wayin'

// == [Kinds]: thingkindVals, Thingkind, Modelkind, ThingFormat

/** The kinds of Thing: a gate, at its bank's banklabel, and a box, under `box`. */
export const thingkindVals = ['gate', 'box'] as const
/** A kind of Thing, one of {@link thingkindVals}. */
export type Thingkind = typeof thingkindVals[number]

/** A model's `modelkind`: a kind of Thing, or one of the models that are never stored. */
export type Modelkind = Thingkind | 'device' | 'wayin' | 'lease' | 'proving'

/** The `fmt` of every Thing, of every kind: the kind is in its `modelkind`. Distinct from big's rows' fmts (3001, 4001, 5003), which are numbers. */
export const ThingFormat = 'a010502'

/** True when `labelpath` is one some kind of Thing may have: one label alone, as a gate's is, or a box's. */
function isLabelpath(labelpath: Labelpath): boolean { return Labelpath.isLabel(labelpath) || Labelpath.isBox(labelpath) }
// --

// == [Thing]: isLifepathDeep, isParityRight, isLabelpathOfKind, GenericChecks, vaultDBShape, PerKindChecks, policiesByModelkind, ThingChecks, TableScope, ThingScope, ScopeAt, ThingCited, Sealed, Wayins, ThingShaped, Sparse, BoxSparse, AnyThingRecord

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

/** True when a Thing's label is the last segment of its labelpath. A root's label is its whole labelpath. */
export function isLabelLast({ labelpath, label }: Labelled): boolean { return labelpath.slice(labelpath.lastIndexOf('/') + 1) === label }
/** True when a Thing's lifeseq is the last of its lifepath. */
function isLifeseqOwn({ lifepath, lifeseq }: Lived & { lifeseq: Lifeseq }): boolean { return Lifeseq.ofLifepath(lifepath) === lifeseq }
/** True when a Thing's lifepath has one lifeseq for each segment of its labelpath. */
export function isLifepathDeep({ lifepath, labelpath }: Pick<Lived & Labelled, 'lifepath' | 'labelpath'>): boolean { return lifepath.split('/').length === labelpath.split('/').length }
/** True when a Thing's own lifeseq is odd exactly when it is a tombstone. */
export function isParityRight({ am, lifepath }: Lived): boolean { return (am === 'x') === Lifeseq.isTombstone(Lifeseq.ofLifepath(lifepath)) }
/** True when a gate's labelpath is its bank's banklabel: the gate's labelpath rule. */
function isGateAtBanklabel({ banklabel, labelpath }: Pick<Labelled, 'labelpath'> & { banklabel: string }): boolean { return labelpath === banklabel }
/** True when a Thing's labelpath follows the rule of its stated `modelkind`: a gate's is its bank's banklabel, and a box's is `box` or one label under it. */
export function isLabelpathOfKind({ modelkind, banklabel, labelpath }: { modelkind: Thingkind, banklabel: string, labelpath: Labelpath }): boolean {
  return (modelkind === 'gate') ? isGateAtBanklabel({ banklabel, labelpath }) : Labelpath.isBox(labelpath)
}
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
const GenericChecks = Validator.Checkers('bad_record', ({ obj, str, int, uint, lit, oneof, user_id, label, banklabel, epochMillis }) => {
  const modelkind    = oneof(thingkindVals)
  const labelpath    = str.refine(isLabelpath, Phrases.LabelpathShape)
  const lifeseq      = str.regex(LifeseqPattern, Phrases.LifeseqShape)
  const voidLifeseq  = lit(VoidLifeseq)
  const anyLifeseq   = str.regex(AnyLifeseqPattern, Phrases.LifeseqShape)
  const lifepath     = str.regex(LifepathPattern, Phrases.LifepathShape)
  const voidLifepath = str.regex(VoidLifepathPattern, Phrases.LifepathShape)
  const anyLifepath  = str.regex(AnyLifepathPattern, Phrases.LifepathShape)
  const am           = SX.am.exclude(['d'])
  const bankScope    = obj({ userid: user_id, banklabel })
  const tableScope   = obj({ modelkind, ...bankScope.shape })
  // The kind leads, as a table's name leads a row's key: a bank labelled `box` has its gate and its root box at `box`.
  const thingScope   = tableScope.extend({ labelpath }).refine(isLabelpathOfKind, Phrases.LabelpathOfOtherKind)
  // A revtok is minted by crypto.randomUUID; the void revtok is the nil UUID.
  const revisioned   = { am, lifepath, lifeseq, revtok: uuid(Phrases.RevtokShape), revseq: uint, written_at: epochMillis, born_at: epochMillis }
  // Minted at each birth of a bank, stored on its gate, and copied onto each box at its seal: the bank's life it was written in.
  const banktok      = uuid(Phrases.BanktokShape)
  // Just what the act tables compare. A write may cite the shell, so its revseq and life may be the shell's -1.
  const thingCited   = obj({
    revtok:   revisioned.revtok,
    revseq:   int.min(SX.VoidRevisionSeq),
    am,
    lifepath: anyLifepath,
  })
  // A Thing's scope, kind and citation: what every record, tombstone and shell has, and a live box's sparse form. Its revseq is the shell's -1
  // only beside the void revtok and lifeseq, and they only beside it.
  const scopedCited  = obj({ ...thingScope.shape, ...thingCited.shape })
    .refine(isShellCitable,    Phrases.CitedHalfShell)
    .refine(isLabelpathOfKind, Phrases.LabelpathOfOtherKind)
  // The fields every live Thing and every tombstone has, a live box's sparse form among them: what the record guards read.
  const scopedLive      = scopedCited.safeExtend({ am: lit('a') })
  const scopedTombstone = scopedCited.safeExtend({ am: lit('x') })
  // A checked record shows its fields in this order, for a reader's eye alone: nothing stored, compared or bound into a
  // ctx takes its order from an object's keys (STYLE.md, *Order comes from an explicit list*).
  const sparse       = obj({ ...thingScope.shape, label, banktok, ...revisioned, fmt: lit(ThingFormat) })
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
    modelkind, labelpath, anyLifeseq, voidLifeseq, anyLifepath, voidLifepath, ...revisioned, banklabel, bankScope, label, banktok,
    tableScope, thingScope, thingCited, scopedCited, scopedLive, scopedTombstone, sparse, sealed,
  }
})

/** The checks of each kind of Thing: its record, its citation, and the parts of it a kind has.
 * A caller outside the shapes modules reads them through each kind's bundle in shapes-thingkinds.ts: `GateChecks`, `BoxChecks`.
 */
export const PerKindChecks = Object.freeze(Validator.Checkers('bad_record', ({ obj, lit, union, discrim }) => {
  const { labelpath, anyLifeseq, voidLifeseq, voidLifepath, sparse, thingCited, sealed, banktok } = GenericChecks
  const emptyBag     = obj({}).strict()
  const { wayins }   = WayinChecks
  // A gate's tombstone keeps no wayin: each place is null, so no wrapped bankKey, salt or credential id outlives the bank.
  const goneWayins   = obj({ main: lit(null), passkey0: lit(null) }).strict()

  // A gate's labelpath alone can be checked only as a label: that it is its bank's banklabel takes the banklabel beside it.
  const gateLabelpath = labelpath.refine(Labelpath.isLabel, Phrases.GateNotAtBanklabel)
  // Typed as a plain labelpath, as every record's is: the refine's return type keeps TypeScript from narrowing it.
  const boxLabelpath  = labelpath.refine((given): boolean => Labelpath.isBox(given), Phrases.LabelpathOfOtherKind)

  // A stored record is strict: a field this version does not know is damage, or a newer format.
  const gateBase     = obj({
    ...sparse.shape,
    modelkind:      lit('gate'),
    labelpath:      gateLabelpath,
    fmt:            lit(ThingFormat),
    wayins:         union([wayins, goneWayins]),
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
    modelkind:      lit('box'),
    labelpath:      boxLabelpath,
    fmt:            lit(ThingFormat),
    sidecar:        CX.sidecar,
    whisper_sealed: sealed,
  }).strict()
  const boxLive      = boxBase.extend({ am: lit('a') })
  // A live box without its body: the only sparse form of any record. A gate and a tombstone are whole wherever they appear.
  const boxSparse    = obj({ ...sparse.shape, modelkind: lit('box'), labelpath: boxLabelpath, am: lit('a') }).strict()
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)

  // A gate is live, with its wayins, or a tombstone, its bank's end, with none.
  const gateLive     = gateBase.extend({ am: lit('a'), wayins })
  const gateGone     = gateBase.extend({ am: lit('x'), wayins: goneWayins })
  const gateThing    = discrim('am', [gateLive, gateGone])
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isGateAtBanklabel, Phrases.GateNotAtBanklabel)
  const gateRecord   = gateLive
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isGateAtBanklabel, Phrases.GateNotAtBanklabel)
  const boxThing     = boxBase
    .refine(isLabelLast,    Phrases.LabelNotLast)
    .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
    .refine(isLifepathDeep, Phrases.LifepathDepth)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isGoneSidecarEmpty, Phrases.TombstoneSidecarNotEmpty)

  // A citation must carry what ThingCited names; any other field of its kind it carries must check, a gate's as its liveness has it.
  const gateCited    = discrim('am', [
    obj({ ...partialOf(gateLive.shape), ...thingCited.shape, am: lit('a') }).strict(),
    obj({ ...partialOf(gateGone.shape), ...thingCited.shape, am: lit('x') }).strict(),
  ])
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
    modelkind:      lit('box'),
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
    banktok:        lit(SX.VoidLifeTok),
    am:             lit('x'),
    lifeseq:        voidLifeseq,
    lifepath:       voidLifepath,
    born_at:        lit(SX.VoidTime),
    written_at:     lit(SX.VoidTime),
  }
  /** The check of the shell of a Thing of `modelkind`, whose labelpath passes `kindLabelpath`: its Thing fields alone, at the void revision */
  function shellAt<KindT extends Thingkind>(modelkind: KindT, kindLabelpath: Z.ZodType<Labelpath>) {
    return obj({ ...shellFields, modelkind: lit(modelkind), labelpath: kindLabelpath }).strict()
      .refine(isLabelLast,    Phrases.LabelNotLast)
      .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
      .refine(isLifepathDeep, Phrases.LifepathDepth)
  }
  const gateShell    = shellAt('gate', gateLabelpath).refine(isGateAtBanklabel, Phrases.GateNotAtBanklabel)
  const boxShell     = shellAt('box', boxLabelpath)
  const boxRecordOrShell = union([boxRecord, boxShell])
  return {
    gateLabelpath, boxLabelpath, wayins, banktok, gateShell, boxShell,
    gateThing, gateRecord, gateCited, boxThing, boxCited, boxSparse, boxSealable, boxLiveSealable, boxRecord, boxRecordOrShell,
  }
}))

/** The storage policies a write may name, by the modelkind of the Thing it writes: only a gate's write may name any. */
export const policiesByModelkind = Object.freeze({ gate: EX.storagePolicyVals, box: [] } as const satisfies Record<Thingkind, readonly EX.StoragePolicy[]>)

/** The check of a host's {@link VaultDB}, by {@link isVaultDB}. */
const vaultDBShape = Validator.Checker(({ custom }) => custom<VaultDB>(isVaultDB, Phrases.VaultDBExpected), 'bad_record')

/** The checks of a Thing's fields, of its citation, of what a write reads of the prior Thing, and of a host's vaultDB.
 * Also `ThingFormat`, the `fmt` of every Thing, and `thingkindVals`, the kinds.
 */
export const ThingChecks = Object.freeze({ ...GenericChecks, vaultDBShape, ThingFormat, thingkindVals })

/** The Things of one kind in one bank: the part of a {@link ThingScope} a table of one bank shares. */
export type TableScope   = Readonly<Z.infer<typeof ThingChecks.tableScope>>
/** Where a Thing is stored, which names it: its kind, its user, its bank, and its labelpath among the bank's Things of its kind. */
export type ThingScope   = Readonly<Z.infer<typeof ThingChecks.thingScope>>
/** A scope whose labelpath is `LabelpathT`. */
export type ScopeAt<LabelpathT extends Labelpath> = ThingScope & Readonly<{ labelpath: LabelpathT }>
/** A write's citation of the Thing it expects to find: its revision, life and liveness, the only fields AdapterVaultDB compares. The shell may be cited. */
export type ThingCited   = Readonly<Z.infer<typeof ThingChecks.thingCited>>
/** The name of a Thing field: one of the fields every kind of Thing has, which AdapterVaultDB reads. The rest of a record is its body. */
export type ThingFieldname = keyof Z.infer<typeof ThingChecks.sparse>
/** A gate, as a Thing: the bank's one gate, at its banklabel, with the bank's banktok. Live, it has its wayins; its tombstone, the bank's end, has each wayin place null. */
export type GateRecord   = Readonly<Z.infer<typeof PerKindChecks.gateThing>>
/** A box, as a Thing: with its sidecar and sealed whisper. A tombstone's sidecar is `{}`, and its whisper is sealed empty. */
export type BoxRecord    = Readonly<Z.infer<typeof PerKindChecks.boxThing>>
/** Any Thing stored in a vaultDB. */
export type ThingRecord  = GateRecord | BoxRecord
/** Every field of every kind of Thing: those every kind has as they are, the rest optional, and each a union of its kinds' types. */
export type AnyThingRecord = AllUnionFields<ThingRecord>
/** One sealed part of a record, at `<part>_sealed`: a fresh key wrapped under the bankKey, the cleartext ciphered under that key, and the tags its unseal reads. */
export type Sealed       = Readonly<Z.infer<typeof ThingChecks.sealed>>
/** A gate's wayins: `main`, its passphrase wayin, and `passkey0`, its passkey wayin or null for none. */
export type Wayins       = Readonly<Z.infer<typeof PerKindChecks.wayins>>

/** The Thing fields of whatever is shaped as a Thing, a lease among them: every one but `modelkind`, which a Thing alone has. */
export type ThingShaped  = Readonly<Omit<Z.infer<typeof ThingChecks.sparse>, 'modelkind'>>
/** A record's Thing fields, without its body: a lease's have no `modelkind`. Only a live box has a sparse form ({@link BoxSparse}): of a gate or a tombstone, these are its Thing fields alone. */
export type Sparse<RecordT extends ThingShaped> = Pick<RecordT, ThingFieldname & keyof RecordT>
// Stored, a sparse box has neither body field. Typed, each may be left out or undefined, so that a Box over it, whose
// getters answer undefined, ducks as one: no other record field, of any kind or form, is optional.
/** A live box without its body, `sidecar` and `whisper_sealed`, as a list answers it: the only sparse form of any record. */
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
      modelkind: ThingChecks.modelkind,
      labelpath: exactOptional(ThingChecks.thingScope.shape.labelpath),
      label:     exactOptional(label),
      lifepath:  exactOptional(shellLifepath),
      fmt:       exactOptional(lit(ThingFormat)),
      ...fixed,
    }),
    // The rules of a record that a proposed shell must meet.
    // An ask's banktok is its sender's, never the shell's: what is proposed has none, and the shell's is the void banktok.
    shell: obj({ ...ThingChecks.sparse.shape, lifepath: shellLifepath, ...fixed, banktok: lit(SX.VoidLifeTok).default(SX.VoidLifeTok) })
      .refine(isLabelLast,    Phrases.LabelNotLast)
      .refine(isLifeseqOwn,   Phrases.LifeseqNotOwn)
      .refine(isLifepathDeep, Phrases.LifepathDepth)
      .refine(isLabelpathOfKind, Phrases.LabelpathOfOtherKind),
  }
})

const labelpathWithParentageChecker = Validator.Checker(() => ThingChecks.sparse.pick({ labelpath: true, label: true }))
const lifepathWithParentageChecker = Validator.Checker(({ obj }) => obj({ lifepath: ThingChecks.anyLifepath, lifeseq: ThingChecks.anyLifeseq }))
const shellAncestorChecker = Validator.Checker(({ obj }) => obj({ labelpath: ThingChecks.labelpath, lifepath: ThingChecks.lifepath }))

/** The shell of the root at `labelpath`: its label is its labelpath. */
function rootShellOf(proposed: Partial<Sparse<ThingRecord>>, labelpath: Labelpath): VoidSentinel {
  return Object.freeze(ShellChecks.shell.parse({
    fmt: ThingFormat, label: labelpath, lifepath: Shell.RootVoidLifepath, ...proposed,
  }))
}

// A Thing's parent is of its own kind: a box's is a box, and a gate has none.
function demandConsistentParent(partialThing: Pick<Sparse<ThingRecord>, 'userid' | 'banklabel' | 'modelkind' | 'labelpath' | 'lifepath'>, parent?: Partial<Sparse<ThingRecord>>): void {
  if (! parent) { return }
  const bankScope = ThingChecks.bankScope.parse(partialThing)
  const parentpath = Labelpath.parentOf(partialThing.labelpath)
  const parentlife = Lifeseq.leadingOf(partialThing.lifepath)
  Validator.demandConsistent({ ...bankScope, modelkind: partialThing.modelkind, labelpath: parentpath, lifepath: parentlife }, parent)
}

/** The shell: the void sentinel that stands for a Thing never created, its citation, and what builds them. */
export const Shell = Object.freeze({
  /** The shell's lifeseq, for life -1. It is never stored, and sorts below every life's. */
  VoidLifeseq,
  /** A root's shell lifepath: the shell's lifeseq alone. */
  RootVoidLifepath: VoidLifeseq,
  /** The citation for a root's birth: the shell, the void sentinel, which cites no row. */
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
  // The shell's modelkind is the one `raw` names, as its check keeps it: TypeScript cannot follow it through the check.
  /** The shell of the Thing `raw` names: the tombstone that stands for it while none is stored.
   * Name its modelkind, and a root by its labelpath alone; any other Thing by its labelpath and lifepath, or by its label under `parent`.
   * Refuses a `raw` that disagrees with `parent`.
   */
  of<KindT extends Thingkind>(raw: Partial<Sparse<ThingRecord>> & Readonly<{ modelkind: KindT }>, parent?: Partial<Sparse<ThingRecord>>): ShellOf<KindRecords[KindT]> {
    const proposed = ShellChecks.shellScoped.parse(raw)
    if ((proposed.labelpath !== undefined) && (Labelpath.parentOf(proposed.labelpath) === '')) { return rootShellOf(proposed, proposed.labelpath) as ShellOf<KindRecords[KindT]> }
    const labels    = Shell.labelpathWithParentage(proposed, parent)
    const lives    = Shell.lifepathWithParentage(proposed, parent)
    const shell    = ShellChecks.shell.parse({ fmt: ThingFormat, ...proposed, ...labels, ...lives })
    demandConsistentParent(shell, parent)
    return Object.freeze(shell) as ShellOf<KindRecords[KindT]>
  },
  /** The shell of the Thing at `scope`, under `ancestor`, the nearest Thing stored above it, or null where none is.
   * Its lifepath is the ancestor's, then the shell's lifeseq for each level below it down to its own; with no ancestor, the shell's lifeseq at every level.
   * Refuses an `ancestor` that is not above `scope`.
   */
  under<KindT extends Thingkind>({ modelkind, userid, banklabel, labelpath }: ThingScope & Readonly<{ modelkind: KindT }>, ancestor: Readonly<Pick<ThingRecord, 'labelpath' | 'lifepath'>> | null): ShellOf<KindRecords[KindT]> {
    const labels      = ThingChecks.labelpath.parse(labelpath).split('/')
    const above       = (ancestor === null) ? null : shellAncestorChecker.parse(ancestor)
    const aboveLabels = above?.labelpath.split('/') ?? []
    Validator.demandConsistent({ labelpath: labels.slice(0, aboveLabels.length).join('/') }, { labelpath: aboveLabels.join('/') })
    const lifeseqs    = [...(above ? [above.lifepath] : []), ...labels.slice(aboveLabels.length).map(() => VoidLifeseq)]
    return Shell.of({ modelkind, userid, banklabel, labelpath, lifepath: lifeseqs.join('/') })
  },
  /** The shell of `seen`'s Thing, in the lives `seen`'s lifepath names for the Things above it. */
  inParentLivesOf<KindT extends Thingkind>(seen: Readonly<Pick<Sparse<ThingRecord>, 'userid' | 'banklabel' | 'labelpath' | 'lifepath'> & { modelkind: KindT }>): ShellOf<KindRecords[KindT]> {
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
export type Tombstone<RecordT extends ThingShaped> = TombstoneOf<RecordT>
// --

// == [Making a Thing]: BulletproofCallback

/** `callback`, wrapped so that what it throws is dealt with in one stated way, never reaching whoever calls it. */
export type BulletproofCallback = <ArgsT extends unknown[]>(callback: (...args: ArgsT) => void) => ((...args: ArgsT) => void)
// --

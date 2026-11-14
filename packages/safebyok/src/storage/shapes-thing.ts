/** The shapes of a Thing, the record a vaultDB stores every kind as, and of the asks a vaultDB takes. */

import type * as Z from 'zod'
import { BX, type Consts, EX, Errors, SX, Validator } from 'safebyok-big/internals'
import * as Phrases from '../phrases'

// == [Lifeseqs]: ShellLifeseq, ShellLifepath, lifeseqOf, seqOfLifeseq, isGoneLifeseq

/** How many base-32 digits a stored lifeseq has. */
const LifeseqDigits = 10

/** The shell's lifeseq, life -1: never stored, so the one lifeseq that is not 10 digits. */
export const ShellLifeseq = '-1'
/** The shell's lifepath: its lifeseq after a `/`, as at depth 1. */
export const ShellLifepath = `/${ShellLifeseq}`

/** The lifeseq of life `seq`: its base-32 digits, `0-9a-v`, padded to 10, so that lifeseqs sort as their lives do. */
export function lifeseqOf(seq: number): string { return seq.toString(32).padStart(LifeseqDigits, '0') }

/** The life `lifeseq` names: -1 for the shell's. */
export function seqOfLifeseq(lifeseq: string): number { return Number.parseInt(lifeseq, 32) }

/** True when `lifeseq` is a tombstone's: an odd life, the shell's among them. */
export function isGoneLifeseq(lifeseq: string): boolean { return Math.abs(seqOfLifeseq(lifeseq) % 2) === 1 }
// --

// == [Kinds]: thingkindVals, Thingkind, GateThingFormat, isLabelpath

/** The kinds of Thing: the modelkind at the base of each labelpath. */
export const thingkindVals = ['bank', 'gate', 'box'] as const satisfies readonly Consts.Modelkind[]
/** A kind of Thing, one of {@link thingkindVals}. */
export type Thingkind = typeof thingkindVals[number]

/** The `fmt` of the main gate's Thing: its own, so that it is never read as big's gate row (4001). */
export const GateThingFormat = 4101

/** True when `labelpath` is a Thing's kind, then one or more labels, each after a `/`. */
function isLabelpath(labelpath: string): boolean {
  const [thingkind = '', ...labels] = labelpath.split('/')
  return (thingkindVals as readonly string[]).includes(thingkind) && (labels.length > 0) && labels.every((label) => Validator.Kit.label.safeParse(label).success)
}
// --

// == [Thing]: thingScope, thingMeta, expectedMeta, gateThing, gateExpected, ThingScope, ThingMeta, ExpectedMeta, GateThing, GateExpected, Thing, ShellMeta

const LifeseqPattern  = /^[\da-v]{10}$/
const LifepathPattern = /^(?:\/[\da-v]{10})+$/

type Lived    = { lifeseq: string, lifepath: string, am: string }
type Revised  = { revtok: string, revseq: number, lifeseq: string }

/** True when a Thing is written at depth 1: its lifepath is its own lifeseq alone. */
function isLifepathOwn({ lifepath, lifeseq }: Lived): boolean { return lifepath === `/${lifeseq}` }
/** True when a Thing's lifeseq is odd exactly when it is a tombstone. */
function isParityRight({ am, lifeseq }: Lived): boolean { return (am === 'x') === isGoneLifeseq(lifeseq) }
/** True unless the Thing is the main gate, deleted: the main gate is never deleted. */
function isMainGateLive({ label, am }: { label?: string, am: string }): boolean { return (label !== 'main') || (am === 'a') }
/** True when an expected record is the shell in all three of its marks, or in none. */
function isShellWhole({ revtok, revseq, lifeseq }: Revised): boolean {
  const isShell = (revseq === SX.VoidRevisionSeq)
  return (isShell === (revtok === SX.VoidRevisionTok)) && (isShell === (lifeseq === ShellLifeseq))
}

/** The checks of a Thing's fields, and of the main gate as a Thing, as proposed and as expected. */
export const { thingScope, thingMeta, expectedMeta, gateThing, gateExpected } = Validator.Checkers('bad_record', ({ obj, str, int, uint, lit, union, user_id, label, epochMillis }) => {
  const labelpath    = str.refine(isLabelpath, Phrases.LabelpathShape)
  const lifeseq      = str.regex(LifeseqPattern, Phrases.LifeseqShape)
  const lifepath     = str.regex(LifepathPattern, Phrases.LifepathShape)
  const am           = SX.am.exclude(['d'])
  const thingScope   = obj({ userid: user_id, banklabel: label, labelpath })
  const thingMeta    = obj({ revtok: str.min(1), revseq: uint, am, lifeseq, lifepath, born_at: epochMillis })
  const expectedMeta = thingMeta.extend({
    revseq:   int.min(SX.VoidRevisionSeq),
    lifeseq:  union([lifeseq, lit(ShellLifeseq)]),
    lifepath: union([lifepath, lit(ShellLifepath)]),
  })
  const emptyBag     = obj({}).strict()
  // A stored record is strict: a field this version does not know is damage, or a newer format.
  const gateBase     = obj({
    ...thingScope.shape, ...thingMeta.shape,
    labelpath:  lit('gate/main'),
    label:      lit('main'),
    fmt:        lit(GateThingFormat),
    written_at: epochMillis,
    wayins:     BX.wayins,
    /** Reserved: always empty, and read by nothing. */
    auth:       emptyBag,
    /** Reserved: always empty, and read by nothing. */
    sigs:       emptyBag,
    /** Reserved: always empty, and read by nothing. */
    meta:       emptyBag,
  }).strict()
  const gateThing    = gateBase
    .refine(isLifepathOwn,  Phrases.LifepathNotOwn)
    .refine(isParityRight,  Phrases.LifeseqParity)
    .refine(isMainGateLive, Phrases.MainGateDeleted)
  // What is expected need carry only its meta; any other field of the gate it carries must check.
  const gateExpected = gateBase.partial().extend(expectedMeta.shape).strict()
    .refine(isShellWhole,  Phrases.ExpectedHalfShell)
    .refine(isLifepathOwn, Phrases.LifepathNotOwn)
    .refine(isParityRight, Phrases.LifeseqParity)
  return { thingScope, thingMeta, expectedMeta, gateThing, gateExpected }
})

/** Where a Thing is stored: its user, its bank, and its labelpath under the bank. */
export type ThingScope   = Readonly<Z.infer<typeof thingScope>>
/** What the store compares of a Thing expected and the one stored: its revision, its life and its liveness. */
export type ThingMeta    = Readonly<Z.infer<typeof thingMeta>>
/** The meta of the Thing a write expects to find, which may be the shell's. */
export type ExpectedMeta = Readonly<Z.infer<typeof expectedMeta>>
/** The main gate, as a Thing. */
export type GateThing    = Readonly<Z.infer<typeof gateThing>>
/** The main gate a write expects to find: its meta, and any of its other fields. */
export type GateExpected = Readonly<Z.infer<typeof gateExpected>>
/** Any Thing a vaultDB stores: the main gate alone, for now. */
export type Thing        = GateThing

/** The meta of the shell, the void sentinel for no Thing stored: what a birth expects. */
export const ShellMeta: ExpectedMeta = Object.freeze({
  revtok: SX.VoidRevisionTok, revseq: SX.VoidRevisionSeq, am: 'x', lifeseq: ShellLifeseq, lifepath: ShellLifepath, born_at: SX.VoidTime,
})
// --

// == [Each kind's checks]: KindChecks, kindChecksOf

/** The checks of each kind of Thing a vaultDB stores: the record proposed, the record expected, and the record stored. */
const KindChecks = {
  gate: { record: gateThing, expected: gateExpected, stored: gateThing.refusingAs('damaged_row') },
} as const

/** The checks of the kind of Thing at `labelpath`, or throw `bad_option` for a kind this vaultDB does not store yet */
export function kindChecksOf(labelpath: string): typeof KindChecks.gate {
  if (! labelpath.startsWith('gate/')) { throw new Errors.VaultError('bad_option', Phrases.ThingkindNotStored) }
  return KindChecks.gate
}
// --

// == [Asks]: AskChecks, GetThingAsk, WriteThingAsk, checkedGetThingAsk, checkedWriteThingAsk, checkWriteInvariants, demandHeld

/** The checks of a vaultDB ask, its records aside, and of a watch's scope. */
const AskChecks = Validator.Checkers('bad_option', ({ obj, arr, lit, unk, oneof }) => {
  const thingOptions = obj({
    /** The storage policies the write must keep, each over the Thing stored. */
    policies: arr(oneof(EX.storagePolicyVals)),
  }).strict()
  return {
    getThingAsk:     thingScope.extend({ op: lit('get'), ifAbsent: SX.ifAbsent }).strict(),
    writeThingAsk:   thingScope.extend({
      op: lit('write'), expected: unk, record: unk, ifAbsent: SX.putIfAbsent, ifPresent: SX.ifPresent, options: thingOptions.optional(),
    }).strict(),
    thingWatchScope: thingScope.pick({ userid: true, banklabel: true }),
  }
})
/** The check of a watch's scope: a bank. */
export const { thingWatchScope } = AskChecks

/** An ask for the Thing at its scope. */
export type GetThingAsk     = Readonly<Z.infer<typeof AskChecks.getThingAsk>>
/** An ask to write `record` over the Thing `expected`: a live record puts it, a tombstone deletes it. */
export type WriteThingAsk   = Readonly<Omit<Z.infer<typeof AskChecks.writeThingAsk>, 'expected' | 'record'> & { expected: GateExpected, record: GateThing }>
/** The scope a watch hears: a bank. */
export type ThingWatchScope = Readonly<Z.infer<typeof thingWatchScope>>

/** `ask`, checked, or throw `bad_option` */
export function checkedGetThingAsk(ask: unknown): GetThingAsk {
  const checked = AskChecks.getThingAsk.parse(ask)
  kindChecksOf(checked.labelpath)
  return checked
}

/** `ask`, with its records checked by their kind and against each other, or throw `bad_option` or `bad_record` */
export function checkedWriteThingAsk(ask: unknown): WriteThingAsk {
  const { expected, record, ...rest } = AskChecks.writeThingAsk.parse(ask)
  const checks  = kindChecksOf(rest.labelpath)
  const checked = { ...rest, expected: checks.expected.parse(expected), record: checks.record.parse(record) }
  checkWriteInvariants(checked)
  return checked
}

/** Refuse a write whose record does not follow from the one it expects. */
function checkWriteInvariants({ expected, record, options, userid, banklabel, labelpath }: WriteThingAsk): void {
  const isLifeFlipped = (record.am !== expected.am)
  demandHeld(record.revseq === expected.revseq + 1,                                                      Phrases.RevseqNotNext)
  demandHeld((record.revtok !== expected.revtok) && (record.revtok !== SX.VoidRevisionTok),              Phrases.RevtokNotNew)
  demandHeld(Validator.isConsistent(record, { userid, banklabel, labelpath }),                           Phrases.RecordOfOtherScope)
  demandHeld((record.am === 'a') || (expected.am === 'a'),                                               Phrases.TombstoneOverTombstone)
  demandHeld(seqOfLifeseq(record.lifeseq) === seqOfLifeseq(expected.lifeseq) + (isLifeFlipped ? 1 : 0),  Phrases.LifeseqNotNext)
  if (record.am === 'a') {
    demandHeld(isLifeFlipped ? (record.born_at === record.written_at) : (record.born_at === expected.born_at), Phrases.BornAtNotKept)
  }
  if (options?.policies.includes('replace_passphrase')) { demandHeld(expected.wayins?.main !== undefined, Phrases.TestimonyMissing) }
}

/** Throw `bad_record`, saying `phrase`, unless `isHeld` */
function demandHeld(isHeld: boolean, phrase: string): void {
  if (! isHeld) { throw new Errors.VaultError('bad_record', phrase) }
}
// --

// == [Loggable asks]: loggableAsk, LoggableAsk, loggableAskOf

/** The part of an ask that is safe to log: its scope, its flags, and each record's meta, never a gate's wayins.
 * Each field is optional, so that a refusal of an ask that is not whole carries what of it was sound.
 */
export const loggableAsk = Validator.objStrip(({ obj, arr, oneof, user_id, label }) => {
  const meta = expectedMeta.partial()
  return {
    op:        oneof(['get', 'write']).optional(),
    userid:    user_id.optional(),
    banklabel: label.optional(),
    labelpath: thingScope.shape.labelpath.optional(),
    ifAbsent:  SX.anyIfAbsent.optional(),
    ifPresent: SX.ifPresent.optional(),
    options:   obj({ policies: arr(oneof(EX.storagePolicyVals)) }).optional(),
    expected:  meta.optional(),
    record:    meta.optional(),
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

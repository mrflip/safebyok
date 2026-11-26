/** What `AdapterVaultDB` makes of a datastore's manifest of a get or a write: each row checked once, the act its tags find in the act tables of `notes/answer-contract.md`, and the answer. */

import { CX, EX, type Errors, SX, Validator } from 'safebyok-big/internals'
import { Labelpath, type Lifetok } from '../shapes/primitives'
import { type ThingRecord, type ThingScope, PerKindChecks, Shell } from '../shapes/shapes-thing'
import { BankChecks, BoxChecks, GateChecks, ThingkindChecks } from '../shapes/shapes-thingkinds'
import { type AnyAsk, type GetAsk, type Track, type Tracked, type WriteAsk, loggableAskOf } from '../shapes/shapes-asks'
import type { GetThingAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import {
  type CheckedGetManifest, type CheckedManifestRows, type CheckedWriteManifest, type GetManifest, type GetTags, type ScribedGetManifest, type ScribedWriteManifest, type WriteManifest, type WriteTags,
  ManifestChecks,
} from '../shapes/shapes-manifest'
import * as ManifestTags from './manifest-tags'
import * as Throwers from '../refusals/throwers'

// == [Observations]: checkGetObservations, checkWriteObservations, checkedRowsOf, checkedRowOf, checkedAncestorOf, checkedBanktokOf, checkedTrackedOf, trackedEntryOf
// A row that fails its kind's checks is incompatible: a record our code would not write, which refuses `damaged_row`. A manifest
// that is malformed, or a row that is no object, means the datastore or its concrete adapter is broken, and refuses `storage_issue`.

/** Check a get's manifest in place: its tags, and each row once. */
export function checkGetObservations(ask: GetAsk, manifest: GetManifest): asserts manifest is GetManifest & CheckedGetManifest {
  Object.assign(manifest, { ...checkedRowsOf(ask, manifest), tags: ManifestChecks.getTags.parse(manifest.tags) })
}

/** Check a write's manifest in place: its tags, and each row once. */
export function checkWriteObservations(ask: WriteAsk, manifest: WriteManifest): asserts manifest is WriteManifest & CheckedWriteManifest {
  Object.assign(manifest, { ...checkedRowsOf(ask, manifest), tags: ManifestChecks.writeTags.parse(manifest.tags) })
}

/** The rows of a get's or a write's manifest, each checked once. The ancestor is read only where there is no actual row. */
function checkedRowsOf(ask: GetAsk | WriteAsk, manifest: GetManifest | WriteManifest): CheckedManifestRows {
  const actual = checkedRowOf(ask, manifest.actual)
  return {
    actual,
    ancestor: (actual === null) ? checkedAncestorOf(ask, manifest.ancestor) : null,
    banktok:  checkedBanktokOf(manifest.banktok),
    tracked:  checkedTrackedOf(ask, manifest.tracked),
    read_tc:  ManifestChecks.read_tc.parse(manifest.read_tc),
  }
}

/** The raw `row` a datastore read at `scope`, checked by its kind but not its address, or null for none. */
function checkedRowOf({ labelpath }: Pick<ThingScope, 'labelpath'>, row: unknown): ThingRecord | null {
  if (row === null) { return null }
  if (! CX.isPlainBag(row)) { throw Throwers.storageIssue() }
  return ThingkindChecks.ofLabelpath(labelpath).stored.parse(row)
}

// The ancestor is found by a prefix of the scope, not by an address, and the shell is built from it: its address is checked here, where it is read.
/** The nearest row above `scope`, checked by its kind and its address, or null for none. */
function checkedAncestorOf({ userid, banklabel, labelpath }: ThingScope, row: unknown): ThingRecord | null {
  if (row === null) { return null }
  const abovepath = ManifestTags.fieldOf(row, 'labelpath')
  if ((typeof abovepath !== 'string') || (! labelpath.startsWith(`${abovepath}/`))) { throw Throwers.rowOfOtherAddress(['labelpath']) }
  const ancestor: ThingRecord = ThingkindChecks.ofLabelpath(abovepath).stored.parse(row)
  const fieldnames = Validator.disagreeingFieldnames(ancestor, { userid, banklabel, labelpath: abovepath })
  if (fieldnames.length > 0) { throw Throwers.rowOfOtherAddress(fieldnames) }
  return ancestor
}

// A banktok is news, never the verdict: one that is no lifetok reads as the void lifetok, and the step's answer stands.
// Unspecified for a damaged row: notes/wontfix.md.
/** A banktok a datastore read, or the void lifetok where it is no lifetok. */
export function checkedBanktokOf(banktok: unknown): Lifetok {
  const banktokReport = PerKindChecks.storedLifetok.shape.lifetok.safeParse(banktok)
  return banktokReport.success ? banktokReport.data : SX.VoidLifeTok
}

/** A manifest's raw `tracked`, each row checked by its kind but not its address. */
function checkedTrackedOf({ track }: AnyAsk, tracked: unknown): Tracked {
  const rows = ManifestChecks.tracked.parse(tracked)
  return {
    bank:                 trackedEntryOf(BankChecks.stored, track.bank, rows['bank']),
    [Labelpath.MainGate]: trackedEntryOf(GateChecks.stored, track[Labelpath.MainGate], rows[Labelpath.MainGate]),
    [Labelpath.RootBox]:  trackedEntryOf(BoxChecks.stored,  track[Labelpath.RootBox], rows[Labelpath.RootBox]),
  }
}

// Nothing stored is at the void revision, as the shell is: a pair there is the same as no row, and differs from any row.
/** `'same'`, or the raw `row` checked by `check`: `'same'` where the datastore says so, or where there is no row and `pair` is at the void revision. */
function trackedEntryOf<RecordT>(check: Readonly<{ parse: (row: unknown) => RecordT }>, pair: Track['bank'], row: unknown): RecordT | 'same' {
  const isVoidSame = (row === null) && (pair.revseq === Shell.Cited.revseq) && (pair.lifepath === Shell.Cited.lifepath)
  if ((row === 'same') || isVoidSame) { return 'same' }
  if (! CX.isPlainBag(row)) { throw Throwers.storageIssue() }
  return check.parse(row)
}
// --

// == [Tables]: getActOf, putActOf, delActOf, isLifeMismatch, isPolicied, policyFailureOf, isGoodAct, isRefusedAct, isWriteAct

/** The act of a get: see the get table in `notes/answer-contract.md`. */
function getActOf({ ifAbsent }: Pick<GetAsk, 'ifAbsent'>, { presence }: GetTags): EX.GotAct | 'void' | 'gone' {
  if (presence === 'live') { return 'gotlive' }
  if (presence === 'void') { return (ifAbsent === 'nil') ? 'gotvoid' : 'void' }
  return (ifAbsent === 'nil') ? 'gotgone' : 'gone'
}

/** The act of a write of a live record: see the put table in `notes/answer-contract.md`. The first matching row wins. */
export function putActOf(ask: WriteAsk, tags: WriteTags): EX.PutAct | EX.RefusedAct {
  const { presence, revtok_cmp: revtokCmp, revseq_cmp: revseqCmp } = tags
  if (revtokCmp  === '=next')                                                         { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                         { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeMismatch(ask, tags)))  { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                                  { return 'forked' }
  // The flag that applies: `ifPresent` over a live Thing, `ifAbsent` over a tombstone or none.
  const opflag = (presence === 'live') ? ask.ifPresent : ask.ifAbsent
  if (revtokCmp  === 'neq')                                                           { return ((presence === 'live') && (opflag === 'get')) ? 'passed' : 'stale' }
  if (presence   === 'void')                                                          { return (opflag === 'add') ? 'born'   : 'void' }
  if (presence   === 'gone')                                                          { return (opflag === 'add') ? 'reborn' : 'gone' }
  if (opflag     === 'repl')                                                          { return 'replaced' }
  return (opflag === 'get') ? 'passed' : 'camped'
}

/** The act of a write of a tombstone: see the del table in `notes/answer-contract.md`. The first matching row wins. */
function delActOf(ask: WriteAsk, tags: WriteTags): EX.DelAct | EX.RefusedAct {
  const { presence, revtok_cmp: revtokCmp, revseq_cmp: revseqCmp } = tags
  if (revtokCmp  === '=next')                                                         { return 'retcon' }
  if (revseqCmp  === 'ahead')                                                         { return 'ahead' }
  if ((revtokCmp === 'eq')  && ((revseqCmp !== 'eq') || isLifeMismatch(ask, tags)))  { return 'clash' }
  if ((revtokCmp === 'neq') && (revseqCmp === 'eq'))                                  { return 'forked' }
  if (revtokCmp  === 'neq')                                                           { return (presence === 'gone') ? 'gone' : 'stale' }
  if (presence   === 'void')                                                          { return 'void' }
  return (presence === 'gone') ? 'dubdel' : 'deleted'
}

// The lifepath stands where big's life tok stood: it names the Thing's life, and the lives above it.
/** True when the ante row differs from the cited one in its life or its liveness. */
function isLifeMismatch({ cited }: Pick<WriteAsk, 'cited'>, { presence, lifepath_eq }: WriteTags): boolean {
  return (! lifepath_eq) || ((presence === 'live') !== (cited.am === 'a'))
}

/** True when a write changes a field fixed for the Thing's life, or fails a storage policy `ask` names. */
function isPolicied(ask: WriteAsk, tags: WriteTags): boolean {
  return (tags.born_at_cmp === 'changed') || (tags.lifetok_cmp === 'changed') || (policyFailureOf(ask, tags) !== null)
}

/** Why the first storage policy `ask` names refuses it, by its verdict in `tags`, or null where each is met. */
function policyFailureOf({ options }: WriteAsk, { policies }: WriteTags): string | null {
  const named = options?.policies ?? []
  for (const policy of named) {
    const verdict = policies[policy]
    if (verdict?.ok === false) { return verdict.message }
  }
  return null
}

/** True when `act` answers good. */
function isGoodAct(act: string): act is EX.GoodAct { return (EX.goodActVals as readonly string[]).includes(act) }

/** True when `act` refuses the ask. */
export function isRefusedAct(act: string): act is EX.RefusedAct { return (EX.refusedActVals as readonly string[]).includes(act) }

/** True when `act` is one a datastore writes the ask's record under. */
export function isWriteAct(act: string): act is EX.WriteAct { return (EX.writeActVals as readonly string[]).includes(act) }
// --

// == [Scribing]: scribeGetAct, scribeWriteAct
// The act is the tags' alone. `actual` is typed to agree with it, and `demandGetConsistency` or `demandWriteConsistency`
// refuses a manifest whose row does not.

/** Write onto a get's manifest the act the get table finds from its tags, and whether it answers good. */
export function scribeGetAct(ask: GetAsk, manifest: CheckedGetManifest): asserts manifest is ScribedGetManifest {
  const act = getActOf(ask, manifest.tags)
  Object.assign(manifest, { ok: isGoodAct(act), act })
}

/** Write onto a write's manifest the act the put or del table finds from its tags, or `policied` where that act writes but a fixed field or a storage policy forbids it, and whether it answers good. */
export function scribeWriteAct(ask: WriteAsk, manifest: CheckedWriteManifest): asserts manifest is ScribedWriteManifest {
  const tableAct = (ask.op === 'put') ? putActOf(ask, manifest.tags) : delActOf(ask, manifest.tags)
  const act      = (isWriteAct(tableAct) && isPolicied(ask, manifest.tags)) ? 'policied' : tableAct
  Object.assign(manifest, { ok: isGoodAct(act), act })
}
// --

// == [Answers]: getAnswerOf, writeAnswerOf, policiedRefusalOf

/** The answer to a get, stripped from its scribed manifest. Where there is no actual row, its `dbhas` is the shell under the ancestor. */
export function getAnswerOf(ask: GetAsk, manifest: ScribedGetManifest): GetThingAnswer {
  const { banktok, tracked, read_tc } = manifest
  const beside = { ask: loggableAskOf(ask), banktok, tracked, read_tc }
  if (manifest.act === 'gotlive') { return { ok: true, ...beside, act: manifest.act, val: manifest.actual } }
  if (manifest.act === 'gotgone') { return { ok: true, ...beside, act: manifest.act, val: null, dbhas: manifest.actual } }
  if (manifest.act === 'gotvoid') { return { ok: true, ...beside, act: manifest.act, val: null, dbhas: Shell.under(ask, manifest.ancestor) } }
  const err = Throwers.actRefused('vault', manifest.act, { oplabel: 'getThing', ask: beside.ask })
  return { ok: false, ...beside, act: manifest.act, dbhas: manifest.actual ?? Shell.under(ask, manifest.ancestor), err }
}

/** The answer to a write, stripped from its scribed manifest: the actual row as `val`, or refused, as `dbhas`, the shell under the ancestor where there is none. */
export function writeAnswerOf(ask: WriteAsk, manifest: ScribedWriteManifest): WriteThingAnswer {
  const { banktok, tracked, read_tc } = manifest
  const beside = { ask: loggableAskOf(ask), banktok, tracked, read_tc }
  if (manifest.ok) { return { ok: true, ...beside, act: manifest.act, val: manifest.actual } }
  const meta  = { oplabel: 'writeThing', ask: beside.ask }
  const dbhas = manifest.actual ?? Shell.under(ask, manifest.ancestor)
  if (manifest.act === 'policied') { return { ok: false, ...beside, act: manifest.act, dbhas, err: policiedRefusalOf(ask, manifest, meta) } }
  return { ok: false, ...beside, act: manifest.act, dbhas, err: Throwers.actRefused('vault', manifest.act, meta) }
}

/** The refusal of a `policied` write, with `meta`: a changed born_at's, else a failed storage policy's, else a changed lifetok's. */
function policiedRefusalOf(ask: WriteAsk, { tags, actual }: ScribedWriteManifest, meta: Errors.RefusalMeta): Errors.VaultError {
  const why = policyFailureOf(ask, tags)
  if (tags.born_at_cmp === 'changed') { return Throwers.bornAtNotStored(actual, meta) }
  if (why !== null)                   { return Throwers.gateIssue(actual, why, meta) }
  return Throwers.lifetokNotStored(actual, meta)
}
// --

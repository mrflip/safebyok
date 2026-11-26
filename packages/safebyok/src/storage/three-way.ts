/** The three-way consistency checks of each verb: the ask, the datastore's manifest and the answer made from it, each against the others.
 * Each refuses `storage_issue` for what the datastore reported, and `unexpected_error` for an answer that does not copy its manifest, which only our own code can make.
 */

import { isEqual, pick } from 'es-toolkit'
import { SX, Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type ThingRecord, type ThingScope, Shell } from '../shapes/shapes-thing'
import { type BirthBankAsk, type GetAsk, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type Tracked, type WriteAsk, RootLabelpaths, birthPutsOf } from '../shapes/shapes-asks'
import type { BirthBankAnswer, GetThingAnswer, GetWorldAnswer, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type {
  CheckedBankObserved, CheckedManifestRows, CheckedRoots, CheckedStatsManifest, CheckedWorldManifest, ScribedBirthManifest, ScribedGetManifest, ScribedListManifest, ScribedWriteManifest, WriteTags,
} from '../shapes/shapes-manifest'
import * as ManifestTags from './manifest-tags'
import * as ManifestActs from './manifest-acts'
import * as Throwers from '../refusals/throwers'

// == [Three-way]: demandGetConsistency, demandWriteConsistency, demandListConsistency, demandBirthConsistency, demandWorldConsistency, demandStatsConsistency
// What belongs here passes the Coach's test: with the call commented out, the checks left before, after and between are
// conservatively prudent; with it, "overkill, but justifiably for a nascent code base". It is not every safety check,
// nor every repeated one: the ask's entry checks, and each row's check against its kind, stand on their own.

/** Refuse a get whose ask, manifest and answer disagree: tags that are not the actual row's, an answer that is not the manifest's, or a row at another address. */
export function demandGetConsistency(ask: GetAsk, manifest: ScribedGetManifest, answer: GetThingAnswer): void {
  if (! isEqual(ManifestTags.getTagsOf(manifest.actual), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  demandSharedConsistency(ask, manifest, answer, recordCopyOf(ask, manifest, answer), [[manifest.actual, ask.labelpath]])
}

/** Refuse a write whose ask, manifest and answer disagree: a datastore that wrote where the act is no write or the reverse, a row written without
 * the proposed revision, tags that are not the unwritten row's or disagree with the ask, an answer that is not the manifest's, or a row at another address.
 */
export function demandWriteConsistency(ask: WriteAsk, manifest: ScribedWriteManifest, answer: WriteThingAnswer): void {
  if (manifest.tags.written !== ManifestActs.isWriteAct(manifest.act)) { throw Throwers.writtenOfOtherAct() }
  if (manifest.tags.written) { demandProposedWritten(ask.record, manifest.actual) } else { demandTagsOfActual(ask, manifest) }
  demandTagsOfAsk(ask, manifest.tags)
  demandSharedConsistency(ask, manifest, answer, recordCopyOf(ask, manifest, answer), [[manifest.actual, ask.labelpath]])
}

/** Refuse a listing whose ask, manifest and answer disagree: tags that are not the parent's, an answer that is not the manifest's, a child listed at
 * a labelpath that is not one label under the parent of its modelkind, or a row at another address.
 */
export function demandListConsistency(ask: ListAsk, manifest: ScribedListManifest, answer: ListThingsAnswer): void {
  if (! isEqual(ManifestTags.getTagsOf(manifest.actual), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  const listedpaths = [...manifest.children, ...manifest.damaged_rows].map(({ labelpath }) => labelpath)
  if (listedpaths.some((labelpath) => ! isChildLabelpath(ask, labelpath))) { throw Throwers.rowOfOtherAddress(['labelpath']) }
  const copy = {
    carried:  answer.ok ? answer.val.parentlife : answer.dbhas,
    expected: manifest.ok ? manifest.actual.lifepath : (manifest.actual ?? ManifestActs.voidParentOf(ask)),
  }
  const rows = manifest.children.map(({ labelpath, record }): RowAt => [record, labelpath])
  demandSharedConsistency(ask, manifest, answer, copy, [[manifest.actual, ask.labelpath], ...rows])
}

/** Refuse a birth whose ask, manifest and answer disagree: a datastore that wrote where the act is no birth or the reverse, a root written without
 * its proposed revision, tags that are not the unwritten roots', an answer that is not the manifest's, or a root at another address.
 */
export function demandBirthConsistency(ask: BirthBankAsk, manifest: ScribedBirthManifest, answer: BirthBankAnswer): void {
  if (manifest.tags.written !== ManifestActs.isWriteAct(manifest.act)) { throw Throwers.writtenOfOtherAct() }
  const puts = birthPutsOf(ask)
  if (manifest.tags.written) {
    for (const [{ record }, rootckey] of [[puts[0], 'bank'], [puts[1], 'gate'], [puts[2], 'root']] as const) { demandProposedWritten(record, manifest.actual[rootckey]) }
  } else if (! isEqual(ManifestTags.birthTagsOf(puts, manifest.actual, false), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  const copy = {
    carried:  answer.ok ? answer.val : answer.dbhas,
    expected: manifest.ok ? manifest.actual : ManifestActs.worldRootsOf(ask, manifest.actual)[manifest.refusedroot],
  }
  demandSharedConsistency(ask, manifest, answer, copy, rootRowsOf(manifest.actual))
}

/** Refuse a get of the world whose ask, manifest and answer disagree: an answer that is not the manifest's, or a root at another address. */
export function demandWorldConsistency(ask: GetWorldAsk, manifest: CheckedWorldManifest, answer: GetWorldAnswer): void {
  const copy = { carried: answer.ok ? answer.val : answer.dbhas, expected: ManifestActs.worldRootsOf(ask, manifest.actual) }
  demandSharedConsistency(ask, manifest, answer, copy, rootRowsOf(manifest.actual))
}

/** Refuse an ask for stats whose manifest and answer disagree: an answer that is not the manifest's, or a root `tracked` carries at another address. */
export function demandStatsConsistency(ask: StatsAsk, manifest: CheckedStatsManifest, answer: StatsAnswer): void {
  demandSharedConsistency(ask, manifest, answer, { carried: answer.ok ? answer.val : answer.dbhas, expected: manifest.stats }, [])
}
// --

// == [Shared]: RowAt, Copy, demandSharedConsistency, recordCopyOf, rootRowsOf, trackedRowsOf
// The checks every verb makes alike.

/** A row the datastore read by its address, null for none, and the labelpath it was read at. */
type RowAt = readonly [row: ThingRecord | null, labelpath: Labelpath]

/** What an answer carries of its manifest beyond the bank, and what the manifest says it should be. */
type Copy = Readonly<{ carried: unknown, expected: unknown }>

// Each row is read by its address, so one at another is the datastore disagreeing with the ask.
/** Refuse what every verb refuses alike: an answer that does not copy its manifest (`copy`, and the manifest's banktok, `tracked` and `read_tc`), or a row
 * at another address than it was read at, among `rows` and the roots `tracked` carries.
 */
function demandSharedConsistency({ userid, banklabel }: ThingWatchScope, manifest: CheckedBankObserved, answer: Pick<CheckedBankObserved, 'banktok' | 'read_tc'> & { tracked: unknown }, copy: Copy, rows: readonly RowAt[]): void {
  const isCopied = isEqual(copy.carried, copy.expected) && (answer.banktok === manifest.banktok) && (answer.tracked === manifest.tracked) && (answer.read_tc === manifest.read_tc)
  if (! isCopied) { throw Throwers.answerOfOtherManifest() }
  for (const [row, labelpath] of [...rows, ...trackedRowsOf(manifest.tracked)]) {
    const fieldnames = (row === null) ? [] : Validator.disagreeingFieldnames(row, { userid, banklabel, labelpath })
    if (fieldnames.length > 0) { throw Throwers.rowOfOtherAddress(fieldnames) }
  }
}

/** What a get's or a write's answer carries of its record, and the manifest's: its record, or the shell under the ancestor where there is none. */
function recordCopyOf(ask: ThingScope, manifest: CheckedManifestRows, answer: GetThingAnswer | WriteThingAnswer): Copy {
  return { carried: ('dbhas' in answer) ? answer.dbhas : answer.val, expected: manifest.actual ?? Shell.under(ask, manifest.ancestor) }
}

/** A bank's roots, each at its labelpath. */
function rootRowsOf(roots: CheckedRoots): RowAt[] {
  return [[roots.bank, RootLabelpaths.bank], [roots.gate, RootLabelpaths.gate], [roots.root, RootLabelpaths.root]]
}

/** The roots `tracked` carries, each at its labelpath: none where it is the same as tracked. */
function trackedRowsOf(tracked: Tracked): RowAt[] {
  const rows = [[tracked.bank, 'bank'], [tracked[Labelpath.MainGate], Labelpath.MainGate], [tracked[Labelpath.RootBox], Labelpath.RootBox]] as const
  return rows.filter((rowAt): rowAt is Extract<typeof rows[number], readonly [ThingRecord, Labelpath]> => rowAt[0] !== 'same')
}
// --

// == [Per verb]: ProposedPins, demandProposedWritten, demandTagsOfActual, demandTagsOfAsk, isChildLabelpath

/** The fields a written row carries of the proposed record: its revision, its life and its liveness. */
const ProposedPins = ['revtok', 'revseq', 'lifepath', 'am'] as const

/** Refuse a written row that lacks the proposed `record`'s revtok, revseq, lifepath or liveness. */
function demandProposedWritten(record: ThingRecord, actual: ThingRecord | null): void {
  if ((actual === null) || (! isEqual(pick(actual, ProposedPins), pick(record, ProposedPins)))) { throw Throwers.proposedNotWritten() }
}

// Unwritten, the ante row is the actual row, so its tags are made again from the row as checked.
/** Refuse an unwritten write's tags where they are not the actual row's. */
function demandTagsOfActual(ask: WriteAsk, manifest: ScribedWriteManifest): void {
  if (! isEqual(ManifestTags.writeTagsOf(ask, manifest.actual, false), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
}

/** Refuse tags that disagree with the ask: a birth where it cites no shell, or verdicts for other storage policies than it names. */
function demandTagsOfAsk({ cited, options }: WriteAsk, { revtok_cmp, policies }: WriteTags): void {
  const named = options?.policies ?? []
  const isPoliciesExact = (Object.keys(policies).length === new Set(named).size) && named.every((policy) => policies[policy] !== undefined)
  const isBirthOfShell  = (revtok_cmp !== 'birth') || (cited.revtok === SX.VoidRevisionTok)
  if (! (isPoliciesExact && isBirthOfShell)) { throw Throwers.tagsOfOtherAsk() }
}

/** True when `labelpath` is one label under the listing's parent, of the listing's modelkind. */
function isChildLabelpath(ask: ListAsk, labelpath: Labelpath): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && Labelpath.isOfModelkind(labelpath, ask.modelkind)
}
// --

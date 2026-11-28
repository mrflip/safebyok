/** The three-way consistency checks of each verb: the ask, the datastore's manifest and the answer made from it, each against the others.
 * Each refuses `storage_issue` for what the datastore reported, and `unexpected_error` for an answer that does not copy its manifest, which only our own code can make.
 */

import { isEqual, pick } from 'es-toolkit'
import { Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type ThingRecord, type ThingScope, Shell, isLabelpathOfKind } from '../shapes/shapes-thing'
import { type BirthBankAsk, type GetAsk, type GetBankAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type Tracked, type WriteAsk, birthPutsOf, rootLabelpathsOf } from '../shapes/shapes-asks'
import type { BirthBankAnswer, GetThingAnswer, GetBankAnswer, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type {
  CheckedBankObserved, CheckedManifestRows, CheckedRoots, CheckedStatsManifest, CheckedGetBankManifest, ScribedBirthManifest, ScribedGetManifest, ScribedListManifest, ScribedWriteManifest, WriteTags,
} from '../shapes/shapes-manifest'
import * as ManifestTags from './manifest-tags'
import * as ManifestActs from './manifest-acts'
import * as Throwers from '../refusals/throwers'

// == [Three-way]: demandGetConsistency, demandWriteConsistency, demandListConsistency, demandBirthConsistency, demandGetBankConsistency, demandStatsConsistency
// What belongs here passes the Coach's test: with the call commented out, the checks left before, after and between are
// conservatively prudent; with it, "overkill, but justifiably for a nascent code base". It is not every safety check,
// nor every repeated one: the ask's entry checks, and each row's check against its kind, stand on their own.

/** Refuse a get whose ask, manifest and answer disagree. */
export function demandGetConsistency(ask: GetAsk, manifest: ScribedGetManifest, answer: GetThingAnswer): void {
  if (! isEqual(ManifestTags.getTagsOf(manifest.actual), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  demandSharedConsistency(ask, manifest, answer, recordCopyOf(ask, manifest, answer), [[manifest.actual, ask.labelpath]])
}

/** Refuse a write whose ask, manifest and answer disagree, among them a datastore that says it wrote where the act is no write, or the reverse. */
export function demandWriteConsistency(ask: WriteAsk, manifest: ScribedWriteManifest, answer: WriteThingAnswer): void {
  if (manifest.tags.written !== ManifestActs.isWriteAct(manifest.act)) { throw Throwers.writtenOfOtherAct() }
  if (manifest.tags.written) { demandProposedWritten(ask.record, manifest.actual); demandTagsOfWritten(ask, manifest.tags) } else { demandTagsOfActual(ask, manifest) }
  demandSharedConsistency(ask, manifest, answer, recordCopyOf(ask, manifest, answer), [[manifest.actual, ask.labelpath]])
}

/** Refuse a listing whose ask, manifest and answer disagree.
 * Of what the answer carries beside the bank, only the parent's lifepath, or a refused listing's `dbhas`, is compared with the manifest.
 */
export function demandListConsistency(ask: ListAsk, manifest: ScribedListManifest, answer: ListThingsAnswer): void {
  if (! isEqual(ManifestTags.getTagsOf(manifest.actual), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  const listedpaths = [...manifest.children, ...manifest.incompatible_rows].map(({ labelpath }) => labelpath)
  if (listedpaths.some((labelpath) => ! isChildLabelpath(ask, labelpath))) { throw Throwers.rowOfOtherAddress(['labelpath']) }
  const copy = {
    carried:  answer.ok ? answer.val.parentlife : answer.dbhas,
    expected: manifest.ok ? manifest.actual.lifepath : (manifest.actual ?? ManifestActs.voidParentOf(ask)),
  }
  const rows = manifest.children.map(({ labelpath, record }): RowAt => [record, labelpath])
  demandSharedConsistency(ask, manifest, answer, copy, [[manifest.actual, ask.labelpath], ...rows])
}

/** Refuse a birth whose ask, manifest and answer disagree, among them a datastore that says it wrote where the act is no birth, or the reverse. */
export function demandBirthConsistency(ask: BirthBankAsk, manifest: ScribedBirthManifest, answer: BirthBankAnswer): void {
  if (manifest.tags.written !== ManifestActs.isWriteAct(manifest.act)) { throw Throwers.writtenOfOtherAct() }
  const puts = birthPutsOf(ask)
  if (manifest.tags.written) {
    for (const [{ record }, rootckey] of [[puts[0], 'gate'], [puts[1], 'root']] as const) { demandProposedWritten(record, manifest.actual[rootckey]) }
  } else if (! isEqual(ManifestTags.birthTagsOf(puts, manifest.actual, false), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  const copy = {
    carried:  answer.ok ? answer.val : answer.dbhas,
    expected: manifest.ok ? manifest.actual : ManifestActs.actualRootsOf(ask, manifest.actual),
  }
  demandSharedConsistency(ask, manifest, answer, copy, rootRowsOf(ask, manifest.actual))
}

/** Refuse a get of the bank whose ask, manifest and answer disagree. */
export function demandGetBankConsistency(ask: GetBankAsk, manifest: CheckedGetBankManifest, answer: GetBankAnswer): void {
  const copy = { carried: answer.ok ? answer.val : answer.dbhas, expected: ManifestActs.actualRootsOf(ask, manifest.actual) }
  demandSharedConsistency(ask, manifest, answer, copy, rootRowsOf(ask, manifest.actual))
}

/** Refuse an ask for stats whose manifest and answer disagree. */
export function demandStatsConsistency(ask: StatsAsk, manifest: CheckedStatsManifest, answer: StatsAnswer): void {
  demandSharedConsistency(ask, manifest, answer, { carried: answer.ok ? answer.val : answer.dbhas, expected: manifest.stats }, [])
}
// --

// == [Shared]: RowAt, Copy, demandSharedConsistency, recordCopyOf, rootRowsOf, trackedRowsOf
// The checks every verb makes alike.

/** A row the datastore read by its address, null for none, and the labelpath it was read at. */
type RowAt = readonly [row: ThingRecord | null, labelpath: Labelpath]

/** The part of a manifest an answer copies beyond the bank, as the answer carries it and as the manifest has it. */
type Copy = Readonly<{ carried: unknown, expected: unknown }>

// Each row is read by its address, so one at another is the datastore disagreeing with the ask.
/** Refuse an answer that does not copy its manifest, or a row among `rows` or in `tracked` at another address than it was read at. */
function demandSharedConsistency({ userid, banklabel }: ThingWatchScope, manifest: CheckedBankObserved, answer: Pick<CheckedBankObserved, 'banktok' | 'read_tc'> & { tracked: unknown }, copy: Copy, rows: readonly RowAt[]): void {
  const isCopied = isEqual(copy.carried, copy.expected) && (answer.banktok === manifest.banktok) && (answer.tracked === manifest.tracked) && (answer.read_tc === manifest.read_tc)
  if (! isCopied) { throw Throwers.answerOfOtherManifest() }
  for (const [row, labelpath] of [...rows, ...trackedRowsOf({ userid, banklabel }, manifest.tracked)]) {
    const fieldnames = (row === null) ? [] : Validator.disagreeingFieldnames(row, { userid, banklabel, labelpath })
    if (fieldnames.length > 0) { throw Throwers.rowOfOtherAddress(fieldnames) }
  }
}

/** The record a get's or a write's answer carries, and the manifest's: its actual row, or the shell under the ancestor where there is none. */
function recordCopyOf(ask: ThingScope, manifest: CheckedManifestRows, answer: GetThingAnswer | WriteThingAnswer): Copy {
  return { carried: ('dbhas' in answer) ? answer.dbhas : answer.val, expected: manifest.actual ?? Shell.under(ask, manifest.ancestor) }
}

/** The roots of the bank at `bankScope`, each at its labelpath. */
function rootRowsOf(bankScope: ThingWatchScope, roots: CheckedRoots): RowAt[] {
  const labelpaths = rootLabelpathsOf(bankScope)
  return [[roots.gate, labelpaths.gate], [roots.root, labelpaths.root]]
}

/** The roots `tracked` carries of the bank at `bankScope`, each at its labelpath: none where it is the same as tracked. */
function trackedRowsOf(bankScope: ThingWatchScope, tracked: Tracked): RowAt[] {
  const labelpaths = rootLabelpathsOf(bankScope)
  const rows = [[tracked.gate, labelpaths.gate], [tracked.root, labelpaths.root]] as const
  return rows.filter((rowAt): rowAt is Extract<typeof rows[number], readonly [ThingRecord, Labelpath]> => rowAt[0] !== 'same')
}
// --

// == [Per verb]: ProposedPins, demandProposedWritten, demandTagsOfActual, demandTagsOfWritten, isChildLabelpath

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

/** Refuse a written write's tags where they are not those of the write its ask lets through. */
function demandTagsOfWritten(ask: WriteAsk, tags: WriteTags): void {
  if (! isEqual(ManifestTags.writtenTagsOf(ask), tags)) { throw Throwers.tagsOfOtherAsk() }
}

// An incompatible child's record is checked by nothing, so its labelpath is held to the listing's kind's rule here.
/** True when `labelpath` is one label under the listing's parent, and a labelpath of the listing's modelkind. */
function isChildLabelpath(ask: ListAsk, labelpath: Labelpath): boolean {
  const label = labelpath.slice(ask.labelpath.length + 1)
  return labelpath.startsWith(`${ask.labelpath}/`) && (! label.includes('/')) && isLabelpathOfKind({ ...ask, labelpath })
}
// --

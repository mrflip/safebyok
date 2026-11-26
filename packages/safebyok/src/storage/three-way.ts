/** The three-way consistency checks of a get and a write: the ask, the datastore's manifest and the answer made from it, each against the others. Each refuses `storage_issue`. */

import { isEqual, pick } from 'es-toolkit'
import { SX, Validator } from 'safebyok-big/internals'
import { Labelpath } from '../shapes/primitives'
import { type ThingRecord, type ThingScope, Shell } from '../shapes/shapes-thing'
import type { GetAsk, WriteAsk } from '../shapes/shapes-asks'
import type { GetThingAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type { CheckedManifestRows, ScribedGetManifest, ScribedWriteManifest, WriteTags } from '../shapes/shapes-manifest'
import * as ManifestTags from './manifest-tags'
import * as ManifestActs from './manifest-acts'
import * as Throwers from '../refusals/throwers'

// == [Three-way]: demandGetConsistency, demandWriteConsistency, demandProposedWritten, demandTagsOfActual, demandTagsOfAsk, demandAnswerCopied, demandRowsAtAddress
// What belongs here passes the Coach's test: with the call commented out, the checks left before, after and between are
// conservatively prudent; with it, "overkill, but justifiably for a nascent code base". It is not every safety check,
// nor every repeated one: the ask's entry checks, and each row's check against its kind, stand on their own.

/** Refuse a get whose ask, manifest and answer disagree: tags that are not the actual row's, an answer that is not the manifest's, or a row at another address. */
export function demandGetConsistency(ask: GetAsk, manifest: ScribedGetManifest, answer: GetThingAnswer): void {
  if (! isEqual(ManifestTags.getTagsOf(manifest.actual), manifest.tags)) { throw Throwers.tagsOfOtherRow() }
  demandAnswerCopied(ask, manifest, answer)
  demandRowsAtAddress(ask, manifest)
}

/** Refuse a write whose ask, manifest and answer disagree: a datastore that wrote where the act is no write or the reverse, a row written without
 * the proposed revision, tags that are not the unwritten row's or disagree with the ask, an answer that is not the manifest's, or a row at another address.
 */
export function demandWriteConsistency(ask: WriteAsk, manifest: ScribedWriteManifest, answer: WriteThingAnswer): void {
  if (manifest.tags.written !== ManifestActs.isWriteAct(manifest.act)) { throw Throwers.writtenOfOtherAct() }
  if (manifest.tags.written) { demandProposedWritten(ask, manifest.actual) } else { demandTagsOfActual(ask, manifest) }
  demandTagsOfAsk(ask, manifest.tags)
  demandAnswerCopied(ask, manifest, answer)
  demandRowsAtAddress(ask, manifest)
}

/** The fields a written row carries of the proposed record: its revision, its life and its liveness. */
const ProposedPins = ['revtok', 'revseq', 'lifepath', 'am'] as const

/** Refuse a written row that lacks the proposed record's revtok, revseq, lifepath or liveness. */
function demandProposedWritten({ record }: WriteAsk, actual: ThingRecord | null): void {
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
  const isPoliciesExact = (Object.keys(policies).length === named.length) && named.every((policy) => policies[policy] !== undefined)
  const isBirthOfShell  = (revtok_cmp !== 'birth') || (cited.revtok === SX.VoidRevisionTok)
  if (! (isPoliciesExact && isBirthOfShell)) { throw Throwers.tagsOfOtherAsk() }
}

/** Refuse an answer that does not copy the manifest: its record (the shell under the ancestor where there is none), its banktok, its `tracked` and its `read_tc`. */
function demandAnswerCopied(ask: ThingScope, manifest: CheckedManifestRows, answer: GetThingAnswer | WriteThingAnswer): void {
  const record   = ('dbhas' in answer) ? answer.dbhas : answer.val
  const isCopied = isEqual(record, manifest.actual ?? Shell.under(ask, manifest.ancestor))
    && (answer.banktok === manifest.banktok) && (answer.tracked === manifest.tracked) && (answer.read_tc === manifest.read_tc)
  if (! isCopied) { throw Throwers.answerOfOtherManifest() }
}

// Each of these rows is read by its address, so one at another is the datastore disagreeing with the ask.
/** Refuse a row at another address than asked: the actual row at the ask's scope, or a root `tracked` carries at its own. */
function demandRowsAtAddress({ userid, banklabel, labelpath }: ThingScope, { actual, tracked }: CheckedManifestRows): void {
  const rows = [[actual, labelpath], [tracked.bank, 'bank'], [tracked[Labelpath.MainGate], Labelpath.MainGate], [tracked[Labelpath.RootBox], Labelpath.RootBox]] as const
  for (const [row, rowpath] of rows) {
    const fieldnames = ((row === null) || (row === 'same')) ? [] : Validator.disagreeingFieldnames(row, { userid, banklabel, labelpath: rowpath })
    if (fieldnames.length > 0) { throw Throwers.rowOfOtherAddress(fieldnames) }
  }
}
// --

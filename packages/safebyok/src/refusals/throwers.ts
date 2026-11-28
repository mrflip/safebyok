/** The throwers of the refusals this package makes itself, each from a phrase in phrases.ts, and every thrower of `safebyok-big`, re-exported. */

// The rules for a refusal, its thrower and its phrase are at the top of safebyok-big's refusals/throwers.ts.

import { Errors, Phrases as BigPhrases } from 'safebyok-big/internals'
import { sanitizeForeignError, unexpectedError } from 'safebyok-big/refusals/throwers'
import * as Phrases from '../phrases'
import { type ThingRecord } from '../shapes/shapes-thing'
import { DatastoreLimitFloor } from '../shapes/shapes-vault-stats'
import { type ListAsk, type WriteAsk, loggableAskOf } from '../shapes/shapes-asks'
import type { IncompatibleThing } from '../shapes/shapes-answers'
import type { Refusaltag } from '../shapes/shapes-manifest'
import type { ProbeStepkind } from '../shapes/shapes-vault-probe'

// == [Big's Throwers]: every thrower of safebyok-big, re-exported

// Re-exported, never redefined: a refusal is one class in both packages (notes/transition.md).
export * from 'safebyok-big/refusals/throwers'
// --

// == [Outcome Throwers]: refusalOfThrown

/** The refusal standing for what a function threw: a refusal as it is, anything else as `unexpected_error`, a bug in safebyok or in the host's own function. */
export function refusalOfThrown(thrown: unknown): Errors.VaultError { return Errors.isVaultError(thrown) ? thrown : unexpectedError(thrown) }
// --

// == [Model Throwers]: signinUnanswered, nobodySignedIn, rootOfOtherKind, thingNotLive, unlockDismissed, gatingSpent, tombstoneSecretsGiven, sidecarMissing, boxOfOtherRoot, thingSoonestBare

/** A `disabled` refusal: the device's sign-in has not answered yet. */
export function signinUnanswered(): Errors.VaultError { return new Errors.VaultError('disabled', Phrases.SigninUnanswered) }

/** An `absent_vault` refusal: nobody is signed in on the device. */
export function nobodySignedIn(): Errors.VaultError { return new Errors.VaultError('absent_vault', Phrases.NobodySignedIn) }

/** An `unexpected_error` refusal: the Thing a VaultMinder has at one of its bank's roots is not of that root's kind. */
export function rootOfOtherKind(): Errors.VaultError { return new Errors.VaultError('unexpected_error', Phrases.RootOfOtherKind) }

/** An `absent_thing` refusal: the bank or gate at `labelpath` has the shell or a tombstone, not a live record. */
export function thingNotLive(labelpath: string): Errors.VaultError {
  return new Errors.VaultError('absent_thing', Phrases.ThingNotLive, { meta: { labelpaths: [labelpath] } })
}

/** A `dismissed` refusal: the wait for an `unlock` gating was dismissed. */
export function unlockDismissed(): Errors.VaultError { return new Errors.VaultError('dismissed', Phrases.UnlockDismissed) }

/** A `gating_concluded` refusal: the gating was attempted already. */
export function gatingSpent(): Errors.VaultError { return new Errors.VaultError('gating_concluded', Phrases.GatingSpent) }

/** A `bad_record` refusal: a tombstone's seal was given secret props. */
export function tombstoneSecretsGiven(): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.TombstoneSecretsGiven) }

/** A `bad_record` refusal: a live box's revision has no sidecar. */
export function sidecarMissing(): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.SidecarMissing) }

/** A `record_conflict` refusal: a box's lifepath is of another life of its bank's root box. */
export function boxOfOtherRoot(): Errors.VaultError { return new Errors.VaultError('record_conflict', Phrases.BoxOfOtherRoot) }

/** A `stale_read` refusal: the device has heard of a newer revision of the Thing at `labelpath` but has no whole record of its newest life. */
export function thingSoonestBare(labelpath: string): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.ThingSoonestBare, { meta: { labelpaths: [labelpath] } })
}
// --

// == [Write Throwers]: opNotOfRecord, revseqNotNext, revtokNotNew, recordOfOtherScope, tombstoneOverTombstone, leadingLifeseqsMoved, lifeseqNotNext, bornAtNotNow, testimonyMissing
// Each refuses a write ask, and its meta carries the loggable part of the ask.

/** A `bad_record` refusal: a put's record is a tombstone, or a del's is live. */
export function opNotOfRecord(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.OpNotOfRecord, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's revseq is not one past the cited one's. */
export function revseqNotNext(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RevseqNotNext, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's revtok is the cited one's, or the void one. */
export function revtokNotNew(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RevtokNotNew, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record is not at the scope the ask names. */
export function recordOfOtherScope(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RecordOfOtherScope, { meta: { ask: loggableAskOf(ask) } }) }

// A del citing a tombstone, the shell among them, refuses dubdel when the ask is made, before anything is fetched, so its
// answer has no dbhas. Its refusal kind is the one big's act tables give dubdel.
/** An `absent_vault` refusal, act `dubdel`: a del cites a tombstone or the shell. */
export function tombstoneOverTombstone(ask: WriteAsk): Errors.VaultError {
  return new Errors.VaultError('absent_vault', Phrases.TombstoneOverTombstone, { meta: { ask: loggableAskOf(ask), act: 'dubdel' } })
}

/** A `bad_record` refusal: the record changes a leading lifeseq of the lifepath it cites. */
export function leadingLifeseqsMoved(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.LeadingLifeseqsMoved, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's lifeseq is not the cited one, or the next one when am flips. */
export function lifeseqNotNext(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.LifeseqNotNext, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: a birth's born_at is not its written_at. */
export function bornAtNotNow(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.BornAtNotNow, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: a replace_passphrase write does not cite the gate's wayins. */
export function testimonyMissing(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.TestimonyMissing, { meta: { ask: loggableAskOf(ask) } }) }
// --

// == [Storage Throwers]: RefusalkindForRefusaltag, taggedRefusal, datastoreQuotaTooSmall, storageCallRefused, rowOfOtherAddress, bankRootsMissing, banktokMissing, listParentNotLive, answerNotMade, writtenOfOtherAct, proposedNotWritten, tagsOfOtherRow, tagsOfOtherAsk, answerOfOtherManifest

/** The kind of refusal of a `policied` write, by the {@link Refusaltag} of its phrase. */
export const RefusalkindForRefusaltag = {
  BornAtMoved:       'bad_record',
  BanktokMoved:      'bad_record',
  ProvedWayinMoved:  'gate_issue',
  OtherWayinMoved:   'gate_issue',
  PasskeyStored:     'gate_issue',
  PasskeyNotAdded:   'gate_issue',
  NoPasskeyStored:   'gate_issue',
  PasskeyNotRevoked: 'gate_issue',
} as const satisfies Record<Refusaltag, Errors.Refusalkind>

// Big types a refusal's meta.act as its own BadAct, which has no `policied`.
/** The refusal of a `policied` write, with the kind and phrase its `refusaltag` names, and its `actual` row (null for none) as `dbhas`. */
export function taggedRefusal(ask: WriteAsk, { act, actual, refusaltag }: Readonly<{ act: 'policied', actual: ThingRecord | null, refusaltag: Refusaltag }>): Errors.VaultError {
  const meta = { oplabel: 'writeThing', ask: loggableAskOf(ask), act } as unknown as Errors.RefusalMeta
  return new Errors.VaultError(RefusalkindForRefusaltag[refusaltag], Phrases.PhraseForRefusaltag[refusaltag], { rows: { dbhas: actual }, meta })
}

/** A `storage_blocked` refusal: the browser's `quota` of bytes for the page is under {@link DatastoreLimitFloor}, too little for a vault. */
export function datastoreQuotaTooSmall(quota: number): Errors.VaultError {
  return new Errors.VaultError('storage_blocked', Phrases.DatastoreQuotaTooSmall(quota, DatastoreLimitFloor))
}

/** A `storage_issue` refusal: the vault's storage refused the call `oplabel`, and would refuse it again. What it threw is the cause. */
export function storageCallRefused(oplabel: string, thrown: unknown): Errors.VaultError {
  return new Errors.VaultError('storage_issue', Phrases.storageCallRefused(oplabel), { cause: sanitizeForeignError(thrown) })
}

/** A `storage_issue` refusal: storage answered a row at another address than asked, by the `fieldnames` that disagree. */
export function rowOfOtherAddress(fieldnames: readonly string[]): Errors.VaultError { return new Errors.VaultError('storage_issue', BigPhrases.rowOfOtherAddress(fieldnames)) }

/** A `storage_issue` refusal: a bank's roots are stored broken, a live gate without its root box or a root box without a live gate. */
export function bankRootsMissing(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.BankRootsMissing) }

/** A `storage_issue` refusal: the datastore handed back a manifest with no banktok. */
export function banktokMissing(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.BanktokMissing) }

/** An `absent_thing` refusal: a list's parent is a tombstone or not stored, so it has no children. `meta` carries the list's act, oplabel and ask. */
export function listParentNotLive(meta: Errors.RefusalMeta): Errors.VaultError { return new Errors.VaultError('absent_thing', Phrases.ListParentNotLive, { meta }) }

/** An `unexpected_error` refusal: a vaultDB could not make the answer for a failure. */
export function answerNotMade(): Errors.VaultError { return new Errors.VaultError('unexpected_error', Phrases.AnswerNotMade) }

/** A `storage_issue` refusal: the datastore wrote where the act its tags find is no write, or wrote nothing where it is one. */
export function writtenOfOtherAct(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.WrittenOfOtherAct) }

/** A `storage_issue` refusal: the row the datastore wrote lacks the revision, life or liveness of the record the write proposed. */
export function proposedNotWritten(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.ProposedNotWritten) }

/** A `storage_issue` refusal: the datastore's tags are not those of the row it handed back. */
export function tagsOfOtherRow(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.TagsOfOtherRow) }

/** A `storage_issue` refusal: the datastore's tags disagree with the write it was asked. */
export function tagsOfOtherAsk(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.TagsOfOtherAsk) }

// Only our own code can make an answer that does not copy its manifest: it is a bug, not trouble in storage.
/** An `unexpected_error` refusal: the vaultDB's answer is not a copy of the datastore's manifest it was made from. */
export function answerOfOtherManifest(): Errors.VaultError { return new Errors.VaultError('unexpected_error', Phrases.AnswerOfOtherManifest) }
// --

// == [Minding Throwers]: notMinded, rootBoxNotHeard, childrenIncompatible

/** The refusal of a box's item asked of a vault TSQ for a Thing other than a box under the root box. */
export function notMinded(): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.NotMinded) }

/** The refusal of `bank.rootBox` read while no live root box is known. */
export function rootBoxNotHeard(): Errors.VaultError { return new Errors.VaultError('record_conflict', Phrases.RootBoxNotHeard) }

/** The bad news of `incompatible_rows`, the children a list for `ask` found incompatible and left out, each named by its labelpath. */
export function childrenIncompatible(ask: ListAsk, incompatible_rows: readonly IncompatibleThing[]): Errors.VaultError {
  return new Errors.VaultError('incompatible_row', Phrases.ChildrenIncompatible, { meta: { ask: loggableAskOf(ask), labelpaths: incompatible_rows.map(({ labelpath }) => labelpath) } })
}
// --

// == [Probing Throwers]: probeStepRefused, probePutNotGot

// The step's own kind is kept, so a host branches on a probe's refusal as it would on the verb's.
/** The refusal of `stepkind`, a step of `Vault.probe`, for what it threw: of the thrown refusal's kind, with that refusal as its cause and the step named in its meta. */
export function probeStepRefused(stepkind: ProbeStepkind, thrown: unknown): Errors.VaultError {
  const cause = refusalOfThrown(thrown)
  return new Errors.VaultError(cause.refusalkind, Phrases.probeStepRefused(stepkind), { cause, meta: { ...cause.meta, stepkind } })
}

/** The refusal of `Vault.probe`'s get, where storage answers the box at `labelpath` missing, or in a revision other than the one the probe put. */
export function probePutNotGot(labelpath: string): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.ProbePutNotGot, { meta: { labelpaths: [labelpath] } })
}
// --

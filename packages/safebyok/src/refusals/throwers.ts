/** The throwers of the refusals this package makes itself, each from a phrase in phrases.ts, and every thrower of `safebyok-big`, re-exported. */

// The rules for a refusal, its thrower and its phrase are at the top of safebyok-big's refusals/throwers.ts.

import { Errors, Phrases as BigPhrases } from 'safebyok-big/internals'
import { sanitizeForeignError, unexpectedError } from 'safebyok-big/refusals/throwers'
import * as Phrases from '../phrases'
import { type ThingRecord } from '../shapes/shapes-thing'
import { StoreLimitFloor } from '../shapes/shapes-vault-stats'
import { type ListAsk, type WriteAsk, loggableAskOf } from '../shapes/shapes-asks'
import type { DamagedThing } from '../shapes/shapes-answers'
import type { ProbeStepkind } from '../shapes/shapes-vault-probe'

// == [Big's Throwers]: every thrower of safebyok-big, re-exported

// Re-exported, never redefined: a refusal is one class in both packages (notes/transition.md).
export * from 'safebyok-big/refusals/throwers'
// --

// == [Outcome Throwers]: refusalOfThrown

/** The refusal standing for what a function threw: a refusal as it is, anything else as `unexpected_error`, a bug in safebyok or in the host's own function. */
export function refusalOfThrown(thrown: unknown): Errors.VaultError { return Errors.isVaultError(thrown) ? thrown : unexpectedError(thrown) }
// --

// == [Model Throwers]: signinUnanswered, nobodySignedIn, thingNotLive, unlockDismissed, gatingSpent, tombstoneSecretsGiven, sidecarMissing, boxOfOtherRoot, thingSoonestBare

/** A `disabled` refusal: the device's sign-in has not answered yet. */
export function signinUnanswered(): Errors.VaultError { return new Errors.VaultError('disabled', Phrases.SigninUnanswered) }

/** An `absent_vault` refusal: nobody is signed in on the device. */
export function nobodySignedIn(): Errors.VaultError { return new Errors.VaultError('absent_vault', Phrases.NobodySignedIn) }

/** An `absent_thing` refusal: the bank or gate at `labelpath` holds the shell or a tombstone, not a live record. */
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

// == [Write Throwers]: opNotOfRecord, revseqNotNext, revtokNotNew, recordOfOtherScope, tombstoneOverTombstone, lifepathNotKept, lifeseqNotNext, bornAtNotNow, testimonyMissing
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
export function lifepathNotKept(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.LifepathNotKept, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: the record's lifeseq is not the cited one, or the next one when am flips. */
export function lifeseqNotNext(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.LifeseqNotNext, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: a birth's born_at is not its written_at. */
export function bornAtNotNow(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.BornAtNotNow, { meta: { ask: loggableAskOf(ask) } }) }

/** A `bad_record` refusal: a replace_passphrase write does not cite the gate's wayins. */
export function testimonyMissing(ask: WriteAsk): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.TestimonyMissing, { meta: { ask: loggableAskOf(ask) } }) }
// --

// == [Storing Throwers]: PoliciedMeta, gateIssue, storeQuotaTooSmall, storageCallRefused, bornAtNotStored, lifetokNotStored, rowOfOtherAddress, bankRootsMissing, banktokMissing, listParentNotLive, answerNotMade, writtenOfOtherAct, proposedNotWritten, tagsOfOtherRow, tagsOfOtherAsk, answerOfOtherManifest

// Big types a refusal's meta.act as its own BadAct, which has no `policied`.
/** Refusal meta with act `policied`, for a write the act tables allow but a storage policy, the born_at check or the lifetok check refuses. */
export const PoliciedMeta = { act: 'policied' } as unknown as Errors.RefusalMeta

/** A `gate_issue` refusal of a write over `ante`, saying `why`, with `meta` and the act `policied`. */
export function gateIssue(ante: ThingRecord | null, why: string, meta: Errors.RefusalMeta = {}): Errors.VaultError {
  return new Errors.VaultError('gate_issue', BigPhrases.gateIssue(why), { rows: { dbhas: ante }, meta: { ...meta, ...PoliciedMeta } })
}

/** A `storage_blocked` refusal: the browser's `quota` of bytes for the page is under {@link StoreLimitFloor}, too little for a vault. */
export function storeQuotaTooSmall(quota: number): Errors.VaultError {
  return new Errors.VaultError('storage_blocked', Phrases.StoreQuotaTooSmall(quota, StoreLimitFloor))
}

/** A `storage_issue` refusal: the vault's storage refused the call `oplabel`, and would refuse it again. What it threw is the cause. */
export function storageCallRefused(oplabel: string, thrown: unknown): Errors.VaultError {
  return new Errors.VaultError('storage_issue', Phrases.storageCallRefused(oplabel), { cause: sanitizeForeignError(thrown) })
}

/** A `bad_record` refusal of a write over `ante`, the live Thing whose born_at it changes, with `meta` and the act `policied`. */
export function bornAtNotStored(ante: ThingRecord | null, meta: Errors.RefusalMeta = {}): Errors.VaultError {
  return new Errors.VaultError('bad_record', Phrases.BornAtNotStored, { rows: { dbhas: ante }, meta: { ...meta, ...PoliciedMeta } })
}

/** A `bad_record` refusal of a write of the bank over `ante`, the live bank whose lifetok it changes, with `meta` and the act `policied`. */
export function lifetokNotStored(ante: ThingRecord | null, meta: Errors.RefusalMeta = {}): Errors.VaultError {
  return new Errors.VaultError('bad_record', Phrases.LifetokNotStored, { rows: { dbhas: ante }, meta: { ...meta, ...PoliciedMeta } })
}

/** A `storage_issue` refusal: storage answered a row at another address than asked, by the `fieldnames` that disagree. */
export function rowOfOtherAddress(fieldnames: readonly string[]): Errors.VaultError { return new Errors.VaultError('storage_issue', BigPhrases.rowOfOtherAddress(fieldnames)) }

/** A `storage_issue` refusal: a live bank is stored without its main gate or its root box. */
export function bankRootsMissing(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.BankRootsMissing) }

/** A `storage_issue` refusal: the datastore handed back a manifest with no banktok. */
export function banktokMissing(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.BanktokMissing) }

/** An `absent_thing` refusal of a list whose parent holds a tombstone or nothing, which has no children. `meta` names its act, its oplabel and its ask. */
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

// == [Minding Throwers]: notMinded, worldNotHeard, childrenStoredDamaged

/** The refusal of a box's item asked of a vault TSQ for a Thing other than a box under the root box. */
export function notMinded(): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.NotMinded) }

/** The refusal of a bank's root box read while its world holds none live. */
export function worldNotHeard(): Errors.VaultError { return new Errors.VaultError('record_conflict', Phrases.WorldNotHeard) }

/** The bad news of `damaged_rows`, the children a list for `ask` found stored damaged and left out, each named by its labelpath. */
export function childrenStoredDamaged(ask: ListAsk, damaged_rows: readonly DamagedThing[]): Errors.VaultError {
  return new Errors.VaultError('damaged_row', Phrases.ChildrenStoredDamaged, { meta: { ask: loggableAskOf(ask), labelpaths: damaged_rows.map(({ labelpath }) => labelpath) } })
}
// --

// == [Probing Throwers]: probeStepRefused, probePutNotGot

// The step's own kind is kept, so a host branches on a probe's refusal as it would on the verb's.
/** The refusal of `stepkind`, a step of `Vault.probe`, for what it threw: of that refusal's kind, its meta naming the step, the refusal its cause. */
export function probeStepRefused(stepkind: ProbeStepkind, thrown: unknown): Errors.VaultError {
  const cause = refusalOfThrown(thrown)
  return new Errors.VaultError(cause.refusalkind, Phrases.probeStepRefused(stepkind), { cause, meta: { ...cause.meta, stepkind } })
}

/** The refusal of `Vault.probe`'s get, where storage answers the box at `labelpath` missing, or in a revision other than the one the probe put. */
export function probePutNotGot(labelpath: string): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.ProbePutNotGot, { meta: { labelpaths: [labelpath] } })
}
// --

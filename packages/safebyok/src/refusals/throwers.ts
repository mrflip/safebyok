/** The throwers of the refusals this package makes itself, each from a phrase in phrases.ts, and every thrower of `safebyok-big`, re-exported. */

// The rules for a refusal, its thrower and its phrase are at the top of safebyok-big's refusals/throwers.ts.

import { Errors, Phrases as BigPhrases } from 'safebyok-big/internals'
import * as Phrases from '../phrases'
import { type ThingRecord } from '../shapes/shapes-thing'
import { type GetAsk, type ListAsk, type WriteAsk, loggableAskOf } from '../shapes/shapes-asks'
import type { DamagedThing } from '../storage/vault-db'

// == [Big's Throwers]: every thrower of safebyok-big, re-exported

// Re-exported, never redefined: a refusal is one class in both packages (notes/transition.md).
export * from 'safebyok-big/refusals/throwers'
// --

// == [Model Throwers]: bankSwept, bankNotBroughtUp, nobodySignedIn, gateSwept, unlockDismissed, gatingSpent, tombstoneSecretsGiven, sidecarMissing, boxOfOtherRoot, boxSoonestBare

/** A `disabled` refusal: the bank was swept. */
export function bankSwept(): Errors.VaultError { return new Errors.VaultError('disabled', Phrases.BankSwept) }

/** A `disabled` refusal: the device has not brought up its user's bank yet. */
export function bankNotBroughtUp(): Errors.VaultError { return new Errors.VaultError('disabled', Phrases.BankNotBroughtUp) }

/** An `absent_vault` refusal: nobody is signed in on the device. */
export function nobodySignedIn(): Errors.VaultError { return new Errors.VaultError('absent_vault', Phrases.NobodySignedIn) }

/** A `disabled` refusal: the gate was swept. */
export function gateSwept(): Errors.VaultError { return new Errors.VaultError('disabled', Phrases.GateSwept) }

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

/** A `stale_read` refusal: the device has heard of a newer revision of the box at `labelpath` but has no whole record of its newest life. */
export function boxSoonestBare(labelpath: string): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.BoxSoonestBare, { meta: { labelpaths: [labelpath] } })
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

// == [Storing Throwers]: PoliciedMeta, gateIssue, bornAtNotStored, lifetokNotStored, rowOfOtherAddress, bankRootsMissing, answerNotMade

// Big types a refusal's meta.act as its own BadAct, which has no `policied`.
/** Refusal meta with act `policied`, for a write the act tables allow but a storage policy, the born_at check or the lifetok check refuses. */
export const PoliciedMeta = { act: 'policied' } as unknown as Errors.RefusalMeta

/** A `gate_issue` refusal of a write over `stored`, saying `why`. */
export function gateIssue(stored: ThingRecord | null, why: string): Errors.VaultError {
  return new Errors.VaultError('gate_issue', BigPhrases.gateIssue(why), { rows: { dbhas: stored }, meta: PoliciedMeta })
}

/** A `bad_record` refusal of a write over `stored`, the live Thing whose born_at it changes. */
export function bornAtNotStored(stored: ThingRecord | null): Errors.VaultError {
  return new Errors.VaultError('bad_record', Phrases.BornAtNotStored, { rows: { dbhas: stored }, meta: PoliciedMeta })
}

/** A `bad_record` refusal of a write of the bank over `stored`, the live bank whose lifetok it changes. */
export function lifetokNotStored(stored: ThingRecord | null): Errors.VaultError {
  return new Errors.VaultError('bad_record', Phrases.LifetokNotStored, { rows: { dbhas: stored }, meta: PoliciedMeta })
}

/** A `storage_issue` refusal: storage answered a row at another address than asked, by the `fieldnames` that disagree. */
export function rowOfOtherAddress(fieldnames: readonly string[]): Errors.VaultError { return new Errors.VaultError('storage_issue', BigPhrases.rowOfOtherAddress(fieldnames)) }

/** A `storage_issue` refusal: a live bank is stored without its main gate or its root box. */
export function bankRootsMissing(): Errors.VaultError { return new Errors.VaultError('storage_issue', Phrases.BankRootsMissing) }

/** An `unexpected_error` refusal: a vaultDB could not make the answer for a failure. */
export function answerNotMade(): Errors.VaultError { return new Errors.VaultError('unexpected_error', Phrases.AnswerNotMade) }
// --

// == [Minding Throwers]: notMinded, worldNotHeard, minderNotStarted, bankMindedInClient, staleRead, childrenStoredDamaged, recordsOfOtherThings

/** The refusal of a minder's item or listing of a Thing it does not mind. */
export function notMinded(): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.NotMinded) }

/** The refusal of a Bank made or read while its device's BankMinder holds no world of its bank. */
export function worldNotHeard(): Errors.VaultError { return new Errors.VaultError('record_conflict', Phrases.WorldNotHeard) }

/** The refusal of a read or a write on a minder that is not minding. */
export function minderNotStarted(): Errors.VaultError {
  return new Errors.VaultError('disabled', Phrases.MinderNotStarted)
}

/** The refusal of a minder's hello while another minder of its bank is minding in the same client. */
export function bankMindedInClient(): Errors.VaultError {
  return new Errors.VaultError('bad_record', Phrases.BankMindedInClient)
}

/** The refusal of a get answered with a revision older than one cached when it began. */
export function staleRead(ask: GetAsk): Errors.VaultError {
  return new Errors.VaultError('stale_read', Phrases.StaleRead, { meta: { ask: loggableAskOf(ask) } })
}

/** The bad news of `damaged_rows`, the children a list for `ask` found stored damaged and left out, each named by its labelpath. */
export function childrenStoredDamaged(ask: ListAsk, damaged_rows: readonly DamagedThing[]): Errors.VaultError {
  return new Errors.VaultError('damaged_row', Phrases.ChildrenStoredDamaged, { meta: { ask: loggableAskOf(ask), labelpaths: damaged_rows.map(({ labelpath }) => labelpath) } })
}

/** The refusal of the records of two different Things, given to `newerThingOf`. */
export function recordsOfOtherThings(): Errors.VaultError { return new Errors.VaultError('bad_record', Phrases.RecordsOfOtherThings) }
// --

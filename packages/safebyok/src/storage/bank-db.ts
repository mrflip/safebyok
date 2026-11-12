/** The answers a bankDB's verbs return, and the helpers that make an answer. */

import { UNANSWERED } from '../helpers/consts'
import { type VaultError, isVaultError, rowsOfRefusal } from '../refusals/errors'
import type { BadOutcome, GoodOutcome } from '../refusals/outcome'
import type { BankScope } from '../shapes/shapes-core'
import type { BankBadAct, DelAct, GoodAct, GotAct, ListAct, OkAct } from '../shapes/shapes-enums'
import type { BoxRow, DamagedVault } from '../shapes/shapes-storage'
import type { BankRow, BankTombstone, GateRecord, LoggableAsk, VaultRow } from '../shapes/shapes-bankdb'
import type { BoxesListed, Tidied } from './vault-db'
import * as Refuse from '../refusals/throwers'

// == [Answers]: GoodAnswer, BadAnswer, Answer, BankEnsured, EnsureBankAnswer, BuildBankAnswer, ReplacePassphraseAnswer, AddPasskeyAnswer, RevokePasskeyAnswer, DelBankAnswer, VaultAnswer, BoxAnswer, ListBoxesAnswer, TidyGoneAnswer, Notice, answerWithVal, refusedAnswerOf, badAnswerOf

/** A bankDB verb's good answer: its `val`, the `act` that says what happened, its `parent`, the row above the one asked for, and what it carries of its `ask`. */
export type GoodAnswer<ValT, ActT extends string, ParentT = BankRow> = GoodOutcome<ValT> & { ask: LoggableAsk, act: ActT, parent: ParentT, dbhas?: unknown }

// A refusal met while delivering a good answer keeps that answer's act: storage did what the act says (`refusedAnswerOf`).
/** A bankDB verb's refused answer: its `err`, with the `act`, `parent` and `dbhas` the refusal carries, and what it carries of its `ask`. */
export type BadAnswer = BadOutcome & { ask: LoggableAsk, act: BankBadAct | GoodAct, parent: unknown, dbhas?: unknown }

/** A `try*` verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. */
export type Answer<ValT, ActT extends string, ParentT = BankRow> = GoodAnswer<ValT, ActT, ParentT> | BadAnswer

/** What `ensureBank` answers of a live bank: its `main` gate row, its vault rows, and the vault rows that failed their checks. */
export type BankEnsured = { gates: { main: GateRecord }, vaults: VaultRow[], damaged_rows: DamagedVault[] }

/** The answer to `ensureBank`. Its `val` is null when no live bank is stored. */
export type EnsureBankAnswer        = Answer<BankEnsured | null, GotAct>
/** The answer to `buildBank`: the gate row put, or under `passed` the live one found. */
export type BuildBankAnswer         = Answer<GateRecord, 'born' | 'reborn' | 'passed'>
/** The answer to `replacePassphrase`: the gate row put. */
export type ReplacePassphraseAnswer = Answer<GateRecord, 'replaced'>
/** The answer to `addPasskey`: the gate row put. */
export type AddPasskeyAnswer        = Answer<GateRecord, 'added'>
/** The answer to `revokePasskey`: the gate row put, or under `passed` the one found with no passkey wayin. */
export type RevokePasskeyAnswer     = Answer<GateRecord, 'revoked' | 'passed'>
/** The answer to `delBank`: the bank's tombstone. A bank has no row above it. */
export type DelBankAnswer           = Answer<BankTombstone, DelAct, null>
/** The answer to a vault get, put or del. Its `val` is the stored row after the call, or null for none. */
export type VaultAnswer             = Answer<VaultRow | null, OkAct>
/** The answer to a box get, put or del, with its vault row as `parent`. Its `val` is the stored row after the call, or null for none. */
export type BoxAnswer               = Answer<BoxRow | null, OkAct, VaultRow>
/** The answer to `listBoxes`, with its vault row as `parent`. */
export type ListBoxesAnswer         = Answer<BoxesListed, ListAct, VaultRow>
/** The answer to `tidyGone`, with the bank's scope as `parent`. */
export type TidyGoneAnswer          = Answer<Tidied, 'tidied', BankScope>

/** A changed row reported by a watch, with the row above it if storage sent one. */
export type Notice = { act: 'gotlive' | 'gotgone', val: BankRow | GateRecord | VaultRow | BoxRow, parent: BankRow | VaultRow | null }

/** A good answer with `val`, keeping `answer`'s act, parent and ask. Throws the refusal of a bad `answer`. */
export function answerWithVal<ValT, ActT extends GoodAct>(answer: Answer<unknown, ActT, unknown>, val: ValT): GoodAnswer<ValT, ActT, unknown> {
  if (! answer.ok) { throw answer.err }
  return { ...carriedOf(answer), ok: true, val }
}

// A refusal thrown while delivering a good answer keeps that answer's act: storage did what the act says.
/** Make a bad answer of `thrown`, keeping the act and parent of `answer`.
 * Pass {@link UNANSWERED} when the throw came before storage returned an answer: the bad answer is then made from the refusal alone.
 */
export function refusedAnswerOf(thrown: unknown, answer: Answer<unknown, GoodAct, unknown> | typeof UNANSWERED): BadAnswer {
  const err = isVaultError(thrown) ? thrown : Refuse.unexpectedError(thrown)
  return (answer === UNANSWERED) ? badAnswerOf(err) : { ...carriedOf(answer), ok: false, err }
}

/** The fields of an answer besides its val or err. */
function carriedOf<ActT extends string>({ ask, act, parent, dbhas }: { ask: LoggableAsk, act: ActT, parent: unknown, dbhas?: unknown }) { return { ask, act, parent, ...((dbhas !== undefined) && { dbhas }) } }

/** Make a bad answer of `err`, with the act, ask and rows it carries, if it has them. */
export function badAnswerOf(err: VaultError): BadAnswer {
  const { act = 'unclassified_storing', ask = {} } = err.meta ?? {}
  const { parent = null, dbhas } = rowsOfRefusal(err)
  return { ok: false, err, act, parent, ask, ...((dbhas !== undefined) && { dbhas }) }
}
// --

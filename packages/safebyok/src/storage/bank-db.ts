/** The `BankDB` interface the models call, the answers its verbs return, and the helpers that make an answer. */

import type * as Z from 'zod'
import { IsBankDB, UNANSWERED } from '../helpers/consts'
import { type VaultError, isVaultError, rowsOfRefusal } from '../refusals/errors'
import type { BadOutcome, GoodOutcome } from '../refusals/outcome'
import type { BankScope } from '../shapes/shapes-core'
import type { BadAct, GoodAct, GotAct, ListAct, OkAct } from '../shapes/shapes-enums'
import type { BoxTidyAsk, DamagedVault, WatchScope } from '../shapes/shapes-storage'
import type {
  BankBuildAsk, BankDelAsk, BankEnsureAsk, BankRow, BankTop, BoxDelAsk, BoxGetAsk, BoxListAsk, BoxPutAsk, BoxRow, BoxSparse, DamagedBox,
  GateRecord, GatePutAsk, LoggableAsk, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultRow,
} from '../shapes/shapes-bankdb'
import * as Refuse from '../refusals/throwers'

// == [Answers]: GoodAnswer, BadAnswer, Answer, BankEnsured, BoxesListed, EnsureBankAnswer, GateAnswer, DelBankAnswer, VaultAnswer, BoxAnswer, ListBoxesAnswer, TidyGoneAnswer, Notice, answerWithVal, refusedAnswerOf, badAnswerOf

/** A bankDB verb's good answer.
 * Beside its `val`, it carries the `act` that says what storage did, the row above the one asked for as `parent`, and the loggable part of its `ask`.
 */
export type GoodAnswer<ValT, ActT extends string, ParentT = BankRow> = GoodOutcome<ValT> & { ask: LoggableAsk, act: ActT, parent: ParentT, dbhas?: unknown }

// A refusal met while delivering a good answer keeps that answer's act: storage did what the act says (`refusedAnswerOf`).
/** A bankDB verb's refused answer.
 * Beside its `err`, it carries the `act`, the `parent` and `dbhas` rows the refusal found, and the loggable part of its `ask`.
 */
export type BadAnswer = BadOutcome & { ask: LoggableAsk, act: BadAct | GoodAct, parent: unknown, dbhas?: unknown }

/** A `try*` verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. */
export type Answer<ValT, ActT extends string, ParentT = BankRow> = GoodAnswer<ValT, ActT, ParentT> | BadAnswer

/** What `ensureBank` answers of a live bank: its `main` gate row, its vault rows, and the vault rows that failed their checks. */
export type BankEnsured = { gates: { main: GateRecord }, vaults: VaultRow[], damaged_rows: DamagedVault[] }
/** A vault's boxes from `listBoxes`, sparse, and the rows that failed their checks. */
export type BoxesListed = { boxes: BoxSparse[], damaged_rows: DamagedBox[] }
/** The count of box rows left after `tidyGone`. */
export type Tidied = { totalCount: number }

/** The answer to `ensureBank`. Its `val` is null when no live bank is stored. */
export type EnsureBankAnswer        = Answer<BankEnsured | null, GotAct>
/** The answer to `buildBank` or a gate verb: the gate row as the datastore reports storing it, or under `passed` the live one found. */
export type GateAnswer              = Answer<GateRecord, OkAct>
/** The answer to `delBank`: the bank's tombstone, or the bank row found. Its `parent` is `main`: a bank has no row above it. */
export type DelBankAnswer           = Answer<BankRow | null, OkAct, typeof BankTop>
/** The answer to a vault get, put or del. Its `val` is the stored row after the call, as the datastore reports it, or null for none. */
export type VaultAnswer             = Answer<VaultRow | null, OkAct>
/** The answer to a box get, put or del, with its vault row as `parent`. Its `val` is the stored row after the call, as the datastore reports it, or null for none. */
export type BoxAnswer               = Answer<BoxRow | null, OkAct, VaultRow>
/** The answer to `listBoxes`, with its vault row as `parent`. */
export type ListBoxesAnswer         = Answer<BoxesListed, ListAct, VaultRow>
/** The answer to `tidyGone`, with the bank's scope as `parent`. */
export type TidyGoneAnswer          = Answer<Tidied, 'tidied', BankScope>

/** A changed row reported by a watch, with its `parent`. A bank row's parent is `main`; another row's is the row above it, or null if storage sent none. */
export type Notice = { act: 'gotlive' | 'gotgone', val: BankRow | GateRecord | VaultRow | BoxRow, parent: BankRow | VaultRow | typeof BankTop | null }

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

// == [Abstract interface]: BankDB, BankDBVerbnames

/** The verbs a model calls on a bankDB, each with its `try*` form. */
export interface BankDB {
  /** Always true: marks a bankDB for safe branding. */
  readonly [IsBankDB]: true
  /** Get the bank row, and for a live bank its `main` gate row and its vault rows.
   * A vault row that fails its checks is listed in `damaged_rows`. `val` is null when no live bank is stored.
   */
  ensureBank(ask: BankEnsureAsk): Promise<GoodAnswer<BankEnsured | null, GotAct>>
  /** Non-throwing form of {@link BankDB.ensureBank}. */
  tryEnsureBank(ask: BankEnsureAsk): Promise<EnsureBankAnswer>
  /** Store the bank record `ask.record` and its `main` gate row `ask.gate` together, over no bank or its tombstone.
   * Under the `passed` act, nothing is stored, and `val` is the live bank's gate row.
   */
  buildBank(ask: BankBuildAsk): Promise<GoodAnswer<GateRecord, OkAct>>
  /** Non-throwing form of {@link BankDB.buildBank}. */
  tryBuildBank(ask: BankBuildAsk): Promise<GateAnswer>
  /** Store the gate record `ask.record`, its passphrase wayin replaced, over the gate row `ask.expected`. */
  replacePassphrase(ask: GatePutAsk): Promise<GoodAnswer<GateRecord, OkAct>>
  /** Non-throwing form of {@link BankDB.replacePassphrase}. */
  tryReplacePassphrase(ask: GatePutAsk): Promise<GateAnswer>
  /** Store the gate record `ask.record`, a passkey wayin added, over the gate row `ask.expected`. */
  addPasskey(ask: GatePutAsk): Promise<GoodAnswer<GateRecord, OkAct>>
  /** Non-throwing form of {@link BankDB.addPasskey}. */
  tryAddPasskey(ask: GatePutAsk): Promise<GateAnswer>
  /** Store the gate record `ask.record`, its passkey wayin removed, over the gate row `ask.expected`. */
  revokePasskey(ask: GatePutAsk): Promise<GoodAnswer<GateRecord, OkAct>>
  /** Non-throwing form of {@link BankDB.revokePasskey}. */
  tryRevokePasskey(ask: GatePutAsk): Promise<GateAnswer>
  /** Store the tombstone `ask.record` over the live bank row `ask.expected`, and delete every gate, vault and box row under the bank. */
  delBank(ask: BankDelAsk): Promise<GoodAnswer<BankRow | null, OkAct, typeof BankTop>>
  /** Non-throwing form of {@link BankDB.delBank}. */
  tryDelBank(ask: BankDelAsk): Promise<DelBankAnswer>
  /** Get the vault row at a scope, whatever its life, in a bank live under `bank_tok`.
   * With `ifAbsent: 'nil'`, `val` is null where no row is stored, and the tombstone where one is; otherwise both refuse.
   */
  getVault(ask: VaultGetAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link BankDB.getVault}. */
  tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer>
  /** Store `ask.record` over the vault row `ask.expected`, in a bank live under `bank_tok`, as `ifPresent` and `ifAbsent` allow.
   * Refuses `stale_write` when the row stored is no longer `ask.expected`: get it again, and put over that.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  putVault(ask: VaultPutAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link BankDB.putVault}. */
  tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer>
  /** Store the tombstone `ask.record` over the live vault row `ask.expected`, and delete the boxes of that vault life. */
  delVault(ask: VaultDelAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link BankDB.delVault}. */
  tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer>
  /** List a vault's boxes, sparse, with its vault row as `parent`.
   * Refuses when the vault is not live under `bank_tok` and `vault_tok`.
   */
  listBoxes(ask: BoxListAsk): Promise<GoodAnswer<BoxesListed, ListAct, VaultRow>>
  /** Non-throwing form of {@link BankDB.listBoxes}. When the vault row refuses, `parent` is that stored row. */
  tryListBoxes(ask: BoxListAsk): Promise<ListBoxesAnswer>
  /** Get a box row, with its vault row as `parent`. Refuses when the vault is not live under `bank_tok` and `vault_tok`.
   * With `ifAbsent: 'nil'`, `val` is null where no row is stored, and the tombstone where one is; otherwise both refuse.
   */
  getBox(ask: BoxGetAsk): Promise<GoodAnswer<BoxRow | null, OkAct, VaultRow>>
  /** Non-throwing form of {@link BankDB.getBox}. */
  tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer>
  /** Store `ask.record` over the box row `ask.expected`, in a vault live under `bank_tok` and `vault_tok`, as `ifPresent` and `ifAbsent` allow.
   * Refuses `stale_write` when the row stored is no longer `ask.expected`: get it again, and put over that.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  putBox(ask: BoxPutAsk): Promise<GoodAnswer<BoxRow | null, OkAct, VaultRow>>
  /** Non-throwing form of {@link BankDB.putBox}. */
  tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer>
  /** Store the tombstone `ask.record` over the live box row `ask.expected`. */
  delBox(ask: BoxDelAsk): Promise<GoodAnswer<BoxRow | null, OkAct, VaultRow>>
  /** Non-throwing form of {@link BankDB.delBox}. */
  tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer>
  /** Delete the vault and box rows of ended lives under the bank, and count the box rows left.
   * Housekeeping for a host: no other verb depends on it.
   */
  tidyGone(ask: BoxTidyAsk): Promise<GoodAnswer<Tidied, 'tidied', BankScope>>
  /** Non-throwing form of {@link BankDB.tidyGone}. */
  tryTidyGone(ask: BoxTidyAsk): Promise<TidyGoneAnswer>
  /** Watch a bank or a vault: call `onNotice` with each changed row, and `onBadNews` with trouble in the watch.
   * A bank's watch hears its bank, gate, vault and box rows; a vault's, its vault row and its box rows.
   * Returns a function that stops the watch. Notices are best effort: never count on one arriving.
   * After bad news, the watch may go on or may have ended.
   */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews?: (news: VaultError) => void): () => void
}

/** The name of each verb of {@link BankDB}. A duck check demands that a bankDB has a function under each name. */
export const BankDBVerbnames = [
  'ensureBank', 'tryEnsureBank', 'buildBank', 'tryBuildBank',
  'replacePassphrase', 'tryReplacePassphrase', 'addPasskey', 'tryAddPasskey', 'revokePasskey', 'tryRevokePasskey',
  'delBank', 'tryDelBank', 'getVault', 'tryGetVault', 'putVault', 'tryPutVault', 'delVault', 'tryDelVault',
  'listBoxes', 'tryListBoxes', 'getBox', 'tryGetBox', 'putBox', 'tryPutBox', 'delBox', 'tryDelBox',
  'tidyGone', 'tryTidyGone', 'watch',
] as const satisfies readonly (keyof BankDB)[]

true satisfies Z.core.util.AssertEqual<typeof BankDBVerbnames[number], Exclude<keyof BankDB, typeof IsBankDB>>
// --

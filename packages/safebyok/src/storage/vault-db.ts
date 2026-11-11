/** The `VaultDB` interface the models call, the answers its verbs return, and the helpers that make an answer. */

import type * as Z from 'zod'
import { IsVaultDB, UNANSWERED } from '../helpers/consts'
import { type VaultError, isVaultError, rowsOfRefusal } from '../refusals/errors'
import type { BadOutcome, GoodOutcome } from '../refusals/outcome'
import type { BankScope } from '../shapes/shapes-core'
import type { OkAct, ListAct } from '../shapes/shapes-enums'
import type {
  BoxDelAsk, BoxGetAsk, BoxPutAsk, BoxRow, BoxSparse, DamagedBox, DamagedVault,
  GateVerbOpts, ReqParams, VaultDelAsk, VaultGetAsk, VaultPutAsk, VaultQuery, VaultRecord, VaultRow, VaultTombstone, WatchScope,
} from '../shapes/shapes-storage'
import * as Refuse from '../refusals/throwers'

// == [Answers]: GoodAnswer, BadAnswer, Answer, VaultAnswer, BoxAnswer, ListAct, OkAct, BankListed, BoxesListed, Tidied, Notice, answerWithVal, refusedAnswerOf, badAnswerOf

/** A vaultDB verb's good answer: its `val`, the `act` that says what happened, and its `world` vault row. */
export type GoodAnswer<ValT, ActT extends string, WorldT = VaultRow> = GoodOutcome<ValT> & { req_params: ReqParams, act: ActT, world: WorldT, dbhas?: unknown }

/** A vaultDB verb's refused answer: its `err`, with the `act`, `world` and `dbhas` the refusal carries. */
export type BadAnswer = BadOutcome & { req_params: ReqParams, act: string, world: unknown, dbhas?: unknown }

/** A `try*` verb's answer: a {@link GoodAnswer} or a {@link BadAnswer}. */
export type Answer<ValT, ActT extends string, WorldT = VaultRow> = GoodAnswer<ValT, ActT, WorldT> | BadAnswer

/** The answer to a vault get, put or del. Its `val` is the stored row after the call, or null for none. */
export type VaultAnswer = Answer<VaultRow | null, OkAct>
/** The answer to a box get, put or del. Its `val` is the stored row after the call, or null for none. */
export type BoxAnswer = Answer<BoxRow | null, OkAct>

export type { DelAct, GotAct, ListAct, OkAct, PutAct } from '../shapes/shapes-enums'

/** The bank's vaults from `listVaults`, and the rows that failed their checks. */
export type BankListed  = { vaults: (VaultRecord | VaultTombstone)[], damaged_rows: DamagedVault[] }
/** A vault's boxes from `listBoxes`, sparse, and the rows that failed their checks. */
export type BoxesListed = { boxes: BoxSparse[], damaged_rows: DamagedBox[] }
/** The count of box rows left after `tidyGone`. */
export type Tidied      = { totalCount: number }

/** A changed row reported by a watch, with its vault row if storage sent one. */
export type Notice = { act: 'got' | 'gone', val: VaultRow | BoxRow, world: VaultRow | null }

/** A good answer with `val`, keeping `answer`'s act, world and request metadata. */
export function answerWithVal<ValT>(answer: Answer<unknown, string, unknown>, val: ValT): GoodAnswer<ValT, string, unknown> { return { ...carriedOf(answer), ok: true, val } }

// A refusal thrown while delivering a good answer keeps that answer's act: storage did what the act says.
/** Make a bad answer of `thrown`, keeping the act and world of `answer`.
 * Pass {@link UNANSWERED} when the throw came before storage returned an answer: the bad answer is then made from the refusal alone.
 */
export function refusedAnswerOf(thrown: unknown, answer: Answer<unknown, string, unknown> | typeof UNANSWERED): BadAnswer {
  const err = isVaultError(thrown) ? thrown : Refuse.unexpectedError(thrown)
  return (answer === UNANSWERED) ? badAnswerOf(err) : { ...carriedOf(answer), ok: false, err }
}

/** The fields of an answer besides its val or err. */
function carriedOf({ req_params, act, world, dbhas }: Answer<unknown, string, unknown>) { return { req_params, act, world, ...((dbhas !== undefined) && { dbhas }) } }

/** Make a bad answer of `err`, with the act, request metadata and rows it carries, if it has them. */
export function badAnswerOf(err: VaultError): BadAnswer {
  const { act = err.refusalkind, req_params = {} } = err.meta ?? {}
  const { world = null, dbhas } = rowsOfRefusal(err)
  return { ok: false, err, act, world, req_params, ...((dbhas !== undefined) && { dbhas }) }
}
// --

// == [Abstract interface]: VaultDB, VaultDBVerbnames

/** The verbs a model calls on a vaultDB, each with its `try*` form. */
export interface VaultDB {
  /** Always true: marks a vaultDB for safe branding. */
  readonly [IsVaultDB]: true
  /** List the bank's vaults and tombstones, without their boxes.
   * A row that fails its checks is listed in `damaged_rows`.
   */
  listVaults(scope: BankScope): Promise<GoodAnswer<BankListed, ListAct, BankScope>>
  /** Non-throwing form of {@link VaultDB.listVaults}. */
  tryListVaults(scope: BankScope): Promise<Answer<BankListed, ListAct, BankScope>>
  /** Get the vault row at a scope, whatever its life.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone; otherwise both refuse.
   */
  getVault(ask: VaultGetAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.getVault}. */
  tryGetVault(ask: VaultGetAsk): Promise<VaultAnswer>
  /** List a vault's boxes, sparse, with its vault row as `world`.
   * Refuses when the vault is not live under `vault_tok`.
   */
  listBoxes(asked: VaultQuery): Promise<GoodAnswer<BoxesListed, ListAct>>
  /** Non-throwing form of {@link VaultDB.listBoxes}. When the vault row refuses, `world` is that stored row. */
  tryListBoxes(asked: VaultQuery): Promise<Answer<BoxesListed, ListAct>>
  /** Get a box row, with its vault row as `world`. Refuses when the vault is not live under `vault_tok`.
   * With `ifAbsent: 'nil'`, `val` is null for no row, or the tombstone; otherwise both refuse.
   */
  getBox(ask: BoxGetAsk): Promise<GoodAnswer<BoxRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.getBox}. */
  tryGetBox(ask: BoxGetAsk): Promise<BoxAnswer>
  /** Store `ask.record` over the vault row `ask.expected`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  putVault(ask: VaultPutAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.putVault}. */
  tryPutVault(ask: VaultPutAsk): Promise<VaultAnswer>
  /** Store `ask.record` over the box row `ask.expected`, in a vault live under its `vault_tok`, as `ifPresent` and `ifAbsent` allow.
   * Under the `passed` act, nothing is stored, and `val` is the live row found.
   */
  putBox(ask: BoxPutAsk): Promise<GoodAnswer<BoxRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.putBox}. */
  tryPutBox(ask: BoxPutAsk): Promise<BoxAnswer>
  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that its only change is to replace the passphrase wayin. */
  replacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'replaced'>>
  /** Non-throwing form of {@link VaultDB.replacePassphrase}. */
  tryReplacePassphrase(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'replaced'>>
  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that its only change is to add a passkey wayin.
   * Refuses `camped` when a passkey wayin is already stored.
   */
  addPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'added'>>
  /** Non-throwing form of {@link VaultDB.addPasskey}. */
  tryAddPasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'added'>>
  /** Put the properly revisioned `record`, demanding a new `gate_epoch` and that the passkey is absent.
   * @returns an answer with the stored row: @see {@link VaultDB.putVault}
   */
  revokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<GoodAnswer<VaultRecord, 'revoked'>>
  /** Non-throwing form of {@link VaultDB.revokePasskey}. */
  tryRevokePasskey(record: VaultRecord, opts: GateVerbOpts): Promise<Answer<VaultRecord, 'revoked'>>
  /** Store the tombstone `ask.record` over the live box row `ask.expected`. */
  delBox(ask: BoxDelAsk): Promise<GoodAnswer<BoxRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.delBox}. */
  tryDelBox(ask: BoxDelAsk): Promise<BoxAnswer>
  /** Store the tombstone `ask.record` over the live vault row `ask.expected`, and delete the boxes of that vault life. */
  delVault(ask: VaultDelAsk): Promise<GoodAnswer<VaultRow | null, OkAct>>
  /** Non-throwing form of {@link VaultDB.delVault}. */
  tryDelVault(ask: VaultDelAsk): Promise<VaultAnswer>
  /** Housekeeping for hosts: delete the box rows whose vault is missing, tombstoned or reborn, and count the box rows left. */
  tidyGone(scope: BankScope): Promise<GoodAnswer<Tidied, 'tidied', BankScope>>
  /** Non-throwing form of {@link VaultDB.tidyGone}. */
  tryTidyGone(scope: BankScope): Promise<Answer<Tidied, 'tidied', BankScope>>
  /** Watch a bank or a vault: call `onNotice` with each changed row, and `onBadNews` with trouble in the watch.
   * Returns a function that stops the watch. Notices are best effort: never count on one arriving.
   * After bad news, the watch may go on or may have ended.
   */
  watch(scope: WatchScope, onNotice: (notice: Notice) => void, onBadNews?: (news: VaultError) => void): () => void
}

/** The name of each verb of {@link VaultDB}. A duck check demands that a vaultDB has a function under each name. */
export const VaultDBVerbnames = [
  'listVaults', 'tryListVaults', 'getVault', 'tryGetVault', 'listBoxes', 'tryListBoxes', 'getBox', 'tryGetBox',
  'putVault', 'tryPutVault', 'putBox', 'tryPutBox',
  'replacePassphrase', 'tryReplacePassphrase', 'addPasskey', 'tryAddPasskey', 'revokePasskey', 'tryRevokePasskey',
  'delBox', 'tryDelBox', 'delVault', 'tryDelVault', 'tidyGone', 'tryTidyGone', 'watch',
] as const satisfies readonly (keyof VaultDB)[]

true satisfies Z.core.util.AssertEqual<typeof VaultDBVerbnames[number], Exclude<keyof VaultDB, typeof IsVaultDB>>
// --

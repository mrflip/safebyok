/** The `VaultDB` interface the models call. Its answers, and what a concrete adapter reports to `AdapterVaultDB`, are in shapes-answers. */

import type { Errors } from 'safebyok-big/internals'
import type { BirthBankAsk, GetAsk, GetWorldAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import type { BirthBankAnswer, GetThingAnswer, GetWorldAnswer, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type { VaultEvent } from '../shapes/shapes-vault-event'

// == [The interface]: VaultDB, VaultDBMembernames, isVaultDB

/** Storage for the Things of a user's banks. Each `try` verb is one atomic step, and resolves an answer instead of throwing.
 * Each `*Ask` builder fills in an ask's defaults and checks nothing: the verb it is passed to refuses a bad ask.
 * The records an answer or a notice carries become the caller's to keep, deeply frozen: a vaultDB never changes one after handing it over.
 */
export interface VaultDB {
  /** The Thing at `ask`'s scope. */
  tryGetThing(ask: GetAsk): Promise<GetThingAnswer>
  /** Write `ask.record` over the ante Thing, if it matches `ask.cited`.
   * - The record is written when its preconditions hold: the exact revision cited and, for a put that replaces a live Thing, the
   *   born_at left unchanged and the storage policies it names. Nothing else of the ante Thing is checked.
   * - Where several refusals apply at once, the answer is one of them, but which is unspecified, and may differ between concrete adapters
   *   and between versions. An ante Thing that fails its checks, so that no precondition can be checked against it, may refuse `incompatible_row`,
   *   `storage_issue`, or the failed precondition's own refusal.
   * - The record carries every field, so a concrete adapter may write it by replacing the ante Thing whole.
   */
  tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer>
  /** The children of the Thing at `ask`'s scope, read in one step. */
  tryListThings(ask: ListAsk): Promise<ListThingsAnswer>
  /** Write a new bank's three roots (bank, main gate, root box), or answer the actual roots of a bank already live. */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer>
  /** A bank's three roots (bank, main gate, root box), read in one step: each live, a tombstone, or the shell where none is stored. */
  tryGetWorld(ask: GetWorldAsk): Promise<GetWorldAnswer>
  /** A bank's storage stats, read in one step: how many boxes and gates it has, live and in all, their size in bytes, and the datastore's limits.
   * Nothing refuses a write for being over a limit. A datastore's limit is never `Infinity`: one with none reports `StoreLimitCap`.
   */
  tryStats(ask: StatsAsk): Promise<StatsAnswer>
  /** Watch a bank's Things, returning a function that stops the watch.
   * `onBadNews` gets any trouble the watch meets, including a Thing that fails its checks.
   * `onEnded` is called once where the watch ends before its stop is called, as one that cannot start may. It comes after
   * `watch` returns and before the bad news that says why; the stop need not be called. News may still reach the watcher
   * after it, as when the watch's closing, an unlisten, fails.
   * A vaultDB whose watch ends only at its stop never calls it.
   * What a watcher is notified of is the vaultDB's own to say: an `AdapterVaultDB` notifies each change its datastore
   * reports, when the datastore delivers it.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void, onEnded?: () => void): () => void
}

/** The members of {@link VaultDB} that are functions. */
const VaultDBMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'tryGetWorld', 'tryStats', 'watch',
] as const satisfies readonly (keyof VaultDB)[]

/** True for an object with a function for each member of {@link VaultDB}. */
export function isVaultDB(val: unknown): val is VaultDB {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return VaultDBMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

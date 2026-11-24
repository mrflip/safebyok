/** The `VaultDB` interface the models call. Its answers, and what a concrete adapter reports to `AdapterVaultDB`, are in shapes-answers. */

import type { Errors } from 'safebyok-big/internals'
import type { BirthBankAsk, GetAsk, GetWorldAsk, ListAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import type { BirthBankAnswer, GetThingAnswer, GetWorldAnswer, ListThingsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import type { VaultEvent } from '../shapes/shapes-vault-event'

// == [The interface]: VaultDB, VaultDBMembernames, isVaultDB

/** Storage for the Things of a user's banks. Each `try` verb is one atomic step, and resolves an answer instead of throwing.
 * Each `*Ask` builder fills in an ask's defaults and checks nothing: the verb it is passed to refuses a bad ask.
 * The records an answer or a notice carries become the caller's to keep, deeply frozen: a vaultDB never changes one after handing it over.
 */
export interface VaultDB {
  /** The Thing at `ask`'s scope. */
  tryGetThing(ask: GetAsk): Promise<GetThingAnswer>
  /** Write `ask.record` over the Thing stored, if it matches `ask.cited`.
   * - The write is stored when its preconditions hold: the exact revision cited and, for a put that replaces a live Thing, the
   *   born_at left unchanged and the storage policies it names. Nothing else of the Thing stored is checked.
   * - Where several refusals apply at once, the answer is one of them, but which is unspecified, and may differ between concrete adapters
   *   and between versions. A Thing stored too damaged to check the preconditions against may refuse `damaged_row`,
   *   `storage_issue`, or the failed precondition's own refusal.
   * - The record carries every field, so a concrete adapter may write it by replacing the Thing stored whole.
   */
  tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer>
  /** The children of the Thing at `ask`'s scope, read in one step. */
  tryListThings(ask: ListAsk): Promise<ListThingsAnswer>
  /** Write a new bank's three roots (bank, main gate, root box), or answer the roots already stored. */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer>
  /** A bank's three roots (bank, main gate, root box), read in one step: each live, a tombstone, or the shell where none is stored. */
  tryGetWorld(ask: GetWorldAsk): Promise<GetWorldAnswer>
  /** Watch a bank's Things, returning a function that stops the watch.
   * `onBadNews` gets any trouble the watch meets, including a Thing that fails its checks.
   * What a watcher is notified of is the vaultDB's own to say: an `AdapterVaultDB` notifies each change its datastore
   * reports, when the datastore delivers it.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void): () => void
}

/** The members of {@link VaultDB} that are functions. */
const VaultDBMembernames = [
  'tryGetThing', 'tryWriteThing', 'tryListThings', 'tryBirthBank', 'tryGetWorld', 'watch',
] as const satisfies readonly (keyof VaultDB)[]

/** True for an object with a function for each member of {@link VaultDB}. */
export function isVaultDB(val: unknown): val is VaultDB {
  if (typeof val !== 'object' || val === null) { return false }
  const members: Partial<Record<string, unknown>> = val
  return VaultDBMembernames.every((membername) => typeof members[membername] === 'function')
}
// --

/** The `OneWatchVaultDB` wrapper: one tab of the origin runs a vaultDB's watch of a bank, and tells the others. */

import { deepFreeze, noop } from 'es-toolkit'
import { type Errors, Outcome } from 'safebyok-big/internals'
import { bulletproofHandlerOf } from '../helpers/bulletproof'
import type { BirthBankAsk, GetAsk, GetBankAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import { AskChecks } from '../shapes/shapes-asks'
import type { BirthBankAnswer, GetThingAnswer, GetBankAnswer, ListThingsAnswer, StatsAnswer, WriteThingAnswer } from '../shapes/shapes-answers'
import { ThingChecks } from '../shapes/shapes-thing'
import { type VaultEvent, SeenChecks } from '../shapes/shapes-vault-event'
import * as Throwers from '../refusals/throwers'
import type { VaultDB } from './vault-db'

// == [Names]: watchnameOf, lockManagerOf

// A userid and a banklabel never hold a `/`, so the name reads back into its parts.
/** The name of the Web Lock and of the BroadcastChannel for the watch of the bank at `scope`: `safebyok/<userid>/<banklabel>/bank`. */
export function watchnameOf({ userid, banklabel }: ThingWatchScope): string { return `safebyok/${userid}/${banklabel}/bank` }

/** This page's Web Locks manager, or undefined where the platform has none */
function lockManagerOf(): LockManager | undefined {
  return (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks
}
// --

// The platform hands the lock to the next tab waiting when the holder lets it go, or when its page closes, reloads or is
// discarded. A hidden holder keeps hearing: Chrome's freezing spares a page holding a Web Lock that another page waits for.
/** A vaultDB that runs the watch of `vaultDB` in one tab of the origin for each bank, and hands what it notifies to the watch of every other tab.
 * Each watch asks for a Web Lock named for the bank; the tab holding it runs the wrapped vaultDB's watch, and posts each notice on a BroadcastChannel of the same name.
 * Every other verb is the wrapped vaultDB's own. Where the platform has no Web Locks, each tab runs the wrapped vaultDB's watch.
 */
export class OneWatchVaultDB implements VaultDB {
  // == [Props]: #vaultDB

  readonly #vaultDB: VaultDB
  // --

  // == [Construction]: constructor

  constructor(vaultDB: VaultDB) {
    this.#vaultDB = ThingChecks.vaultDBShape.parse(vaultDB, { where: "In OneWatchVaultDB's vaultDB" })
    Object.freeze(this)
  }
  // --

  // == [Verbs]: tryGetThing, tryWriteThing, tryListThings, tryBirthBank, tryGetBank, tryStats, watch, #holdWatch, #whileLocked

  /** The wrapped vaultDB's {@link VaultDB.tryGetThing}. */
  tryGetThing(ask: GetAsk): Promise<GetThingAnswer> { return this.#vaultDB.tryGetThing(ask) }

  /** The wrapped vaultDB's {@link VaultDB.tryWriteThing}. */
  tryWriteThing(ask: WriteAsk): Promise<WriteThingAnswer> { return this.#vaultDB.tryWriteThing(ask) }

  /** The wrapped vaultDB's {@link VaultDB.tryListThings}. */
  tryListThings(ask: ListAsk): Promise<ListThingsAnswer> { return this.#vaultDB.tryListThings(ask) }

  /** The wrapped vaultDB's {@link VaultDB.tryBirthBank}. */
  tryBirthBank(ask: BirthBankAsk): Promise<BirthBankAnswer> { return this.#vaultDB.tryBirthBank(ask) }

  /** The wrapped vaultDB's {@link VaultDB.tryGetBank}. */
  tryGetBank(ask: GetBankAsk): Promise<GetBankAnswer> { return this.#vaultDB.tryGetBank(ask) }

  /** The wrapped vaultDB's {@link VaultDB.tryStats}. */
  tryStats(ask: StatsAsk): Promise<StatsAnswer> { return this.#vaultDB.tryStats(ask) }

  /** Watch a bank's Things ({@link VaultDB.watch}): notified of what the wrapped vaultDB's watch notifies, in whichever tab of the origin runs it.
   * The wrapped vaultDB's watch starts in a tab once it is handed the bank's lock, so a change while the lock changes hands reaches no tab. Bad news reaches only the holder's `onBadNews`.
   * Of what another tab posts, only an `item` event that passes its checks is notified, deeply frozen, with the `read_tc` the holder heard it at.
   * Where this tab's watch cannot start, as where the wrapped vaultDB's watch throws as it starts, it ends. Its `onEnded` is called, then its `onBadNews` says why.
   */
  watch(scope: ThingWatchScope, onNotice: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void, onEnded: () => void = noop): () => void {
    const { scope: bankScope } = AskChecks.watchArgs.parse({ scope, onNotice, onBadNews, onEnded })
    const locks = lockManagerOf()
    if (locks === undefined) { return this.#vaultDB.watch(bankScope, onNotice, onBadNews, onEnded) }
    // A notice handler that throws is a bug in the host's code, not trouble in storage.
    const notify  = bulletproofHandlerOf(onNotice, { ifError: 'tell', transformer: Throwers.refusalOfThrown, onBadNews })
    const channel = new BroadcastChannel(watchnameOf(bankScope))
    channel.addEventListener('message', ({ data }: MessageEvent<unknown>) => {
      const heardReport = SeenChecks.itemEvent.safeParse(data)
      if (heardReport.success) { notify(deepFreeze(heardReport.data as VaultEvent)) }
    })
    const release = this.#holdWatch(locks, bankScope, channel, notify, onBadNews, (err) => {
      channel.close()
      onEnded()
      onBadNews(Outcome.storageRefusalOf(err))
    })
    return () => {
      release()
      channel.close()
    }
  }

  /** Ask for the bank's lock, and while this tab holds it, run the wrapped vaultDB's watch, posting each notice on `channel`; answers the function that lets the lock go */
  #holdWatch(
    locks: LockManager, bankScope: ThingWatchScope, channel: BroadcastChannel,
    notify: (event: VaultEvent) => void, onBadNews: (news: Errors.VaultError) => void, onFailed: (err: unknown) => void,
  ): () => void {
    let isReleased = false
    let release = () => { isReleased = true }
    void this.#whileLocked(locks, bankScope, onFailed, () => new Promise<void>((resolve) => {
      // A watch stopped while it waited for the lock starts nothing.
      if (isReleased) { resolve(); return }
      const unwatch = this.#vaultDB.watch(bankScope, (event) => {
        channel.postMessage(event)
        notify(event)
      }, onBadNews)
      release = () => {
        unwatch()
        resolve()
      }
    }))
    return () => { release() }
  }

  /** Call `hold` once this tab is handed the bank's lock, and keep the lock until the promise it answers settles; what `hold` throws, or the lock request itself, goes to `onFailed` */
  async #whileLocked(locks: LockManager, bankScope: ThingWatchScope, onFailed: (err: unknown) => void, hold: () => Promise<void>): Promise<void> {
    try {
      await locks.request(watchnameOf(bankScope), hold)
    } catch (err) {
      onFailed(err)
    }
  }
  // --
}

/** A vaultDB that runs the watch of `vaultDB` in one tab of the origin for each bank ({@link OneWatchVaultDB}), for a browser app to pass to `Device.make`. */
export function oneWatchVaultDB(vaultDB: VaultDB): OneWatchVaultDB { return new OneWatchVaultDB(vaultDB) }

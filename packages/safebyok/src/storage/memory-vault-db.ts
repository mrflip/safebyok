/** The vaultDB in memory. */

import { type EX, type Errors, Helpers, Outcome } from 'safebyok-big/internals'
import { AdapterVaultDB, type Received } from './adapter-vault-db'
import type { BirthBankAsk, BirthPuts, GetThingAsk, ListThingsAsk, Thing, ThingScope, ThingWatchScope, WorldRecord, WriteThingAsk } from './shapes-thing'
import { type BankRootsFetched, type WorldFetched, isWriteAct, worldOf, writtenRootsOf, writtenThingOf } from './thing-classifier'
import type { Actual, BirthBankActual, ListThingsActual } from './vault-db'

/** A watch: the bank it watches, the function that receives each change, and the one that hears its trouble. */
type Watcher = { scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void }

/** A vaultDB kept in this tab's memory, gone when the tab closes. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #banks, #watchers

  // Each bank's Things, by labelpath, so that a listing reads one bank's. The modelkind at the base of each labelpath keeps the kinds apart.
  readonly #banks = new Map<string, Map<string, unknown>>()
  readonly #watchers = new Set<Watcher>()
  // --

  // == [Things]: _cheat_things, ckeyOf, #thingsOf, #write, #rootsOf, #worldFetchedOf, #worldOf, #notify

  /** For tests: the Things stored in `scope`'s bank, by labelpath, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Map<string, unknown> { return this.#thingsOf(scope) } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the bank at `scope`, in `#banks`. */
  static ckeyOf({ userid, banklabel }: ThingWatchScope): string { return Helpers.ckeyOf(userid, banklabel) }

  /** The Things of `scope`'s bank, by labelpath. */
  #thingsOf(scope: ThingWatchScope): Map<string, unknown> {
    const ckey = MemoryVaultDB.ckeyOf(scope)
    const things = this.#banks.get(ckey) ?? new Map<string, unknown>()
    this.#banks.set(ckey, things)
    return things
  }

  /** Write `record` at `scope`, and return it as read back, checked. */
  #write(scope: ThingScope, record: Thing): Thing {
    const things = this.#thingsOf(scope)
    things.set(scope.labelpath, structuredClone(record))
    return writtenThingOf(scope, structuredClone(things.get(scope.labelpath)))
  }

  /** The raw roots of a bank's `things`, each a copy, or null for none. */
  #rootsOf(things: Map<string, unknown>): BankRootsFetched {
    return structuredClone({ bank: things.get('bank') ?? null, gate: things.get('gate') ?? null, root: things.get('box') ?? null })
  }

  /** The raw bank and main gate of a bank's `things`, each a copy, or null for none. */
  #worldFetchedOf(things: Map<string, unknown>): WorldFetched {
    return structuredClone({ bank: things.get('bank') ?? null, maingate: things.get('gate') ?? null })
  }

  /** The world of the bank of `things` at `scope`, as it now stands. */
  #worldOf(scope: ThingWatchScope, things: Map<string, unknown>): WorldRecord | null { return worldOf(scope, this.#worldFetchedOf(things)) }

  // Each watcher is called on a later microtask, so nothing it does runs inside the write that notified it.
  /** Notify each watcher of `thing`'s bank of it, and of the bank as `world`. */
  #notify(thing: Thing, world: WorldRecord | null): void {
    for (const { scope, receive, onBadNews } of this.#watchers) {
      if ((scope.userid === thing.userid) && (scope.banklabel === thing.banklabel)) {
        queueMicrotask(() => {
          try { receive({ record: structuredClone(thing), world: structuredClone(world) }) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)) }
        })
      }
    }
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doWatch

  protected doGetThing(ask: GetThingAsk): Actual<EX.GotAct> {
    const things = this.#thingsOf(ask)
    return this.classifyGetThing(ask, structuredClone(things.get(ask.labelpath) ?? null), this.#worldFetchedOf(things))
  }

  protected doWriteThing(ask: WriteThingAsk): Actual<EX.PutAct | EX.DelAct> {
    const things = this.#thingsOf(ask)
    const actual = this.classifyWriteThing(ask, structuredClone(things.get(ask.labelpath) ?? null), this.#worldFetchedOf(things))
    if (! (actual.ok && isWriteAct(actual.act))) { return actual }
    const record = this.#write(ask, ask.record)
    const world  = this.#worldOf(ask, things)
    this.#notify(record, world)
    return { ...actual, world, record }
  }

  protected doListThings(ask: ListThingsAsk): ListThingsActual {
    const things   = this.#thingsOf(ask)
    const under    = `${ask.labelpath}/`
    const children = [...things]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    return this.classifyListThings(ask, { parent: structuredClone(things.get(ask.labelpath) ?? null), children }, this.#worldFetchedOf(things))
  }

  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthBankActual {
    const things = this.#thingsOf(ask)
    const actual = this.classifyBirthBank(puts, this.#rootsOf(things))
    if (! (actual.ok && (actual.act === 'born'))) { return actual }
    for (const { labelpath, record } of puts) { things.set(labelpath, structuredClone(record)) }
    const written = writtenRootsOf(puts, this.#rootsOf(things))
    const world   = this.#worldOf(ask, things)
    for (const thing of Object.values(written)) { this.#notify(thing, world) }
    return { ...actual, world, things: written }
  }

  protected override doWatch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void {
    const watcher = { scope, receive, onBadNews }
    this.#watchers.add(watcher)
    return () => { this.#watchers.delete(watcher) }
  }
  // --
}

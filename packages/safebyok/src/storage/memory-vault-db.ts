/** The vaultDB in memory. */

import { type Errors, Helpers, Outcome } from 'safebyok-big/internals'
import { AdapterVaultDB, type Received } from './adapter-vault-db'
import { Labelpath } from '../shapes/primitives'
import { type ThingRecord } from '../shapes/shapes-thing'
import { type AnyAsk, type BirthBankAsk, type BirthPuts, type GetAsk, type ListAsk, type ThingWatchScope, type Tracked, type WorldRecord, type WriteAsk } from '../shapes/shapes-asks'
import type { AboveFetched, BankRootsFetched, WorldFetched } from './thing-classifier'
import * as Classifier from './thing-classifier'
import type { BirthBankActual, GotActual, ListThingsActual, WroteActual } from './vault-db'

/** A watch: the bank it follows, the function called with each change, and the one called with any trouble. */
export type Watcher = { scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void }

/** A vaultDB in this tab's memory, gone when the tab closes. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #banks, #watchers

  // Each bank's Things, by labelpath, so that a listing reads one bank's. The modelkind at the base of each labelpath keeps the kinds apart.
  readonly #banks = new Map<string, Map<Labelpath, unknown>>()
  readonly #watchers = new Set<Watcher>()
  // --

  // == [Things]: _cheat_things, ckeyOf, #thingsOf, #write, #rootsOf, #worldFetchedOf, #aboveOf, #worldAfter, #notify

  /** For tests: the Things stored in `scope`'s bank, by labelpath, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Map<Labelpath, unknown> { return this.#thingsOf(scope) } // eslint-disable-line unicorn/prefer-private-class-fields

  /** The ckey of the bank at `scope`, in `#banks`. */
  static ckeyOf({ userid, banklabel }: ThingWatchScope): string { return Helpers.ckeyOf(userid, banklabel) }

  /** The Things of `scope`'s bank, by labelpath. */
  #thingsOf(scope: ThingWatchScope): Map<Labelpath, unknown> {
    const ckey = MemoryVaultDB.ckeyOf(scope)
    const things = this.#banks.get(ckey) ?? new Map<Labelpath, unknown>()
    this.#banks.set(ckey, things)
    return things
  }

  /** Write `record` at its scope, and return it as read back, checked. */
  #write(record: ThingRecord): ThingRecord {
    const things = this.#thingsOf(record)
    things.set(record.labelpath, structuredClone(record))
    return Classifier.writtenThingOf(record, structuredClone(things.get(record.labelpath)))
  }

  /** The raw roots of `ask`'s bank, each a copy, or null for none, and how its bank, main gate and root box compare with what `ask` tracks. */
  #rootsOf(ask: AnyAsk): BankRootsFetched {
    const { maingate: gate, ...fetched } = this.#worldFetchedOf(ask)
    return { ...fetched, gate, root: structuredClone(this.#thingsOf(ask).get(Labelpath.RootBox) ?? null) }
  }

  /** The raw bank and main gate of `ask`'s bank, each a copy, or null for none, and how they and its root box compare with what `ask` tracks. */
  #worldFetchedOf(ask: AnyAsk): WorldFetched {
    const things  = this.#thingsOf(ask)
    const fetched = structuredClone({ bank: things.get('bank') ?? null, maingate: things.get(Labelpath.MainGate) ?? null })
    const rows    = { bank: fetched.bank, [Labelpath.MainGate]: fetched.maingate, [Labelpath.RootBox]: structuredClone(things.get(Labelpath.RootBox) ?? null) }
    return { ...fetched, tracked: Classifier.trackedFetchedOf(ask, rows) }
  }

  /** The raw world of `ask`'s bank, and the nearest Thing stored above its scope, each a copy, or null for none. */
  #aboveOf(ask: GetAsk | WriteAsk): AboveFetched {
    const things    = this.#thingsOf(ask)
    const abovepath = Labelpath.ancestorsOf(ask.labelpath).find((labelpath) => things.has(labelpath))
    return { ...this.#worldFetchedOf(ask), ancestor: (abovepath === undefined) ? null : structuredClone(things.get(abovepath)) }
  }

  /** The world of `ask`'s bank as it now stands, and its `tracked` for what `ask` tracks. */
  #worldAfter(ask: AnyAsk): { world: WorldRecord | null, tracked?: Tracked } {
    const fetched = this.#worldFetchedOf(ask)
    return { world: Classifier.worldOf(ask, fetched), ...Classifier.trackedFieldOf(ask, fetched.tracked) }
  }

  // Each watcher is called on a later microtask, so nothing it does runs inside the write that notified it.
  /** Notify each watcher of `thing`'s bank of it, and of the bank as `world`. */
  // The order and timing of an *adapter*'s notifications relative to reads, writes, or other notifications is unspecified, even for datastores that provide assurance.
  #notify(thing: ThingRecord, world: WorldRecord | null): void {
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

  protected doGetThing(ask: GetAsk): GotActual {
    const things = this.#thingsOf(ask)
    return this.classifyGetThing(ask, structuredClone(things.get(ask.labelpath) ?? null), this.#aboveOf(ask))
  }

  protected doWriteThing(ask: WriteAsk): WroteActual {
    const things = this.#thingsOf(ask)
    const actual = this.classifyWriteThing(ask, structuredClone(things.get(ask.labelpath) ?? null), this.#aboveOf(ask))
    if (! (actual.ok && Classifier.isWriteAct(actual.act))) { return actual }
    const record = this.#write(ask.record)
    const after  = this.#worldAfter(ask)
    this.#notify(record, after.world)
    return { ...actual, ...after, record }
  }

  protected doListThings(ask: ListAsk): ListThingsActual {
    const things   = this.#thingsOf(ask)
    const under    = `${ask.labelpath}/`
    const children = [...things]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    const fetched  = { parent: structuredClone(things.get(ask.labelpath) ?? null), children, read_tc: Classifier.readTcNow() }
    return this.classifyListThings(ask, fetched, this.#worldFetchedOf(ask))
  }

  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthBankActual {
    const things = this.#thingsOf(ask)
    const actual = this.classifyBirthBank(puts, this.#rootsOf(ask))
    if (! (actual.ok && (actual.act === 'born'))) { return actual }
    for (const { labelpath, record } of puts) { things.set(labelpath, structuredClone(record)) }
    const written = Classifier.writtenRootsOf(puts, this.#rootsOf(ask))
    const after   = this.#worldAfter(ask)
    for (const thing of Object.values(written)) { this.#notify(thing, after.world) }
    return { ...actual, ...after, things: written }
  }

  protected override doWatch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void {
    const watcher = { scope, receive, onBadNews }
    this.#watchers.add(watcher)
    return () => { this.#watchers.delete(watcher) }
  }
  // --
}

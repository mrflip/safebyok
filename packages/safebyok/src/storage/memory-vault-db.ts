/** The vaultDB in memory. */

import { type Errors, Helpers, Outcome } from 'safebyok-big/internals'
import { AdapterVaultDB } from './adapter-vault-db'
import { readTcNow } from './agerank'
import type { ActualBeside, BirthBankActual, GetWorldActual, GotActual, ListThingsActual, Received, StatsActual, WroteActual } from '../shapes/shapes-answers'
import { Labelpath, type Lifetok } from '../shapes/primitives'
import { type ThingRecord } from '../shapes/shapes-thing'
import { type AnyAsk, type BirthBankAsk, type BirthPuts, type GetAsk, type GetWorldAsk, type ListAsk, type StatsAsk, type ThingWatchScope, type WriteAsk } from '../shapes/shapes-asks'
import type { AboveFetched, BankFetched, BankRootsFetched } from './thing-classifier'
import * as Classifier from './thing-classifier'
import { vaultStatsOf } from './vault-stats'

/** A watch: the bank it follows, the function called with each change, and the one called with any trouble. */
export type Watcher = { scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: Errors.VaultError) => void }

/** A vaultDB in this tab's memory, gone when the tab closes. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #banks, #watchers

  // Each bank's Things, by labelpath, so that a listing reads one bank's. The modelkind at the base of each labelpath keeps the kinds apart.
  readonly #banks = new Map<string, Map<Labelpath, unknown>>()
  readonly #watchers = new Set<Watcher>()
  // --

  // == [Things]: _cheat_things, ckeyOf, #thingsOf, #write, #rootsOf, #bankFetchedOf, #aboveOf, #besideAfter, #notify

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

  /** The raw roots of `ask`'s bank, each a copy, or null for none, how they compare with what `ask` tracks, and when they were read. */
  #rootsOf(ask: AnyAsk): BankRootsFetched {
    const things  = this.#thingsOf(ask)
    const fetched = structuredClone({ bank: things.get('bank') ?? null, gate: things.get(Labelpath.MainGate) ?? null, root: things.get(Labelpath.RootBox) ?? null })
    const rows    = { bank: fetched.bank, [Labelpath.MainGate]: fetched.gate, [Labelpath.RootBox]: fetched.root }
    return { ...fetched, tracked: Classifier.trackedFetchedOf(ask, rows), read_tc: readTcNow() }
  }

  /** The raw bank of `ask`'s bank, a copy, or null for none, how its roots compare with what `ask` tracks, and when they were read. */
  #bankFetchedOf(ask: AnyAsk): BankFetched {
    const { bank, tracked, read_tc } = this.#rootsOf(ask)
    return { bank, tracked, read_tc }
  }

  /** The raw bank of `ask`'s bank, and the nearest Thing stored above its scope, each a copy, or null for none. */
  #aboveOf(ask: GetAsk | WriteAsk): AboveFetched {
    const things    = this.#thingsOf(ask)
    const abovepath = Labelpath.ancestorsOf(ask.labelpath).find((labelpath) => things.has(labelpath))
    return { ...this.#bankFetchedOf(ask), ancestor: (abovepath === undefined) ? null : structuredClone(things.get(abovepath)) }
  }

  /** The banktok of `ask`'s bank as it now stands, its `tracked` for what `ask` tracks, and when they were read. */
  #besideAfter(ask: AnyAsk): ActualBeside {
    const fetched = this.#bankFetchedOf(ask)
    return { banktok: Classifier.banktokOf(ask, fetched.bank), tracked: Classifier.trackedOf(ask, fetched.tracked), read_tc: fetched.read_tc }
  }

  // Each watcher is called on a later microtask, so nothing it does runs inside the write that notified it.
  /** Notify each watcher of `thing`'s bank of it, with `banktok`. */
  // The order and timing of an *adapter*'s notifications relative to reads, writes, or other notifications is unspecified, even for datastores that provide assurance.
  #notify(thing: ThingRecord, banktok: Lifetok): void {
    for (const { scope, receive, onBadNews } of this.#watchers) {
      if ((scope.userid === thing.userid) && (scope.banklabel === thing.banklabel)) {
        queueMicrotask(() => {
          try { receive({ record: structuredClone(thing), banktok }) } catch (err) { onBadNews(Outcome.storageRefusalOf(err)) }
        })
      }
    }
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doStats, doWatch

  protected doGetThing(ask: GetAsk): GotActual {
    const things = this.#thingsOf(ask)
    return this.classifyGetThing(ask, structuredClone(things.get(ask.labelpath) ?? null), this.#aboveOf(ask))
  }

  protected doWriteThing(ask: WriteAsk): WroteActual {
    const things = this.#thingsOf(ask)
    const actual = this.classifyWriteThing(ask, structuredClone(things.get(ask.labelpath) ?? null), this.#aboveOf(ask))
    if (! (actual.ok && Classifier.isWriteAct(actual.act))) { return actual }
    const record = this.#write(ask.record)
    const after  = this.#besideAfter(ask)
    this.#notify(record, after.banktok)
    return { ...actual, ...after, record }
  }

  protected doListThings(ask: ListAsk): ListThingsActual {
    const things   = this.#thingsOf(ask)
    const under    = `${ask.labelpath}/`
    const children = [...things]
      .filter(([labelpath]) => labelpath.startsWith(under) && (! labelpath.includes('/', under.length)))
      .map(([labelpath, raw]) => ({ labelpath, raw: structuredClone(raw) }))
    return this.classifyListThings(ask, { parent: structuredClone(things.get(ask.labelpath) ?? null), children }, this.#bankFetchedOf(ask))
  }

  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthBankActual {
    const things = this.#thingsOf(ask)
    const actual = this.classifyBirthBank(puts, this.#rootsOf(ask))
    if (! (actual.ok && (actual.act === 'born'))) { return actual }
    for (const { labelpath, record } of puts) { things.set(labelpath, structuredClone(record)) }
    const written = Classifier.writtenRootsOf(puts, this.#rootsOf(ask))
    const after   = this.#besideAfter(ask)
    for (const thing of Object.values(written)) { this.#notify(thing, after.banktok) }
    return { ...actual, ...after, things: written }
  }

  protected doGetWorld(ask: GetWorldAsk): GetWorldActual { return this.classifyGetWorld(ask, this.#rootsOf(ask)) }

  // Memory sets no limit of its own, so each is the cap.
  protected doStats(ask: StatsAsk): StatsActual {
    const filed = [...this.#thingsOf(ask)].map(([labelpath, raw]) => ({ labelpath, raw }))
    return this.classifyStats(ask, this.#bankFetchedOf(ask), vaultStatsOf(filed))
  }

  protected override doWatch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void {
    const watcher = { scope, receive, onBadNews }
    this.#watchers.add(watcher)
    return () => { this.#watchers.delete(watcher) }
  }
  // --
}

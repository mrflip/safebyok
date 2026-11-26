/** The vaultDB in memory. */

import { AdapterVaultDB } from './adapter-vault-db'
import type { BirthBankActual, GetWorldActual, ListThingsActual, StatsActual } from '../shapes/shapes-answers'
import type { GetManifest, WriteManifest } from '../shapes/shapes-manifest'
import type { Labelpath } from '../shapes/primitives'
import type { BirthBankAsk, BirthPuts, GetAsk, GetWorldAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import { MemoryDatastore, type Watcher } from './memory-datastore'
import * as Classifier from './thing-classifier'

/** A vaultDB in this tab's memory, gone when the tab closes: each `do*` hands its ask to one function of its {@link MemoryDatastore}. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #datastore, _cheat_things

  readonly #datastore = new MemoryDatastore()

  /** For tests: the Things stored in `scope`'s bank, by labelpath, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Map<Labelpath, unknown> { return this.#datastore._cheat_things(scope) } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetWorld, doStats, doWatch

  protected doGetThing(ask: GetAsk): GetManifest { return this.#datastore.getThing(ask) }

  protected doWriteThing(ask: WriteAsk): WriteManifest { return this.#datastore.writeThing(ask) }

  // Scaffolding: until thread 2 (manifest_rest), which makes each of these one line, as doGetThing is.
  protected doListThings(ask: ListAsk): ListThingsActual {
    const { parent, children, ...bankFetched } = this.#datastore.listThings(ask)
    return this.classifyListThings(ask, { parent, children }, bankFetched)
  }

  // Memory runs in one step whatever it runs between awaits, so the read and the write here are one atomic step.
  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthBankActual {
    const actual = this.classifyBirthBank(puts, this.#datastore.getWorld(ask))
    if (! (actual.ok && (actual.act === 'born'))) { return actual }
    const written = this.#datastore.birthRoots(ask, puts)
    return { ...actual, banktok: Classifier.banktokOf(ask, written.bank), tracked: Classifier.trackedOf(ask, written.tracked), read_tc: written.read_tc, things: Classifier.writtenRootsOf(puts, written) }
  }

  protected doGetWorld(ask: GetWorldAsk): GetWorldActual { return this.classifyGetWorld(ask, this.#datastore.getWorld(ask)) }

  protected doStats(ask: StatsAsk): StatsActual {
    const { stats, ...bankFetched } = this.#datastore.stats(ask)
    return this.classifyStats(ask, bankFetched, stats)
  }
  // --

  protected override doWatch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void { return this.#datastore.watch(scope, receive, onBadNews) }
}

/** The vaultDB in memory. */

import { AdapterVaultDB } from './adapter-vault-db'
import type { BirthManifest, GetManifest, ListManifest, StatsManifest, WorldManifest, WriteManifest } from '../shapes/shapes-manifest'
import type { Labelpath } from '../shapes/primitives'
import type { BirthBankAsk, BirthPuts, GetAsk, GetWorldAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import { MemoryDatastore, type Watcher } from './memory-datastore'

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

  protected doListThings(ask: ListAsk): ListManifest { return this.#datastore.listThings(ask) }

  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthManifest { return this.#datastore.birthBank(ask, puts) }

  protected doGetWorld(ask: GetWorldAsk): WorldManifest { return this.#datastore.getWorld(ask) }

  protected doStats(ask: StatsAsk): StatsManifest { return this.#datastore.stats(ask) }

  protected override doWatch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void { return this.#datastore.watch(scope, receive, onBadNews) }
  // --
}

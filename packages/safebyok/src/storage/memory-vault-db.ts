/** The vaultDB in memory. */

import { AdapterVaultDB } from './adapter-vault-db'
import type { BirthManifest, GetManifest, ListManifest, StatsManifest, GetBankManifest, WriteManifest } from '../shapes/shapes-manifest'
import type { Thingkind } from '../shapes/shapes-thing'
import type { BirthBankAsk, BirthPuts, GetAsk, GetBankAsk, ListAsk, StatsAsk, ThingWatchScope, WriteAsk } from '../shapes/shapes-asks'
import { type BankRows, MemoryDatastore, type Watcher } from './memory-datastore'

/** A vaultDB in this tab's memory, gone when the tab closes: each `do*` hands its ask to one function of its {@link MemoryDatastore}. */
export class MemoryVaultDB extends AdapterVaultDB {
  // == [Props]: #datastore, _cheat_things

  readonly #datastore = new MemoryDatastore()

  /** For tests: the Things stored in `scope`'s bank, in each kind's table, to read or change in place. */
  _cheat_things(scope: ThingWatchScope): Readonly<Record<Thingkind, BankRows>> { return this.#datastore._cheat_things(scope) } // eslint-disable-line unicorn/prefer-private-class-fields
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetBank, doStats, doWatch

  protected doGetThing(ask: GetAsk): GetManifest { return this.#datastore.getThing(ask) }

  protected doWriteThing(ask: WriteAsk): WriteManifest { return this.#datastore.writeThing(ask) }

  protected doListThings(ask: ListAsk): ListManifest { return this.#datastore.listThings(ask) }

  protected doBirthBank(ask: BirthBankAsk, puts: BirthPuts): BirthManifest { return this.#datastore.birthBank(ask, puts) }

  protected doGetBank(ask: GetBankAsk): GetBankManifest { return this.#datastore.getBank(ask) }

  protected doStats(ask: StatsAsk): StatsManifest { return this.#datastore.stats(ask) }

  protected override doWatch(scope: ThingWatchScope, receive: Watcher['receive'], onBadNews: Watcher['onBadNews']): () => void { return this.#datastore.watch(scope, receive, onBadNews) }
  // --
}

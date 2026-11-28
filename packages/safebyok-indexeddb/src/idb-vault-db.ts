/** The vaultDB in this browser's IndexedDB. */

import * as DB from 'safebyok/storage'
import type {
  BirthBankAsk, BirthManifest, BirthPuts, GetAsk, GetManifest, GetBankAsk, ListAsk, ListManifest, Received, StatsAsk, StatsManifest, ThingWatchScope, VaultError, GetBankManifest, WriteAsk, WriteManifest,
} from 'safebyok/storage'
import { IdbDatastore } from './idb-datastore'

// == [Options]: IdbVaultDBOpts, idbVaultDBOpts

/** Options for {@link IdbVaultDB}:
 * - `dbName` -- scopes the database names: `safebyok-<dbName>:…`, or `safebyok:…` if left out
 */
export type IdbVaultDBOpts = { dbName?: string | undefined }

/** The check of {@link IdbVaultDBOpts}. */
const idbVaultDBOpts = DB.objCheck(({ str }) => ({ dbName: str.min(1).optional() }), 'bad_record')
// --

/** A vaultDB stored in this browser's IndexedDB. Its watches receive the writes made in every tab. */
export class IdbVaultDB extends DB.AdapterVaultDB {
  // == [Props]: #datastore

  readonly #datastore: IdbDatastore
  // --

  // == [Construction]: constructor

  constructor(opts: IdbVaultDBOpts = {}) {
    const { dbName } = idbVaultDBOpts.parse(opts, { where: "In IdbVaultDB's options" })
    super()
    this.#datastore = new IdbDatastore(dbName)
  }
  // --

  // == [Protected, the calls of AdapterVaultDB]: doGetThing, doWriteThing, doListThings, doBirthBank, doGetBank, doStats, doWatch

  protected async doGetThing(ask: GetAsk): Promise<GetManifest> { return await this.#datastore.getThing(ask) }

  protected async doWriteThing(ask: WriteAsk): Promise<WriteManifest> { return await this.#datastore.writeThing(ask) }

  protected async doListThings(ask: ListAsk): Promise<ListManifest> { return await this.#datastore.listThings(ask) }

  protected async doBirthBank(ask: BirthBankAsk, puts: BirthPuts): Promise<BirthManifest> { return await this.#datastore.birthBank(ask, puts) }

  protected async doGetBank(ask: GetBankAsk): Promise<GetBankManifest> { return await this.#datastore.getBank(ask) }

  protected async doStats(ask: StatsAsk): Promise<StatsManifest> { return await this.#datastore.stats(ask) }

  protected override doWatch(scope: ThingWatchScope, receive: (received: Received) => void, onBadNews: (news: VaultError) => void): () => void { return this.#datastore.watch(scope, receive, onBadNews) }
  // --
}

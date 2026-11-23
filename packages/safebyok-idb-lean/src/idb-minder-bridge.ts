/** IdbMinderBridge: copies the whole records a VaultMinder caches into an IdbVaultDB. */

import { noop } from 'es-toolkit'
import { type MinderEvent, type ThingRecord, type Tombstone, type VaultError, MinderEventFormat, Thing, VaultMinder } from 'safebyok'
import * as DB from 'safebyok/storage'
import { IdbVaultDB } from './idb-vault-db'
import * as Phrases from './phrases'

// == [Options]: IdbMinderBridgeOpts

/** Options for {@link IdbMinderBridge.make}. */
export interface IdbMinderBridgeOpts {
  /** The minder whose cache is copied. */
  readonly minder:     VaultMinder
  /** The IdbVaultDB the records are copied into. */
  readonly idbVaultDB: IdbVaultDB
  /** Called with the refusal of each copy that fails. Default: a no-op. */
  readonly onBadNews?: ((news: VaultError) => void) | undefined
}
// --

/** Copies a VaultMinder's cache into an IdbVaultDB.
 * Each whole record or tombstone the minder caches is stored, if it is newer than the Thing stored there.
 * Nothing else is written, and nothing is ever deleted.
 * Say hello to the bridge before the minder: it copies only what the cache receives after its own `hello`.
 */
export class IdbMinderBridge {
  // == [Props]: #minder, #idbVaultDB, #onBadNews, #isListening

  readonly #minder:     VaultMinder
  readonly #idbVaultDB: IdbVaultDB
  readonly #onBadNews:  (news: VaultError) => void
  #isListening = false
  // --

  // == [Construction]: make, constructor

  /** Make a bridge from `minder`'s cache to `idbVaultDB`. It copies nothing until `hello`. */
  static make(opts: IdbMinderBridgeOpts): IdbMinderBridge {
    const { minder, idbVaultDB, onBadNews = noop } = Checks.bridgeMakeArgs.parse(opts)
    return new IdbMinderBridge({ minder, idbVaultDB, onBadNews })
  }

  private constructor({ minder, idbVaultDB, onBadNews }: Omit<IdbMinderBridgeOpts, 'onBadNews'> & { onBadNews: (news: VaultError) => void }) {
    this.#minder     = minder
    this.#idbVaultDB = idbVaultDB
    this.#onBadNews  = onBadNews
    Object.freeze(this)
  }
  // --

  // == [Starting]: hello

  /** Start copying the minder's cache to IndexedDB. A second call does nothing. */
  hello(): void {
    if (this.#isListening) { return }
    this.#isListening = true
    this.#minder.listen((event) => { this.#copyCached(event) }, MinderEventFormat)
  }
  // --

  // == [Copying]: #copyCached

  /** Copy to IndexedDB the record `event` says was cached, if any. */
  #copyCached(event: MinderEvent): void {
    try {
      const record = cachedRecordOf(event)
      if (record === null) { return }
      void this.#idbVaultDB.overwriteThing(record).catch((err: unknown) => { this.#onBadNews(DB.storageRefusalOf(err)) })
    } catch (err) {
      this.#onBadNews(DB.storageRefusalOf(err))
    }
  }
  // --
}

// == [Helpers]: cachedRecordOf

/** The whole record or tombstone `event` says was cached, or null for none. */
function cachedRecordOf(event: MinderEvent): ThingRecord | Tombstone<ThingRecord> | null {
  if ((event.eventkind !== 'item') || (event.type !== 'updated') || (event.action?.type !== 'success')) { return null }
  const record = event.state.data
  return ((record === undefined) || Thing.isVoidSentinel(record)) ? null : record
}
// --

// == [Checks]: Checks

/** The check of {@link IdbMinderBridge.make}'s arguments. */
const Checks = DB.Checkers('bad_record', ({ obj, custom, fn }) => ({
  bridgeMakeArgs: obj({
    minder:     custom<VaultMinder>((val) => val instanceof VaultMinder, Phrases.BridgeMinderExpected),
    idbVaultDB: custom<IdbVaultDB>((val) => val instanceof IdbVaultDB, Phrases.BridgeVaultDBExpected),
    onBadNews:  fn<(news: VaultError) => void>().optional(),
  }).strict(),
}))
// --

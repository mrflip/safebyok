/** `PersistScaffold`, the private QueryClient a device's persisters restore one bank's records into and save them from. */

// Scaffolding until the LocalBridge thread, which restores the Things itself and removes this file.

import * as TSQ from '@tanstack/query-core'
import { type Persister, persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/query-persist-client-core'
import { deepFreeze, noop } from 'es-toolkit'
import { Labelpath } from '../shapes/primitives'
import type { MaskedRow } from '../shapes/shapes-masked-view'
import type { BankScope } from '../shapes/shapes-stamps'
import { type ThingRecord, ThingChecks, ThingFormat } from '../shapes/shapes-thing'
import type { VaultEvent } from '../shapes/shapes-vault-event'
import type { SortedVaultDB } from '../storage/sorted-vault-db'
import { maskedRowsOf } from './masked-rows'
import { bankKeyHeadOf } from './query-keys'

// == [PersistScaffold]: PersistScaffold

// It holds records as the vaultDB stores them, and nothing else: no listing, no lease, and no query of a host's, whose
// queries and mutations may hold cleartexts. No host is handed its client.
/** One bank's records between page loads: each root's and each box's newest whole record or tombstone, in a QueryClient of its own, under a key of its own.
 * It is filled from what the bank's SortedVaultDB tells, and from what a persister restores.
 */
export class PersistScaffold {
  // == [Props]: #queryClient, #scope

  readonly #queryClient: TSQ.QueryClient
  /** The bank. */
  readonly #scope:       BankScope
  // --

  // == [Construction]: make, constructor

  /** A scaffold of the bank at `scope`, empty, with a QueryClient of its own. */
  static make(scope: BankScope): PersistScaffold { return new PersistScaffold(ThingChecks.bankScope.parse(scope)) }

  // A query no one observes is collected after TanStack's gcTime, and a save after that would leave its record out.
  private constructor(scope: BankScope) {
    this.#queryClient = new TSQ.QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    this.#scope       = Object.freeze({ userid: scope.userid, banklabel: scope.banklabel })
    Object.freeze(this)
  }
  // --

  // == [Persisting]: persist

  /** Restore the roots' or the boxes' records `persister` keeps, then save them to it at each change.
   * A snapshot saved under another format reads as empty, and is removed. Rejects where the restore fails, discarding the snapshot; saving goes on.
   */
  async persist(rootsOrBoxes: RootsOrBoxes, persister: Persister): Promise<void> {
    const queryClient = this.#queryClient
    const keyHead     = this.#keyHeadOf(rootsOrBoxes)
    const dehydrateOptions: TSQ.DehydrateOptions = {
      shouldDehydrateQuery:    (tsqQuery) => (TSQ.partialMatchKey(tsqQuery.queryKey, keyHead) && (tsqQuery.state.data !== undefined)),
      shouldDehydrateMutation: () => false,
    }
    try {
      await persistQueryClientRestore({ queryClient, persister, buster: PersistBuster, maxAge: Infinity, hydrateOptions: RestoreOpts })
    } finally {
      persistQueryClientSubscribe({ queryClient, persister, buster: PersistBuster, dehydrateOptions })
    }
  }
  // --

  // == [Reading]: records, maskedRootRows

  /** Every record kept: the roots' first, then the boxes'. Anything a persister restored that is not a record is left out. */
  records(): ThingRecord[] {
    const roots = RootLabelpaths.map((labelpath) => this.#queryClient.getQueryData(this.#keyOf(labelpath)))
    const boxes = this.#queryClient.getQueryCache().findAll({ queryKey: this.#keyHeadOf('boxes') }).map(({ state }) => state.data)
    return [...roots, ...boxes].filter(isRecord)
  }

  /** The roots' rows, masked for a devtool. */
  maskedRootRows(): MaskedRow[] { return maskedRowsOf(this.#queryClient, this.#keyHeadOf('roots')) }
  // --

  // == [Listening]: listen

  // The vault TSQ tells the device of trouble the SortedVaultDB tells: here it would be told twice.
  /** Keep each whole record or tombstone of a root or a box that `sortedVaultDB` tells of, until the function it returns is called. */
  listen(sortedVaultDB: SortedVaultDB): () => void {
    return sortedVaultDB.listen({ hear: (event) => { this.#hear(event) }, onBadNews: noop })
  }
  // --

  // == [Helpers]: #hear, #keyOf, #keyHeadOf

  /** Keep the record of `event`, where it is a whole record or tombstone of a root or a box */
  #hear(event: VaultEvent): void {
    if ((event.eventkind !== 'item') || ((event.liveness !== 'full') && (event.liveness !== 'gone'))) { return }
    if (! isRootOrBox(event.labelpath)) { return }
    this.#queryClient.setQueryData(this.#keyOf(event.labelpath), event.val)
  }

  /** The key of the record at `labelpath` */
  #keyOf(labelpath: Labelpath): TSQ.QueryKey { return [...this.#keyHeadOf(rootsOrBoxesOf(labelpath)), labelpath] }

  /** The key every record of the roots or the boxes starts with */
  #keyHeadOf(rootsOrBoxes: RootsOrBoxes): TSQ.QueryKey { return [...bankKeyHeadOf(this.#scope), rootsOrBoxes] }
  // --
}
// --

// == [Helpers]: RootsOrBoxes, RootLabelpaths, PersistBuster, RestoreOpts, rootsOrBoxesOf, isRootOrBox, isRecord

/** Which of a device's two persisters: the bank's roots', or its boxes'. */
export type RootsOrBoxes = 'roots' | 'boxes'

/** The labelpaths of a bank's roots, in the order a SortedVaultDB tells them: the bank, its main gate and its root box. */
const RootLabelpaths: readonly Labelpath[] = Object.freeze(['bank', Labelpath.MainGate, Labelpath.RootBox])

// The minders this replaced saved under ThingFormat alone, so a snapshot of theirs is discarded.
/** The buster a snapshot is saved under: a snapshot saved under another is discarded at restore. */
const PersistBuster = `${ThingFormat}/scaffold`

/** How a snapshot is restored: each record deeply frozen. */
const RestoreOpts: TSQ.HydrateOptions = Object.freeze({ defaultOptions: { deserializeData: deepFreeze } })

/** Which persister keeps the record at `labelpath`, a root's or a box's */
function rootsOrBoxesOf(labelpath: Labelpath): RootsOrBoxes { return RootLabelpaths.includes(labelpath) ? 'roots' : 'boxes' }

/** True for the labelpath of a root or a box */
function isRootOrBox(labelpath: Labelpath): boolean { return RootLabelpaths.includes(labelpath) || Labelpath.isBox(labelpath) }

/** True for a record, whole or a tombstone */
function isRecord(val: unknown): val is ThingRecord { return ThingChecks.sparse.safeParse(val).success }
// --

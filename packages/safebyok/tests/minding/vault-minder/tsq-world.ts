import { type QueryKey, QueryClient, QueryObserver } from '@tanstack/query-core'
import { vi } from 'vitest'
import { VaultTSQ } from '../../../src/minding/vault-tsq'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { SortedVaultDB } from '../../../src/storage/sorted-vault-db'
import { readTcNow } from '../../../src/storage/thing-classifier'
import type { ReadTc } from '../../../src/storage/vault-db'
import type { ThingScope } from '../../../src/shapes/shapes-thing'
import type { SeenThing, VaultItemEvent } from '../../../src/shapes/shapes-vault-event'
import * as TH from '../../test-helpers'

/** A bank's VaultTSQ on a fresh QueryClient, the SortedVaultDB it hears, and a way to hand the vaultDB's watcher a notice. */
export interface TSQWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB:     VaultDBT
  sorted:      SortedVaultDB
  queryClient: QueryClient
  vaultTSQ:    VaultTSQ
  /** Hand `event` to the vaultDB's watcher, as the datastore would push it. */
  notify:      (event: VaultItemEvent) => void
}

/** The VaultTSQ of `TH.ThingBank` over `vaultDB`, on a fresh QueryClient, with the bank born through its SortedVaultDB, which so knows the roots at revision 0. */
export async function tsqWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT): Promise<TSQWorld<VaultDBT>> {
  const watching    = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const sorted      = SortedVaultDB.make(TH.ThingBank, { vaultDB, makeThing: TH.makePlainThing })
  const queryClient = new QueryClient()
  const vaultTSQ    = VaultTSQ.make({ vaultMinder: sorted, queryClient, scope: TH.ThingBank })
  await TH.expectGood(sorted.tryBirthBank(TH.birthBankAskOf()))
  function notify(event: VaultItemEvent): void {
    for (const watched of watching.mock.calls) { watched[1](event) }
  }
  return { vaultDB, sorted, queryClient, vaultTSQ, notify }
}

/** The notice a raw watch gets for `record`, read at `read_tc`, now by default. */
export function noticeOf(record: SeenThing, read_tc: ReadTc = readTcNow()): VaultItemEvent {
  return { ...TH.itemEventOf(record), read_tc }
}

/** A `read_tc` read a span of 65.536 seconds after `read_tc`. */
export function readTcSpanAfter(read_tc: ReadTc): ReadTc {
  const nextSpan = Number.parseInt(read_tc.slice(0, 8), 16) + 1
  return `${nextSpan.toString(16).padStart(8, '0')}${read_tc.slice(8)}`
}

/** Put `record` in `vaultDB`'s datastore as another device would, notifying no watcher. */
export function cheatStored(vaultDB: MemoryVaultDB, record: SeenThing): void { vaultDB._cheat_things(TH.ThingBank).set(record.labelpath, record) }

/** The item query of the box at `scope`, `TH.BoxScope` by default, or undefined for none. */
export function itemQueryAt({ queryClient }: TSQWorld<MemoryVaultDB>, scope: ThingScope = TH.BoxScope) {
  return queryClient.getQueryCache().find({ queryKey: VaultTSQ.itemQueryKeyOf(scope), exact: true })
}

/** The listing query of the children of the box at `scope`, the root box by default, or undefined for none. */
export function listQueryAt({ queryClient }: TSQWorld<MemoryVaultDB>, scope: ThingScope = TH.RootScope) {
  return queryClient.getQueryCache().find({ queryKey: VaultTSQ.listQueryKeyOf(scope), exact: true })
}

// An observer that is never subscribed fetches nothing, and reads the query under the client's defaults, as a hook's does.
/** True when an observer of the query at `queryKey` would find it stale. Builds the query where there is none. */
export function isObservedStale(queryClient: QueryClient, queryKey: QueryKey): boolean {
  return new QueryObserver(queryClient, { queryKey }).getCurrentResult().isStale
}

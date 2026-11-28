import { type QueryKey, QueryClient, QueryObserver } from '@tanstack/query-core'
import { vi } from 'vitest'
import { VaultTSQ } from '../../../src/minding/vault-tsq'
import { MemoryVaultDB } from '../../../src/storage/memory-vault-db'
import { VaultMinder } from '../../../src/minding/vault-minder'
import { readTcNow } from '../../../src/storage/agerank'
import type { ReadTc, SeenThing, VaultItemEvent } from '../../../src/shapes/shapes-vault-event'
import type { ThingScope } from '../../../src/shapes/shapes-thing'
import type { ThingMaker } from '../../../src/shapes/shapes-vault-minder'
import * as TH from '../../test-helpers'

/** A bank's VaultTSQ on a fresh QueryClient, the VaultMinder it hears, and a way to hand the vaultDB's watcher a notice. */
export interface TSQWorld<VaultDBT extends MemoryVaultDB> {
  vaultDB:     VaultDBT
  sorted:      VaultMinder
  queryClient: QueryClient
  vaultTSQ:    VaultTSQ
  /** Hand `event` to the vaultDB's watcher, as the datastore would push it. */
  notify:      (event: VaultItemEvent) => void
}

/** The VaultTSQ of `TH.ThingBank` over `vaultDB`, on a fresh QueryClient, with the bank born through its VaultMinder, which so knows the roots at revision 0.
 * Its VaultMinder watches the vaultDB, and its VaultTSQ hears that VaultMinder.
 * Its VaultMinder's Things are made by `makeThing`, plain ones by default.
 */
export async function tsqWorldOf<VaultDBT extends MemoryVaultDB>(vaultDB: VaultDBT, makeThing: ThingMaker = TH.makePlainThing): Promise<TSQWorld<VaultDBT>> {
  const watching    = vi.spyOn(vaultDB as MemoryVaultDB, 'watch')
  const sorted      = VaultMinder.make(TH.ThingBank, { vaultDB, bank: { makeThing } }).connect()
  const queryClient = new QueryClient()
  const vaultTSQ    = VaultTSQ.make({ vaultMinder: sorted, queryClient, scope: TH.ThingBank }).connect()
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
export function cheatPlant(vaultDB: MemoryVaultDB, record: SeenThing): void { vaultDB._cheat_things(TH.ThingBank)[record.modelkind].set(record.labelpath, record) }

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

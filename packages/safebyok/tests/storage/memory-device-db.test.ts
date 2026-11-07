/** MemoryDeviceDB: the battery every DeviceDB runs. */

import { describe, expect, it, vi } from 'vitest'
import { ckeyOf } from '../../src/helpers/helpers'
import { VaultError } from '../../src/refusals/errors'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import * as TH from '../test-helpers'

/** The calls a MemoryDeviceDB makes of its storage, any of which the next may be. */
const StorageCalls = ['doStow', 'doPeek', 'doForget', 'doListLeases', 'doDelRawLease'] as const

const memoryRowsOf = (deviceDB: MemoryDeviceDB): TH.DeviceDBRowCheats => ({
  plantLeaseRow: ({ applabel, user_id, vaultlabel }, row) => { deviceDB._cheat_leaseRows().set(ckeyOf(applabel, user_id, vaultlabel), { scopepath: [applabel, user_id, vaultlabel], row }) },
  leaseRowsOf:   () => [...deviceDB._cheat_leaseRows().values()].map(({ row }) => row),
})

// Memory has no storage to fail, so the next call to it throws as a refused write would.
const failNextCall = (deviceDB: MemoryDeviceDB): void => {
  type StorageCall = typeof StorageCalls[number]
  const spies = StorageCalls.map((call) => vi.spyOn(deviceDB as unknown as Record<StorageCall, () => unknown>, call))
  const fail = (): never => {
    for (const spy of spies) { spy.mockRestore() }
    throw new DOMException('the disk is full', 'QuotaExceededError')
  }
  for (const spy of spies) { spy.mockImplementationOnce(fail) }
}

TH.describeDeviceDBBattery("MemoryDeviceDB", {
  makeDeviceDB:        () => new MemoryDeviceDB(),
  _cheat_rowsOf:       memoryRowsOf,
  _cheat_failNextCall: failNextCall,
})

describe("describeDeviceDBBattery", () => {
  it("refuses opts that lack a hook it needs", () => {
    expect(() => { TH.describeDeviceDBBattery("none", { _cheat_rowsOf: memoryRowsOf } as never) }).to.throw(VaultError)
    expect(() => { TH.describeDeviceDBBattery("none", { makeDeviceDB: () => new MemoryDeviceDB(), _cheat_rowsOf: 'rows' } as never) }).to.throw(VaultError)
  })
})

import { describe, expect, it } from 'vitest'
import { memoryDeviceDB } from '../src/device-db'
import type { Lease } from '../src/types'
import * as TH from './test-helpers'

TH.describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())

describe("memoryDeviceDB", () => {
  it("treats a mangled record as no lease, and discards it", async () => {
    const deviceDB = memoryDeviceDB()
    const mangled = { ...(await TH.leaseOf('u1')), lease_key: 'not a key handle' }
    await deviceDB.putLease(mangled as unknown as Lease)
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("treats a mangled mark as no mark, and clears it", async () => {
    const deviceDB = memoryDeviceDB()
    await deviceDB.putMark(TH.markOf('u1', { seen: { device_id: '' } }))
    expect(await deviceDB.getMark(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getMark(TH.scopeOf('u1'))).to.be.null  // stays gone
  })
})

import { describe, expect, it } from 'vitest'
import { memoryDeviceDB } from '../src/device-db'
import type { DeviceUnlock } from '../src/types'
import * as TH from './test-helpers'

TH.describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())

describe("memoryDeviceDB", () => {
  it("treats a mangled record as no remembered unlock, and clears it", async () => {
    const deviceDB = memoryDeviceDB()
    const mangled = { ...(await TH.unlockOf('u1')), local_unlock_key: 'not a key handle' }
    await deviceDB.writeUnlock(mangled as unknown as DeviceUnlock, TH.NoLocks)
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.readUnlock(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("treats a mangled mark as no mark, and clears it", async () => {
    const deviceDB = memoryDeviceDB()
    await deviceDB.writeMark(TH.markOf('u1', { seen: { device_id: '' } }))
    expect(await deviceDB.readMark(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.readMark(TH.scopeOf('u1'))).to.be.null  // stays gone
  })
})

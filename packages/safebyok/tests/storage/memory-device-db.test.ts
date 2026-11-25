import { describe, expect, it } from 'vitest'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import * as TH from '../test-helpers'

TH.describeDeviceDBLeaseBattery('MemoryDeviceDB', {
  makeDeviceDB: () => new MemoryDeviceDB(),
  makeTwin:     (deviceDB) => deviceDB,
  plant:        (deviceDB, scope, raw) => { deviceDB._cheat_rows().set(MemoryDeviceDB.ckeyOf(scope), raw) },
})

/** A MemoryDeviceDB whose every peek and stow throws an error that quotes a lease row. */
class FailingDeviceDB extends MemoryDeviceDB {
  protected override doPeekLease(): never { throw new TypeError('lease_key quoted here') }
  protected override doStowLease(): never { throw new TypeError('lease_key quoted here') }
}

describe("MemoryDeviceDB, what only a store in memory can show", () => {
  it("stores a copy of the row it is handed, and answers a copy of what it stores", async () => {
    const deviceDB = new MemoryDeviceDB()
    const row      = await TH.liveLeaseRowOf()
    await deviceDB.stowLease(row)
    const peeked   = await deviceDB.peekLease(TH.WorldScope)
    expect(peeked).to.not.equal(deviceDB._cheat_rows().get(MemoryDeviceDB.ckeyOf(TH.WorldScope)))
    expect(await deviceDB.peekLease(TH.WorldScope)).to.not.equal(peeked)
  })

  it("calls a listener later, never inside the stow", async () => {
    const deviceDB = new MemoryDeviceDB()
    const heard: string[] = []
    deviceDB.listen(({ banklabel }) => { heard.push(banklabel) })
    const stowed = deviceDB.stowLease(await TH.liveLeaseRowOf())
    expect(heard).to.have.lengthOf(0)
    await stowed
    await TH.eventually(() => heard.length > 0)
    expect(heard).to.deep.equal([TH.WorldScope.banklabel])
  })
})

describe("DeviceDB, what a store throws", () => {
  const VerbCases = [
    [(deviceDB: MemoryDeviceDB) => deviceDB.peekLease(TH.WorldScope), 'peekLease', 'refuses a peek that throws as storage_unavailable, keeping only the name'],
    [async (deviceDB: MemoryDeviceDB) => deviceDB.stowLease(await TH.liveLeaseRowOf()), 'stowLease', 'refuses a stow that throws as storage_unavailable, keeping only the name'],
  ] as const
  for (const [verbOf, oplabel, blurb] of VerbCases) {
    it(blurb, async () => {
      const refusal = await TH.expectRefusal(verbOf(new FailingDeviceDB()), 'storage_unavailable')
      expect(refusal.message).to.include(oplabel).and.include('TypeError').and.not.include('lease_key')
    })
  }
})

import { describe, expect, it } from 'vitest'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import * as TH from '../test-helpers'

TH.describeDeviceDBLeaseBattery('MemoryDeviceDB', {
  makeDeviceDB: () => new MemoryDeviceDB(),
  makeTwin:     (deviceDB) => deviceDB,
  plant:        (deviceDB, scope, raw) => { deviceDB._cheat_leases().set(MemoryDeviceDB.ckeyOf(scope), raw) },
})

TH.describeDeviceDBDevicetokBattery('MemoryDeviceDB', {
  makeDeviceDB:   () => new MemoryDeviceDB(),
  makeTwin:       (deviceDB) => deviceDB,
  plantDevicetok: (deviceDB, scope, raw) => { deviceDB._cheat_devicetoks().set(MemoryDeviceDB.devicetokCkeyOf(scope), raw) },
})

/** A MemoryDeviceDB whose every peek, stow and listen throws an error that quotes a lease record, and whose devicetok stow throws too. */
class FailingDeviceDB extends MemoryDeviceDB {
  protected override doPeekLease(): never { throw new TypeError('lease_key quoted here') }
  protected override doStowLease(): never { throw new TypeError('lease_key quoted here') }
  protected override doListen(): never { throw new TypeError('lease_key quoted here') }
  protected override doStowDevicetok(): never { throw new TypeError('lease_key quoted here') }
}

describe("MemoryDeviceDB, what only a store in memory can show", () => {
  it("stores a copy of the lease record it is handed, and answers a copy of what it stores", async () => {
    const deviceDB = new MemoryDeviceDB()
    const lease    = await TH.liveLeaseRecordOf()
    await deviceDB.stowLease(lease)
    const peeked   = await deviceDB.peekLease(TH.WorldLeaseScope)
    expect(peeked).to.not.equal(deviceDB._cheat_leases().get(MemoryDeviceDB.ckeyOf(TH.WorldLeaseScope)))
    expect(await deviceDB.peekLease(TH.WorldLeaseScope)).to.not.equal(peeked)
  })

  it("calls a listener later, never inside the stow", async () => {
    const deviceDB = new MemoryDeviceDB()
    const heard: string[] = []
    deviceDB.listen(({ banklabel }) => { heard.push(banklabel) })
    const stowed = deviceDB.stowLease(await TH.liveLeaseRecordOf())
    expect(heard).to.have.lengthOf(0)
    await stowed
    await TH.eventually(() => heard.length > 0)
    expect(heard).to.deep.equal([TH.WorldScope.banklabel])
  })
})

describe("DeviceDB, what a store throws", () => {
  const VerbCases = [
    [(deviceDB: MemoryDeviceDB) => deviceDB.peekLease(TH.WorldLeaseScope), 'peekLease', 'refuses a peek that throws as storage_unavailable, naming only what it threw'],
    [async (deviceDB: MemoryDeviceDB) => deviceDB.stowLease(await TH.liveLeaseRecordOf()), 'stowLease', 'refuses a stow that throws as storage_unavailable, naming only what it threw'],
    [(deviceDB: MemoryDeviceDB) => deviceDB.ensureDevicetok(TH.WorldScope), 'ensureDevicetok', 'refuses an ensureDevicetok that throws as storage_unavailable, naming only what it threw'],
  ] as const
  for (const [verbOf, oplabel, blurb] of VerbCases) {
    it(blurb, async () => {
      const refusal = await TH.expectRefusal(verbOf(new FailingDeviceDB()), 'storage_unavailable')
      expect(refusal.message).to.include(oplabel).and.include('TypeError').and.not.include('lease_key')
    })
  }

  it("refuses a listen that throws as storage_unavailable, naming only what it threw", () => {
    const refusal = TH.expectSyncRefusal(() => new FailingDeviceDB().listen(() => undefined), 'storage_unavailable')
    expect(refusal.message).to.include('listen').and.include('TypeError').and.not.include('lease_key')
  })
})

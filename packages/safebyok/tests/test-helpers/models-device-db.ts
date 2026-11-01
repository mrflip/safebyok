import { describe, expect, it } from 'vitest'
import { type DeviceDB, deviceRecordOf } from '../../src/devicedb/devicedb'
import { type GateEpochSeen, type LeaseRecord, type VaultCacheable, LeaseFormat } from '../../src/models/models-shapes'
import type { VaultScope } from '../../src/shapes/scopes'
import { fakeCiphered, scopeOf } from './builders'
import { expectBad, expectRefusal } from './refusals'

/** The bank scope of `user_id` in the `acme` app. */
export const bankScopeOf = (user_id: string) => ({ applabel: 'acme', user_id })

/** A models lease record of `user_id`'s vault `vaultlabel`: a live non-extractable leaseKey around fake wrapped material. */
export const modelsLeaseOf = async (user_id: string, vaultlabel = 'main'): Promise<LeaseRecord> => ({
  fmt:                     LeaseFormat,
  ...scopeOf(user_id, vaultlabel),
  vault_tok:               `vault-tok-${user_id}`,
  registered_at:           1_800_000_000_000,
  gate_epoch:              1,
  autolock_at:             1_900_000_000_000,
  lease_key:               await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']),
  vault_key_lease_wrapped: fakeCiphered(`lease-${user_id}`),
})

/** A cached copy of the vault `scope` names, as the deviceDB files it: what its central holds past the scope is the listing's to judge, so a tag stands in for it. */
export const cacheableOf = (scope: VaultScope, tag = 'copy'): VaultCacheable => (
  { ...scope, central: { ...scope, tag }, staged: null } as unknown as VaultCacheable
)

const [bank1, bank2] = [bankScopeOf('u1'), bankScopeOf('u2')]
const [u1, u1spare, u12] = [scopeOf('u1'), scopeOf('u1', 'spare'), scopeOf('u12')]

/** u1's device record holding `device_id` and the epochs seen. */
const recordOf = (device_id: string, highest_gate_epochs: readonly GateEpochSeen[] = []) => deviceRecordOf(bank1, device_id, highest_gate_epochs)

/** The behaviour every models DeviceDB owes, run against an adapter with a factory making a fresh, empty one per test. */
export const describeModelsDeviceDB = (adapterTitle: string, makeDeviceDB: () => DeviceDB | Promise<DeviceDB>) => {
  describe(`${adapterTitle}, its leases`, () => {
    it("holds no lease until one is put, then that record, its leaseKey still a non-extractable CryptoKey", async () => {
      const deviceDB = await makeDeviceDB()
      const lease = await modelsLeaseOf('u1')
      expect(await deviceDB.getLease(u1)).to.be.null
      expect(await deviceDB.putLease(lease)).to.equal(lease)
      const stored = await deviceDB.getLease(u1) as LeaseRecord
      expect(stored).to.deep.equal(lease)
      expect(stored.lease_key).to.be.instanceOf(CryptoKey)
      expect(stored.lease_key.extractable).to.be.false
    })

    it("keeps each vault's lease to itself, and erases only the one named", async () => {
      const deviceDB = await makeDeviceDB()
      const [one, spare, two] = [await modelsLeaseOf('u1'), await modelsLeaseOf('u1', 'spare'), await modelsLeaseOf('u2')]
      await Promise.all([deviceDB.putLease(one), deviceDB.putLease(spare), deviceDB.putLease(two)])
      await deviceDB.delLease(u1)
      expect(await deviceDB.getLease(u1)).to.be.null
      expect(await deviceDB.getLease(u1spare)).to.deep.equal(spare)
      expect(await deviceDB.getLease(scopeOf('u2'))).to.deep.equal(two)
    })

    it("refuses 'bad_record' a lease whose leaseKey is no key handle, storing nothing", async () => {
      const deviceDB = await makeDeviceDB()
      const lease = await modelsLeaseOf('u1')
      await expectBad(deviceDB.tryPutLease({ ...lease, lease_key: 'not a key handle' } as unknown as LeaseRecord), 'bad_record')
      expect(await deviceDB.getLease(u1)).to.be.null
    })

    it("lands one scope's calls in the order they were made, awaited or not: a delLease made after a putLease erases it", async () => {
      const deviceDB = await makeDeviceDB()
      const putting = deviceDB.putLease(await modelsLeaseOf('u1'))
      const deleting = deviceDB.delLease(u1)
      await Promise.all([putting, deleting])
      expect(await deviceDB.getLease(u1)).to.be.null
    })
  })

  describe(`${adapterTitle}, its device record`, () => {
    it("holds none until advanced, then the record as it came", async () => {
      const deviceDB = await makeDeviceDB()
      const record = recordOf('device-a', [{ vaultlabel: 'main', gate_epoch: 2 }])
      expect(await deviceDB.getDeviceRecord(bank1)).to.be.null
      expect(await deviceDB.advanceDeviceRecord(record)).to.deep.equal({ record, wroteOverDamaged: false })
      expect(await deviceDB.getDeviceRecord(bank1)).to.deep.equal(record)
    })

    it("keeps the first device_id stored, and for each vault the higher gate_epoch, never a lower", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.advanceDeviceRecord(recordOf('device-a', [{ vaultlabel: 'main', gate_epoch: 4 }, { vaultlabel: 'spare', gate_epoch: 1 }]))
      const { record: advanced, wroteOverDamaged } = await deviceDB.advanceDeviceRecord(recordOf('device-b', [{ vaultlabel: 'main', gate_epoch: 2 }, { vaultlabel: 'spare', gate_epoch: 3 }, { vaultlabel: 'third', gate_epoch: 5 }]))
      expect(wroteOverDamaged).to.be.false
      expect(advanced.device_id).to.eq('device-a')
      expect(advanced.highest_gate_epochs).to.have.deep.members([{ vaultlabel: 'main', gate_epoch: 4 }, { vaultlabel: 'spare', gate_epoch: 3 }, { vaultlabel: 'third', gate_epoch: 5 }])
      expect(await deviceDB.getDeviceRecord(bank1)).to.deep.equal(advanced)
    })

    it("keeps what each of two advances made at once saw: neither undoes the other", async () => {
      const deviceDB = await makeDeviceDB()
      await Promise.all([
        deviceDB.advanceDeviceRecord(recordOf('device-a', [{ vaultlabel: 'main', gate_epoch: 3 }])),
        deviceDB.advanceDeviceRecord(recordOf('device-b', [{ vaultlabel: 'spare', gate_epoch: 5 }])),
      ])
      const stored = await deviceDB.getDeviceRecord(bank1)
      expect(stored?.device_id).to.eq('device-a')
      expect(stored?.highest_gate_epochs).to.have.deep.members([{ vaultlabel: 'main', gate_epoch: 3 }, { vaultlabel: 'spare', gate_epoch: 5 }])
    })

    it("keeps each bank scope's record to itself", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.advanceDeviceRecord(recordOf('device-a'))
      expect(await deviceDB.getDeviceRecord(bank2)).to.be.null
      const { record } = await deviceDB.advanceDeviceRecord(deviceRecordOf(bank2, 'device-b'))
      expect(record).to.include({ device_id: 'device-b' })
    })
  })

  describe(`${adapterTitle}, its cached vaults`, () => {
    it("finds every copy of a bank's vaults, and none of another bank's, nor any lease or device record", async () => {
      const deviceDB = await makeDeviceDB()
      const [main, spare] = [cacheableOf(u1), cacheableOf(u1spare)]
      expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([])
      const lease = await modelsLeaseOf('u1')
      await Promise.all([
        deviceDB.putCachedVault(main),
        deviceDB.putCachedVault(spare),
        deviceDB.putCachedVault(cacheableOf(u12)),
        deviceDB.putLease(lease),
        deviceDB.advanceDeviceRecord(recordOf('device-a')),
      ])
      expect(await deviceDB.findCachedVaults(bank1)).to.have.deep.members([main, spare])
    })

    it("stores a copy in place of the one before", async () => {
      const deviceDB = await makeDeviceDB()
      const second = cacheableOf(u1, 'second')
      await deviceDB.putCachedVault(cacheableOf(u1, 'first'))
      await deviceDB.putCachedVault(second)
      expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([second])
    })

    it("hands the listing its cache: load finds the copies and save stores one", async () => {
      const deviceDB = await makeDeviceDB()
      const cache = deviceDB.vaultCache(bank1)
      expect(Object.isFrozen(cache)).to.be.true
      await cache.save(cacheableOf(u1))
      expect(await cache.load()).to.deep.equal([cacheableOf(u1)])
    })

    it("clears one vault's lease and copy, leaving the device record and every other vault's", async () => {
      const deviceDB = await makeDeviceDB()
      const record = recordOf('device-a', [{ vaultlabel: 'main', gate_epoch: 2 }])
      const [lease, spareLease] = [await modelsLeaseOf('u1'), await modelsLeaseOf('u1', 'spare')]
      await Promise.all([
        deviceDB.putLease(lease),
        deviceDB.putLease(spareLease),
        deviceDB.putCachedVault(cacheableOf(u1)),
        deviceDB.putCachedVault(cacheableOf(u1spare)),
        deviceDB.advanceDeviceRecord(record),
      ])
      await deviceDB.clearCachedVault(u1)
      expect(await deviceDB.getLease(u1)).to.be.null
      expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([cacheableOf(u1spare)])
      expect(await deviceDB.getLease(u1spare)).to.deep.equal(spareLease)
      expect(await deviceDB.getDeviceRecord(bank1)).to.deep.equal(record)
    })

    it("refuses 'bad_record' a copy that names no vault, storing nothing", async () => {
      const deviceDB = await makeDeviceDB()
      const { vaultlabel: _vaultlabel, ...nameless } = cacheableOf(u1)
      await expectRefusal(deviceDB.putCachedVault(nameless as unknown as VaultCacheable), 'bad_record')
      expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([])
    })
  })

  describe(`${adapterTitle}, erasing everything`, () => {
    it("erases every lease, copy and device record", async () => {
      const deviceDB = await makeDeviceDB()
      const lease = await modelsLeaseOf('u1')
      await Promise.all([
        deviceDB.putLease(lease),
        deviceDB.putCachedVault(cacheableOf(u1)),
        deviceDB.advanceDeviceRecord(recordOf('device-a')),
      ])
      await deviceDB.delAll()
      expect(await deviceDB.getLease(u1)).to.be.null
      expect(await deviceDB.findCachedVaults(bank1)).to.deep.equal([])
      expect(await deviceDB.getDeviceRecord(bank1)).to.be.null
    })
  })
}

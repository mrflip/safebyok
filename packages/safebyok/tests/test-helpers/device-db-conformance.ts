import { describe, it, expect } from 'vitest'
import { type DeviceDB } from '../../src/device-db'
import { scopeOf, leaseOf, NoLocks, markOf } from './builders'
import { expectRefusal } from './refusals'


/**
 * The behaviour every DeviceDB owes, written once: no lease until one is written, then that one
 * back, its leaseKey still a non-extractable CryptoKey; likewise a device mark, the newest
 * written in place of the one before but never at a lower lock generation; a lease written only
 * while its scope's mark stands at the lock generation expected; each scope kept to itself, and
 * marks apart from leases; and an erase of one, or of all. Run it against an adapter with a
 * factory making a fresh, empty one per test. For a DeviceDB's own tests, from
 * `safebyok/testing`; it runs under vitest.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeDeviceDB - A fresh, empty adapter: no record in it, and none shared with another call.
 *
 * @example
 *   describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())
 */
export const describeDeviceDB = (adapterTitle: string, makeDeviceDB: () => DeviceDB | Promise<DeviceDB>) => {
  describe(`${adapterTitle}, as a DeviceDB`, () => {
    it("has no lease until one is written, then keeps it whole, leaseKey handle and all", async () => {
      const deviceDB = await makeDeviceDB()
      expect(await deviceDB.readLease(scopeOf('u1'))).to.be.null
      const lease = await leaseOf('u1')
      await deviceDB.writeLease(lease, NoLocks)
      const kept = await deviceDB.readLease(scopeOf('u1'))
      expect(kept).to.deep.equal(lease)
      expect(kept?.lease_key).to.be.instanceOf(CryptoKey)
      expect(kept?.lease_key.extractable).to.be.false
    })

    it("keeps leases per user: erasing one leaves the other", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeLease(await leaseOf('u1'), NoLocks)
      await deviceDB.writeLease(await leaseOf('u2'), NoLocks)
      await deviceDB.eraseLease(scopeOf('u1'))
      expect(await deviceDB.readLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readLease(scopeOf('u2'))).to.not.be.null
    })

    it("eraseAll erases every lease, and every device mark", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeLease(await leaseOf('u1'), NoLocks)
      await deviceDB.writeLease(await leaseOf('u2'), NoLocks)
      await deviceDB.writeMark(markOf('u1'))
      await deviceDB.eraseAll()
      expect(await deviceDB.readLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readLease(scopeOf('u2'))).to.be.null
      expect(await deviceDB.readMark(scopeOf('u1'))).to.be.null
    })

    it("has no device mark until one is written, then keeps it whole, and the newest in place of the one before", async () => {
      const deviceDB = await makeDeviceDB()
      expect(await deviceDB.readMark(scopeOf('u1'))).to.be.null
      await deviceDB.writeMark(markOf('u1'))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1'))
      await deviceDB.writeMark(markOf('u1', { seen: { unlock_epoch: 4 } }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: { unlock_epoch: 4 } }))
    })

    it("keeps marks per vault, and apart from leases: erasing one leaves the rest", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeLease(await leaseOf('u1'), NoLocks)
      await deviceDB.writeMark(markOf('u1'))
      await deviceDB.writeMark(markOf('u2'))
      await deviceDB.eraseMark(scopeOf('u1'))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.be.null
      expect(await deviceDB.readMark(scopeOf('u2'))).to.deep.equal(markOf('u2'))
      expect(await deviceDB.readLease(scopeOf('u1'))).to.not.be.null
      await deviceDB.eraseLease(scopeOf('u2'))
      expect(await deviceDB.readMark(scopeOf('u2'))).to.deep.equal(markOf('u2'))
    })

    it("writes a lease only while the mark stands at the lock generation expected, refusing as 'stale_write' otherwise", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeMark(markOf('u1', { lock_generation: 2 }))
      await expectRefusal(deviceDB.writeLease(await leaseOf('u1'), { lock_generation: 1 }), 'stale_write')
      expect(await deviceDB.readLease(scopeOf('u1'))).to.be.null
      await deviceDB.writeLease(await leaseOf('u1'), { lock_generation: 2 })
      expect(await deviceDB.readLease(scopeOf('u1'))).to.not.be.null
    })

    it("reads the lock generation of a scope with no mark as 0, and of each scope apart", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeLease(await leaseOf('u1'), NoLocks)
      await deviceDB.writeMark(markOf('u1', { lock_generation: 1 }))
      await deviceDB.writeLease(await leaseOf('u2'), NoLocks)
      expect(await deviceDB.readLease(scopeOf('u2'))).to.not.be.null
      await expectRefusal(deviceDB.writeLease(await leaseOf('u1'), NoLocks), 'stale_write')
    })

    it("never lowers a mark's lock generation: a mark written from an older read keeps the higher", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeMark(markOf('u1', { lock_generation: 3 }))
      await deviceDB.writeMark(markOf('u1', { seen: { unlock_epoch: 4 }, lock_generation: 1 }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: { unlock_epoch: 4 }, lock_generation: 3 }))
      await deviceDB.writeMark(markOf('u1', { lock_generation: 5 }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { lock_generation: 5 }))
    })

    it("keeps a mark that has seen no vault, its lock generation counting as any mark's", async () => {
      const deviceDB = await makeDeviceDB()
      await deviceDB.writeMark(markOf('u1', { seen: null, lock_generation: 2 }))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: null, lock_generation: 2 }))
      await expectRefusal(deviceDB.writeLease(await leaseOf('u1'), NoLocks), 'stale_write')
      await deviceDB.writeMark(markOf('u1'))
      expect(await deviceDB.readMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { lock_generation: 2 }))
    })
  })
}

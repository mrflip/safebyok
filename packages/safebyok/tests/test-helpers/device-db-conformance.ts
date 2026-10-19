import { describe, it, expect } from 'vitest'
import { type DeviceDB } from '../../src/device-db'
import { scopeOf, leaseOf, markOf } from './builders'
import { expectingGood } from './refusals'


/**
 * The behaviour every DeviceDB owes, written once: every verb answering a good Outcome; no lease
 * until one is written, then that record back, its leaseKey still a non-extractable CryptoKey;
 * likewise a device mark, the newest written in place of the one before; each scope kept to
 * itself, and marks apart from leases; and an erase of one, or of all. Run it against an adapter with a
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
    it("answers every verb with a good Outcome, never a bare record", async () => {
      const deviceDB = await makeDeviceDB()
      const lease = await leaseOf('u1')
      expect(await deviceDB.putLease(lease)).to.deep.equal({ ok: true, val: undefined })
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: lease })
      expect(await deviceDB.putMark(markOf('u1'))).to.deep.equal({ ok: true, val: undefined })
      expect(await deviceDB.getMark(scopeOf('u1'))).to.deep.equal({ ok: true, val: markOf('u1') })
      expect(await deviceDB.delLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: undefined })
      expect(await deviceDB.delMark(scopeOf('u1'))).to.deep.equal({ ok: true, val: undefined })
      expect(await deviceDB.delAll()).to.deep.equal({ ok: true, val: undefined })
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: null })
    })

    it("has no lease until one is written, then keeps it whole, leaseKey handle and all", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      expect(await deviceDB.getLease(scopeOf('u1'))).to.be.null
      const lease = await leaseOf('u1')
      await deviceDB.putLease(lease)
      const kept = await deviceDB.getLease(scopeOf('u1'))
      expect(kept).to.deep.equal(lease)
      expect(kept?.lease_key).to.be.instanceOf(CryptoKey)
      expect(kept?.lease_key.extractable).to.be.false
    })

    it("keeps leases per user: erasing one leaves the other", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease(await leaseOf('u1'))
      await deviceDB.putLease(await leaseOf('u2'))
      await deviceDB.delLease(scopeOf('u1'))
      expect(await deviceDB.getLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getLease(scopeOf('u2'))).to.not.be.null
    })

    it("delAll erases every lease, and every device mark", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease(await leaseOf('u1'))
      await deviceDB.putLease(await leaseOf('u2'))
      await deviceDB.putMark(markOf('u1'))
      await deviceDB.delAll()
      expect(await deviceDB.getLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getLease(scopeOf('u2'))).to.be.null
      expect(await deviceDB.getMark(scopeOf('u1'))).to.be.null
    })

    it("has no device mark until one is written, then keeps it whole, and the newest in place of the one before", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      expect(await deviceDB.getMark(scopeOf('u1'))).to.be.null
      await deviceDB.putMark(markOf('u1'))
      expect(await deviceDB.getMark(scopeOf('u1'))).to.deep.equal(markOf('u1'))
      await deviceDB.putMark(markOf('u1', { seen: { unlock_epoch: 4 } }))
      expect(await deviceDB.getMark(scopeOf('u1'))).to.deep.equal(markOf('u1', { seen: { unlock_epoch: 4 } }))
    })

    it("keeps marks per vault, and apart from leases: erasing one leaves the rest", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease(await leaseOf('u1'))
      await deviceDB.putMark(markOf('u1'))
      await deviceDB.putMark(markOf('u2'))
      await deviceDB.delMark(scopeOf('u1'))
      expect(await deviceDB.getMark(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getMark(scopeOf('u2'))).to.deep.equal(markOf('u2'))
      expect(await deviceDB.getLease(scopeOf('u1'))).to.not.be.null
      await deviceDB.delLease(scopeOf('u2'))
      expect(await deviceDB.getMark(scopeOf('u2'))).to.deep.equal(markOf('u2'))
    })
  })
}

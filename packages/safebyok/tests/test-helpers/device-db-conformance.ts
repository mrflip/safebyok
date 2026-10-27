import { describe, it, expect } from 'vitest'
import { type DeviceDB } from '../../src/device-db'
import type { LeaseRecord } from '../../src/types/types'
import { scopeOf, leaseOf, deviceRecordOf } from './builders'
import { expectBad, expectingGood } from './refusals'


/**
 * The behaviour every DeviceDB owes, written once: every verb answering a good Outcome; no lease
 * until one is written, then that record back, its leaseKey still a non-extractable CryptoKey;
 * a device record, raised and never lowered, the first `device_id` kept; each scope kept to
 * itself, and records apart from leases; an erase of one, or of all; one scope's calls landing
 * in the order they were made, awaited or not; and a record that fails its check read as none and
 * discarded, but never one written after the read that found it. Given a second factory, an
 * adapter over a store the browser withholds, it checks too that every verb then resolves a bad
 * Outcome of 'storage_blocked', never a rejection, as the DeviceDB base class answers. Run it against
 * an adapter with a factory making a fresh, empty one per test. For a DeviceDB's own tests, from
 * `safebyok/testing`; it runs under vitest.
 *
 * @param adapterTitle - The adapter under test, as the suite's titles name it.
 * @param makeDeviceDB - A fresh, empty adapter: no record in it, and none shared with another call.
 * @param makeBlockedDeviceDB - Optional: the adapter over a store the browser withholds -- site
 *   data blocked, no room, no such storage -- so each of its verbs meets that refusal. Called within
 *   the test, so it may stub a global there, undoing it with vitest's `onTestFinished`.
 *
 * @example
 *   describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())
 * @example
 *   describeDeviceDB('idbDeviceDB', () => idbDeviceDB({ dbName: TH.freshDbName() }), () => {
 *     // Every open refused as a browser refuses one from an opaque origin, until the test ends.
 *     const opening = vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('The operation is insecure.', 'SecurityError') })
 *     onTestFinished(() => { opening.mockRestore() })
 *     return idbDeviceDB({ dbName: TH.freshDbName() })
 *   })
 */
export const describeDeviceDB = (adapterTitle: string, makeDeviceDB: () => DeviceDB | Promise<DeviceDB>, makeBlockedDeviceDB?: () => DeviceDB | Promise<DeviceDB>) => {
  describe(`${adapterTitle}, as a DeviceDB`, () => {
    if (makeBlockedDeviceDB !== undefined) {
      it("answers every verb over a store the browser withholds with a bad Outcome of 'storage_blocked', never a rejection", async () => {
        const deviceDB = await makeBlockedDeviceDB()
        const lease = await leaseOf('u1')
        await expectBad(deviceDB.getLease(scopeOf('u1')), 'storage_blocked')
        await expectBad(deviceDB.putLease(lease), 'storage_blocked')
        await expectBad(deviceDB.delLease(scopeOf('u1')), 'storage_blocked')
        await expectBad(deviceDB.getDeviceRecord(scopeOf('u1')), 'storage_blocked')
        await expectBad(deviceDB.raiseDeviceRecord(deviceRecordOf('u1')), 'storage_blocked')
        await expectBad(deviceDB.delDeviceRecord(scopeOf('u1')), 'storage_blocked')
        await expectBad(deviceDB.delAll(), 'storage_blocked')
      })
    }

    it("answers every verb with a good Outcome, never a bare record", async () => {
      const deviceDB = await makeDeviceDB()
      const lease = await leaseOf('u1')
      expect(await deviceDB.putLease(lease)).to.deep.equal({ ok: true, val: lease })
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: lease })
      expect(await deviceDB.raiseDeviceRecord(deviceRecordOf('u1'))).to.deep.equal({ ok: true, val: deviceRecordOf('u1') })
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.deep.equal({ ok: true, val: deviceRecordOf('u1') })
      expect(await deviceDB.delLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: undefined })
      expect(await deviceDB.delDeviceRecord(scopeOf('u1'))).to.deep.equal({ ok: true, val: undefined })
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

    it("resolves the lease as stored, whole, leaseKey handle and all", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      const lease = await leaseOf('u1')
      const stored = await deviceDB.putLease(lease)
      expect(stored).to.deep.equal(lease)
      expect(stored.lease_key).to.be.instanceOf(CryptoKey)
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal(stored)
    })

    it("lands one scope's calls in the order they were made, awaited or not: the last of a put and an erase made together wins", async () => {
      const deviceDB = await makeDeviceDB()
      const first = await leaseOf('u1')
      const second = await leaseOf('u1', { gate_epoch: 2 })
      await Promise.all([deviceDB.putLease(first), deviceDB.putLease(second)])
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: second })
      await Promise.all([deviceDB.putLease(first), deviceDB.delLease(scopeOf('u1'))])
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: null })
      await Promise.all([deviceDB.delLease(scopeOf('u1')), deviceDB.putLease(second)])
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: second })
      // A read made first sees what was stored then; one made after a write sees the write.
      const [before, _putOutcome, after] = await Promise.all([deviceDB.getLease(scopeOf('u1')), deviceDB.putLease(first), deviceDB.getLease(scopeOf('u1'))])
      expect(before).to.deep.equal({ ok: true, val: second })
      expect(after).to.deep.equal({ ok: true, val: first })
    })

    // Each of these plants a record that fails its check through the verb that writes it: no verb
    // checks what it is handed, and a raise over nothing stores what it came with.
    it("never discards a lease written after the unreadable row a getLease found: a putLease made as the getLease began is kept", async () => {
      const deviceDB = await makeDeviceDB()
      const lease = await leaseOf('u1')
      await deviceDB.putLease({ ...lease, lease_key: 'not a key handle' } as unknown as LeaseRecord)
      const [found, written] = await Promise.all([deviceDB.getLease(scopeOf('u1')), deviceDB.putLease(lease)])
      expect(found).to.deep.equal({ ok: true, val: null })
      expect(written).to.deep.equal({ ok: true, val: lease })
      expect(await deviceDB.getLease(scopeOf('u1'))).to.deep.equal({ ok: true, val: lease })
    })

    it("never discards a device record raised after the unreadable row a getDeviceRecord found: a raiseDeviceRecord made as the getDeviceRecord began is kept", async () => {
      const deviceDB = await makeDeviceDB()
      const raising = deviceRecordOf('u1', { highest_vault_epoch: 3 })
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { device_id: '' }))
      const [found, raised] = await Promise.all([deviceDB.getDeviceRecord(scopeOf('u1')), deviceDB.raiseDeviceRecord(raising)])
      expect(found).to.deep.equal({ ok: true, val: null })
      expect(raised).to.deep.equal({ ok: true, val: raising })
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.deep.equal({ ok: true, val: raising })
    })

    it("discards a row that fails its check, of either kind, and reads it as none", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease({ ...(await leaseOf('u1')), ask_passphrase_at: 'soon' } as unknown as LeaseRecord)
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { device_id: '' }))
      expect(await deviceDB.getLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.be.null
      // A sound record raised now starts afresh: nothing of the discarded one is kept.
      expect(await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { device_id: 'device-two' }))).to.deep.equal(deviceRecordOf('u1', { device_id: 'device-two' }))
    })

    it("keeps leases per user: erasing one leaves the other", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease(await leaseOf('u1'))
      await deviceDB.putLease(await leaseOf('u2'))
      await deviceDB.delLease(scopeOf('u1'))
      expect(await deviceDB.getLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getLease(scopeOf('u2'))).to.not.be.null
    })

    it("delAll erases every lease, and every device record", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease(await leaseOf('u1'))
      await deviceDB.putLease(await leaseOf('u2'))
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u1'))
      await deviceDB.delAll()
      expect(await deviceDB.getLease(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getLease(scopeOf('u2'))).to.be.null
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.be.null
    })

    it("has no device record until one is raised, then keeps it whole, raised to a higher vault_epoch", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.be.null
      expect(await deviceDB.raiseDeviceRecord(deviceRecordOf('u1'))).to.deep.equal(deviceRecordOf('u1'))
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.deep.equal(deviceRecordOf('u1'))
      expect(await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { highest_vault_epoch: 4 }))).to.deep.equal(deviceRecordOf('u1', { highest_vault_epoch: 4 }))
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.deep.equal(deviceRecordOf('u1', { highest_vault_epoch: 4 }))
    })

    it("never lowers a device record: a lower vault_epoch keeps the higher, and resolves the record as stored", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { highest_vault_epoch: 5 }))
      expect(await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { highest_vault_epoch: 3 }))).to.deep.equal(deviceRecordOf('u1', { highest_vault_epoch: 5 }))
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.deep.equal(deviceRecordOf('u1', { highest_vault_epoch: 5 }))
    })

    it("keeps the first device_id raised: a later raise under another id keeps it, and raises the epoch", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { device_id: 'device-one' }))
      expect(await deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { device_id: 'device-two', highest_vault_epoch: 2 }))).to.deep.equal(deviceRecordOf('u1', { device_id: 'device-one', highest_vault_epoch: 2 }))
    })

    it("raises two at once to the higher, in whichever order they land", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await Promise.all([deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { highest_vault_epoch: 7 })), deviceDB.raiseDeviceRecord(deviceRecordOf('u1', { highest_vault_epoch: 6 }))])
      const raised = await deviceDB.getDeviceRecord(scopeOf('u1'))
      expect(raised?.highest_vault_epoch).to.eq(7)
    })

    it("keeps device records per vault, and apart from leases: erasing one leaves the rest", async () => {
      const deviceDB = expectingGood(await makeDeviceDB())
      await deviceDB.putLease(await leaseOf('u1'))
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u1'))
      await deviceDB.raiseDeviceRecord(deviceRecordOf('u2'))
      await deviceDB.delDeviceRecord(scopeOf('u1'))
      expect(await deviceDB.getDeviceRecord(scopeOf('u1'))).to.be.null
      expect(await deviceDB.getDeviceRecord(scopeOf('u2'))).to.deep.equal(deviceRecordOf('u2'))
      expect(await deviceDB.getLease(scopeOf('u1'))).to.not.be.null
      await deviceDB.delLease(scopeOf('u2'))
      expect(await deviceDB.getDeviceRecord(scopeOf('u2'))).to.deep.equal(deviceRecordOf('u2'))
    })
  })
}

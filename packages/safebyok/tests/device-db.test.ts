import { describe, expect, it, vi } from 'vitest'
import { deviceOutcomeOf, deviceTroubleAsConditions, memoryDeviceDB, type DeviceDB } from '../src/device-db'
import { VaultError } from '../src/errors'
import type { LeaseRecord, VaultScope } from '../src/types'
import * as TH from './test-helpers'

TH.describeDeviceDB('memoryDeviceDB', () => memoryDeviceDB())

describe("memoryDeviceDB", () => {
  it("treats a mangled record as no lease, and discards it", async () => {
    const deviceDB = TH.expectingGood(memoryDeviceDB())
    const mangled = { ...(await TH.leaseOf('u1')), lease_key: 'not a key handle' }
    await deviceDB.putLease(mangled as unknown as LeaseRecord)
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getLease(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("treats a mangled mark as no mark, and clears it", async () => {
    const deviceDB = TH.expectingGood(memoryDeviceDB())
    await deviceDB.putMark(TH.markOf('u1', { seen: { device_id: '' } }))
    expect(await deviceDB.getMark(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getMark(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("answers a null lease as a good Outcome, as its first example shows", async () => {
    expect(await memoryDeviceDB().getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("answers a null mark as a good Outcome, as its second example shows", async () => {
    expect(await memoryDeviceDB().getMark({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("refuses a scope whose name holds the ckey delimiter as a bad Outcome of 'bad_label', never a rejection", async () => {
    await TH.expectBad(memoryDeviceDB().getLease({ ...TH.scopeOf('u1'), user_id: 'u^1' }), 'bad_label')
  })
})

describe("deviceOutcomeOf", () => {
  it("answers what the body returns as a good Outcome, as its first example shows", async () => {
    expect(await deviceOutcomeOf('getMark', () => TH.markOf('u1'))).to.deep.equal({ ok: true, val: TH.markOf('u1') })
  })

  it("says a SecurityError as 'storage_blocked', the store's error its cause, as its second example shows", async () => {
    const blocked = new DOMException('The operation is insecure.', 'SecurityError')
    const err = await TH.expectBad(deviceOutcomeOf('getMark', () => Promise.reject(blocked)), 'storage_blocked')
    expect(err.cause).to.eq(blocked)
    expect(err.message).to.match(/will not help until that changes/)
  })

  it("passes a VaultError through as it came", async () => {
    const refusal = new VaultError('bad_label', 'no such label')
    expect(await TH.expectBad(deviceOutcomeOf('delMark', () => { throw refusal }), 'bad_label')).to.eq(refusal)
  })
})

describe("deviceTroubleAsConditions", () => {
  it("passes a good Outcome through as it came", async () => {
    const deviceDB = memoryDeviceDB()
    await deviceDB.putMark(TH.markOf('u1'))
    expect(await deviceTroubleAsConditions(deviceDB).getMark(TH.scopeOf('u1'))).to.deep.equal({ ok: true, val: TH.markOf('u1') })
  })

  it("passes a store's own refusal through as it came", async () => {
    const deviceDB = memoryDeviceDB()
    const refusal = new VaultError('storage_blocked', 'no room')
    vi.spyOn(deviceDB, 'getLease').mockResolvedValueOnce(TH.bad(refusal))
    const passed = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'storage_blocked')
    expect(passed).to.eq(refusal)
  })

  it("says a bad Outcome whose err is no VaultError as a condition, that err its cause", async () => {
    const deviceDB = memoryDeviceDB()
    const trouble = new Error('the disk said no')
    vi.spyOn(deviceDB, 'delLease').mockResolvedValueOnce({ ok: false, err: trouble } as unknown as Awaited<ReturnType<DeviceDB['delLease']>>)
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).delLease(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.cause).to.eq(trouble)
  })

  const NotOutcomes = [
    // what a store written before its verbs resolved Outcomes might answer:
    [undefined,           'nothing at all'],
    [null,                'a bare null, as a lease absent'],
    [{ format: 'x' },     'a bare record'],
  ] as const

  for (const [answer, blurb] of NotOutcomes) {
    it(`refuses an answer that is no Outcome -- ${blurb} -- as 'bad_option', naming the verb`, async () => {
      const deviceDB = memoryDeviceDB()
      vi.spyOn(deviceDB, 'getLease').mockResolvedValueOnce(answer as unknown as Awaited<ReturnType<DeviceDB['getLease']>>)
      const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getLease(TH.scopeOf('u1')), 'bad_option')
      expect(err.message).to.include('getLease')
    })
  }

  it("never rejects, even for a store that throws before its promise", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'delAll').mockImplementationOnce(() => { throw new Error('thrown at once') })
    await TH.expectBad(deviceTroubleAsConditions(deviceDB).delAll(), 'storage_unavailable')
  })

  it("names no scope in what it says", async () => {
    const deviceDB = memoryDeviceDB()
    const scope: VaultScope = { applabel: 'acme', user_id: 'distinctive_user', vaultlabel: 'main' }
    vi.spyOn(deviceDB, 'getMark').mockRejectedValueOnce(new Error('no'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getMark(scope), 'storage_unavailable')
    expect(err.message).not.to.include('distinctive_user')
  })
})

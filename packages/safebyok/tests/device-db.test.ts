import { describe, expect, it, vi } from 'vitest'
import { deviceOutcomeOf, deviceRecordFor, deviceRecordOf, deviceTroubleAsConditions, memoryDeviceDB, raisedDeviceRecord, type DeviceDB } from '../src/device-db'
import { VaultError } from '../src/errors'
import type { DeviceRecord, LeaseRecord, VaultScope } from '../src/types/types'
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

  it("treats a mangled device record as none, and clears it", async () => {
    const deviceDB = TH.expectingGood(memoryDeviceDB())
    await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1', { device_id: '' }))
    expect(await deviceDB.getDeviceRecord(TH.scopeOf('u1'))).to.be.null
    expect(await deviceDB.getDeviceRecord(TH.scopeOf('u1'))).to.be.null  // stays gone
  })

  it("answers a null lease as a good Outcome, as its first example shows", async () => {
    expect(await memoryDeviceDB().getLease({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("answers a null device record as a good Outcome, as its second example shows", async () => {
    expect(await memoryDeviceDB().getDeviceRecord({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })).to.deep.equal({ ok: true, val: null })
  })

  it("refuses a scope whose name holds the ckey delimiter as a bad Outcome of 'bad_scope', never a rejection", async () => {
    await TH.expectBad(memoryDeviceDB().getLease({ ...TH.scopeOf('u1'), user_id: 'u^1' }), 'bad_scope')
  })
})

describe("raisedDeviceRecord", () => {
  const record: DeviceRecord = TH.deviceRecordOf('u1')

  it("stores the record as it came where none stands, as its first example shows", () => {
    expect(raisedDeviceRecord(undefined, record)).to.eq(record)
  })

  it("keeps the higher highest_vault_epoch where a record stands, as its second example shows", () => {
    expect(raisedDeviceRecord({ ...record, highest_vault_epoch: 5 }, { ...record, highest_vault_epoch: 3 }).highest_vault_epoch).to.eq(5)
  })

  it("raises a standing record to a higher epoch, keeping its own device_id", () => {
    const standing = TH.deviceRecordOf('u1', { device_id: 'device-one', highest_vault_epoch: 2 })
    expect(raisedDeviceRecord(standing, TH.deviceRecordOf('u1', { device_id: 'device-two', highest_vault_epoch: 4 })))
      .to.deep.equal(TH.deviceRecordOf('u1', { device_id: 'device-one', highest_vault_epoch: 4 }))
  })

  const GivesWayCases = [
    // what may stand under the ckey that is no device record of this scope:
    [null,                                                       'a null left by a store'],
    [{ format: 'safebyok-device-v0', highest_vault_epoch: 9 },  'a row that fails its check'],
    [TH.deviceRecordOf('u2', { highest_vault_epoch: 9 }),        "another scope's record, filed where it should not be"],
  ] as const

  for (const [stored, blurb] of GivesWayCases) {
    it(`gives way to the record handed to it over ${blurb}`, () => {
      expect(raisedDeviceRecord(stored, record)).to.eq(record)
    })
  }
})

describe("deviceRecordOf", () => {
  it("builds the record from the scope's parsed names alone, frozen: a Vault object passes as its scope, as its example shows", () => {
    const holder = { ...TH.scopeOf('u1'), vault_tok: 'vault-tok-u1', lock: () => undefined }
    const record = deviceRecordOf(holder, 'device-one', 3)
    expect(record).to.deep.equal(TH.deviceRecordOf('u1', { highest_vault_epoch: 3 }))
    expect(Object.isFrozen(record)).to.be.true
  })

  it("refuses a scope that fails its check as bad_scope, and a device_id or epoch that fails as bad_record", () => {
    TH.expectSyncRefusal(() => deviceRecordOf({ ...TH.scopeOf('u1'), vaultlabel: 'Main' }, 'device-one', 3), 'bad_scope')
    TH.expectSyncRefusal(() => deviceRecordOf(TH.scopeOf('u1'), '', 3), 'bad_record')
    TH.expectSyncRefusal(() => deviceRecordOf(TH.scopeOf('u1'), 'device-one', -1), 'bad_record')
  })
})

describe("deviceRecordFor", () => {
  const scope = TH.scopeOf('u1')
  const record: DeviceRecord = TH.deviceRecordOf('u1')

  it("hands back a record of the scope as it came, and none as none, as its first example shows", () => {
    expect(deviceRecordFor(scope, record)).to.deep.equal(record)
    expect(deviceRecordFor(scope, null)).to.be.null
  })

  it("reads a record naming another user as none, as its second example shows", () => {
    expect(deviceRecordFor(scope, { ...record, user_id: 'someone-else' })).to.be.null
  })

  const NoneCases = [
    [{ ...record, device_id: undefined },          'one with no device_id'],
    [{ ...record, device_id: '' },                 'one with an empty device_id'],
    [{ ...record, highest_vault_epoch: -1 },       'one with a negative epoch'],
    [{ ...record, user_id: 'u 1' },                "one whose user_id fails its check, never refused as the check's bad_scope"],
    [{ ...record, format: 'safebyok-device-v0' },  'one of another format'],
    [{ ...record, vaultlabel: 'work' },            "another vault's"],
    ['a string, not a record',                     'what is no record at all'],
  ] as const

  for (const [answer, blurb] of NoneCases) {
    it(`reads ${blurb} as none`, () => {
      expect(deviceRecordFor(scope, answer)).to.be.null
    })
  }
})

describe("deviceOutcomeOf", () => {
  it("answers what the body returns as a good Outcome, a record or null, as its first example shows", async () => {
    expect(await deviceOutcomeOf('getDeviceRecord', () => TH.deviceRecordOf('u1'))).to.deep.equal({ ok: true, val: TH.deviceRecordOf('u1') })
    expect(await deviceOutcomeOf('getDeviceRecord', () => Promise.resolve(null))).to.deep.equal({ ok: true, val: null })
  })

  it("says a SecurityError as 'storage_blocked', the store's error its cause, never rejecting, as its second example shows", async () => {
    const blocked = new DOMException('The operation is insecure.', 'SecurityError')
    const err = await TH.expectBad(deviceOutcomeOf('delDeviceRecord', () => Promise.reject(blocked)), 'storage_blocked')
    expect(err.cause).to.eq(blocked)
    expect(err.message).to.match(/erasing its record of this vault/)
    expect(err.message).to.match(/will not help until that changes/)
  })

  const ThrownCases = [
    // what a host's own store may throw, and what the vault hears:
    [new DOMException('No room.', 'QuotaExceededError'),     "storage_blocked",      'no room, as a private window or a full disk gives'],
    [new DOMException('Gone.', 'NotSupportedError'),          "storage_blocked",      'no such storage at all'],
    [{ name: 'SecurityError', message: 'from another frame' }, "storage_blocked",      'a refusal told by its name alone, from another frame'],
    [new Error('socket closed'),                              "storage_unavailable",  'any other failure, which a retry may mend'],
    ["a bare string",                                         "storage_unavailable",  'a thrown value that is no Error'],
  ] as const

  for (const [thrown, refusalkind, blurb] of ThrownCases) {
    it(`says ${blurb} as '${refusalkind}', what was thrown its cause`, async () => {
      const err = await TH.expectBad(deviceOutcomeOf('getLease', vi.fn<() => Promise<null>>().mockRejectedValue(thrown)), refusalkind)
      expect(err.cause).to.eq(thrown)
    })
  }

  it("passes a VaultError through as it came", async () => {
    const refusal = new VaultError('bad_scope', 'no such label')
    expect(await TH.expectBad(deviceOutcomeOf('delDeviceRecord', () => { throw refusal }), 'bad_scope')).to.eq(refusal)
  })
})

describe("deviceTroubleAsConditions", () => {
  it("passes a good Outcome through as it came", async () => {
    const deviceDB = memoryDeviceDB()
    await deviceDB.raiseDeviceRecord(TH.deviceRecordOf('u1'))
    expect(await deviceTroubleAsConditions(deviceDB).getDeviceRecord(TH.scopeOf('u1'))).to.deep.equal({ ok: true, val: TH.deviceRecordOf('u1') })
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

  it("says a failing store reading its device record as 'storage_unavailable', as its first example shows", async () => {
    const deviceDB = memoryDeviceDB()
    vi.spyOn(deviceDB, 'getDeviceRecord').mockRejectedValueOnce(new Error('the disk said no'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getDeviceRecord(TH.scopeOf('u1')), 'storage_unavailable')
    expect(err.message).to.match(/failed reading its record of this vault/)
  })

  it("says site data blocked as 'storage_blocked', the store's error its cause, as its second example shows", async () => {
    const deviceDB = memoryDeviceDB()
    const blocked = new DOMException('The operation is insecure.', 'SecurityError')
    vi.spyOn(deviceDB, 'getDeviceRecord').mockImplementationOnce(() => { throw blocked })
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getDeviceRecord(TH.scopeOf('u1')), 'storage_blocked')
    expect(err.cause).to.eq(blocked)
    expect(err.message).to.match(/will not help until that changes/)
  })

  it("names no scope in what it says", async () => {
    const deviceDB = memoryDeviceDB()
    const scope: VaultScope = { applabel: 'acme', user_id: 'distinctive_user', vaultlabel: 'main' }
    vi.spyOn(deviceDB, 'getDeviceRecord').mockRejectedValueOnce(new Error('no'))
    const err = await TH.expectBad(deviceTroubleAsConditions(deviceDB).getDeviceRecord(scope), 'storage_unavailable')
    expect(err.message).not.to.include('distinctive_user')
  })
})

/** The device: its options, the host's functions it wraps, and its sweep, over its MemoryVaultDB. */

import { afterEach, describe, expect, it, vi } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import { Consts, Errors, Phrases } from 'safebyok-big/internals'
import { browserOpts } from '../../src/browser'
import { Bank } from '../../src/models/bank'
import { Lease } from '../../src/models/lease'
import { DefaultLeaseMillis, DefaultOnBadNews, Device, tellBadNewsTo } from '../../src/models/device'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { type BadNews, type DeviceSnapshot, PendingBank } from '../../src/shapes/shapes-bankish'
import * as TH from '../test-helpers'

describe("a page that is not a secure context", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("refuses Device.make", () => {
    vi.stubGlobal('isSecureContext', false)
    const err = TH.expectSyncRefusal(() => TH.makeDevice(), 'insecure_context')
    expect(err.message).to.match(/https/)
  })

  it("makes a device in a secure context, or where the platform has no isSecureContext", () => {
    vi.stubGlobal('isSecureContext', true)
    expect(TH.makeDevice().isEnabled).to.be.true
    vi.stubGlobal('isSecureContext', undefined)
    expect(TH.makeDevice().isEnabled).to.be.true
  })
})

describe("Device.make(record, opts)", () => {
  it("makes an enabled device of the record's scope and token", () => {
    const device = TH.makeDevice()
    expect(device).to.include({ ...TH.WorldScope, device_tok: TH.DeviceTok })
    expect(device.scope).to.deep.equal(TH.WorldScope)
    expect(device.isEnabled).to.be.true
    expect(device.demandEnabled()).to.equal(device)
    expect(device.modelkind).to.eq('device')
  })

  it("accepts the bag of browserOpts() spread in, ignoring its device database", () => {
    const vaultDB = new MemoryVaultDB()
    const device = Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, { ...browserOpts({ dbName: 'device-test' }), vaultDB, logger: TH.quietLogger })
    expect(device.isEnabled).to.be.true
    expect(device.vaultDB).to.equal(vaultDB)
    expect(device).to.not.have.property('deviceDB')
  })

  it("gives each bank made on it the vaultDB it is given", () => {
    const vaultDB = new MemoryVaultDB()
    expect(TH.makeDevice({}, { vaultDB }).vaultDB).to.equal(vaultDB)
  })

  it("refuses a vaultDB missing a verb, naming it", () => {
    const err = TH.expectSyncRefusal(() => TH.makeDevice({}, { vaultDB: { tryGetThing: vi.fn() } } as never), 'bad_record')
    expect(err.message).to.include('vaultDB: ')
  })

  it("serializes as its scope and token alone, and is frozen", () => {
    const device = TH.makeDevice()
    expect(TH.jsonOf(device)).to.deep.equal({ ...TH.WorldScope, device_tok: TH.DeviceTok })
    expect(device.toJSON()).to.deep.equal(TH.jsonOf(device))
    expect(Object.isFrozen(device)).to.be.true
  })

  it("wraps each of the host's functions, leaving none of the host's own on a property", () => {
    const device = TH.makeDevice()
    for (const guarded of [device.keyDeriver, device.strengthChecker]) { expect(Consts.isGuarded(guarded)).to.be.true }
    expect(Object.values(device)).to.not.include.members([TH.testDeriver, TH.anyStrengthChecker])
  })

  it("rounds a fraction of a minute to the nearest millisecond, and turns Infinity into ForeverMillis", () => {
    expect(TH.makeDevice({}, { autolockMinutes: 1 / 7 }).leaseMillis).to.eq(8571)
    expect(TH.makeDevice({}, { autolockMinutes: Infinity }).leaseMillis).to.eq(Consts.ForeverMillis)
    expect(TH.makeDevice({}, { autolockMinutes: 30 }).autolockMinutes).to.eq(30)
  })

  it("leases for DefaultLeaseMillis where the host names no autolockMinutes", () => {
    expect(TH.makeDevice({}, { autolockMinutes: undefined }).leaseMillis).to.eq(DefaultLeaseMillis)
  })

  it("warns through its logger of a test key deriver", () => {
    const warn = vi.fn()
    TH.makeDevice({}, { logger: { log: vi.fn(), warn, error: vi.fn() } })
    expect(warn.mock.calls[0]?.slice(0, 2)).to.deep.equal([Phrases.TestDeriverNotice, { oplabel: 'Device.make' }])
  })

  const OptsCases = [
    ['keyDeriver',       { keyDeriver: 3 }],
    ['strengthChecker',  { strengthChecker: 3 }],
    ['logger',           { logger: 3 }],
  ] as const

  for (const [fieldname, moved] of OptsCases) {
    it(`refuses a ${fieldname} of the wrong type, naming it`, () => {
      const err = TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_record')
      expect(err.message.startsWith(`${fieldname}: `)).to.be.true
    })
  }

  const OtherOptsCases = [
    [{ autolockMinutes: 0 },     'an autolock of no minutes'],
    [{ autolockMinutes: -5 },    'an autolock of negative minutes'],
    [{ autolockMinutes: '30' },  'an autolock written as text'],
    [{ gates: ['main'] },        'an option of the old core'],
    [{ requestCleartext: vi.fn() }, 'a requestCleartext, which a device does not take'],
    [{ onBadNews: 'tell me' },   'an onBadNews that is not a function'],
  ] as const

  for (const [moved, blurb] of OtherOptsCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice({}, moved as never), 'bad_record')
    })
  }

  const RecordCases = [
    [{ device_tok: undefined },            'no device_tok'],
    [{ device_tok: 'device_one' },         'a device_tok that is a label'],
    [{ banklabel: '' },                    'an empty banklabel'],
    [{ userid: 42 },                       'a userid that is not a string'],
    [{ userid: undefined, user_id: 'u1' }, 'its user named user_id, as safebyok-big names it'],
    [{ user_id: 'u1' },                    'a user_id beside its userid'],
    [{ gates: ['main'] },                  'a field a device record does not have'],
  ] as const

  for (const [moved, blurb] of RecordCases) {
    it(`refuses a record with ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice(moved as never), 'bad_record')
    })
  }

  it("refuses no record, no opts, or opts with no keyDeriver or no vaultDB", () => {
    const vaultDB = new MemoryVaultDB()
    TH.expectSyncRefusal(() => Device.make(null as never, { keyDeriver: TH.testDeriver, vaultDB }))
    TH.expectSyncRefusal(() => Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, undefined as never))
    TH.expectSyncRefusal(() => Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, { vaultDB } as never))
    TH.expectSyncRefusal(() => Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, { keyDeriver: TH.testDeriver } as never))
  })
})

describe("device.sweep()", () => {
  it("sweeps its bank and lets it go, the device staying enabled, and never throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(device.sweep()).to.equal(device)
    expect(bank.isEnabled).to.be.false
    expect(device.isEnabled).to.be.true
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank })
    expect(device.sweep()).to.equal(device)
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank })
  })

  it("rejects a call waiting for an `unlock` gating with its bank's end cause", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    device.sweep()
    expect(await TH.expectRefusal(ensuring, 'disabled')).to.equal(bank.endCause)
  })

  it("leaves the device able to judge a passphrase and show the next bank made on it", async () => {
    const { device, record } = await TH.buildBornBank()
    device.sweep()
    expect(await device.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
    const later = Bank.make(record, { device, vaultDB: device.vaultDB })
    expect(device.getSnapshot().bank).to.equal(later.getSnapshot())
    await TH.expectGood(later.tryUnlock({ passphraseCleartext: TH.TestPassphrase }))
    expect(device.getSnapshot().bank).to.include({ stage: 'unlocked' })
  })

  it("leaves a bank working when a second is made on its device", async () => {
    const { bank, device, record } = await TH.buildBornBank()
    const later = Bank.make(record, { device, vaultDB: device.vaultDB })
    expect(bank.isEnabled).to.be.true
    expect(bank.isLocked).to.be.false
    await bank.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(device.getSnapshot().bank).to.equal(later.getSnapshot())
  })

  it("sweeps every bank made on the device, an earlier one unlocked too", async () => {
    const { bank, device, record } = await TH.buildBornBank()
    const later = Bank.make(record, { device, vaultDB: device.vaultDB })
    await TH.expectGood(later.tryUnlock({ passphraseCleartext: TH.TestPassphrase }))
    const sweepLease = vi.spyOn(Lease.prototype, 'sweep')
    device.sweep()
    expect(sweepLease).toHaveBeenCalledTimes(2)
    for (const swept of [bank, later]) {
      expect(swept.isEnabled).to.be.false
      await TH.expectRefusal(swept.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    }
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank })
  })

  it("does nothing on a device with no bank, which births one after it", async () => {
    const device = TH.makeDevice()
    device.sweep()
    const bank = await Bank.birth(device, { passphraseCleartext: TH.TestPassphrase })
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
  })
})

describe("device.judgeStrength(passphraseCleartext)", () => {
  it("returns the verdict of the device's strength checker, given the device's scope", async () => {
    const strengthChecker = vi.fn((passphrase: string) => (passphrase === 'weak' ? { strong: false as const, reason: 'too short' } : { strong: true as const }))
    const device = TH.makeDevice({}, { strengthChecker })
    expect(await device.judgeStrength('weak')).to.deep.equal({ strong: false, reason: 'too short' })
    expect(await device.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
    expect(strengthChecker).toHaveBeenLastCalledWith(TH.TestPassphrase, TH.WorldScope)
  })

  it("judges every passphrase weak with no strengthChecker", async () => {
    const device = TH.makeDevice({}, { strengthChecker: undefined })
    expect(await device.judgeStrength(TH.TestPassphrase)).to.include({ strong: false })
  })

  it("rejects, rather than throws, a value that is not a string", async () => {
    await TH.expectRefusal(TH.makeDevice().judgeStrength(null as never), 'bad_record')
  })
})

describe("device.lock()", () => {
  it("locks the bank made on the device, and never throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(device.lock()).to.equal(device)
    expect(bank.isLocked).to.be.true
    expect(device.lock()).to.equal(device)
    expect(bank.isLocked).to.be.true
  })

  it("locks every bank made on the device, an earlier one too", async () => {
    const { bank, device, record } = await TH.buildBornBank()
    const later = Bank.make(record, { device, vaultDB: device.vaultDB })
    await TH.expectGood(later.tryUnlock({ passphraseCleartext: TH.TestPassphrase }))
    expect(bank.isLocked).to.be.false
    expect(later.isLocked).to.be.false
    device.lock()
    expect(bank.isLocked).to.be.true
    expect(later.isLocked).to.be.true
  })

  it("does nothing on a device with no bank, or a swept one", () => {
    const device = TH.makeDevice()
    expect(device.lock()).to.equal(device)
    device.sweep()
    expect(device.lock()).to.equal(device)
  })
})

/** A listener on `device`'s snapshot that records each snapshot it reads. */
function snapshotsOf(device: Device): DeviceSnapshot[] {
  const snapshots: DeviceSnapshot[] = []
  device.subscribe(() => { snapshots.push(device.getSnapshot()) })
  return snapshots
}

describe("device.getSnapshot() and device.subscribe(listener)", () => {
  it("shows the pending bank before a bank is made", () => {
    const device = TH.makeDevice()
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank })
    expect(Object.isFrozen(device.getSnapshot())).to.be.true
  })

  it("carries the bank's own snapshot, and tells its subscribers of each change to it", async () => {
    const { bank, device } = await TH.buildBornBank()
    const snapshots = snapshotsOf(device)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
    bank.lock()
    bank.lock()
    expect(snapshots).to.have.lengthOf(1)
    expect(snapshots[0]!.bank).to.equal(bank.getSnapshot())
    expect(snapshots[0]!.bank).to.include({ stage: 'locked' })
  })

  it("follows the last bank made on it, and no longer the one before", async () => {
    const { bank, device, record } = await TH.buildBornBank()
    const later = Bank.make(record, { device, vaultDB: device.vaultDB })
    const snapshots = snapshotsOf(device)
    bank.lock()
    expect(snapshots).to.have.lengthOf(0)
    expect(device.getSnapshot().bank).to.equal(later.getSnapshot())
  })

  it("shows an `unlock` gating wanted while a call waits for one, and carries no cleartext", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const snapshots = snapshotsOf(device)
    const ensuring = bank.ensureUnlocked()
    const passphraseCleartext = 'not the passphrase, though long enough'
    await TH.expectRefusal(bank.unlock({ passphraseCleartext }), 'wrong_passphrase')
    await bank.unlock({ passphraseCleartext: TH.TestPassphrase })
    await ensuring
    expect(snapshots.map(({ bank: { stage, isUnlockWanted } }) => ({ stage, isUnlockWanted }))).to.deep.equal([
      { stage: 'locked', isUnlockWanted: true },
      { stage: 'unlocked', isUnlockWanted: false },
    ])
    expect(JSON.stringify(snapshots)).not.to.include(passphraseCleartext)
  })

  it("shows the pending bank once its bank is swept, and tells its subscribers so", async () => {
    const { bank, device } = await TH.buildBornBank()
    const snapshots = snapshotsOf(device)
    bank.sweep()
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank })
    expect(snapshots.at(-1)).to.equal(device.getSnapshot())
  })

  it("still shows its bank when an earlier bank made on it is swept", async () => {
    const { bank, device, record } = await TH.buildBornBank()
    const later = Bank.make(record, { device, vaultDB: device.vaultDB })
    const snapshots = snapshotsOf(device)
    bank.sweep()
    expect(snapshots).to.have.lengthOf(0)
    expect(device.getSnapshot().bank).to.equal(later.getSnapshot())
  })

  it("tells every subscriber when one throws, and passes the throw to onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    device.subscribe(() => { throw new Error('a bug in the host') })
    const listener = vi.fn()
    device.subscribe(listener)
    bank.lock()
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'unexpected_error' })
  })

  it("stops telling a listener once it unsubscribes, and refuses one that is not a function", async () => {
    const { bank, device } = await TH.buildBornBank()
    const listener = vi.fn()
    const unsubscribe = device.subscribe(listener)
    unsubscribe()
    bank.lock()
    expect(listener).not.toHaveBeenCalled()
    TH.expectSyncRefusal(() => device.subscribe(null as never), 'bad_record')
  })
})

describe("device.tellBadNews(badnews)", () => {
  it("tells a refusal as it is and anything else thrown as an unexpected error, and drops the news of a thing disabled", async () => {
    const onBadNews = vi.fn()
    const device = TH.makeDevice({}, { onBadNews })
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down."), new Error("Thrown."), new Errors.VaultError('disabled', "Gone.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable', 'unexpected_error'])
  })

  it("warns of each on the device's logger by default", async () => {
    const warn = vi.fn()
    const device = TH.makeDevice({}, { logger: { log: vi.fn(), warn, error: vi.fn() }, onBadNews: undefined })
    warn.mockClear()
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => warn.mock.calls.length === 1)
    expect(warn.mock.calls[0]?.slice(0, 2)).to.deep.equal(["Down.", { oplabel: 'Device.onBadNews', refusalkind: 'storage_unavailable' }])
    expect(DefaultOnBadNews).to.be.a('function')
  })

  it("tells the host's onBadNews still, once the device is swept", async () => {
    const onBadNews = vi.fn()
    const device = TH.makeDevice({}, { onBadNews })
    device.sweep()
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews).toHaveBeenCalledOnce()
  })
})

describe("tellBadNewsTo", () => {
  it("calls the handler with each news and its device", async () => {
    const device = TH.makeDevice()
    const onBadNews = vi.fn()
    const news = [new Errors.VaultError('storage_unavailable', "Down."), new Errors.VaultError('absent_box', "Gone.")]
    tellBadNewsTo(onBadNews, device, news)
    await TH.eventually(() => onBadNews.mock.calls.length === 2)
    expect(onBadNews.mock.calls).to.deep.equal(news.map((told) => [{ news: told, device }]))
  })

  it("reports a handler's throw to the platform and still delivers the rest of the news", () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const told: string[] = []
    const device = TH.makeDevice()
    tellBadNewsTo(({ news }) => { told.push(news.refusalkind); throw new Error("The handler is broken.") }, device, [new Errors.VaultError('storage_unavailable', "Down."), new Errors.VaultError('absent_box', "Gone.")])
    expect(told).to.deep.equal(['storage_unavailable', 'absent_box'])
    expect(reported).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported = vi.fn()
    vi.stubGlobal('reportError', reported)
    const device = TH.makeDevice()
    tellBadNewsTo(() => Promise.reject(new Error("Rejected.")), device, [new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => reported.mock.calls.length === 1)
    expect(reported.mock.calls[0]?.[0]).to.have.property('message', "Rejected.")
    vi.unstubAllGlobals()
  })

  it("refuses a handler that is not a function, a missing device, or news that is not a VaultError", () => {
    const device = TH.makeDevice()
    const onBadNews = vi.fn()
    const news = new Errors.VaultError('storage_unavailable', "Down.")
    TH.expectSyncRefusal(() => { tellBadNewsTo('tell me' as never, device, [news]) }, 'bad_record')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, {} as never, [news]) }, 'bad_record')
    TH.expectSyncRefusal(() => { tellBadNewsTo(onBadNews, device, [new Error("Down.") as never]) }, 'bad_record')
    expect(onBadNews).not.toHaveBeenCalled()
  })
})

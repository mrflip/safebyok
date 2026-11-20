/** The device: its options, the host's functions it wraps, and its sweep, over its MemoryVaultDB. */

import { afterEach, describe, expect, it, vi } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import { Consts, Errors, Phrases } from 'safebyok-big/internals'
import { browserOpts } from '../../src/browser'
import { Bank } from '../../src/models/bank'
import { DefaultLeaseMillis, DefaultOnBadNews, Device, guardRequestCleartext, tellBadNewsTo } from '../../src/models/device'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { Gating } from '../../src/models/gating'
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
  it("makes an enabled device of the record's scope and token, opening no gating", () => {
    const device = TH.makeDevice()
    expect(device).to.include({ ...TH.WorldScope, device_tok: TH.DeviceTok })
    expect(device.scope).to.deep.equal(TH.WorldScope)
    expect(device.isEnabled).to.be.true
    expect(device.demandEnabled()).to.equal(device)
    expect(device.openGating).to.be.null
    expect(device.modelkind).to.eq('device')
  })

  it("takes the bag of browserOpts() spread in, ignoring its device database", () => {
    const vaultDB = new MemoryVaultDB()
    const device = Device.make({ ...TH.WorldScope, device_tok: TH.DeviceTok }, { ...browserOpts({ dbName: 'device-test' }), vaultDB, logger: TH.quietLogger })
    expect(device.isEnabled).to.be.true
    expect(device.vaultDB).to.equal(vaultDB)
    expect(device).to.not.have.property('deviceDB')
  })

  it("keeps the vaultDB it is given, for each bank made on it", () => {
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

  it("wraps each of the host's functions, keeping none of the host's own on a property", () => {
    const requestCleartext = vi.fn()
    const device = TH.makeDevice({}, { requestCleartext })
    for (const guarded of [device.keyDeriver, device.strengthChecker]) { expect(Consts.isGuarded(guarded)).to.be.true }
    expect(Object.values(device)).to.not.include.members([requestCleartext, TH.testDeriver, TH.anyStrengthChecker])
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
    ['requestCleartext', { requestCleartext: null }],
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

describe("guardRequestCleartext(requestCleartext)", () => {
  it("resolves true once the dialog returns, having shown it the gating", async () => {
    const gating = {} as Gating
    const dialog = vi.fn()
    const guarded = guardRequestCleartext(dialog)
    expect(Consts.isGuarded(guarded)).to.be.true
    expect(await guarded(gating)).to.be.true
    expect(dialog).toHaveBeenCalledExactlyOnceWith(gating)
  })

  it("waits on a dialog that returns a promise", async () => {
    const latch = TH.makeLatch()
    let isSettled = false
    async function settling(): Promise<boolean> {
      const answer = await guardRequestCleartext(() => latch.pass())({} as Gating)
      isSettled = true
      return answer
    }
    const asking = settling()
    await TH.wakeupAtNextTick()
    expect(isSettled).to.be.false
    latch.release()
    expect(await asking).to.be.true
  })

  it("resolves false, dropping what the dialog threw or rejected with", async () => {
    expect(await guardRequestCleartext(() => { throw new Error(TH.TestPassphrase) })({} as Gating)).to.be.false
    expect(await guardRequestCleartext(() => Promise.reject(new Error(TH.TestPassphrase)))({} as Gating)).to.be.false
  })

  it("refuses a dialog that is not a function, naming it", () => {
    const err = TH.expectSyncRefusal(() => guardRequestCleartext('ask' as never), 'bad_record')
    expect(err.message).to.match(/^requestCleartext: /)
  })
})

describe("device.sweep()", () => {
  it("disables the device for good, and never throws", () => {
    const device = TH.makeDevice()
    expect(device.sweep()).to.equal(device)
    expect(device.isEnabled).to.be.false
    TH.expectSyncRefusal(() => device.demandEnabled(), 'disabled')
    expect(device.sweep()).to.equal(device)
    expect(device.isEnabled).to.be.false
  })

  it("dismisses the gating open on the device", async () => {
    const device = TH.makeDevice()
    const prompting = TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'dismissed')
    const gating = device.openGating!
    device.sweep()
    await prompting
    expect(gating.isOpen).to.be.false
    expect(device.openGating).to.be.null
  })

  it("lets an attempt under way finish as the gating's last, and no bank unlocks on the swept device", async () => {
    const latch = TH.makeLatch()
    const keyDeriver = { ...TH.testDeriver, deriveKeyBytes: async (passphrase: string, saltBytes: Uint8Array) => {
      await latch.pass()
      return TH.testDeriver.deriveKeyBytes(passphrase, saltBytes)
    } }
    const device = TH.makeDevice({}, { keyDeriver })
    const prompting = TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'disabled')
    const gating = device.openGating!
    const attempting = gating.attempt({ passphraseClear: TH.TestPassphrase })
    device.sweep()
    expect(gating.isOpen).to.be.true
    latch.release()
    await TH.expectBad(attempting, 'disabled')
    await prompting
    expect(gating.isOpen).to.be.false
  })

  it("refuses a gating launched after it", async () => {
    const device = TH.makeDevice()
    device.sweep()
    await TH.expectRefusal(Bank.launchBirthBankPrompt(device), 'disabled')
    expect(device.openGating).to.be.null
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

  it("does nothing on a device with no bank, or a swept one", () => {
    const device = TH.makeDevice()
    expect(device.lock()).to.equal(device)
    device.sweep()
    expect(device.lock()).to.equal(device)
  })
})

/** A listener on `device`'s snapshot that keeps each snapshot it reads. */
function snapshotsOf(device: Device): DeviceSnapshot[] {
  const snapshots: DeviceSnapshot[] = []
  device.subscribe(() => { snapshots.push(device.getSnapshot()) })
  return snapshots
}

describe("device.getSnapshot() and device.subscribe(listener)", () => {
  it("shows the pending bank and no gating before a bank is made", () => {
    const device = TH.makeDevice()
    expect(device.getSnapshot()).to.deep.equal({ bank: PendingBank, gating: null })
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

  it("shows the gating open on it, under a gatingseq that grows as each gating opens and ends", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const first = TH.expectRefusal(bank.launchUnlockBankPrompt(), 'dismissed')
    expect(device.getSnapshot().gating).to.deep.equal({ gatingkind: 'unlock_bank', gatingseq: 3, isAttempting: false })
    device.openGating!.dismiss()
    await first
    expect(device.getSnapshot().gating).to.be.null
    const second = TH.expectRefusal(bank.launchUnlockBankPrompt(), 'dismissed')
    expect(device.getSnapshot().gating).to.include({ gatingseq: 5 })
    device.openGating!.dismiss()
    await second
  })

  it("shows an attempt under way until it is refused, and carries no cleartext", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const prompting = TH.expectRefusal(bank.launchUnlockBankPrompt(), 'dismissed')
    const snapshots = snapshotsOf(device)
    const passphraseClear = 'not the passphrase, though long enough'
    await TH.expectBad(bank.tryAttemptUnlock({ passphraseClear }), 'wrong_passphrase')
    expect(snapshots.map(({ gating }) => gating?.isAttempting)).to.deep.equal([true, false])
    expect(JSON.stringify(device.getSnapshot())).not.to.include(passphraseClear)
    device.openGating!.dismiss()
    await prompting
  })

  it("shows the gating gone, and the bank unlocked, once an attempt lands", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const prompting = bank.launchUnlockBankPrompt()
    await TH.expectGood(bank.tryAttemptUnlock({ passphraseClear: TH.TestPassphrase }))
    await prompting
    expect(device.getSnapshot()).to.deep.equal({ bank: bank.getSnapshot(), gating: null })
    expect(device.getSnapshot().bank).to.include({ stage: 'unlocked' })
  })

  it("shows its bank swept once it is swept, and its gating gone", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const prompting = TH.expectRefusal(bank.launchUnlockBankPrompt(), 'dismissed')
    device.sweep()
    await prompting
    expect(device.getSnapshot().gating).to.be.null
    expect(device.getSnapshot().bank).to.include({ stage: 'swept', isEnded: true })
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

  it("warns of each on the device's logger by default, and once the device is swept, in place of the host's", async () => {
    const warn = vi.fn()
    const onBadNews = vi.fn()
    const device = TH.makeDevice({}, { logger: { log: vi.fn(), warn, error: vi.fn() }, onBadNews })
    warn.mockClear()
    device.sweep()
    device.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => warn.mock.calls.length === 1)
    expect(warn.mock.calls[0]?.slice(0, 2)).to.deep.equal(["Down.", { oplabel: 'Device.onBadNews', refusalkind: 'storage_unavailable' }])
    expect(onBadNews).not.toHaveBeenCalled()
    expect(DefaultOnBadNews).to.be.a('function')
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

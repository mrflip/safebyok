/** The device: its options, the host's functions it wraps, and its sweep, over its MemoryVaultDB. */

import { QueryClient } from '@tanstack/query-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
// fake-indexeddb installs IndexedDB's globals, for the device database browserOpts() opens: no browser.
import 'fake-indexeddb/auto'
import { Consts, Errors, Phrases } from 'safebyok-big/internals'
import { browserOpts } from '../../src/browser'
import { Bank } from '../../src/models/bank'
import { DefaultLeaseMillis, DefaultOnBadNews, Device, tellBadNewsTo } from '../../src/models/device'
import { BirthGating } from '../../src/models/gating'
import { VaultMinder } from '../../src/minding/vault-minder'
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

  it("refuses a queryCacheOpts the minder refuses, and gives its minder the one it is given", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({}, { queryCacheOpts: { retry: 3 } } as never), 'bad_record')
    expect(TH.makeDevice({}, { queryCacheOpts: { staleTime: 5 } }).minder).to.be.an('object')
  })

  it("refuses a queryClient VaultMinder.makeClient did not make, and gives its minder the one it is given", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({}, { queryClient: new QueryClient() }), 'bad_record')
    const queryClient = VaultMinder.makeClient()
    expect(TH.makeDevice({}, { queryClient }).minder.queryClient).to.equal(queryClient)
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

/** The stages `device`'s snapshot shows, from now on, each once in a row. */
function stagesOf(device: Device): string[] {
  const stages = [device.getSnapshot().bank.stage as string]
  device.subscribe(() => { const { stage } = device.getSnapshot().bank; if (stages.at(-1) !== stage) { stages.push(stage) } })
  return stages
}

describe("device.hello()", () => {
  it("finds the bank stored for its scope and shows it locked, with its vault", async () => {
    const born   = await TH.buildBornBank()
    const device = TH.makeDevice({}, { vaultDB: born.device.vaultDB })
    const stages = stagesOf(device)
    await device.hello()
    expect(stages).to.deep.equal(['starting', 'locked'])
    expect(device.bank).to.be.instanceOf(Bank)
    expect(device.bank!.scope).to.deep.equal(born.bank.scope)
    expect(device.vault!.bank).to.equal(device.bank)
    expect(device.vault!.minder).to.equal(device.minder)
    await TH.expectGood(device.bank!.gate.tryUnlock({ passphraseCleartext: TH.TestPassphrase }))
    expect(device.getSnapshot().bank).to.include({ stage: 'unlocked' })
  })

  it("shows its bank unborn where none is stored, and the bank born on it after", async () => {
    const device = TH.makeDevice()
    const stages = stagesOf(device)
    await device.hello()
    expect(device.getSnapshot().bank).to.include({ stage: 'unborn', isLocked: true, lastErr: null })
    expect(device.bank).to.be.null
    expect(device.vault).to.be.null
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
    expect(stages).to.deep.equal(['starting', 'unborn', 'unlocked'])
    expect(device.bank).to.equal(bank)
    expect(device.vault!.bank).to.equal(bank)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
  })

  it("shows the refusal as failed where its bank cannot be read, and never rejects", async () => {
    const born    = await TH.buildBornBank()
    const vaultDB = born.device.vaultDB as MemoryVaultDB
    vaultDB._cheat_things(born.bank.scope).set('bank', { mangled: true })
    const device = TH.makeDevice({}, { vaultDB })
    await device.hello()
    const shown = device.getSnapshot().bank
    expect(shown).to.include({ stage: 'failed', isLocked: true })
    expect(shown.lastErr).to.include({ refusalkind: 'storage_issue' })
    expect(Object.isFrozen(shown.lastErr)).to.be.true
    expect(device.bank).to.be.null
  })

  it("shows failed, and does not reject, where its vaultDB cannot watch", async () => {
    const vaultDB = new MemoryVaultDB()
    vi.spyOn(vaultDB, 'watch').mockImplementation(() => { throw new Error('no watching here') })
    const device = TH.makeDevice({}, { vaultDB })
    await device.hello()
    expect(device.getSnapshot().bank).to.include({ stage: 'failed' })
    expect(device.getSnapshot().bank.lastErr).to.not.be.null
  })

  it("answers the same promise each time, and keeps the bank born on it since", async () => {
    const { bank, device } = await TH.buildBornBank()
    const helloing = device.hello()
    expect(device.hello()).to.equal(helloing)
    await helloing
    expect(device.bank).to.equal(bank)
  })
})

describe("device.birthGating(cleartexts)", () => {
  it("refuses until `hello` answers", async () => {
    const device = TH.makeDevice()
    const helloing = device.hello()
    TH.expectSyncRefusal(() => device.birthGating({ passphraseCleartext: TH.TestPassphrase }), 'disabled')
    await helloing
    expect(device.birthGating({ passphraseCleartext: TH.TestPassphrase })).to.be.instanceOf(BirthGating)
  })

  it("zeroes the passkey answer when it refuses before `hello` answers", () => {
    const passkeyCleartext = TH.passkeyAnswerOf()
    TH.expectSyncRefusal(() => TH.makeDevice().birthGating({ passphraseCleartext: TH.TestPassphrase, passkeyCleartext }), 'disabled')
    expect(TH.isZeroed(passkeyCleartext.prfBytes)).to.be.true
  })

  it("keeps no bank where the birth is refused", async () => {
    const device = TH.makeDevice({}, { strengthChecker: () => ({ strong: false, reason: 'too short' }) })
    await device.hello()
    await TH.expectRefusal(device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt(), 'weak_passphrase')
    expect(device.bank).to.be.null
    expect(device.getSnapshot().bank).to.include({ stage: 'unborn' })
  })
})

describe("device.sweep()", () => {
  it("sweeps its bank, the device staying enabled and showing it swept, and never throws", async () => {
    const { bank, device } = await TH.buildBornBank()
    expect(device.sweep()).to.equal(device)
    expect(bank.isEnabled).to.be.false
    expect(device.isEnabled).to.be.true
    expect(device.getSnapshot().bank).to.include({ stage: 'swept' })
    expect(device.sweep()).to.equal(device)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
  })

  it("rejects a call waiting for an `unlock` gating with its bank's end cause", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const ensuring = bank.ensureUnlocked()
    device.sweep()
    expect(await TH.expectRefusal(ensuring, 'disabled')).to.equal(bank.endCause)
  })

  it("leaves the device able to judge a passphrase", async () => {
    const { device } = await TH.buildBornBank()
    device.sweep()
    expect(await device.judgeStrength(TH.TestPassphrase)).to.deep.equal({ strong: true })
  })

  it("does nothing on a device with no bank, which births one after it", async () => {
    const device = TH.makeDevice()
    await device.hello()
    device.sweep()
    const bank = await device.birthGating({ passphraseCleartext: TH.TestPassphrase }).attempt()
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

  it("shows its own bank still when another bank is made over the same vaultDB, which it is not told of", async () => {
    const born = await TH.buildBornBank()
    const { bank, device } = born
    const other = TH.makeStoredBank(born)
    const snapshots = snapshotsOf(device)
    other.lock()
    expect(snapshots).to.have.lengthOf(0)
    expect(device.getSnapshot().bank).to.equal(bank.getSnapshot())
    expect(device.bank).to.equal(bank)
  })

  it("shows an `unlock` gating wanted while a call waits for one, and carries no cleartext", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.lock()
    const snapshots = snapshotsOf(device)
    const ensuring = bank.ensureUnlocked()
    const passphraseCleartext = 'not the passphrase, though long enough'
    await TH.expectRefusal(bank.gate.unlock({ passphraseCleartext }), 'wrong_passphrase')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await ensuring
    expect(snapshots.map(({ bank: { stage, isUnlockWanted } }) => ({ stage, isUnlockWanted }))).to.deep.equal([
      { stage: 'locked', isUnlockWanted: true },
      { stage: 'unlocked', isUnlockWanted: false },
    ])
    expect(JSON.stringify(snapshots)).not.to.include(passphraseCleartext)
  })

  it("shows its bank swept once it is swept, and tells its subscribers so", async () => {
    const { bank, device } = await TH.buildBornBank()
    const snapshots = snapshotsOf(device)
    bank.sweep()
    expect(device.getSnapshot().bank).to.include({ stage: 'swept' })
    expect(snapshots.at(-1)).to.equal(device.getSnapshot())
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

  it("stops telling a listener once it unsubscribes", async () => {
    const { bank, device } = await TH.buildBornBank()
    const listener = vi.fn()
    const unsubscribe = device.subscribe(listener)
    unsubscribe()
    bank.lock()
    expect(listener).not.toHaveBeenCalled()
  })

  it("refuses a listener that is not a function", async () => {
    const { device } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => device.subscribe(null as never), 'bad_record')
  })
})

describe("device.tellBadNews(badnews)", () => {
  it("passes a refusal on unchanged, wraps anything else thrown as an unexpected error, and drops the news of a thing disabled", async () => {
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
  it("calls the handler with each item of news and its device", async () => {
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

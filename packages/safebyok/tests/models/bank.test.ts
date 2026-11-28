/** The bank: the Things `bank.makeThing` makes of each record, the gate, root box and bank stamp it finds in its VaultMinder, its snapshot, the lease its tabs share, what it announces to `onLifecycle`, and its host members. */

import { noop } from 'es-toolkit'
import { type Mock, afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Clock, Consts, Errors, SX } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import { Box } from '../../src/models/box'
import type { Device } from '../../src/models/device'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import * as Throwers from '../../src/refusals/throwers'
import { Lifeseq } from '../../src/shapes/primitives'
import { type BadNews, type DeviceEvent, type DeviceOpts, type LifecycleHandler, type Lifecyclekind, type BankSnapshot, PendingBank, bankStageVals, leasekindVals } from '../../src/shapes/shapes-bankish'
import type { LeaseRecord } from '../../src/shapes/shapes-stamps'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { SeenThing } from '../../src/shapes/shapes-vault-event'
import { readAtOf, readTcNow } from '../../src/storage/agerank'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { oneWatchVaultDB } from '../../src/storage/one-watch-vault-db'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** A device signed in to a bank none of whose records it has heard of. */
async function signedInDevice(): Promise<Device> {
  const device = TH.makeDevice()
  await device.signin(TH.WorldScope.userid)
  return device
}

describe("bank.makeThing(begun)", () => {
  it("makes a Gate or a Box by the modelkind of the item event's labelpath, with the record it received", () => {
    const { bank } = TH.makeDevice()
    const [gateRecord, boxRecord] = [TH.gateThingOf(), TH.boxThingOf()]
    const [gate, box] = [bank.makeThing(TH.thingEventOf(gateRecord)), bank.makeThing(TH.thingEventOf(boxRecord))]
    expectTypeOf(gate).toEqualTypeOf<Gate>()
    expectTypeOf(box).toEqualTypeOf<Box>()
    expect([gate, box].map((thing) => thing.constructor)).to.deep.equal([Gate, Box])
    expect([gate.pickle(), box.pickle()]).to.deep.equal([gateRecord, boxRecord])
  })

  it("makes the Thing of the shell, holding it, which has received nothing", () => {
    const thing = TH.makeDevice().bank.makeThing(TH.gateShellOf())
    expect(thing).to.be.instanceOf(Gate)
    expect(thing.pickle()).to.deep.equal(TH.gateShellOf())
  })

  it("makes the Thing of an item event of a sparse record over its kind's shell, which it holds", () => {
    const sparse = TH.boxSparseOf(TH.boxThingOf())
    const thing = TH.makeDevice().bank.makeThing(TH.thingEventOf<BoxRecord>(sparse))
    expect(thing).to.be.instanceOf(Box)
    expect(thing.pickle()).to.deep.equal(Shell.inParentLivesOf(sparse))
  })

  const RefusedCases = [
    [TH.thingEventOf({ ...TH.gateThingOf(), labelpath: 'vault/main' } as never), 'bad_record', 'an item event at a labelpath of no kind of Thing'],
    [TH.thingEventOf({ ...TH.gateThingOf(), labelpath: 'other', label: 'other' }), 'bad_record', "an item event of a gate at another labelpath than its banklabel"],
    [TH.thingEventOf({ ...TH.boxThingOf(), userid: 'u2' }),                 'record_conflict', "an item event of a record of another bank than its device's"],
    [Shell.inParentLivesOf({ ...TH.boxThingOf(), banklabel: 'other' }),    'record_conflict', "the shell of another bank than its device's"],
    [TH.boxThingOf(),                                                       'bad_record',      'a whole record with no item event'],
    [null,                                                                  'bad_record',      'nothing at all'],
  ] as const

  for (const [begun, refusalkind, blurb] of RefusedCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice().bank.makeThing(begun as never), refusalkind)
    })
  }
})

describe("bank.gate, bank.rootBox, bank.life, bank.banktok and bank.scope", () => {
  it("are the gate and root box its VaultMinder caches, and the life and banktok of its gate", async () => {
    const { device, bank, gateRecord } = await TH.buildBornBank()
    expect(device.bank).to.equal(bank)
    expect(bank.gate).to.equal(bank.vaultMinder!.thingAt(TH.GateScope))
    expect(bank.rootBox).to.deep.equal(bank.vaultMinder!.thingAt(TH.RootScope)!.pickle())
    expect(bank.life).to.deep.equal(TH.WorldBankLife)
    expect(bank.banktok).to.equal(gateRecord.banktok).and.equal(TH.WorldBankLife.banktok)
    expect(bank.gate.life).to.deep.equal(TH.WorldGateLife)
    expect(bank.scope).to.deep.equal(device.scope)
  })

  it("keeps its gate at the labelpath of its banklabel", async () => {
    const { bank, gateRecord } = await TH.buildBornBank()
    expect(gateRecord.labelpath).to.equal(bank.scope.banklabel)
    expect(bank.gate.labelpath).to.equal(bank.scope.banklabel)
  })

  it("refuses its gate before signin, and its life and root box while each models the shell", async () => {
    TH.expectSyncRefusal(() => TH.makeDevice({ userid: null }).bank.gate, 'absent_vault')
    const { bank } = await signedInDevice()
    expect(bank.gate.pickle()).to.deep.equal(TH.gateShellOf())
    expect(bank.banktok).to.equal(SX.VoidLifeTok)
    TH.expectSyncRefusal(() => bank.life)
    TH.expectSyncRefusal(() => bank.rootBox)
  })
})

describe("bank.demandVaultMinder()", () => {
  it("answers the VaultMinder its signin was handed", async () => {
    const { bank } = await signedInDevice()
    expect(bank.demandVaultMinder()).to.equal(bank.vaultMinder)
  })

  it("refuses before signin", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({ userid: null }).bank.demandVaultMinder(), 'absent_vault')
  })
})

describe("bank.demandRootsLive()", () => {
  it("answers the bank whose gate and root box are live", async () => {
    const { device, bank } = await TH.buildBornBank()
    expect(device.bank.demandRootsLive()).to.equal(bank)
  })

  it("refuses a bank that has heard of neither of them", async () => {
    const { bank } = await signedInDevice()
    TH.expectSyncRefusal(() => bank.demandRootsLive(), 'absent_thing')
  })
})

/** Each order the gate and the root box of a bank born elsewhere may arrive in, one at a time. */
const RootOrderCases = [
  [[TH.GateScope, TH.RootScope], 'the order an answer tells them in'],
  [[TH.RootScope, TH.GateScope], 'the root box first'],
] as const

describe("bank.getSnapshot() and bank.subscribe(listener)", () => {
  it("shows the pending bank from signin until a bank is found", () => {
    const { bank } = TH.makeDevice()
    expect(bank.getSnapshot()).to.equal(PendingBank)
    expect(Object.isFrozen(bank.getSnapshot())).to.be.true
  })

  it("shows a born bank unlocked, its lease ending the device's lease length after it was proved", async () => {
    const { device } = await TH.buildBornBank()
    const { bank } = device
    expect(bank.getSnapshot()).to.deep.equal({ stage: 'unlocked', isLocked: false, isEnded: false, endCause: null, leaseEndsAt: TH.T0 + device.leaseMillis, lastErr: null, isUnlockWanted: false })
    expect(Object.isFrozen(bank.getSnapshot())).to.be.true
  })

  it("tells its subscribers once each for a lock, an `unlock` gating and a disconnect, which locks, the snapshot the same object between them", async () => {
    const { bank } = await TH.buildBornBank()
    const counter = TH.countCalls(bank.subscribe)
    const unlocked = bank.getSnapshot()
    expect(bank.getSnapshot()).to.equal(unlocked)

    bank.lock()
    const locked = bank.getSnapshot()
    expect(counter.calls).to.eq(1)
    expect(locked).to.deep.equal({ stage: 'locked', isLocked: true, isEnded: false, endCause: null, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(bank.getSnapshot()).to.equal(locked)

    await bank.gate.gatingUnlockAttempt({ passphrase: TH.TestPassphrase })
    expect(counter.calls).to.eq(2)
    expect(bank.getSnapshot()).to.deep.equal(unlocked)

    bank.device.disconnect()
    expect(counter.calls).to.eq(3)
    expect(bank.getSnapshot()).to.deep.equal(locked)
  })

  it("tells no subscriber of a call that changes nothing in the snapshot: a second lock, a disconnect or connect while locked, a wrong passphrase, or a box landing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const counter = TH.countCalls(bank.subscribe)
    const unlocked = bank.getSnapshot()
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(bank.getSnapshot()).to.equal(unlocked)
    bank.lock()
    bank.lock()
    await TH.expectRefusal(bank.gate.gatingUnlockAttempt({ passphrase: 'not the passphrase' }), 'wrong_passphrase')
    bank.device.disconnect()
    bank.device.connect()
    expect(counter.calls).to.eq(1)
  })

  it("shows an `unlock` gating wanted while a call waits for one, and carries no cleartext", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    const snapshots: BankSnapshot[] = []
    bank.subscribe(() => { snapshots.push(bank.getSnapshot()) })
    const ensuring = bank.ensureUnlocked()
    const passphraseCleartext = 'not the passphrase, though long enough'
    await TH.expectRefusal(bank.gate.unlock({ passphraseCleartext }), 'wrong_passphrase')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await ensuring
    expect(snapshots.map(({ stage, isUnlockWanted }) => ({ stage, isUnlockWanted }))).to.deep.equal([
      { stage: 'locked', isUnlockWanted: true },
      { stage: 'unlocked', isUnlockWanted: false },
    ])
    expect(JSON.stringify(snapshots)).not.to.include(passphraseCleartext)
  })

  it("shows the bank disabled once its device is disabled, telling its subscribers once", async () => {
    const { bank, device } = await TH.buildBornBank()
    const counter = TH.countCalls(bank.subscribe)
    device.disable()
    expect(counter.calls).to.eq(1)
    expect(bank.getSnapshot()).to.deep.equal({ stage: 'disabled', isLocked: true, isEnded: true, endCause: bank.endCause, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(bank.getSnapshot().endCause).to.equal(device.endCause).and.include({ refusalkind: 'disabled' })
  })

  it("tells no subscriber once disabled", async () => {
    const { bank, device } = await TH.buildBornBank()
    device.disable()
    const disabled = bank.getSnapshot()
    const counter = TH.countCalls(bank.subscribe)
    bank.lock()
    device.connect()
    device.disconnect()
    device.disable()
    expect(counter.calls).to.eq(0)
    expect(bank.getSnapshot()).to.equal(disabled)
  })

  it("shows only stages that bankStageVals lists", async () => {
    const { bank } = await TH.buildBornBank()
    const snapshots = [bank.getSnapshot()]
    bank.lock()
    snapshots.push(bank.getSnapshot())
    bank.device.disable()
    snapshots.push(bank.getSnapshot())
    expect(snapshots.map(({ stage }) => stage)).to.deep.equal(['unlocked', 'locked', 'disabled'])
    expect(bankStageVals).to.include.members(snapshots.map(({ stage }) => stage))
  })

  it("stops telling a listener once it unsubscribes", async () => {
    const { bank } = await TH.buildBornBank()
    const listener = vi.fn()
    const unsubscribe = bank.subscribe(listener)
    bank.lock()
    unsubscribe()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(listener).toHaveBeenCalledOnce()
  })

  it("tells every subscriber when one throws, and passes the throw to the device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.subscribe(() => { throw new Error('a bug in the host') })
    const listener = vi.fn()
    bank.subscribe(listener)
    bank.lock()
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'unexpected_error' })
  })

  it("refuses a listener that is not a function", async () => {
    const { bank } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => bank.subscribe('call me' as never), 'bad_record')
  })
})

describe("a bank's stage as its roots arrive one at a time", () => {
  for (const [order, blurb] of RootOrderCases) {
    it(`shows unborn until the last root lands, then locked, in ${blurb}`, async () => {
      const born   = await TH.buildBornBank()
      const minder = born.device.bank.demandVaultMinder()
      const device = TH.makeDevice()
      await device.signin(TH.WorldScope.userid)
      expect(device.bank.getSnapshot().stage).to.eq('unborn')
      const stages: string[] = []
      device.bank.subscribe(() => { stages.push(device.bank.getSnapshot().stage) })
      for (const root of order) {
        const record = minder.thingAt({ ...TH.WorldScope, ...root })!.pickle() as SeenThing
        device.bank.demandVaultMinder().receive({ ...TH.itemEventOf(record), sourcelabel: 'other_device', read_tc: readTcNow() })
      }
      expect(stages).to.deep.equal(['locked'])
      expect([device.bank, device.vault]).to.not.include(null)
    })
  }
})

// uuid's v7 never mints a read_tc earlier than the last, whatever the clock says.
/** Set the clock past every read_tc minted so far */
function setClockPastEveryReadTc(): void {
  vi.setSystemTime(readAtOf(readTcNow()) + 1)
}

describe("a bank's softlock, near its lease's end", () => {
  it("turns on softlockMillis before the lease ends, on the device's bank and gate alike", async () => {
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 600, softlockMinutes: 10 }) })
    expect(bank.leaseEndsAt).to.eq(TH.T0 + (600 * Consts.MinuteMillis))
    expect([bank.isSoftlocked, bank.gate.isSoftlocked]).to.deep.equal([false, false])
    vi.setSystemTime(bank.leaseEndsAt! - (10 * Consts.MinuteMillis) - 1)
    expect(bank.isSoftlocked).to.be.false
    vi.setSystemTime(bank.leaseEndsAt! - (10 * Consts.MinuteMillis))
    expect([bank.isSoftlocked, bank.gate.isSoftlocked]).to.deep.equal([true, true])
    expect([bank.isLocked, bank.getSnapshot().stage]).to.deep.equal([false, 'unlocked'])
  })

  it("is on while the bank is locked", async () => {
    const { bank } = await TH.buildBornBank()
    bank.lock()
    expect(bank.isSoftlocked).to.be.true
  })

  it("has ensureUnlocked wait, though the bank shows unlocked, for an `unlock` gating that renews the lease", async () => {
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 600 }) })
    const nearEnd = bank.leaseEndsAt! - Consts.MinuteMillis
    vi.setSystemTime(nearEnd)
    const ensuring = bank.ensureUnlocked()
    expect(bank.getSnapshot()).to.include({ stage: 'unlocked', isUnlockWanted: true })
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await ensuring).to.equal(bank)
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
    expect([bank.leaseEndsAt, bank.isSoftlocked]).to.deep.equal([nearEnd + (600 * Consts.MinuteMillis), false])
  })

  it("leaves a call that wants the bank unlocked alone before the softlock: ensureUnlocked resolves at once", async () => {
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 600 }) })
    vi.setSystemTime(bank.leaseEndsAt! - (11 * Consts.MinuteMillis))
    expect(await bank.ensureUnlocked()).to.equal(bank)
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })
})

describe("a bank's janitor", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("locks the bank at its first tick once the lease has ended", async () => {
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 25, janitorMinutes: 10 }) })
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(bank.isLocked).to.be.false
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect([bank.isLocked, bank.getSnapshot().stage]).to.deep.equal([true, 'locked'])
  })

  it("locks a bank unlocked while disconnected once the lease has ended", async () => {
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 25, janitorMinutes: 10 }) })
    device.disconnect()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(device.bank.isLocked).to.be.false
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(device.bank.isLocked).to.be.true
  })

  it("re-reads the roots at the first tick after the gate goes stale", async () => {
    setClockPastEveryReadTc()
    const vaultDB = new MemoryVaultDB()
    const tryGetBank = vi.spyOn(vaultDB, 'tryGetBank')
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, gateStaleMinutes: 25, janitorMinutes: 10 }) })
    const asked = tryGetBank.mock.calls.length
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(tryGetBank.mock.calls.length - asked).to.eq(0)
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(tryGetBank.mock.calls.length - asked).to.eq(1)
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(tryGetBank.mock.calls.length - asked).to.eq(1)
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(tryGetBank.mock.calls.length - asked).to.eq(2)
  })

  it("tells the device's onBadNews where the re-read is refused, and keeps the bank as it was", async () => {
    setClockPastEveryReadTc()
    const vaultDB = new MemoryVaultDB()
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, onBadNews, gateStaleMinutes: 5, janitorMinutes: 10 }) })
    vi.spyOn(vaultDB, 'tryGetBank').mockRejectedValue(new Error('the network is down'))
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(bank.getSnapshot().stage).to.eq('unlocked')
  })

  it("re-reads no stale gate while disconnected, and does again once connected", async () => {
    setClockPastEveryReadTc()
    const vaultDB = new MemoryVaultDB()
    const tryGetBank = vi.spyOn(vaultDB, 'tryGetBank')
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, gateStaleMinutes: 5, janitorMinutes: 10 }) })
    device.disconnect()
    const asked = tryGetBank.mock.calls.length
    await vi.advanceTimersByTimeAsync(30 * Consts.MinuteMillis)
    expect(tryGetBank.mock.calls.length - asked).to.eq(0)
    device.connect()
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(tryGetBank.mock.calls.length - asked).to.be.at.least(1)
  })

  it("starts the watch at its next tick, where it threw as it started", async () => {
    const vaultDB = new MemoryVaultDB()
    const onBadNews = vi.fn()
    vi.spyOn(vaultDB, 'watch').mockImplementationOnce(() => { throw new Error('the socket is down') })
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, onBadNews, janitorMinutes: 10 }) })
    expect([bank.demandVaultMinder().isWatching, onBadNews.mock.calls.length]).to.deep.equal([false, 1])
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect([bank.demandVaultMinder().isWatching, onBadNews.mock.calls.length]).to.deep.equal([true, 1])
  })

  it("starts the watch at its next tick, where a OneWatchVaultDB's wrapped watch threw as it started", async () => {
    vi.stubGlobal('navigator', { locks: TH.fakeLockManager() })
    const memory = new MemoryVaultDB()
    const innerWatch = vi.spyOn(memory, 'watch').mockImplementationOnce(() => { throw new Error('the socket is down') })
    const onBadNews = vi.fn()
    const vaultDB = oneWatchVaultDB(memory)
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, onBadNews, janitorMinutes: 10 }) })
    await vi.advanceTimersByTimeAsync(0)
    expect([bank.demandVaultMinder().isWatching, onBadNews.mock.calls.length]).to.deep.equal([false, 1])
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect([bank.demandVaultMinder().isWatching, innerWatch.mock.calls.length, onBadNews.mock.calls.length]).to.deep.equal([true, 2, 1])
    bank.demandVaultMinder().disconnect()
  })

  it("starts no watch while disconnected", async () => {
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { janitorMinutes: 10 }) })
    device.disconnect()
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(device.bank.demandVaultMinder().isWatching).to.be.false
  })

  it("runs from sign-in, and through a disconnect", async () => {
    const device = TH.makeDevice({ userid: null })
    const ante = vi.getTimerCount()
    await device.signin(TH.WorldScope.userid)
    expect(vi.getTimerCount() - ante).to.eq(1)
    device.disconnect()
    expect(vi.getTimerCount() - ante).to.eq(1)
  })

  it("stops for good once the device is disabled", async () => {
    const device = TH.makeDevice({ userid: null })
    const ante = vi.getTimerCount()
    await device.signin(TH.WorldScope.userid)
    device.disable()
    device.connect()
    expect(vi.getTimerCount() - ante).to.eq(0)
  })

  it("does not start on a device disabled before it signs in", async () => {
    const device = TH.makeDevice({ userid: null })
    const ante = vi.getTimerCount()
    device.disable()
    await device.signin(TH.WorldScope.userid)
    expect(vi.getTimerCount() - ante).to.eq(0)
  })
})

/** Two tabs of one browser: a bank born unlocked in the first, over a vaultDB and a deviceDB the second shares, which has signed in. */
interface TwoTabs {
  first:    TH.BornBank
  second:   Device
  deviceDB: MemoryDeviceDB
  vaultDB:  MemoryVaultDB
}

/** {@link TwoTabs}, each device made with `opts` too, once the second's bank has done what its sign-in started. */
async function twoTabs(opts: Partial<DeviceOpts> = {}): Promise<TwoTabs> {
  const [vaultDB, deviceDB] = [new MemoryVaultDB(), new MemoryDeviceDB()]
  const first  = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB, ...opts }) })
  const second = TH.makeDevice({}, { vaultDB, deviceDB, ...opts })
  await second.signin(TH.WorldScope.userid)
  await settle()
  return { first, second, deviceDB, vaultDB }
}

/** Let what is under way finish: every promise settled, every timer due now run. */
async function settle(): Promise<void> { await vi.advanceTimersByTimeAsync(0) }

/** The lease record `deviceDB` has for {@link TH.WorldScope}'s main gate. */
async function storedLeaseOf(deviceDB: MemoryDeviceDB): Promise<LeaseRecord | null> { return await deviceDB.peekLease(TH.WorldLeaseScope) }

/** A device of another browser over `vaultDB`, its own deviceDB, unlocked, whose passphrase it then replaces: a gate change the tabs of `vaultDB` hear of. */
async function changeGateElsewhere(vaultDB: MemoryVaultDB): Promise<void> {
  const elsewhere = TH.makeDevice({}, { vaultDB })
  await elsewhere.signin(TH.WorldScope.userid)
  const {gate} = elsewhere.bank
  await gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'a different passphrase, just as long' })
  await settle()
}

describe("a lease shared by the tabs of one deviceDB", () => {
  it("unlocks a tab as it signs in under the lease another tab stowed", async () => {
    const { first, second } = await twoTabs()
    expect(second.bank.getSnapshot().stage).to.eq('unlocked')
    expect(second.bank.leaseLoggable).to.deep.equal(first.device.bank.leaseLoggable)
    expect(second.bank.leaseEndsAt).to.eq(first.device.bank.leaseEndsAt)
  })

  it("unlocks a tab from its root shelf before the vaultDB answers", async () => {
    const [vaultDB, deviceDB, rootShelf] = [new MemoryVaultDB(), new MemoryDeviceDB(), new TH.MemoryShelf()]
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB, rootShelf }) })
    vi.spyOn(vaultDB, 'tryGetBank').mockReturnValue(new Promise(noop))
    const reloaded = TH.makeDevice({}, { vaultDB, deviceDB, rootShelf })
    await settle()
    expect(reloaded.bank.getSnapshot().stage).to.eq('unlocked')
  })

  it("follows an unlock in one tab to the other, resuming a call waiting there", async () => {
    const { first, second } = await twoTabs()
    first.bank.lock()
    await settle()
    const ensuring = second.bank.ensureUnlocked()
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await ensuring).to.equal(second.bank)
    expect(second.bank.getSnapshot()).to.include({ stage: 'unlocked', isUnlockWanted: false })
  })

  it("locks every tab at a lock in one, leaving the lease's tombstone stored", async () => {
    const { first, second, deviceDB } = await twoTabs()
    second.lock()
    await settle()
    expect([first.device.bank.isLocked, second.bank.isLocked]).to.deep.equal([true, true])
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'x', lifeseq: Lifeseq.ofLifenum(1) })
  })

  it("takes up a renewal made in another tab, ending when it ends", async () => {
    const { first, second } = await twoTabs()
    vi.setSystemTime(TH.T0 + Consts.MinuteMillis)
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect(second.bank.leaseEndsAt).to.eq(TH.T0 + Consts.MinuteMillis + second.leaseMillis)
  })

  it("starts the next life at an unlock after a lock in any tab, which every tab takes up", async () => {
    const { first, second, deviceDB } = await twoTabs()
    second.lock()
    await settle()
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2), born_at: TH.T0 })
    expect(second.bank.isUnlocked).to.be.true
  })

  it("leaves a tab locked as it signs in where the lease stored has passed its end", async () => {
    const [vaultDB, deviceDB] = [new MemoryVaultDB(), new MemoryDeviceDB()]
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB }) })
    device.disconnect()
    vi.setSystemTime(TH.T0 + device.leaseMillis)
    const later = TH.makeDevice({}, { vaultDB, deviceDB })
    await later.signin(TH.WorldScope.userid)
    await settle()
    expect(later.bank.getSnapshot().stage).to.eq('locked')
  })

  it("starts the next life at an unlock after the lease stored has passed its end", async () => {
    const [vaultDB, deviceDB] = [new MemoryVaultDB(), new MemoryDeviceDB()]
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB }) })
    device.disconnect()
    const later = TH.T0 + device.leaseMillis
    vi.setSystemTime(later)
    const reloaded = TH.makeDevice({}, { vaultDB, deviceDB })
    await reloaded.signin(TH.WorldScope.userid)
    await reloaded.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2), revseq: 2, born_at: later })
  })

  it("keeps its own lease where an older lease record rings", async () => {
    const onBadNews = vi.fn()
    const { first, second, deviceDB } = await twoTabs({ onBadNews })
    vi.setSystemTime(TH.T0 + Consts.MinuteMillis)
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    const endsAt = second.bank.leaseEndsAt
    deviceDB._cheat_leases().set(MemoryDeviceDB.ckeyOf(TH.WorldLeaseScope), await TH.liveLeaseRecordOf({ revseq: 0 }))
    await deviceDB.stowLease(TH.leaseTombstoneOf({ userid: 'u2' }))
    await settle()
    expect([first.device.bank.leaseEndsAt, second.bank.leaseEndsAt]).to.deep.equal([endsAt, endsAt])
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("softlocks the lease in every tab when the gate changes elsewhere, writing the revision once", async () => {
    const { first, second, deviceDB, vaultDB } = await twoTabs()
    await changeGateElsewhere(vaultDB)
    const softlockEnd = Clock.nowMillis() + second.softlockMillis
    expect([first.device.bank.leaseEndsAt, second.bank.leaseEndsAt]).to.deep.equal([softlockEnd, softlockEnd])
    expect([first.device.bank.isSoftlocked, second.bank.isSoftlocked]).to.deep.equal([true, true])
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(0), revseq: 1, ends_at: softlockEnd })
  })

  it("leaves the lease's end alone at a gate change where it comes before the softlock's", async () => {
    const { first, second, deviceDB, vaultDB } = await twoTabs()
    const nearEnd = first.device.bank.leaseEndsAt! - Consts.MinuteMillis
    vi.setSystemTime(nearEnd)
    const stow = vi.spyOn(deviceDB, 'stowLease')
    await changeGateElsewhere(vaultDB)
    expect(second.bank.leaseEndsAt).to.eq(nearEnd + Consts.MinuteMillis)
    expect(stow).not.toHaveBeenCalled()
  })

  it("softlocks a lease it takes up that cites an older revision of the gate", async () => {
    const [vaultDB, deviceDB] = [new MemoryVaultDB(), new MemoryDeviceDB()]
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB }) })
    device.disconnect()
    await changeGateElsewhere(vaultDB)
    const later = TH.makeDevice({}, { vaultDB, deviceDB })
    await later.signin(TH.WorldScope.userid)
    await settle()
    expect([later.bank.isUnlocked, later.bank.leaseEndsAt]).to.deep.equal([true, Clock.nowMillis() + later.softlockMillis])
  })

  it("leaves the gate stored as it is where a lease it takes up cites a newer revision of the gate", async () => {
    const { second, deviceDB, vaultDB } = await twoTabs()
    const gateStored = structuredClone(vaultDB._cheat_things(TH.WorldScope).gate.get(TH.GateScope.labelpath))
    const [stored, loggableBefore] = [await storedLeaseOf(deviceDB) as LiveOf<LeaseRecord>, second.bank.leaseLoggable]
    await deviceDB.stowLease({ ...stored, ...Lease.nextRevisionOf(stored), gate_revseq: stored.gate_revseq + 1, gate_revtok: TH.OtherRevtok })
    await settle()
    expect(vaultDB._cheat_things(TH.WorldScope).gate.get(TH.GateScope.labelpath)).to.deep.equal(gateStored)
    expect(second.bank.leaseLoggable).to.not.deep.equal(loggableBefore)
    expect([second.bank.isUnlocked, second.bank.isSoftlocked]).to.deep.equal([true, false])
  })

  it("drops the lease in a tab that disconnects alone, and takes it up again as it connects", async () => {
    const { first, second } = await twoTabs()
    second.disconnect()
    await settle()
    expect([first.device.bank.isUnlocked, second.bank.isUnlocked]).to.deep.equal([true, false])
    second.connect()
    await settle()
    expect(second.bank.isUnlocked).to.be.true
  })

  it("leaves the other tabs unlocked when one is disabled", async () => {
    const { first, second } = await twoTabs()
    second.disable()
    await settle()
    expect([first.device.bank.isUnlocked, second.bank.isLocked]).to.deep.equal([true, true])
  })

  it("locks every tab at the janitor's autolock in any one", async () => {
    const { first, second } = await twoTabs({ autolockMinutes: 25, janitorMinutes: 10 })
    await vi.advanceTimersByTimeAsync(30 * Consts.MinuteMillis)
    expect([first.device.bank.isLocked, second.bank.isLocked]).to.deep.equal([true, true])
  })

  it("tells onBadNews where the deviceDB refuses a stow, and keeps the lease in the tab", async () => {
    const onBadNews = vi.fn()
    const deviceDB = new MemoryDeviceDB()
    vi.spyOn(deviceDB, 'stowLease').mockRejectedValue(Throwers.deviceDBFailed('stowLease', new Error('the disk is full')))
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { deviceDB, onBadNews }) })
    await settle()
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable'])
    expect(device.bank.isUnlocked).to.be.true
  })

  it("tells onBadNews where the deviceDB refuses a peek as it connects, and stays as it was", async () => {
    const onBadNews = vi.fn()
    const deviceDB = new MemoryDeviceDB()
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { deviceDB, onBadNews }) })
    device.disconnect()
    vi.spyOn(deviceDB, 'peekLease').mockRejectedValue(Throwers.deviceDBFailed('peekLease', new Error('the disk is gone')))
    device.connect()
    await settle()
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable'])
    expect(device.bank.isLocked).to.be.true
  })

  it("keeps each tab's lease its own where the host gives no deviceDB", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB }) })
    const second = TH.makeDevice({}, { vaultDB })
    await second.signin(TH.WorldScope.userid)
    await settle()
    expect(second.bank.getSnapshot().stage).to.eq('locked')
  })
})

/** The kinds of lease announcement `onLifecycle` heard on `device`, in order. */
function kindsHeardOn(onLifecycle: Mock<LifecycleHandler>, device: Device): Lifecyclekind[] {
  return eventsHeardOn(onLifecycle, device).map(({ kind }) => kind).filter((kind) => (leasekindVals as readonly Lifecyclekind[]).includes(kind))
}

/** The events `onLifecycle` heard on `device`, in order. */
function eventsHeardOn(onLifecycle: Mock<LifecycleHandler>, device: Device): DeviceEvent[] {
  return onLifecycle.mock.calls.map(([event]) => event).filter((event) => event.device === device)
}

/** The crossings of stage `onLifecycle` heard on `device`, in order, each as `'from>to'`. */
function crossingsHeardOn(onLifecycle: Mock<LifecycleHandler>, device: Device): string[] {
  return eventsHeardOn(onLifecycle, device).filter((event): event is Extract<DeviceEvent, { kind: 'stage_crossed' }> => event.kind === 'stage_crossed').map(({ from, to }) => `${from}>${to}`)
}

/** How many times `onLifecycle` heard on `device` that its watch ended. */
function endingsHeardOn(onLifecycle: Mock<LifecycleHandler>, device: Device): number {
  return eventsHeardOn(onLifecycle, device).filter(({ kind }) => kind === 'watch_ended').length
}

describe("the host's onLifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("hears of the lease a tab takes up as it signs in, and nothing of the birth", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { first, second } = await twoTabs({ onLifecycle })
    expect([kindsHeardOn(onLifecycle, first.device), kindsHeardOn(onLifecycle, second)]).to.deep.equal([[], ['lease_taken_up']])
  })

  it("hears of a lock taken up from another tab, and nothing in the tab whose host locked", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { first, second } = await twoTabs({ onLifecycle })
    onLifecycle.mockClear()
    first.device.lock()
    await settle()
    expect([kindsHeardOn(onLifecycle, first.device), kindsHeardOn(onLifecycle, second)]).to.deep.equal([[], ['lock_taken_up']])
  })

  it("hears of an unlock taken up from another tab, and nothing in the tab whose host unlocked", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { first, second } = await twoTabs({ onLifecycle })
    first.device.lock()
    await settle()
    onLifecycle.mockClear()
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect([kindsHeardOn(onLifecycle, first.device), kindsHeardOn(onLifecycle, second)]).to.deep.equal([[], ['lease_taken_up']])
  })

  it("hears of no lock in a tab that signs in locked", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { first, vaultDB, deviceDB } = await twoTabs({ onLifecycle })
    first.device.lock()
    await settle()
    const later = TH.makeDevice({}, { vaultDB, deviceDB, onLifecycle })
    await later.signin(TH.WorldScope.userid)
    await settle()
    expect(kindsHeardOn(onLifecycle, later)).to.deep.equal([])
  })

  it("hears of the janitor's autolock", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 25, janitorMinutes: 10, onLifecycle }) })
    await vi.advanceTimersByTimeAsync(30 * Consts.MinuteMillis)
    expect(kindsHeardOn(onLifecycle, device)).to.deep.equal(['autolocked'])
  })

  it("hears of a softlock as the gate changes elsewhere", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const vaultDB = new MemoryVaultDB()
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, onLifecycle }) })
    await changeGateElsewhere(vaultDB)
    expect(kindsHeardOn(onLifecycle, device)).to.deep.equal(['softlocked'])
  })

  it("hears each crossing of stage, in the tab that crossed it and in the tab that followed", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { first, second } = await twoTabs({ onLifecycle })
    expect(crossingsHeardOn(onLifecycle, first.device)).to.deep.equal(['signed_out>starting', 'starting>unborn', 'unborn>locked', 'locked>unlocked'])
    expect(crossingsHeardOn(onLifecycle, second)).to.deep.equal(['signed_out>starting', 'starting>locked', 'locked>unlocked'])
    first.device.lock()
    await settle()
    expect(crossingsHeardOn(onLifecycle, first.device).slice(4)).to.deep.equal(['unlocked>locked'])
    expect(crossingsHeardOn(onLifecycle, second).slice(3)).to.deep.equal(['unlocked>locked'])
  })

  it("hears the crossing to disabled, with its from and to", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { second } = await twoTabs({ onLifecycle })
    onLifecycle.mockClear()
    second.disable()
    expect(eventsHeardOn(onLifecycle, second)).to.deep.equal([{ kind: 'stage_crossed', from: 'unlocked', to: 'disabled', device: second }])
  })

  it("hears no crossing where a root's news leaves the stage as it was", async () => {
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { second } = await twoTabs({ onLifecycle })
    onLifecycle.mockClear()
    second.bank.align()
    expect(eventsHeardOn(onLifecycle, second)).to.deep.equal([])
  })

  it("hears the watch's end once, and not again as the janitor starts it", async () => {
    vi.stubGlobal('navigator', { locks: TH.fakeLockManager() })
    const memory = new MemoryVaultDB()
    vi.spyOn(memory, 'watch').mockImplementationOnce(() => { throw new Error('the socket is down') })
    const onLifecycle = vi.fn<LifecycleHandler>()
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB: oneWatchVaultDB(memory), onBadNews: noop, onLifecycle, janitorMinutes: 10 }) })
    await vi.advanceTimersByTimeAsync(0)
    expect(endingsHeardOn(onLifecycle, device)).to.eq(1)
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect([device.bank.demandVaultMinder().isWatching, endingsHeardOn(onLifecycle, device)]).to.deep.equal([true, 1])
    device.bank.demandVaultMinder().disconnect()
  })

  it("may throw, and the tab still follows the stored lease", async () => {
    vi.stubGlobal('reportError', vi.fn())
    const onLifecycle = vi.fn<LifecycleHandler>(() => { throw new Error("The handler is broken.") })
    const { first, second } = await twoTabs({ onLifecycle })
    first.device.lock()
    await settle()
    expect(second.bank.isLocked).to.be.true
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect(second.bank.isUnlocked).to.be.true
  })
})

describe("the default onLifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it("logs each announcement at the level for news", async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const { first, second } = await twoTabs({ logger })
    vi.clearAllMocks()
    first.device.lock()
    await settle()
    const lines = logger.log.mock.calls as [string, Record<string, unknown>][]
    expect(lines.map(([message]) => message)).to.have.members([
      "The bank's stage went from 'unlocked' to 'locked'.", "The bank's stage went from 'unlocked' to 'locked'.", "The device's lease changed: lock_taken_up.",
    ])
    expect(lines.map(([, story]) => story)).to.deep.include({ oplabel: 'Device.onLifecycle', kind: 'stage_crossed', from: 'unlocked', to: 'locked' })
    expect(lines.map(([, story]) => story)).to.deep.include({ oplabel: 'Device.onLifecycle', kind: 'lock_taken_up' })
    expect([logger.warn, logger.error].map((logged) => logged.mock.calls.length)).to.deep.equal([0, 0])
    expect(second.bank.isLocked).to.be.true
  })
})

describe("bank.stats() and bank.tryStats()", () => {
  it("answer the stats vault.stats() does, with no unlock", async () => {
    // stats @example
    const { bank, device, vault } = await TH.buildBornVault()
    bank.lock()
    const stats = await device.bank.stats()
    const { box, gate, max } = stats
    expect(box.size + gate.size).to.be.below(0.9 * max.size)
    expect(stats.box).to.deep.include({ count: 1, live_count: 1 })
    expect(stats).to.deep.equal(await vault.stats())
    expect(await device.bank.tryStats()).to.deep.equal({ ok: true, val: stats })
  })

  it("refuse before signin, and a disabled device, reading nothing", async () => {
    await TH.expectRefusal(TH.makeDevice({ userid: null }).bank.stats(), 'absent_vault')
    const { bank, device } = await TH.buildBornVault()
    const read = vi.spyOn(bank.device.vaultDB, 'tryStats')
    device.disable()
    await TH.expectRefusal(device.bank.stats(), 'disabled')
    expect(await device.bank.tryStats()).to.deep.include({ ok: false })
    expect(read).not.toHaveBeenCalled()
  })
})


/** The first lifeseq. */
const Life0 = Lifeseq.ofLifenum(0)

describe("Bank.mintLife(found)", () => {
  it("mints, over the gate's shell, the gate's first life, at its banklabel, born now", () => {
    const life = Bank.mintLife(TH.gateShellOf())
    expect(life).to.deep.equal({ ...TH.ThingBank, labelpath: TH.ThingBank.banklabel, lifepath: Life0, born_at: TH.T0, banktok: life.banktok })
  })

  it("mints, over the gate's tombstone, the life after it, with a new banktok", () => {
    const tomb = TH.gateTombOf(TH.gateThingOf())
    const life = Bank.mintLife(tomb)
    expect(life).to.deep.equal({ ...TH.ThingBank, labelpath: TH.ThingBank.banklabel, lifepath: Lifeseq.ofLifenum(2), born_at: TH.T0, banktok: life.banktok })
    expect(life.banktok).to.not.eq(tomb.banktok)
  })

  it("mints the same lifepath on every call over one gate, born when it is called", () => {
    const one = Bank.mintLife(TH.gateShellOf())
    vi.setSystemTime(TH.T0 + 5)
    const two = Bank.mintLife(TH.gateShellOf())
    expect([one.lifepath, two.lifepath]).to.deep.equal([Life0, Life0])
    expect([one.born_at, two.born_at]).to.deep.equal([TH.T0, TH.T0 + 5])
  })

  it("mints a new banktok on each call, a UUID", () => {
    const tomb = TH.gateTombOf(TH.gateThingOf())
    const [one, two] = [Bank.mintLife(tomb), Bank.mintLife(tomb)]
    expect(one.banktok).to.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(one.banktok).to.not.eq(two.banktok)
  })

  const FoundCases = [
    [null,                                        'null'],
    [TH.gateThingOf(),                            'a live gate'],
    [TH.omitting(TH.gateShellOf(), 'banklabel'), 'a shell with no banklabel'],
  ] as const

  for (const [found, blurb] of FoundCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => Bank.mintLife(found as never), 'bad_record')
    })
  }

  it("mints the gate's life at box for the bank labelled box, as a gate's", () => {
    const life = Bank.mintLife({ ...TH.gateShellOf(), banklabel: 'box', labelpath: 'box', label: 'box' })
    expect(life).to.include({ banklabel: 'box', labelpath: 'box' })
  })
})

describe("a bank labelled box", () => {
  it("is born unlocked through a MemoryVaultDB, its gate and its root box both at box, and puts and reads a box", async () => {
    const device = TH.makeDevice({ banklabel: 'box' })
    await device.signin(TH.WorldScope.userid)
    const bank = await Bank.birth(device, { passphraseCleartext: TH.TestPassphrase })
    expect(bank.isUnlocked).to.be.true
    expect(bank.gate.pickle()).to.include({ modelkind: 'gate', labelpath: 'box' })
    expect(bank.rootBox).to.include({ modelkind: 'box', labelpath: 'box', am: 'a' })
    await device.vault!.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(await device.vault!.withWhisper('box/openai', (box) => box.whisper)).to.deep.equal(TH.Whisper)
  })
})

describe("bank.lock() and bank.hostVault(vault)", () => {
  it("locks, evicting its lease, and locks again with nothing to evict", async () => {
    const { bank } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    expect(bank.lock()).to.equal(bank)
    expect(bank.isLocked).to.be.true
    bank.lock()
    expect(evict).toHaveBeenCalledTimes(1)
  })

  it("hosts only a vault, with a connect and a disconnect to call", async () => {
    const { bank } = await TH.buildBornBank()
    TH.expectSyncRefusal(() => { bank.hostVault({} as never) }, 'bad_record')
    TH.expectSyncRefusal(() => { bank.hostVault({ connect: vi.fn() } as never) }, 'bad_record')
    TH.expectSyncRefusal(() => { bank.hostVault(null as never) }, 'bad_record')
  })

  it("connects a vault it hosts at once while its device is connected, then disconnects and connects it with the device", async () => {
    const { bank, device } = await TH.buildBornBank()
    const hosted = { connect: vi.fn(), disconnect: vi.fn() }
    bank.hostVault(hosted)
    expect([hosted.connect.mock.calls.length, hosted.disconnect.mock.calls.length]).to.deep.equal([1, 0])
    device.disconnect()
    expect([hosted.connect.mock.calls.length, hosted.disconnect.mock.calls.length]).to.deep.equal([1, 1])
    device.connect()
    expect([hosted.connect.mock.calls.length, hosted.disconnect.mock.calls.length]).to.deep.equal([2, 1])
  })

  it("leaves a vault it hosts unconnected while its device is disconnected", async () => {
    const { bank, device } = await TH.buildBornBank()
    device.disconnect()
    const hosted = { connect: vi.fn(), disconnect: vi.fn() }
    bank.hostVault(hosted)
    expect(hosted.connect).not.toHaveBeenCalled()
  })

  it("disconnects each vault it hosts, once, as its device is disabled", async () => {
    const { bank, device } = await TH.buildBornBank()
    const hosted = { connect: vi.fn(), disconnect: vi.fn(() => { expect(bank.isEnabled).to.be.false }) }
    bank.hostVault(hosted)
    device.disable()
    device.disable()
    expect(hosted.disconnect).toHaveBeenCalledOnce()
    TH.expectSyncRefusal(() => { bank.hostVault({ connect: vi.fn(), disconnect: vi.fn() }) }, 'disabled')
  })
})

describe("a bank whose device is disabled", () => {
  it("is locked and ended with its device's end cause", async () => {
    const { bank, device } = await TH.buildBornBank()
    const evict = vi.spyOn(Lease.prototype, 'evict')
    device.disable()
    device.disable()
    expect(evict).toHaveBeenCalledTimes(1)
    expect([bank.isLocked, bank.isEnabled, device.isEnabled]).to.deep.equal([true, false, false])
    expect(bank.endCause).to.equal(device.endCause).and.include({ refusalkind: 'disabled' })
    expect(TH.expectSyncRefusal(() => bank.demandEnabled(), 'disabled')).to.equal(bank.endCause)
  })
})

describe("the bank's Things, beside a gate verb", () => {
  it("have the gate a gate verb wrote once the verb resolves", async () => {
    const { bank, device } = await TH.buildBornBank()
    const post = await bank.gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'another horse battery staple' })
    expect(device.bank.demandVaultMinder().thingAt(TH.GateScope)?.pickle()).to.deep.equal(post.pickle())
    expect(post.pickle()).to.include({ banktok: bank.banktok, labelpath: TH.ThingBank.banklabel })
  })
})

describe("bank.tellBadNews(badnews)", () => {
  it("passes the news to its device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    bank.tellBadNews([new Errors.VaultError('storage_unavailable', "Down.")])
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews.mock.calls[0]?.[0]).to.deep.include({ device: bank.device })
  })
})

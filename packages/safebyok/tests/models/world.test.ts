/** The world: the Things `world.makeThing` makes of each record, the bank, main gate and bank stamp it finds in its VaultMinder, its snapshot, the lease its tabs share, and what it announces to `onLifecycle`. */

import { noop } from 'es-toolkit'
import { type Mock, afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Clock, Consts } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import { Box } from '../../src/models/box'
import type { Device } from '../../src/models/device'
import { Gate } from '../../src/models/gate'
import { Lease } from '../../src/models/lease'
import * as Throwers from '../../src/refusals/throwers'
import { Lifeseq } from '../../src/shapes/primitives'
import { type BadNews, type DeviceOpts, type LifecycleHandler, type Lifecyclekind, type WorldSnapshot, PendingWorld, bankStageVals } from '../../src/shapes/shapes-bankish'
import type { LeaseRecord } from '../../src/shapes/shapes-stamps'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import type { LiveOf } from '../../src/shapes/shapes-sealers'
import type { SeenThing } from '../../src/shapes/shapes-vault-event'
import { readAtOf, readTcNow } from '../../src/storage/agerank'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** A device signed in to a bank none of whose records it has heard of. */
async function signedInDevice(): Promise<Device> {
  const device = TH.makeDevice()
  await device.signin(TH.WorldScope.userid)
  return device
}

describe("world.makeThing(begun)", () => {
  it("makes a Bank, a Gate or a Box by the modelkind of the item event's labelpath, holding the record it received", () => {
    const { world } = TH.makeDevice()
    const [bankRecord, gateRecord, boxRecord] = [TH.bankThingOf(), TH.gateThingOf(), TH.boxThingOf()]
    const [bank, gate, box] = [world.makeThing(TH.thingEventOf(bankRecord)), world.makeThing(TH.thingEventOf(gateRecord)), world.makeThing(TH.thingEventOf(boxRecord))]
    expectTypeOf(bank).toEqualTypeOf<Bank>()
    expectTypeOf(gate).toEqualTypeOf<Gate>()
    expectTypeOf(box).toEqualTypeOf<Box>()
    expect([bank, gate, box].map((thing) => thing.constructor)).to.deep.equal([Bank, Gate, Box])
    expect([bank.pickle(), gate.pickle(), box.pickle()]).to.deep.equal([bankRecord, gateRecord, boxRecord])
  })

  it("makes the Thing of the shell, holding it, which has received nothing", () => {
    const thing = TH.makeDevice().world.makeThing(TH.gateShellOf())
    expect(thing).to.be.instanceOf(Gate)
    expect(thing.pickle()).to.deep.equal(TH.gateShellOf())
  })

  it("makes the Thing of an item event of a sparse record over its kind's shell, which it holds", () => {
    const sparse = TH.boxSparseOf(TH.boxThingOf())
    const thing = TH.makeDevice().world.makeThing(TH.thingEventOf<BoxRecord>(sparse))
    expect(thing).to.be.instanceOf(Box)
    expect(thing.pickle()).to.deep.equal(Shell.inParentLivesOf(sparse))
  })

  const RefusedCases = [
    [TH.thingEventOf({ ...TH.bankThingOf(), labelpath: 'vault' } as never), 'bad_record',      'an item event at a labelpath of no kind of Thing'],
    [TH.thingEventOf({ ...TH.boxThingOf(), userid: 'u2' }),                 'record_conflict', "an item event of a record of another bank than its device's"],
    [Shell.inParentLivesOf({ ...TH.boxThingOf(), banklabel: 'other' }),    'record_conflict', "the shell of another bank than its device's"],
    [TH.boxThingOf(),                                                       'bad_record',      'a whole record with no item event'],
    [null,                                                                  'bad_record',      'nothing at all'],
  ] as const

  for (const [begun, refusalkind, blurb] of RefusedCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice().world.makeThing(begun as never), refusalkind)
    })
  }
})

describe("world.bank, world.gate, world.rootBox and world.bankStamp", () => {
  it("are the bank, main gate and root box its VaultMinder keeps, and the bank's stamp, which a gate of the world's takes for its bank's", async () => {
    const { device, bank } = await TH.buildBornBank()
    const { world } = device
    expect(world.bank).to.equal(bank)
    expect(world.gate).to.equal(bank.gate)
    expect(world.rootBox).to.equal(world.vaultMinder!.thingAt(TH.RootScope))
    expect(world.rootBox?.pickle()).to.equal(bank.rootBox)
    expect(world.vaultMinder!.thingAt({ ...TH.WorldScope, labelpath: 'gate' })).to.equal(world.gate)
    expect(world.bankStamp).to.deep.equal(bank.stamp)
    expect(world.gate!.bankStamp).to.deep.equal(bank.stamp)
  })

  it("are null until the world hears of each, and the stamp refuses until it hears of a live bank", async () => {
    expect([TH.makeDevice({ userid: null }).world.bank, TH.makeDevice({ userid: null }).world.gate]).to.deep.equal([null, null])
    const { world } = await signedInDevice()
    expect(world.bank!.pickle()).to.deep.equal(TH.bankShellOf())
    expect(world.gate!.pickle()).to.deep.equal(TH.gateShellOf())
    TH.expectSyncRefusal(() => world.bankStamp, 'absent_thing')
    TH.expectSyncRefusal(() => world.makeThing(TH.thingEventOf(TH.gateThingOf())).bankStamp, 'absent_thing')
  })
})

describe("world.demandVaultMinder()", () => {
  it("answers the VaultMinder its signin was handed", async () => {
    const { world } = await signedInDevice()
    expect(world.demandVaultMinder()).to.equal(world.vaultMinder)
  })

  it("refuses before signin", () => {
    TH.expectSyncRefusal(() => TH.makeDevice({ userid: null }).world.demandVaultMinder(), 'absent_vault')
  })
})

describe("world.demandRootsLive()", () => {
  it("answers the bank of a world whose bank, main gate and root box are live", async () => {
    const { device, bank } = await TH.buildBornBank()
    expect(device.world.demandRootsLive()).to.equal(bank)
  })

  it("refuses a world that has heard of none of them", async () => {
    const { world } = await signedInDevice()
    TH.expectSyncRefusal(() => world.demandRootsLive(), 'absent_thing')
  })
})

/** Each order the bank, the main gate and the root box of a bank born elsewhere may arrive in, one at a time. */
const RootOrderCases = [
  [["bank", "gate", "box"], 'the order an answer tells them in'],
  [["box", "bank", "gate"], 'the root box first'],
  [["gate", "box", "bank"], 'the main gate first, the bank last'],
  [["bank", "box", "gate"], 'the main gate last'],
] as const

describe("world.getSnapshot() and world.subscribe(listener)", () => {
  it("shows the pending world from signin until a bank is found", () => {
    const { world } = TH.makeDevice()
    expect(world.getSnapshot()).to.equal(PendingWorld)
    expect(Object.isFrozen(world.getSnapshot())).to.be.true
  })

  it("shows a born bank unlocked, its lease ending the device's lease length after it was proved", async () => {
    const { device } = await TH.buildBornBank()
    const { world } = device
    expect(world.getSnapshot()).to.deep.equal({ stage: 'unlocked', isLocked: false, isEnded: false, endCause: null, leaseEndsAt: TH.T0 + device.leaseMillis, lastErr: null, isUnlockWanted: false })
    expect(Object.isFrozen(world.getSnapshot())).to.be.true
  })

  it("tells its subscribers once each for a lock, an `unlock` gating and a disconnect, which locks, the snapshot the same object between them", async () => {
    const { bank } = await TH.buildBornBank()
    const { world } = bank.device
    const counter = TH.countCalls(world.subscribe)
    const unlocked = world.getSnapshot()
    expect(world.getSnapshot()).to.equal(unlocked)

    bank.lock()
    const locked = world.getSnapshot()
    expect(counter.calls).to.eq(1)
    expect(locked).to.deep.equal({ stage: 'locked', isLocked: true, isEnded: false, endCause: null, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(world.getSnapshot()).to.equal(locked)

    await bank.gate.gatingUnlockAttempt({ passphrase: TH.TestPassphrase })
    expect(counter.calls).to.eq(2)
    expect(world.getSnapshot()).to.deep.equal(unlocked)

    bank.device.disconnect()
    expect(counter.calls).to.eq(3)
    expect(world.getSnapshot()).to.deep.equal(locked)
  })

  it("tells no subscriber of a call that changes nothing in the snapshot: a second lock, a disconnect or connect while locked, a wrong passphrase, or a box landing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const { world } = bank.device
    const counter = TH.countCalls(world.subscribe)
    const unlocked = world.getSnapshot()
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(world.getSnapshot()).to.equal(unlocked)
    bank.lock()
    bank.lock()
    await TH.expectRefusal(bank.gate.gatingUnlockAttempt({ passphrase: 'not the passphrase' }), 'wrong_passphrase')
    bank.device.disconnect()
    bank.device.connect()
    expect(counter.calls).to.eq(1)
  })

  it("shows an `unlock` gating wanted while a call waits for one, and carries no cleartext", async () => {
    const { bank, device: { world } } = await TH.buildBornBank()
    bank.lock()
    const snapshots: WorldSnapshot[] = []
    world.subscribe(() => { snapshots.push(world.getSnapshot()) })
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
    const { world } = device
    const counter = TH.countCalls(world.subscribe)
    device.disable()
    expect(counter.calls).to.eq(1)
    expect(world.getSnapshot()).to.deep.equal({ stage: 'disabled', isLocked: true, isEnded: true, endCause: bank.endCause, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(world.getSnapshot().endCause).to.equal(device.endCause).and.include({ refusalkind: 'disabled' })
  })

  it("tells no subscriber once disabled", async () => {
    const { bank, device } = await TH.buildBornBank()
    const { world } = device
    device.disable()
    const disabled = world.getSnapshot()
    const counter = TH.countCalls(world.subscribe)
    bank.lock()
    device.connect()
    device.disconnect()
    device.disable()
    expect(counter.calls).to.eq(0)
    expect(world.getSnapshot()).to.equal(disabled)
  })

  it("shows only stages that bankStageVals lists", async () => {
    const { bank } = await TH.buildBornBank()
    const { world } = bank.device
    const snapshots = [world.getSnapshot()]
    bank.lock()
    snapshots.push(world.getSnapshot())
    bank.device.disable()
    snapshots.push(world.getSnapshot())
    expect(snapshots.map(({ stage }) => stage)).to.deep.equal(['unlocked', 'locked', 'disabled'])
    expect(bankStageVals).to.include.members(snapshots.map(({ stage }) => stage))
  })

  it("stops telling a listener once it unsubscribes", async () => {
    const { bank } = await TH.buildBornBank()
    const { world } = bank.device
    const listener = vi.fn()
    const unsubscribe = world.subscribe(listener)
    bank.lock()
    unsubscribe()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(listener).toHaveBeenCalledOnce()
  })

  it("tells every subscriber when one throws, and passes the throw to the device's onBadNews", async () => {
    const onBadNews = vi.fn()
    const { bank } = await TH.buildBornBank({ device: TH.makeDevice({}, { onBadNews }) })
    const { world } = bank.device
    world.subscribe(() => { throw new Error('a bug in the host') })
    const listener = vi.fn()
    world.subscribe(listener)
    bank.lock()
    expect(listener).toHaveBeenCalledOnce()
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect((onBadNews.mock.calls[0]![0] as BadNews).news).to.include({ refusalkind: 'unexpected_error' })
  })

  it("refuses a listener that is not a function", async () => {
    const { bank } = await TH.buildBornBank()
    const { world } = bank.device
    TH.expectSyncRefusal(() => world.subscribe('call me' as never), 'bad_record')
  })
})

describe("a world's stage as its roots arrive one at a time", () => {
  for (const [order, blurb] of RootOrderCases) {
    it(`shows unborn until the last root lands, then locked, in ${blurb}`, async () => {
      const born   = await TH.buildBornBank()
      const minder = born.device.world.demandVaultMinder()
      const device = TH.makeDevice()
      await device.signin(TH.WorldScope.userid)
      expect(device.world.getSnapshot().stage).to.eq('unborn')
      const stages: string[] = []
      device.world.subscribe(() => { stages.push(device.world.getSnapshot().stage) })
      for (const labelpath of order) {
        const record = minder.thingAt({ ...TH.WorldScope, labelpath })!.pickle() as SeenThing
        device.world.demandVaultMinder().receive({ ...TH.itemEventOf(record), sourcelabel: 'other_device', read_tc: readTcNow() })
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

describe("a world's softlock, near its lease's end", () => {
  it("turns on softlockMillis before the lease ends, on the world, bank and gate alike", async () => {
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 600, softlockMinutes: 10 }) })
    const { world } = device
    expect(world.leaseEndsAt).to.eq(TH.T0 + (600 * Consts.MinuteMillis))
    expect([world.isSoftlocked, bank.isSoftlocked, bank.gate.isSoftlocked]).to.deep.equal([false, false, false])
    vi.setSystemTime(world.leaseEndsAt! - (10 * Consts.MinuteMillis) - 1)
    expect(world.isSoftlocked).to.be.false
    vi.setSystemTime(world.leaseEndsAt! - (10 * Consts.MinuteMillis))
    expect([world.isSoftlocked, bank.isSoftlocked, bank.gate.isSoftlocked]).to.deep.equal([true, true, true])
    expect([world.isLocked, world.getSnapshot().stage]).to.deep.equal([false, 'unlocked'])
  })

  it("is on while the world is locked", async () => {
    const { bank, device: { world } } = await TH.buildBornBank()
    bank.lock()
    expect([world.isSoftlocked, bank.isSoftlocked]).to.deep.equal([true, true])
  })

  it("has ensureUnlocked wait, though the bank shows unlocked, for an `unlock` gating that renews the lease", async () => {
    const { bank, device: { world } } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 600 }) })
    const nearEnd = world.leaseEndsAt! - Consts.MinuteMillis
    vi.setSystemTime(nearEnd)
    const ensuring = bank.ensureUnlocked()
    expect(world.getSnapshot()).to.include({ stage: 'unlocked', isUnlockWanted: true })
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await ensuring).to.equal(bank)
    expect(world.getSnapshot().isUnlockWanted).to.be.false
    expect([world.leaseEndsAt, world.isSoftlocked]).to.deep.equal([nearEnd + (600 * Consts.MinuteMillis), false])
  })

  it("leaves a call that wants the bank unlocked alone before the softlock: ensureUnlocked resolves at once", async () => {
    const { bank, device: { world } } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 600 }) })
    vi.setSystemTime(world.leaseEndsAt! - (11 * Consts.MinuteMillis))
    expect(await bank.ensureUnlocked()).to.equal(bank)
    expect(world.getSnapshot().isUnlockWanted).to.be.false
  })
})

describe("a world's janitor", () => {
  it("locks the world at its first tick once the lease has ended", async () => {
    const { device: { world } } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 25, janitorMinutes: 10 }) })
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(world.isLocked).to.be.false
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect([world.isLocked, world.getSnapshot().stage]).to.deep.equal([true, 'locked'])
  })

  it("locks a world unlocked while disconnected once the lease has ended", async () => {
    const { bank, device } = await TH.buildBornBank({ device: TH.makeDevice({}, { autolockMinutes: 25, janitorMinutes: 10 }) })
    device.disconnect()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(device.world.isLocked).to.be.false
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(device.world.isLocked).to.be.true
  })

  it("re-reads the roots at the first tick after the gate goes stale", async () => {
    setClockPastEveryReadTc()
    const vaultDB = new MemoryVaultDB()
    const tryGetWorld = vi.spyOn(vaultDB, 'tryGetWorld')
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, gateStaleMinutes: 25, janitorMinutes: 10 }) })
    const asked = tryGetWorld.mock.calls.length
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(tryGetWorld.mock.calls.length - asked).to.eq(0)
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(tryGetWorld.mock.calls.length - asked).to.eq(1)
    await vi.advanceTimersByTimeAsync(20 * Consts.MinuteMillis)
    expect(tryGetWorld.mock.calls.length - asked).to.eq(1)
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(tryGetWorld.mock.calls.length - asked).to.eq(2)
  })

  it("tells the device's onBadNews where the re-read is refused, and keeps the world as it was", async () => {
    setClockPastEveryReadTc()
    const vaultDB = new MemoryVaultDB()
    const onBadNews = vi.fn()
    const { device: { world } } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, onBadNews, gateStaleMinutes: 5, janitorMinutes: 10 }) })
    vi.spyOn(vaultDB, 'tryGetWorld').mockRejectedValue(new Error('the network is down'))
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(world.getSnapshot().stage).to.eq('unlocked')
  })

  it("re-reads no stale gate while disconnected, and does again once connected", async () => {
    setClockPastEveryReadTc()
    const vaultDB = new MemoryVaultDB()
    const tryGetWorld = vi.spyOn(vaultDB, 'tryGetWorld')
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, gateStaleMinutes: 5, janitorMinutes: 10 }) })
    device.disconnect()
    const asked = tryGetWorld.mock.calls.length
    await vi.advanceTimersByTimeAsync(30 * Consts.MinuteMillis)
    expect(tryGetWorld.mock.calls.length - asked).to.eq(0)
    device.connect()
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(tryGetWorld.mock.calls.length - asked).to.be.at.least(1)
  })

  it("starts the watch at its next tick, where it threw as it started", async () => {
    const vaultDB = new MemoryVaultDB()
    const onBadNews = vi.fn()
    vi.spyOn(vaultDB, 'watch').mockImplementationOnce(() => { throw new Error('the socket is down') })
    const { device: { world } } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, onBadNews, janitorMinutes: 10 }) })
    expect([world.demandVaultMinder().isWatching, onBadNews.mock.calls.length]).to.deep.equal([false, 1])
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect([world.demandVaultMinder().isWatching, onBadNews.mock.calls.length]).to.deep.equal([true, 1])
  })

  it("starts no watch while disconnected", async () => {
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { janitorMinutes: 10 }) })
    device.disconnect()
    await vi.advanceTimersByTimeAsync(10 * Consts.MinuteMillis)
    expect(device.world.demandVaultMinder().isWatching).to.be.false
  })

  it("runs from sign-in, and through a disconnect", async () => {
    const device = TH.makeDevice({ userid: null })
    const before = vi.getTimerCount()
    await device.signin(TH.WorldScope.userid)
    expect(vi.getTimerCount() - before).to.eq(1)
    device.disconnect()
    expect(vi.getTimerCount() - before).to.eq(1)
  })

  it("stops for good once the device is disabled", async () => {
    const device = TH.makeDevice({ userid: null })
    const before = vi.getTimerCount()
    await device.signin(TH.WorldScope.userid)
    device.disable()
    device.connect()
    expect(vi.getTimerCount() - before).to.eq(0)
  })

  it("does not start on a device disabled before it signs in", async () => {
    const device = TH.makeDevice({ userid: null })
    const before = vi.getTimerCount()
    device.disable()
    await device.signin(TH.WorldScope.userid)
    expect(vi.getTimerCount() - before).to.eq(0)
  })
})

/** Two tabs of one browser: a bank born unlocked in the first, over a vaultDB and a deviceDB the second shares, which has signed in. */
interface TwoTabs {
  first:    TH.BornBank
  second:   Device
  deviceDB: MemoryDeviceDB
  vaultDB:  MemoryVaultDB
}

/** {@link TwoTabs}, each device made with `opts` too, once the second's world has done what its sign-in started. */
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

/** The lease record `deviceDB` stores for {@link TH.WorldScope}'s main gate. */
async function storedLeaseOf(deviceDB: MemoryDeviceDB): Promise<LeaseRecord | null> { return await deviceDB.peekLease(TH.WorldLeaseScope) }

/** A device of another browser over `vaultDB`, its own deviceDB, unlocked, whose passphrase it then replaces: a gate change the tabs of `vaultDB` hear of. */
async function changeGateElsewhere(vaultDB: MemoryVaultDB): Promise<void> {
  const elsewhere = TH.makeDevice({}, { vaultDB })
  await elsewhere.signin(TH.WorldScope.userid)
  const gate = elsewhere.world.gate!
  await gate.replacePassphrase({ passphraseCleartext: TH.TestPassphrase, nextPassphraseCleartext: 'a different passphrase, just as long' })
  await settle()
}

describe("a lease shared by the tabs of one deviceDB", () => {
  it("unlocks a tab as it signs in under the lease another tab stowed, as a page reload does", async () => {
    const { first, second } = await twoTabs()
    expect(second.world.getSnapshot().stage).to.eq('unlocked')
    expect(second.world.leaseLoggable).to.deep.equal(first.device.world.leaseLoggable)
    expect(second.world.leaseEndsAt).to.eq(first.device.world.leaseEndsAt)
  })

  it("unlocks a tab from its root shelf before the vaultDB answers", async () => {
    const [vaultDB, deviceDB, rootShelf] = [new MemoryVaultDB(), new MemoryDeviceDB(), new TH.MemoryShelf()]
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB, rootShelf }) })
    vi.spyOn(vaultDB, 'tryGetWorld').mockReturnValue(new Promise(noop))
    const reloaded = TH.makeDevice({}, { vaultDB, deviceDB, rootShelf })
    await settle()
    expect(reloaded.world.getSnapshot().stage).to.eq('unlocked')
  })

  it("follows an unlock in one tab to the other, resuming a call waiting there", async () => {
    const { first, second } = await twoTabs()
    first.bank.lock()
    await settle()
    const ensuring = second.world.ensureUnlocked()
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await ensuring).to.equal(second.world)
    expect(second.world.getSnapshot()).to.include({ stage: 'unlocked', isUnlockWanted: false })
  })

  it("locks every tab at a lock in one, leaving the lease's tombstone stored", async () => {
    const { first, second, deviceDB } = await twoTabs()
    second.lock()
    await settle()
    expect([first.device.world.isLocked, second.world.isLocked]).to.deep.equal([true, true])
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'x', lifeseq: Lifeseq.ofLifenum(1) })
  })

  it("takes up a renewal made in another tab, ending when it ends", async () => {
    const { first, second } = await twoTabs()
    vi.setSystemTime(TH.T0 + Consts.MinuteMillis)
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect(second.world.leaseEndsAt).to.eq(TH.T0 + Consts.MinuteMillis + second.leaseMillis)
  })

  it("starts the next life at an unlock after a lock in any tab, which every tab takes up", async () => {
    const { first, second, deviceDB } = await twoTabs()
    second.lock()
    await settle()
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2), born_at: TH.T0 })
    expect(second.world.isUnlocked).to.be.true
  })

  it("leaves a tab locked as it signs in where the lease stored has passed its end", async () => {
    const [vaultDB, deviceDB] = [new MemoryVaultDB(), new MemoryDeviceDB()]
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB }) })
    device.disconnect()
    vi.setSystemTime(TH.T0 + device.leaseMillis)
    const later = TH.makeDevice({}, { vaultDB, deviceDB })
    await later.signin(TH.WorldScope.userid)
    await settle()
    expect(later.world.getSnapshot().stage).to.eq('locked')
  })

  it("starts the next life at an unlock after the lease stored has passed its end, as when every tab closed while it was live", async () => {
    const [vaultDB, deviceDB] = [new MemoryVaultDB(), new MemoryDeviceDB()]
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB, deviceDB }) })
    device.disconnect()
    const later = TH.T0 + device.leaseMillis
    vi.setSystemTime(later)
    const reloaded = TH.makeDevice({}, { vaultDB, deviceDB })
    await reloaded.signin(TH.WorldScope.userid)
    await reloaded.world.gate!.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2), revseq: 2, born_at: later })
  })

  it("keeps its own lease where an older lease record rings", async () => {
    const onBadNews = vi.fn()
    const { first, second, deviceDB } = await twoTabs({ onBadNews })
    vi.setSystemTime(TH.T0 + Consts.MinuteMillis)
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    const endsAt = second.world.leaseEndsAt
    deviceDB._cheat_leases().set(MemoryDeviceDB.ckeyOf(TH.WorldLeaseScope), await TH.liveLeaseRecordOf({ revseq: 0 }))
    await deviceDB.stowLease(TH.leaseTombstoneOf({ userid: 'u2' }))
    await settle()
    expect([first.device.world.leaseEndsAt, second.world.leaseEndsAt]).to.deep.equal([endsAt, endsAt])
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("softlocks the lease in every tab when the gate changes elsewhere, writing the revision once", async () => {
    const { first, second, deviceDB, vaultDB } = await twoTabs()
    await changeGateElsewhere(vaultDB)
    const softlockEnd = Clock.nowMillis() + second.softlockMillis
    expect([first.device.world.leaseEndsAt, second.world.leaseEndsAt]).to.deep.equal([softlockEnd, softlockEnd])
    expect([first.device.world.isSoftlocked, second.world.isSoftlocked]).to.deep.equal([true, true])
    expect(await storedLeaseOf(deviceDB)).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(0), revseq: 1, ends_at: softlockEnd })
  })

  it("leaves the lease's end alone at a gate change where it comes before the softlock's", async () => {
    const { first, second, deviceDB, vaultDB } = await twoTabs()
    const nearEnd = first.device.world.leaseEndsAt! - Consts.MinuteMillis
    vi.setSystemTime(nearEnd)
    const stow = vi.spyOn(deviceDB, 'stowLease')
    await changeGateElsewhere(vaultDB)
    expect(second.world.leaseEndsAt).to.eq(nearEnd + Consts.MinuteMillis)
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
    expect([later.world.isUnlocked, later.world.leaseEndsAt]).to.deep.equal([true, Clock.nowMillis() + later.softlockMillis])
  })

  it("leaves the gate stored as it is where a lease it takes up cites a newer revision of the gate", async () => {
    const { second, deviceDB, vaultDB } = await twoTabs()
    const gateStored = structuredClone(vaultDB._cheat_things(TH.WorldScope).get('gate'))
    const [stored, loggableBefore] = [await storedLeaseOf(deviceDB) as LiveOf<LeaseRecord>, second.world.leaseLoggable]
    await deviceDB.stowLease({ ...stored, ...Lease.nextRevisionOf(stored), gate_revseq: stored.gate_revseq + 1, gate_revtok: TH.OtherRevtok })
    await settle()
    expect(vaultDB._cheat_things(TH.WorldScope).get('gate')).to.deep.equal(gateStored)
    expect(second.world.leaseLoggable).to.not.deep.equal(loggableBefore)
    expect([second.world.isUnlocked, second.world.isSoftlocked]).to.deep.equal([true, false])
  })

  it("drops the lease in a tab that disconnects alone, and takes it up again as it connects", async () => {
    const { first, second } = await twoTabs()
    second.disconnect()
    await settle()
    expect([first.device.world.isUnlocked, second.world.isUnlocked]).to.deep.equal([true, false])
    second.connect()
    await settle()
    expect(second.world.isUnlocked).to.be.true
  })

  it("leaves the other tabs unlocked when one is disabled, as a disconnect does", async () => {
    const { first, second } = await twoTabs()
    second.disable()
    await settle()
    expect([first.device.world.isUnlocked, second.world.isLocked]).to.deep.equal([true, true])
  })

  it("locks every tab at the janitor's autolock in any one", async () => {
    const { first, second } = await twoTabs({ autolockMinutes: 25, janitorMinutes: 10 })
    await vi.advanceTimersByTimeAsync(30 * Consts.MinuteMillis)
    expect([first.device.world.isLocked, second.world.isLocked]).to.deep.equal([true, true])
  })

  it("tells onBadNews where the deviceDB refuses a stow, and keeps the lease in the tab", async () => {
    const onBadNews = vi.fn()
    const deviceDB = new MemoryDeviceDB()
    vi.spyOn(deviceDB, 'stowLease').mockRejectedValue(Throwers.deviceDBFailed('stowLease', new Error('the disk is full')))
    const { device } = await TH.buildBornBank({ device: TH.makeDevice({}, { deviceDB, onBadNews }) })
    await settle()
    expect(onBadNews.mock.calls.map(([heard]) => (heard as BadNews).news.refusalkind)).to.deep.equal(['storage_unavailable'])
    expect(device.world.isUnlocked).to.be.true
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
    expect(device.world.isLocked).to.be.true
  })

  it("keeps each tab's lease its own where the host gives no deviceDB", async () => {
    const vaultDB = new MemoryVaultDB()
    await TH.buildBornBank({ device: TH.makeDevice({}, { vaultDB }) })
    const second = TH.makeDevice({}, { vaultDB })
    await second.signin(TH.WorldScope.userid)
    await settle()
    expect(second.world.getSnapshot().stage).to.eq('locked')
  })
})

/** The kinds `onLifecycle` heard announced on `device`, in order. */
function kindsHeardOn(onLifecycle: Mock<LifecycleHandler>, device: Device): Lifecyclekind[] {
  return onLifecycle.mock.calls.filter(([event]) => event.device === device).map(([event]) => event.kind)
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

  it("may throw, and the tab still follows the stored lease", async () => {
    vi.stubGlobal('reportError', vi.fn())
    const onLifecycle = vi.fn<LifecycleHandler>(() => { throw new Error("The handler is broken.") })
    const { first, second } = await twoTabs({ onLifecycle })
    first.device.lock()
    await settle()
    expect(second.world.isLocked).to.be.true
    await first.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await settle()
    expect(second.world.isUnlocked).to.be.true
  })
})

describe("world.stats() and world.tryStats()", () => {
  it("answer the stats vault.stats() does, with no unlock", async () => {
    // stats @example
    const { bank, device, vault } = await TH.buildBornVault()
    bank.lock()
    const stats = await device.world.stats()
    const { box, gate, max } = stats
    expect(box.size + gate.size).to.be.below(0.9 * max.size)
    expect(stats.box).to.deep.include({ count: 1, live_count: 1 })
    expect(stats).to.deep.equal(await vault.stats())
    expect(await device.world.tryStats()).to.deep.equal({ ok: true, val: stats })
  })

  it("refuse before signin (the roots are not live), and a disabled device, reading nothing", async () => {
    await TH.expectRefusal(TH.makeDevice({ userid: null }).world.stats(), 'absent_thing')
    const { bank, device } = await TH.buildBornVault()
    const read = vi.spyOn(bank.device.vaultDB, 'tryStats')
    device.disable()
    await TH.expectRefusal(device.world.stats(), 'disabled')
    expect(await device.world.tryStats()).to.deep.include({ ok: false })
    expect(read).not.toHaveBeenCalled()
  })
})

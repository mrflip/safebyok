/** The world: the Things `world.makeThing` makes of each record, the bank, main gate and bank stamp it finds in its VaultMinder, and its snapshot. */

import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Consts } from 'safebyok-big/internals'
import { Bank } from '../../src/models/bank'
import { Box } from '../../src/models/box'
import type { Device } from '../../src/models/device'
import { Gate } from '../../src/models/gate'
import { type BadNews, type WorldSnapshot, PendingWorld, bankStageVals } from '../../src/shapes/shapes-bankish'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import type { SeenThing } from '../../src/shapes/shapes-vault-event'
import { readAtOf, readTcNow } from '../../src/storage/agerank'
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

  it("stops on disconnect, and starts again on connect", async () => {
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

  it("does not start until the device signs in", async () => {
    const device = TH.makeDevice({ userid: null })
    const before = vi.getTimerCount()
    await device.signin(TH.WorldScope.userid)
    expect(vi.getTimerCount() - before).to.eq(1)
    device.disconnect()
    expect(vi.getTimerCount() - before).to.eq(0)
  })
})

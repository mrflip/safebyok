/** The world: the Things `world.makeThing` makes of each record, the bank, main gate and bank stamp it finds in its VaultMinder, and its snapshot. */

import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { Bank } from '../../src/models/bank'
import { Box } from '../../src/models/box'
import type { Device } from '../../src/models/device'
import { Gate } from '../../src/models/gate'
import { type BadNews, type WorldSnapshot, PendingWorld, bankStageVals } from '../../src/shapes/shapes-bankish'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import type { SeenThing } from '../../src/shapes/shapes-vault-event'
import { readTcNow } from '../../src/storage/agerank'
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

  it("tells its subscribers once each for a lock, an `unlock` gating and a sweep, the snapshot the same object between them", async () => {
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

    bank.sweep()
    expect(counter.calls).to.eq(3)
    expect(world.getSnapshot()).to.deep.equal({ stage: 'swept', isLocked: true, isEnded: true, endCause: bank.endCause, leaseEndsAt: null, lastErr: null, isUnlockWanted: false })
    expect(world.getSnapshot().endCause).to.equal(bank.endCause).and.include({ refusalkind: 'disabled' })
  })

  it("tells no subscriber of a call that changes nothing in the snapshot: a second lock or sweep, a wrong passphrase, or a box landing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const { world } = bank.device
    const counter = TH.countCalls(world.subscribe)
    const unlocked = world.getSnapshot()
    await vault.putBoxOnce('box/openai', { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(world.getSnapshot()).to.equal(unlocked)
    bank.lock()
    bank.lock()
    await TH.expectRefusal(bank.gate.gatingUnlockAttempt({ passphrase: 'not the passphrase' }), 'wrong_passphrase')
    expect(counter.calls).to.eq(1)
    bank.sweep()
    bank.sweep()
    expect(counter.calls).to.eq(2)
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

  it("shows the bank swept once its device is swept", async () => {
    const { bank, device } = await TH.buildBornBank()
    const { world } = device
    const counter = TH.countCalls(world.subscribe)
    device.sweep()
    expect(counter.calls).to.eq(1)
    expect(world.getSnapshot()).to.include({ stage: 'swept', isEnded: true, endCause: bank.endCause })
  })

  it("leaves its snapshot unchanged once swept, telling no subscriber of a lock or of its device's sweep", async () => {
    const { bank, device } = await TH.buildBornBank()
    const { world } = device
    bank.sweep()
    const swept = world.getSnapshot()
    const counter = TH.countCalls(world.subscribe)
    bank.lock()
    device.sweep()
    expect(counter.calls).to.eq(0)
    expect(world.getSnapshot()).to.equal(swept)
    expect(swept.endCause).to.equal(bank.endCause)
  })

  it("shows only stages that bankStageVals lists", async () => {
    const { bank } = await TH.buildBornBank()
    const { world } = bank.device
    const snapshots = [world.getSnapshot()]
    bank.lock()
    snapshots.push(world.getSnapshot())
    bank.sweep()
    snapshots.push(world.getSnapshot())
    expect(snapshots.map(({ stage }) => stage)).to.deep.equal(['unlocked', 'locked', 'swept'])
    expect(bankStageVals).to.include.members(snapshots.map(({ stage }) => stage))
  })

  it("stops telling a listener once it unsubscribes", async () => {
    const { bank } = await TH.buildBornBank()
    const { world } = bank.device
    const listener = vi.fn()
    const unsubscribe = world.subscribe(listener)
    bank.lock()
    unsubscribe()
    bank.sweep()
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

/** The world's Things: what `world.makeThing` makes of each record, and the bank, main gate and bank stamp it finds in its VaultMinder. */

import { describe, expect, expectTypeOf, it } from 'vitest'
import { Bank } from '../../src/models/bank'
import { BaseThing } from '../../src/models/base-thing'
import { Box } from '../../src/models/box'
import type { Device } from '../../src/models/device'
import { Gate } from '../../src/models/gate'
import { Shell } from '../../src/shapes/shapes-thing'
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

describe("world.makeThing(seen)", () => {
  it("makes a Bank, a Gate or a Box by the modelkind of the record's labelpath, holding the record", () => {
    const { world } = TH.makeDevice()
    const [bankRecord, gateRecord, boxRecord] = [TH.bankThingOf(), TH.gateThingOf(), TH.boxThingOf()]
    const [bank, gate, box] = [world.makeThing(bankRecord), world.makeThing(gateRecord), world.makeThing(boxRecord)]
    expectTypeOf(bank).toEqualTypeOf<Bank>()
    expectTypeOf(gate).toEqualTypeOf<Gate>()
    expectTypeOf(box).toEqualTypeOf<Box>()
    expect([bank, gate, box].map((thing) => thing.constructor)).to.deep.equal([Bank, Gate, Box])
    expect([bank.pickle(), gate.pickle(), box.pickle()]).to.deep.equal([bankRecord, gateRecord, boxRecord])
  })

  it("makes the Thing of the shell, holding it", () => {
    const thing = TH.makeDevice().world.makeThing(TH.gateShellOf())
    expect(thing).to.be.instanceOf(Gate)
    expect(thing.pickle()).to.deep.equal(TH.gateShellOf())
  })

  it("makes the Thing of a sparse record over its kind's shell, which then cites the record it receives", () => {
    const sparse = BaseThing.sparseOf(TH.boxThingOf())
    const thing = TH.makeDevice().world.makeThing(sparse)
    if (! (thing instanceof Box)) { throw new TypeError("A box's sparse record made no Box.") }
    expect(thing.pickle()).to.deep.equal(Shell.inParentLivesOf(sparse))
    thing.receive(TH.thingEventOf(sparse))
    expect(thing.pickle()).to.deep.equal(Shell.inParentLivesOf(sparse))
    expect(thing.citable).to.deep.include({ revtok: sparse.revtok, revseq: sparse.revseq, lifepath: sparse.lifepath })
  })

  const RefusedCases = [
    [{ ...TH.bankThingOf(), labelpath: 'vault' }, 'bad_record',      'a labelpath of no kind of Thing'],
    [{ ...TH.boxThingOf(), userid: 'u2' },        'record_conflict', "a record of another bank than its device's"],
    [null,                                        'bad_record',      'no record at all'],
  ] as const

  for (const [seen, refusalkind, blurb] of RefusedCases) {
    it(`refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => TH.makeDevice().world.makeThing(seen as never), refusalkind)
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
    expect(world.gate).to.be.null
    TH.expectSyncRefusal(() => world.bankStamp, 'absent_thing')
    TH.expectSyncRefusal(() => world.makeThing(TH.gateThingOf()).bankStamp, 'absent_thing')
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

/** A form holding a username and every secret field, obvious fakes. */
function secretForm(): FormData {
  const form = new FormData()
  for (const [fieldname, text] of [['username', 'hue'], ['passphrase', 'a fake passphrase'], ['nextPassphrase', 'a fake next one'], ['confirmation', 'a fake next one']] as const) { form.append(fieldname, text) }
  return form
}

describe("world.vacateUnlessAttemptable(handed)", () => {
  it("changes nothing it is handed over a live bank", async () => {
    const { device } = await TH.buildBornBank()
    const [form, dna] = [secretForm(), { passphrase: 'a fake passphrase', passkeyAnswer: TH.passkeyAnswerOf(), nextPasskeyAnswer: TH.passkeyAnswerOf() }]
    device.world.vacateUnlessAttemptable(form)
    device.world.vacateUnlessAttemptable(dna)
    expect([...form.keys()]).to.deep.equal(['username', 'passphrase', 'nextPassphrase', 'confirmation'])
    expect([TH.isZeroed(dna.passkeyAnswer.prfBytes), TH.isZeroed(dna.nextPasskeyAnswer.prfBytes)]).to.deep.equal([false, false])
  })

  it("empties a form's secret fields and zeroes each passkey answer, whichever verb's names it is in, where no bank is live, and never throws", async () => {
    for (const { world } of [TH.makeDevice({ userid: null }), await signedInDevice()]) {
      const [form, dna] = [secretForm(), { passphrase: 'a fake passphrase', passkeyAnswer: TH.passkeyAnswerOf(), nextPasskeyAnswer: TH.passkeyAnswerOf() }]
      world.vacateUnlessAttemptable(form)
      world.vacateUnlessAttemptable(dna)
      expect([...form.keys()]).to.deep.equal(['username'])
      expect([TH.isZeroed(dna.passkeyAnswer.prfBytes), TH.isZeroed(dna.nextPasskeyAnswer.prfBytes)]).to.deep.equal([true, true])
      for (const handed of ['a fake passphrase', 42, null, undefined, { passphrase: 42 }]) { world.vacateUnlessAttemptable(handed) }
    }
  })

  it("clears what it is handed once the world is swept", async () => {
    const { device } = await TH.buildBornBank()
    device.sweep()
    const dna = { passkeyAnswer: TH.passkeyAnswerOf() }
    device.world.vacateUnlessAttemptable(dna)
    expect(TH.isZeroed(dna.passkeyAnswer.prfBytes)).to.be.true
  })
})

/** Each order the bank, the main gate and the root box of a bank born elsewhere may arrive in, one at a time. */
const RootOrderCases = [
  [["bank", "gate", "box"], 'the order an answer tells them in'],
  [["box", "bank", "gate"], 'the root box first'],
  [["gate", "box", "bank"], 'the main gate first, the bank last'],
  [["bank", "box", "gate"], 'the main gate last'],
] as const

describe("a world's stage as its roots arrive one at a time", () => {
  for (const [order, blurb] of RootOrderCases) {
    it(`shows unborn until the last root lands, then locked, in ${blurb}`, async () => {
      const born   = await TH.buildBornBank()
      const minder = born.device.world.demandVaultMinder()
      const device = TH.makeDevice()
      await device.signin(TH.WorldScope.userid)
      expect(device.getSnapshot().bank.stage).to.eq('unborn')
      const stages: string[] = []
      device.subscribe(() => { stages.push(device.getSnapshot().bank.stage) })
      for (const labelpath of order) {
        const record = minder.thingAt({ ...TH.WorldScope, labelpath })!.pickle() as SeenThing
        device.world.demandVaultMinder().receive({ ...TH.itemEventOf(record), sourcelabel: 'other_device', read_tc: readTcNow() })
      }
      expect(stages).to.deep.equal(['locked'])
      expect([device.bank, device.vault]).to.not.include(null)
    })
  }
})

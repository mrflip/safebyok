/** A Box's whisper: extractWhisper, the kept value through a lock, the bags, and what may be a whisper. The states are in box-whisper-states.test.ts. */

import { describe, expect, it } from 'vitest'
import { ENCRYPTED, LOCKED, VEILED, Whispered, brandOf, isWhisperedBag } from '../../src/helpers/consts'
import type { Whisper } from '../../src/shapes/shapes-core'
import type { BoxWorld, Fetched } from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../../src/shapes/shapes-storage'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

/** A box built of `record`, with the same record in storage. */
function builtOf(record: Fetched<BoxRecord, BoxSparse>): Promise<TestableBox> {
  world.mw.seedPut(record)
  return boxListingOf(world.mw).build(record)
}

const TestWhisper = { apiKey: 'sk-test-0000' }

/** A box whose whisper is `whisper`, that whisper exposed. */
async function exposedOf(whisper: Whisper = TestWhisper): Promise<TestableBox> {
  const box = await builtOf(fullBoxRecord())
  await box.put({ whisper })
  return box.expose()
}

// == [The absent contract]: a box gone or damaged has no whisper to open

describe("box.extractWhisper(): refused from its guard", () => {
  const RefusedCases = [
    // absent, refused ahead of the seal:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      false,   "absent_box",       'a deleted box'],
    // locked, refused first:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      true,    "vault_locked",     'a deleted box while the vault is locked'],
    [() => fullBoxRecord(),                              true,    "vault_locked",     'a full box while the vault is locked'],
    // present and full, past the guard to a lease that never sealed it:
    [() => fullBoxRecord(),                              false,   "damaged_whisper",  'a full box whose whisper will not open'],
  ] as const
  for (const [recordOf, isLocked, refusalkind, blurb] of RefusedCases) {
    it(`refuses '${refusalkind}' for ${blurb}`, async () => {
      const box = await boxListingOf(world.mw).build(recordOf())
      world.mw.setLocked(isLocked)
      await TH.expectRefusal(box.extractWhisper(), refusalkind)
    })
  }
})
// --

// == [What the lease opens]: a whisper that opens to no whisper

describe("box.extractWhisper(): a decrypted value that is not a valid whisper", () => {
  const OpenedCases = [
    ['text that is not JSON',           'sk-test-SECRET {'],
    ['JSON that is not a whisper',      'null'],
    ['JSON that is a bare string',      '"sk-test-SECRET"'],
    ['JSON that is an array',           '["sk-test-SECRET"]'],
  ] as const
  for (const [blurb, text] of OpenedCases) {
    it(`refuses 'damaged_whisper' for ${blurb}, quoting none of it`, async () => {
      const base = world.mw.world
      const leasedWorld: BoxWorld = { vault_tok: base.vault_tok, get isLocked() { return base.isLocked }, receiveWorld: (taken) => { base.receiveWorld(taken) }, ensureTimely: (maxMillis) => base.ensureTimely(maxMillis), sealStampedString: () => Promise.reject(new Error('nothing is sealed here')), unsealStampedString: () => Promise.resolve(text), subscribe: (listener) => base.subscribe(listener) }
      const box = await boxListingOf(world.mw, { world: leasedWorld }).build(fullBoxRecord())
      const err = await TH.expectRefusal(box.extractWhisper(), 'damaged_whisper')
      expect(err.message).to.eq(Phrases.UndecodedWhisper)
      expect(JSON.stringify({ meta: err.meta, cause: String(err.cause) })).to.not.include('SECRET')
    })
  }
})
// --

// == [The whisper while locked]

describe("box.whisper through a lock", () => {
  it("keeps the whisper exposed while the vault locks, and reads it again once unlocked", async () => {
    const box = await exposedOf()
    world.mw.setLocked(true)
    expect(box.whisper).to.eq(LOCKED)
    expect(box.getSnapshot().isExposed).to.be.true
    world.mw.setLocked(false)
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000' })
  })

  it("returns the same object once unlocked, keeping edits made before and during the lock", async () => {
    const box = await exposedOf({ apiKey: 'sk-test-0000' })
    const exposed = box.whisper as { apiKey: string, org?: string }
    exposed.apiKey = 'sk-test-edited'
    world.mw.setLocked(true)
    exposed.org = 'acme'
    expect(box.whisper).to.eq(LOCKED)
    world.mw.setLocked(false)
    expect(box.whisper).to.eq(exposed)
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-edited', org: 'acme' })
  })

  it("refuses 'vault_locked' at an expose while locked, keeping the exposed whisper", async () => {
    const box = await exposedOf()
    world.mw.setLocked(true)
    await TH.expectRefusal(box.expose(), 'vault_locked')
    world.mw.setLocked(false)
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000' })
  })
})
// --

// == [The bags]: ENCRYPTED, LOCKED, VEILED, Whispered, isWhisperedBag

describe("the sentinel bags and isWhisperedBag", () => {
  const Bags = [[ENCRYPTED, 'encrypted'], [LOCKED, 'locked'], [VEILED, 'veiled']] as const

  for (const [bag, kind] of Bags) {
    it(`${kind} is frozen, carries the mark, and shows nothing as JSON`, () => {
      expect(Object.isFrozen(bag)).to.be.true
      expect(brandOf(bag, Whispered)).to.eq(kind)
      expect(JSON.stringify(bag)).to.eq('{}')
    })
  }

  it("marks with the symbol every copy of the module shares", () => {
    expect(Whispered).to.eq(Symbol.for('@safebyok/whispered'))
  })

  const CarriesCases = [
    [ENCRYPTED,                                       true,  'the encrypted bag'],
    [LOCKED,                                          true,  'the locked bag'],
    [VEILED,                                          true,  'the veiled bag'],
    [{ ...LOCKED },                                   true,  'a copy made by spreading it'],
    [Object.assign({}, VEILED),                       true,  'a copy made by assigning it'],
    [{ [Symbol.for('@safebyok/whispered')]: 'mine' }, true,  'a forgery carrying the mark'],
    [Symbol.for('@safebyok/whispered'),               false, 'the symbol itself'],
    [{},                                              false, 'an empty bag'],
    [{ deep: { ...LOCKED } },                         false, 'a whisper with a bag nested in it'],
    [{ apiKey: 'sk-test-0000' },                      false, 'a whisper'],
    [null,                                            false, 'null'],
    [undefined,                                       false, 'undefined'],
    ['LOCKED',                                        false, 'its name'],
  ] as const
  for (const [val, expected, blurb] of CarriesCases) {
    it(`is ${String(expected)} for ${blurb}`, () => {
      expect(isWhisperedBag(val)).to.eq(expected)
    })
  }

  it("never mistakes a whisper with a bag's name in it for a bag", async () => {
    const box = await exposedOf({ LOCKED: 'LOCKED' })
    expect(isWhisperedBag(box.whisper)).to.be.false
    expect(box.whisper).to.deep.equal({ LOCKED: 'LOCKED' })
  })

  for (const [bag, kind] of Bags) {
    it(`refuses a put of the ${kind} bag, a copy of it, or a whisper with it nested, keeping what is stored`, async () => {
      const box = await exposedOf()
      for (const whisper of [bag, { ...bag }, { deep: { ...bag } }]) {
        await TH.expectRefusal(box.put({ whisper }))
      }
      expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test-0000' })
    })
  }

  it("refuses a put of the whisper read while locked, even after the unlock", async () => {
    const box = await exposedOf()
    world.mw.setLocked(true)
    const readWhileLocked = box.whisper
    world.mw.setLocked(false)
    world.mw.clearCalls()
    await TH.expectRefusal(box.put({ whisper: readWhileLocked }))
    expect(world.mw.callsOf('put')).to.deep.equal([])
    expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test-0000' })
  })
})
// --

// == [What a whisper may be]: put, expose

describe("box.whisper and box.put: what a whisper may be", () => {
  const BadWhisperCases = [
    [null,                                               'null'],
    ['sk-test-SECRET',                                   'a bare string'],
    [42,                                                 'a bare number'],
    [true,                                               'a bare boolean'],
    [['sk-test-SECRET'],                                 'an array'],
    [{ apiKey: 'sk-test-SECRET', when: new Date(T0) },   'an object JSON would mangle'],
    [['sk-test-SECRET', undefined],                      'an array with undefined'],
    [{ SECRET_KEY: new Map() },                          'an object with a Map'],
  ] as const

  for (const [whisper, blurb] of BadWhisperCases) {
    it(`refuses a put of ${blurb}, putting nothing and quoting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      world.mw.clearCalls()
      const err = await TH.expectRefusal(box.put({ whisper: whisper as never, sidecar: {} }))
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      expect(world.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("refuses a whisper JSON would mangle, even while the vault is locked", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.setLocked(true)
    await TH.expectRefusal(box.put({ whisper: new Date(T0), sidecar: {} }))
  })

  it("exposes a copy of the whisper put, not the host's object", async () => {
    const box = await builtOf(fullBoxRecord())
    const given = { apiKey: 'sk-test-0000', deep: { orgId: 'org-0000' } }
    await box.put({ whisper: given })
    given.apiKey = 'sk-test-changed'
    await box.expose()
    const AsPut = { apiKey: 'sk-test-0000', deep: { orgId: 'org-0000' } }
    expect(box.whisper).to.deep.equal(AsPut)
    const exposed = box.whisper as typeof AsPut
    expect(Object.isFrozen(exposed)).to.be.false
    expect(Object.isFrozen(exposed.deep)).to.be.false
    exposed.deep.orgId = 'org-1111'
    expect(box.whisper).to.eq(exposed)
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000', deep: { orgId: 'org-1111' } })
    expect(await box.extractWhisper()).to.deep.equal(AsPut)
    await box.expose()
    expect(box.whisper).to.not.eq(exposed)
    expect(box.whisper).to.deep.equal(AsPut)
  })

  for (const [whisper, blurb] of [[{}, 'an empty object'], [{ val: null }, 'an object whose val is null']] as const) {
    it(`puts and opens ${blurb} unchanged`, async () => {
      const box = await builtOf(fullBoxRecord())
      await box.put({ whisper })
      expect(await box.extractWhisper()).to.deep.equal(whisper)
      await box.expose()
      expect(box.whisper).to.deep.equal(whisper)
      expect(box.getSnapshot().isExposed).to.be.true
      await box.put({ sidecar: { note: 'kept' } })
      expect(await box.extractWhisper()).to.deep.equal(whisper)
    })
  }

  it("opens a box sealed as { val } in the old form as the whisper { val }", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ whisper: { val: 'sk-test-0000' } })
    expect(await box.extractWhisper()).to.deep.equal({ val: 'sk-test-0000' })
  })

  it("keeps the exposed whisper out of every snapshot and JSON form of the box", async () => {
    const box = await exposedOf({ apiKey: 'sk-test-SECRET' })
    for (const form of [box.toJSON(), box, box.getSnapshot(), { central: box._cheat_central }]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

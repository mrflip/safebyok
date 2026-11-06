/** A Box's whisper: extractWhisper, the kept value through a lock, the bags, and what may be a whisper. The states are in box-whisper-states.test.ts. */

import { describe, expect, it } from 'vitest'
import { ENCRYPTED, LOCKED, VEILED, Whispered } from '../../src/helpers/consts'
import type { Whisper } from '../../src/shapes/shapes-core'
import type { BoxRecord, BoxSparse, BoxWorld, Fetched } from '../../src/shapes/shapes-vaultish'
import { Storable } from '../../src/models/storable'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

/** A box built of `record`, with the same record in storage. */
const builtOf = (record: Fetched<BoxRecord, BoxSparse>): Promise<TestableBox> => {
  held.mw.seedStore(record)
  return boxListingOf(held.mw).build(record)
}

const TestWhisper = { apiKey: 'sk-test-0000' }

/** A box storing `whisper`, that whisper exposed. */
const exposedOf = async (whisper: Whisper = TestWhisper): Promise<TestableBox> => {
  const box = await builtOf(fullBoxRecord())
  await box.put({ whisper })
  return box.expose()
}

// == [The absent contract]: a box gone or damaged has no whisper to open

describe("box.extractWhisper(): refused from its guard", () => {
  const RefusedCases = [
    // absent, refused ahead of the seal:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      "unlocked", "absent_box",       'a deleted box'],
    // locked, refused first:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      "locked",   "vault_locked",     'a deleted box while the vault is locked'],
    [() => fullBoxRecord(),                              "locked",   "vault_locked",     'a full box while the vault is locked'],
    // present and full, past the guard to a lease that never sealed it:
    [() => fullBoxRecord(),                              "unlocked", "damaged_box",      'a full box whose whisper will not open'],
  ] as const
  for (const [recordOf, lockState, refusalkind, blurb] of RefusedCases) {
    it(`refuses '${refusalkind}' for ${blurb}`, async () => {
      const box = await boxListingOf(held.mw).build(recordOf())
      held.mw.setLockState(lockState)
      await TH.expectRefusal(box.extractWhisper(), refusalkind)
    })
  }
})
// --

// == [What the lease opens]: a whisper that opens to no whisper

describe("box.extractWhisper(): what the lease opens that is no whisper", () => {
  const OpenedCases = [
    ['text that is no JSON',            'sk-test-SECRET {'],
    ['JSON that is no whisper',         'null'],
    ['JSON that is a bare string',      '"sk-test-SECRET"'],
    ['JSON that is an array',           '["sk-test-SECRET"]'],
  ] as const
  for (const [blurb, text] of OpenedCases) {
    it(`refuses 'damaged_box' for ${blurb}, quoting none of it`, async () => {
      const { world } = held.mw
      const leasedWorld: BoxWorld = { scope: world.scope, vault_tok: world.vault_tok, lockState: () => world.lockState(), tellBadNews: (badnews) => { world.tellBadNews(badnews) }, demandUnlocked: () => world.demandUnlocked(), takeWorld: (taken) => { world.takeWorld(taken) }, ensureTimely: (maxMillis) => world.ensureTimely(maxMillis), sealStampedString: () => Promise.reject(new Error('nothing is sealed here')), unsealStampedString: () => Promise.resolve(text), subscribe: (listener) => world.subscribe(listener) }
      const box = await boxListingOf(held.mw, { world: leasedWorld }).build(fullBoxRecord())
      const err = await TH.expectRefusal(box.extractWhisper(), 'damaged_box')
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
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
    expect(box.getSnapshot().exposed).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000' })
  })

  it("gives back the very object once unlocked, an edit made before the lock or during it kept", async () => {
    const box = await exposedOf({ apiKey: 'sk-test-0000' })
    const exposed = box.whisper as { apiKey: string, org?: string }
    exposed.apiKey = 'sk-test-edited'
    held.mw.setLockState('locked')
    exposed.org = 'acme'
    expect(box.whisper).to.eq(LOCKED)
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.eq(exposed)
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-edited', org: 'acme' })
  })

  it("refuses 'vault_locked' at an expose while locked, keeping the one exposed", async () => {
    const box = await exposedOf()
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.expose(), 'vault_locked')
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000' })
  })
})
// --

// == [The bags]: ENCRYPTED, LOCKED, VEILED, Whispered, Storable.isFUBag

describe("the bags and Storable.isFUBag: a mark, not an identity", () => {
  const Bags = [[ENCRYPTED, 'encrypted'], [LOCKED, 'locked'], [VEILED, 'veiled']] as const

  for (const [bag, kind] of Bags) {
    it(`${kind} is frozen, carries the mark, and shows nothing as JSON`, () => {
      expect(Object.isFrozen(bag)).to.be.true
      expect(Reflect.get(bag, Whispered)).to.eq(kind)
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
    [{ [Symbol.for('@safebyok/whispered')]: 'mine' }, true,  'a forgery, harmless as it only ever refuses at a put'],
    [Symbol.for('@safebyok/whispered'),               false, 'the symbol itself'],
    [{},                                              false, 'an empty bag'],
    [{ deep: { ...LOCKED } },                         false, 'a whisper with one nested, which CX.whisper refuses all the same'],
    [{ apiKey: 'sk-test-0000' },                      false, 'a whisper'],
    [null,                                            false, 'null'],
    [undefined,                                       false, 'undefined'],
    ['LOCKED',                                        false, 'its name'],
  ] as const
  for (const [val, expected, blurb] of CarriesCases) {
    it(`is ${String(expected)} for ${blurb}`, () => {
      expect(Storable.isFUBag(val)).to.eq(expected)
    })
  }

  it("never takes a whisper for one: a whisper of that name is exposed", async () => {
    const box = await exposedOf({ LOCKED: 'LOCKED' })
    expect(Storable.isFUBag(box.whisper)).to.be.false
    expect(box.whisper).to.deep.equal({ LOCKED: 'LOCKED' })
  })

  for (const [bag, kind] of Bags) {
    it(`refuses ${kind}, a copy, or one nested, at a put, keeping what is stored`, async () => {
      const box = await exposedOf()
      for (const whisper of [bag, { ...bag }, { deep: { ...bag } }]) {
        await TH.expectRefusal(box.put({ whisper }), 'bad_option')
      }
      expect(await box.extractWhisper()).to.deep.equal({ apiKey: 'sk-test-0000' })
    })
  }

  it("stores nothing of a whisper read while locked and put after the unlock", async () => {
    const box = await exposedOf()
    held.mw.setLockState('locked')
    const readWhileLocked = box.whisper
    held.mw.setLockState('unlocked')
    held.mw.clearCalls()
    await TH.expectRefusal(box.put({ whisper: readWhileLocked }), 'bad_option')
    expect(held.mw.callsOf('put')).to.deep.equal([])
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
    [['sk-test-SECRET', undefined],                      'an array holding undefined'],
    [{ SECRET_KEY: new Map() },                          'an object holding a Map'],
  ] as const

  for (const [whisper, blurb] of BadWhisperCases) {
    it(`refuses a put of ${blurb} as 'bad_option', putting nothing and quoting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.clearCalls()
      const err = await TH.expectRefusal(box.put({ whisper: whisper as never, sidecar: {} }), 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("refuses before its guards: a whisper JSON would mangle refuses while the vault is locked", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({ whisper: new Date(T0), sidecar: {} }), 'bad_option')
  })

  it("exposes a plain copy of the whisper put: the host's later change to its own reaches no box, and the box's takes an edit, stable until the next expose", async () => {
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

  for (const [whisper, blurb] of [[{}, 'an empty object'], [{ val: null }, 'an object with a val, no holder now']] as const) {
    it(`stores and opens ${blurb} as the whisper it is`, async () => {
      const box = await builtOf(fullBoxRecord())
      await box.put({ whisper })
      expect(await box.extractWhisper()).to.deep.equal(whisper)
      await box.expose()
      expect(box.whisper).to.deep.equal(whisper)
      expect(box.getSnapshot().exposed).to.be.true
      await box.put({ sidecar: { note: 'kept' } })
      expect(await box.extractWhisper()).to.deep.equal(whisper)
    })
  }

  it("opens a box sealed as { val } in the old form as the whisper { val }, not a failure", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ whisper: { val: 'sk-test-0000' } })
    expect(await box.extractWhisper()).to.deep.equal({ val: 'sk-test-0000' })
  })

  it("shows the whisper exposed in no snapshot or JSON of the box", async () => {
    const box = await exposedOf({ apiKey: 'sk-test-SECRET' })
    for (const form of [box.toJSON(), box, box.getSnapshot(), { central: box._cheat_central }]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

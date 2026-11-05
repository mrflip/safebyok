/** A Box's whisper: extractWhisper and expose, the setter, LOCKED, and the whisper given as { val }. */

import { describe, expect, it } from 'vitest'
import { LOCKED } from '../../src/helpers/consts'
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
    ['JSON that is no { val } holder',  '{"value":"sk-test-SECRET"}'],
  ] as const
  for (const [blurb, text] of OpenedCases) {
    it(`refuses 'damaged_box' for ${blurb}, quoting none of it`, async () => {
      const { world } = held.mw
      const leasedWorld: BoxWorld = { clock: world.clock, scope: world.scope, vault_tok: world.vault_tok, lockState: () => world.lockState(), tellBadNews: (badnews) => { world.tellBadNews(badnews) }, demandUnlocked: () => world.demandUnlocked(), takeWorld: (taken) => { world.takeWorld(taken) }, ensureTimely: (maxMillis) => world.ensureTimely(maxMillis), sealStampedString: () => Promise.reject(new Error('nothing is sealed here')), unsealStampedString: () => Promise.resolve(text) }
      const box = await boxListingOf(held.mw, { world: leasedWorld }).build(fullBoxRecord())
      const err = await TH.expectRefusal(box.extractWhisper(), 'damaged_box')
      expect(err.message).to.eq(Phrases.UndecodedWhisper)
      expect(JSON.stringify({ meta: err.meta, cause: String(err.cause) })).to.not.include('SECRET')
    })
  }
})
// --

// == [The whisper while locked]

describe("box.whisper while the vault is locked", () => {
  it("reads LOCKED over a whisper exposed", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("keeps the whisper exposed while the vault locks, and reads it again once unlocked", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
    expect(box.getSnapshot().exposed).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

// == [Forgetting the whisper]: whisper = null or LOCKED while locked

describe("box.whisper = null while the vault is locked", () => {
  for (const [forget, blurb] of [[null, 'null'], [LOCKED, 'LOCKED']] as const) {
    it(`passes setting ${blurb}, forgetting the whisper exposed, which stays forgotten once unlocked`, async () => {
      const box = await builtOf(fullBoxRecord())
      box.whisper = { val: 'sk-test-0000' }
      held.mw.setLockState('locked')
      box.whisper = forget
      expect(box.getSnapshot().exposed).to.be.false
      held.mw.setLockState('unlocked')
      expect(box.whisper).to.be.null
    })
  }

  it("refuses 'vault_locked' setting a new whisper, keeping the one exposed", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = { val: 'sk-test-1111' } }, 'vault_locked')
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

// == [LOCKED, a frozen bag]: LOCKED, Storable.isLockedFUBag, the whisper setter

describe("LOCKED and Storable.isLockedFUBag: a frozen bag of the package's own (the Coach, 2026-10-31)", () => {
  it("is frozen, and shows nothing as JSON", () => {
    expect(Object.isFrozen(LOCKED)).to.be.true
    expect(JSON.stringify(LOCKED)).to.eq('{}')
  })

  const LookalikeCases = [
    [Symbol.for('LOCKED'),          "Symbol.for('LOCKED'), the symbol it once was"],
    [{},                            'an empty bag'],
    [{ ...LOCKED },                 'a copy made by spreading it'],
    [Object.assign({}, LOCKED),     'a copy made by assigning it'],
    [{ val: 'sk-test-0000' },       'a whisper given as { val }'],
    [null,                          'null'],
    [undefined,                     'undefined'],
    ['LOCKED',                      'its name'],
  ] as const

  it("is true for LOCKED", () => {
    expect(Storable.isLockedFUBag(LOCKED)).to.be.true
  })

  for (const [lookalike, blurb] of LookalikeCases) {
    it(`is false for ${blurb}`, () => {
      expect(Storable.isLockedFUBag(lookalike)).to.be.false
    })
  }

  it("is what box.whisper answers while the vault is locked, over a whisper exposed or none", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    expect(Storable.isLockedFUBag(box.whisper)).to.be.true
    held.mw.setLockState('unlocked')
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("forgets the whisper exposed when set, as null does, while unlocked", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    box.whisper = LOCKED
    expect(box.whisper).to.be.null
    expect(box.getSnapshot().exposed).to.be.false
  })

  it("never takes a whisper for it: a whisper set is exposed, and a copy of LOCKED is refused as no whisper", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'LOCKED' }
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
    TH.expectSyncRefusal(() => { box.whisper = { ...LOCKED } }, 'bad_option')
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
  })
})
// --

// == [The whisper as { val }]: the whisper setter, put

describe("box.whisper and box.put: the whisper given as { val }", () => {
  const BadWhisperCases = [
    ['sk-test-SECRET',                                          'a bare whisper'],
    [{ val: null },                                             'a val that is null'],
    [{ val: { apiKey: 'sk-test-SECRET', when: new Date(T0) } }, 'a val JSON would mangle'],
    [{ val: 'sk-test-SECRET', SECRET_NOTE: 'x' },               'a field beside the val'],
    [{ value: 'sk-test-SECRET' },                               'a whisper under another name'],
  ] as const

  for (const [whisper, blurb] of BadWhisperCases) {
    it(`refuses setting ${blurb} as 'bad_option', keeping the whisper exposed and quoting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      box.whisper = { val: 'sk-test-0000' }
      const err = TH.expectSyncRefusal(() => { box.whisper = whisper as never }, 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
    })

    it(`refuses a put of ${blurb} as 'bad_option', putting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: whisper as never, sidecar: {} }), 'bad_option')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("refuses 'bad_option' before its guards: a bare whisper refuses so while the vault is locked, set or sent", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = 'sk-test-0000' as never }, 'bad_option')
    await TH.expectRefusal(box.put({ whisper: 'sk-test-0000' as never, sidecar: {} }), 'bad_option')
  })

  it("keeps a frozen copy of the whisper set: the host's later change to its own reaches no box, and the box's cannot be changed in place, val and all", async () => {
    const box = await builtOf(fullBoxRecord())
    const given = { val: { apiKey: 'sk-test-0000' } }
    box.whisper = given
    given.val.apiKey = 'sk-test-changed'
    expect(box.whisper).to.deep.equal({ val: { apiKey: 'sk-test-0000' } })
    expect(Object.isFrozen(box.whisper)).to.be.true
    expect(() => { (box.whisper as { val: unknown }).val = 'sk-test-1111' }).to.throw(TypeError)
    expect(() => { ((box.whisper as { val: { apiKey: string } }).val).apiKey = 'sk-test-1111' }).to.throw(TypeError)
    expect(box.whisper).to.deep.equal({ val: { apiKey: 'sk-test-0000' } })
  })

  it("shows the whisper exposed in no snapshot or JSON of the box", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: { apiKey: 'sk-test-SECRET' } }
    for (const form of [box.toJSON(), box, box.getSnapshot(), { central: box._cheat_central }]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

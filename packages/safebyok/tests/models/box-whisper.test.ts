/** A Box's whisper: extractWhisper, expose and veil, LOCKED, and the whisper given as { val }. */

import { describe, expect, it } from 'vitest'
import { LOCKED } from '../../src/helpers/consts'
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

/** A box storing `val`, that whisper exposed. */
const exposedOf = async (val: Whisper = 'sk-test-0000'): Promise<TestableBox> => {
  const box = await builtOf(fullBoxRecord())
  await box.put({ whisper: { val } })
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
    const box = await exposedOf()
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("keeps the whisper exposed while the vault locks, and reads it again once unlocked", async () => {
    const box = await exposedOf()
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
    expect(box.getSnapshot().exposed).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

// == [Veiling the whisper]: box.veil, locked or not

describe("box.veil()", () => {
  it("overwrites the whisper exposed and answers the box, while unlocked", async () => {
    const box = await exposedOf()
    expect(box.veil()).to.eq(box)
    expect(box.whisper).to.be.null
    expect(box.getSnapshot().exposed).to.be.false
  })

  it("passes while the vault is locked, and the whisper stays veiled once unlocked", async () => {
    const box = await exposedOf()
    held.mw.setLockState('locked')
    expect(box.veil()).to.eq(box)
    expect(box.getSnapshot().exposed).to.be.false
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.be.null
  })

  it("passes with nothing exposed, and on a box discarded", async () => {
    const box = await builtOf(fullBoxRecord())
    expect(box.veil().whisper).to.be.null
    box.sweep()
    expect(box.veil()).to.eq(box)
  })

  it("refuses 'vault_locked' at an expose while locked, keeping the one exposed", async () => {
    const box = await exposedOf()
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.expose(), 'vault_locked')
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

// == [LOCKED, a frozen bag]: LOCKED, Storable.isLockedFUBag

describe("LOCKED and Storable.isLockedFUBag: a frozen bag of the package's own", () => {
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
    await box.put({ whisper: { val: 'sk-test-0000' } })
    await box.expose()
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("never takes a whisper for it: a whisper of that name is exposed, and LOCKED or a copy is refused at a put as no whisper", async () => {
    const box = await exposedOf('LOCKED')
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
    await TH.expectRefusal(box.put({ whisper: LOCKED as never }), 'bad_option')
    await TH.expectRefusal(box.put({ whisper: { ...LOCKED } as never }), 'bad_option')
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
  })
})
// --

// == [The whisper as { val }]: put, expose

describe("box.whisper and box.put: the whisper given as { val }", () => {
  const BadWhisperCases = [
    ['sk-test-SECRET',                                          'a bare whisper'],
    [{ val: null },                                             'a val that is null'],
    [{ val: { apiKey: 'sk-test-SECRET', when: new Date(T0) } }, 'a val JSON would mangle'],
    [{ val: 'sk-test-SECRET', SECRET_NOTE: 'x' },               'a field beside the val'],
    [{ value: 'sk-test-SECRET' },                               'a whisper under another name'],
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

  it("refuses before its guards: a bare whisper refuses while the vault is locked", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({ whisper: 'sk-test-0000' as never, sidecar: {} }), 'bad_option')
  })

  it("exposes a frozen copy of the whisper put: the host's later change to its own reaches no box, and the box's cannot be changed in place, val and all", async () => {
    const box = await builtOf(fullBoxRecord())
    const given = { val: { apiKey: 'sk-test-0000' } }
    await box.put({ whisper: given })
    given.val.apiKey = 'sk-test-changed'
    await box.expose()
    expect(box.whisper).to.deep.equal({ val: { apiKey: 'sk-test-0000' } })
    expect(Object.isFrozen(box.whisper)).to.be.true
    expect(() => { (box.whisper as { val: unknown }).val = 'sk-test-1111' }).to.throw(TypeError)
    expect(() => { ((box.whisper as { val: { apiKey: string } }).val).apiKey = 'sk-test-1111' }).to.throw(TypeError)
    expect(box.whisper).to.deep.equal({ val: { apiKey: 'sk-test-0000' } })
  })

  it("shows the whisper exposed in no snapshot or JSON of the box", async () => {
    const box = await exposedOf({ apiKey: 'sk-test-SECRET' })
    for (const form of [box.toJSON(), box, box.getSnapshot(), { central: box._cheat_central }]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

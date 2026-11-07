/** A Box's whisper as React would have it: `box.patchWhisper`, and the stable identity `useSyncExternalStore` needs of `box.whisper`. */

import { describe, expect, it, vi } from 'vitest'
import { LOCKED, VEILED } from '../../src/helpers/consts'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const Stored = { apiKey: 'sk-test-0000', org: { name: 'acme', seats: 3 }, tags: ['a', 'b'] }
const lock = () => { held.mw.setLocked(true) }

/** A box storing {@link Stored}, not exposed. */
const unexposedOf = async (): Promise<TestableBox> => {
  const record = fullBoxRecord()
  held.mw.seedStore(record)
  const box = await boxListingOf(held.mw).build(record)
  return box.put({ whisper: Stored })
}

describe("box.patchWhisper", () => {
  it("deep-merges into a new object, its arrays replaced, leaving the old one be and storing nothing", async () => {
    const box = await unexposedOf()

    await box.expose()
    const was = box.whisper
    const tryPutBox = vi.spyOn(held.mw.vaultDB, 'tryPutBox')
    expect(box.patchWhisper({ org: { seats: 4 }, tags: ['c'], added: true })).to.eq(box)
    expect(box.whisper).not.to.eq(was)
    expect(box.whisper).to.deep.equal({ apiKey: Stored.apiKey, org: { name: 'acme', seats: 4 }, tags: ['c'], added: true })
    expect(was).to.deep.equal(Stored)
    expect(tryPutBox).not.toHaveBeenCalled()
    expect(await box.extractWhisper()).to.deep.equal(Stored)
  })

  it("tells each subscriber once, leaving the snapshot, which holds nothing of the value, as it was", async () => {
    const box = await unexposedOf()

    await box.expose()
    const told = vi.fn()
    box.subscribe(told)
    const was = box.getSnapshot()
    box.patchWhisper({ apiKey: 'sk-patched' })
    expect(told).toHaveBeenCalledOnce()
    expect(box.getSnapshot()).to.eq(was)
  })

  it("is what box.putExposed then stores", async () => {
    const box = await unexposedOf()

    await box.expose()
    await box.patchWhisper({ apiKey: 'sk-patched' }).putExposed()
    expect(await box.extractWhisper()).to.deep.include({ apiKey: 'sk-patched' })
  })

  it("merges behind a veil, which stays", async () => {
    const box = await unexposedOf()

    await box.expose()
    box.veil().patchWhisper({ apiKey: 'sk-patched' })
    expect(box.whisper).to.eq(VEILED)
    expect(box.unveil().whisper).to.deep.include({ apiKey: 'sk-patched' })
  })

  it("refuses while not exposed", async () => {
    const box = await unexposedOf()

    const err = TH.expectSyncRefusal(() => box.patchWhisper({ apiKey: 'x' }), 'bad_option')
    expect(err.message).to.eq(Phrases.NotExposed)
  })

  it("merges while locked, showing nothing and storing nothing, and the unlock shows it", async () => {
    const box = await unexposedOf()

    await box.expose()
    lock()
    const told = vi.fn()
    box.subscribe(told)
    const tryPutBox = vi.spyOn(held.mw.vaultDB, 'tryPutBox')
    expect(box.patchWhisper({ apiKey: 'sk-patched' }).whisper).to.eq(LOCKED)
    expect(told).toHaveBeenCalledOnce()
    expect(tryPutBox).not.toHaveBeenCalled()
    held.mw.setLocked(false)
    expect(box.whisper).to.deep.include({ apiKey: 'sk-patched' })
  })

  it("refuses while locked and not exposed", async () => {
    const box = await unexposedOf()

    lock()
    const err = TH.expectSyncRefusal(() => box.patchWhisper({ apiKey: 'x' }), 'bad_option')
    expect(err.message).to.eq(Phrases.NotExposed)
  })

  const BadPatches = [
    ['a symbol key',        { [Symbol('sneak')]: 1 }],
    ['a nested symbol key', { org: { [Symbol('sneak')]: 1 } }],
    ['a bag',               VEILED],
    ['a copy of a bag',     { ...LOCKED }],
    ['a bare string',       'sk-test' as never],
    ['an array',            ['sk-test'] as never],
  ] as const
  for (const [blurb, patch] of BadPatches) {
    it(`refuses ${blurb}, the value left as it was`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const was = box.whisper
      TH.expectSyncRefusal(() => box.patchWhisper(patch), 'bad_option')
      expect(box.whisper).to.eq(was)
    })
  }
})

describe("box.expose, repeated", () => {
  it("tells the subscribers of the new object, though the snapshot's fields do not move", async () => {
    const box = await unexposedOf()

    await box.expose()
    const was = box.whisper
    const told = vi.fn()
    box.subscribe(told)
    await box.expose()
    expect(told).toHaveBeenCalledOnce()
    expect(box.whisper).not.to.eq(was)
  })
})

describe("the identity useSyncExternalStore reads", () => {
  it("box.whisper answers one object until something moves, in every state, so a hook does not loop", async () => {
    const box = await unexposedOf()

    expect(box.whisper).to.eq(box.whisper)
    await box.expose()
    expect(box.whisper).to.eq(box.whisper)
    box.veil()
    expect(box.whisper).to.eq(box.whisper)
    lock()
    expect(box.whisper).to.eq(box.whisper)
    held.mw.setLocked(false)
    box.unveil()
    expect(box.whisper).to.eq(box.whisper)
    box.unexpose()
    expect(box.whisper).to.eq(box.whisper)
  })
})

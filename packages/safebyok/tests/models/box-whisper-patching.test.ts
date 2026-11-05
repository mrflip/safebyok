/** A Box's whisper as React would have it: `box.patchWhisper`, `box.whisperMasked`, and the stable identity `useSyncExternalStore` needs of each. */

import { describe, expect, it, vi } from 'vitest'
import { ENCRYPTED, LOCKED, VEILED, Whispered, WhisperMask } from '../../src/helpers/consts'
import * as Phrases from '../../src/helpers/phrases'
import { Box } from '../../src/models/box'
import * as TH from '../test-helpers'
import { type TestableBox, boxListingOf, fullBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

const Stored = { apiKey: 'sk-test-0000', org: { name: 'acme', seats: 3 }, tags: ['a', 'b'] }
const lock = () => { held.mw.setLockState('locked') }

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

  it("tells each subscriber once, moving getSnapshot's identity with nothing of the value on it", async () => {
    const box = await unexposedOf()

    await box.expose()
    const told = vi.fn()
    box.subscribe(told)
    const was = box.getSnapshot()
    box.patchWhisper({ apiKey: 'sk-patched' })
    expect(told).toHaveBeenCalledOnce()
    expect(box.getSnapshot()).not.to.eq(was)
    expect(box.getSnapshot()).to.deep.equal(was)
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

  it("refuses 'bad_option' while not exposed", async () => {
    const box = await unexposedOf()

    const err = TH.expectSyncRefusal(() => box.patchWhisper({ apiKey: 'x' }), 'bad_option')
    expect(err.message).to.eq(Phrases.NotExposed)
  })

  it("refuses 'vault_locked' while locked, exposed or not", async () => {
    const box = await unexposedOf()

    lock()
    TH.expectSyncRefusal(() => box.patchWhisper({ apiKey: 'x' }), 'vault_locked')
    held.mw.setLockState('unlocked')
    await box.expose()
    lock()
    TH.expectSyncRefusal(() => box.patchWhisper({ apiKey: 'x' }), 'vault_locked')
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
    it(`refuses 'bad_option' given ${blurb}, the value left as it was`, async () => {
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

describe("box.whisperMasked", () => {
  const Masked = { apiKey: WhisperMask, org: { name: WhisperMask, seats: WhisperMask }, tags: [WhisperMask, WhisperMask] }

  it("is the encrypted bag while not exposed, locked or not", async () => {
    const box = await unexposedOf()

    expect(box.whisperMasked).to.eq(ENCRYPTED)
    lock()
    expect(box.whisperMasked).to.eq(ENCRYPTED)
  })

  it("is the value itself when it shows", async () => {
    const box = await unexposedOf()

    await box.expose()
    expect(box.whisperMasked).to.eq(box.whisper)
  })

  const HidingCases = [
    ['locked', lock],
    ['veiled', (box: TestableBox) => { box.veil() }],
  ] as const
  for (const [kind, hide] of HidingCases) {
    it(`while ${kind} has the value's shape, each leaf the mask, frozen, and marked '${kind}'`, async () => {
      const box = await unexposedOf()

      await box.expose()
      hide(box)
      const masked = box.whisperMasked
      expect(masked).to.deep.equal({ ...Masked, [Whispered]: kind })
      expect(Object.isFrozen(masked)).to.be.true
      expect(Box.isFUBag(masked)).to.be.true
      expect(JSON.stringify(masked)).not.to.include(Stored.apiKey)
    })

    it(`while ${kind} refuses a put of it, or a copy`, async () => {
      const box = await unexposedOf()

      await box.expose()
      hide(box)
      const masked = box.whisperMasked
      held.mw.setLockState('unlocked')
      const err = await TH.expectRefusal(box.put({ whisper: masked }), 'bad_option')
      expect(err.message).to.include(Phrases.WhisperedIsNoWhisper)
      await TH.expectRefusal(box.put({ whisper: { ...masked } }), 'bad_option')
    })

    it(`while ${kind} keeps its identity until the value changes`, async () => {
      const box = await unexposedOf()

      await box.expose()
      const reveal = box.whisperMasked
      hide(box)
      const masked = box.whisperMasked
      expect(masked).not.to.eq(reveal)
      expect(box.whisperMasked).to.eq(masked)
    })
  }

  it("is made again for a new value, and for a new reason", async () => {
    const box = await unexposedOf()

    await box.expose()
    box.veil()
    const veiled = box.whisperMasked
    expect(box.patchWhisper({ extra: 'leaf' }).whisperMasked).not.to.eq(veiled)
    expect(box.whisperMasked).to.deep.include({ extra: WhisperMask })
    const veiledAgain = box.whisperMasked
    lock()
    expect(box.whisperMasked).not.to.eq(veiledAgain)
    expect(Reflect.get(box.whisperMasked, Whispered)).to.eq('locked')
  })
})

describe("the identity useSyncExternalStore reads", () => {
  const Readers = [
    ['box.whisper',       (box: TestableBox) => box.whisper],
    ['box.whisperMasked', (box: TestableBox) => box.whisperMasked],
  ] as const
  for (const [blurb, read] of Readers) {
    it(`${blurb} answers one object until something moves, in every state, so a hook does not loop`, async () => {
      const box = await unexposedOf()

      expect(read(box)).to.eq(read(box))
      await box.expose()
      expect(read(box)).to.eq(read(box))
      box.veil()
      expect(read(box)).to.eq(read(box))
      lock()
      expect(read(box)).to.eq(read(box))
      held.mw.setLockState('unlocked')
      box.unveil()
      expect(read(box)).to.eq(read(box))
      box.unexpose()
      expect(read(box)).to.eq(read(box))
    })
  }
})

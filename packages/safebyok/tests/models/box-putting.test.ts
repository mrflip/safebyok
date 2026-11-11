/** A Box's put: rebirth over a tombstone, the lease's seal, the versioned replace, and a patch naming a half. */

import { ENCRYPTED, VEILED } from '../../src/helpers/consts'
import { describe, expect, it, vi } from 'vitest'
import { type BoxHalves, type Fetched } from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { FakeBoxKeyWrapped, FakeWhisperCiphered, type TestableBox, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0, type TestableBoxListing } from '../test-helpers/models-world'

const world = useModelsWorld()

/** A box built of `record`, with the same record in storage. */
const builtOf = (record: Fetched<BoxRecord, BoxSparse>, listing: TestableBoxListing = boxListingOf(world.mw)): Promise<TestableBox> => {
  world.mw.seedPut(record)
  return listing.build(record)
}

// == [Rebirth]: an edit over a box gone or damaged

describe("box.put(patch): rebirth over a tombstone", () => {
  const TombstoneCases = [
    ["rev-x2", 'a deleted box'],
  ] as const
  for (const [tok, blurb] of TombstoneCases) {
    it(`brings ${blurb} back to life under a new box_tok`, async () => {
      const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }), fakeSealBoxListingOf(world.mw))
      world.mw.setNow(T0 + 5000)
      await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'reborn' } })).resolves.to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box.box_tok).to.not.eq('box-tok-a')
      expect(box.registered_at).to.eq(T0 + 5000)
      const [put] = world.mw.callsOf('put')
      expect(put?.expectedRevisionTok).to.equal(tok)
      expect(put?.record).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, written_at: T0 + 5000, sidecar: { note: 'reborn' } })
      expect(box._cheat_central).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, box_tok: box.box_tok })
    })

    it(`brings ${blurb} back to life from a patch with only a sidecar`, async () => {
      const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }), fakeSealBoxListingOf(world.mw))
      world.mw.clearCalls()
      await box.put({ sidecar: { note: 'no whisper' } })
      expect(world.mw.callsOf('put')).to.have.lengthOf(1)
      expect(box.isPresent).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'no whisper' })
    })
  }
})
// --

// == [The seal in put]: the vault's lease seals what a put is given

describe("box.put(patch): the vault's lease seals the whisper and the sidecar", () => {
  it("seals a whisper and its sidecar over a full box with the vault's lease", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { account: 'work' } })
    expect(box.revision_seq).to.eq(2)
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.box_key_wrapped).to.deep.equal(FakeBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(FakeWhisperCiphered)
  })

  it("seals the sidecar given in place of the one the box carries", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { account: 'home' } })
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("seals a deleted box back to life with the sidecar given", async () => {
    const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2 }))
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    expect(box.isPresent).to.be.true
    expect(box.isFull).to.be.true
    expect(box.sidecar).to.deep.equal({})
    expect(box.revision_seq).to.eq(3)
  })

  it("seals a patch of both halves over a sparse record without fetching", async () => {
    const box = await builtOf(sparseBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    const ensuringWorld = vi.spyOn(world.mw.world, 'ensureTimely')
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { account: 'home' } }, { maxWorldMillis: 5 })
    expect(world.mw.callsOf('get')).to.deep.equal([])
    expect(world.mw.callsOf('put')).to.have.lengthOf(1)
    expect(ensuringWorld).toHaveBeenCalledWith(5)
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("fetches a whole box past its refresh horizon first, even for a patch of both halves", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { account: 'home' } }, { maxMillisSinceRefresh: 0 })
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
    expect(world.mw.callsOf('put')).to.have.lengthOf(1)
  })

  it("fetches a sparse box first where the patch keeps the sidecar stored", async () => {
    const box = await builtOf(sparseBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    await box.put({ whisper: { apiKey: 'sk-test-0000' } })
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
    expect(box.sidecar).to.deep.equal(fullBoxRecord().sidecar)
  })

  it("refuses a live box that is still sparse after hydrating", async () => {
    const box = await builtOf(sparseBoxRecord())
    world.mw.willGet(world.mw.answerOf(box.scope, sparseBoxRecord()))
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' } }))
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("keeps the whisper out of the cached record and the snapshot", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ whisper: { key: 'sk-test-SECRET' }, sidecar: {} })
    for (const form of [box.toJSON(), { central: box._cheat_central }, box.snapshot]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

/** Options that leave the box as built: a fetch of storage's box first would show the box built is not the first. */
const asBuilt = { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity } as const

describe("box.put: the versioned replace, with or without ifPresent 'repl'", () => {
  for (const opts of [{}, { ifPresent: 'repl' }] as const) {
    it(`refuses 'stale_write' for a box that changed in storage, and updates the box to the stored revision, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await builtOf(fullBoxRecord())
      world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
      world.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      const [put] = world.mw.callsOf('put')
      expect(put?.expectedRevisionTok).to.eq('rev-a1')
      expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
      expect(box).to.include({ revision_tok: 'rev-stored', revision_seq: 4 })
    })

    it(`refuses a put over a stored tombstone as stale, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await builtOf(fullBoxRecord())
      world.mw.seedPut(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-gone' }))
      world.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 2 })
    })
  }

  it("puts over the cached revision with ifPresent 'repl'", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'repl', ...asBuilt })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(2)
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: box.revision_tok, revision_seq: 2 })
  })

  it("refuses 'stale_write' when a newer revision arrives during the seal", async () => {
    const rival = fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-rival' })
    const listing = fakeSealBoxListingOf(world.mw, {}, () => { world.mw.seedPut(rival); box.receive(rival) })
    const box = await listing.build(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }), 'stale_write')
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-rival', revision_seq: 2 })
    expect(box.revision_tok).to.eq('rev-rival')
  })

  it("refuses 'camped' with ifPresent 'fail' over a live record, saving nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fail', ...asBuilt }), 'camped')
    expect(box.revision_seq).to.eq(1)
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-a1', revision_seq: 1 })
  })

  it("with ifPresent 'get' over a live record, returns the box unchanged and saves nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'get', ...asBuilt })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(1)
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-a1', revision_seq: 1 })
  })

  it("passes maxWorldMillis to the world when given beside ifPresent", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'repl', maxMillisSinceRefresh: Infinity, maxWorldMillis: 5 })).resolves.to.eq(box)
    expect(world.mw.callsOf('ensureTimely')[0]?.maxMillis).to.eq(5)
  })

  it("refuses an unknown ifPresent before putting anything", async () => {
    const box = await builtOf(fullBoxRecord())
    const before = box._cheat_central
    world.mw.clearCalls()
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fetch' as never, ...asBuilt }))
    expect(box._cheat_central).to.deep.equal(before)
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })
})

// == [A whisper and a sidecar on every update]: put, expose, veil

describe("box.put(patch): a patch naming a half", () => {
  const PatchCases = [
    [{},                                                       'neither'],
    [{ whisper: null, sidecar: { note: 'x' } },                'a whisper given as null'],
    [{ whisper: { apiKey: 'sk-test-0000' }, sidecar: null },      'a sidecar given as null'],
  ] as const

  for (const [patch, blurb] of PatchCases) {
    it(`refuses a put of ${blurb}, putting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      world.mw.clearCalls()
      await TH.expectRefusal(box.put(patch as unknown as BoxHalves))
      expect(world.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("names the failing field of a patch that fails its check", async () => {
    const box = await builtOf(fullBoxRecord())
    const err = await TH.expectRefusal(box.put({ whisper: null } as never), 'bad_option')
    expect(err.message).to.contain('whisper')
  })

  it("refuses a patch naming neither half, even while the vault is locked", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.setLocked(true)
    await TH.expectRefusal(box.put({}))
  })

  it("seals nothing on expose, veil or unexpose", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ whisper: { apiKey: 'sk-test-0000' } })
    const { revision_seq } = box
    world.mw.clearCalls()
    await box.expose()
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000' })
    box.veil()
    expect(box.whisper).to.eq(VEILED)
    box.unexpose()
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.revision_seq).to.eq(revision_seq)
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("seals the given sidecar over a full box, not the cached one", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    expect(box.sidecar).to.deep.equal({})
  })
})
// --

describe("box.put checks its patch before it checks the lock", () => {
  it("refuses a patch that names neither half before it looks at the lock", async () => {
    const box = await builtOf(fullBoxRecord())
    world.mw.setLocked(true)
    await TH.expectRefusal(box.put({}))
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses an empty patch over a sparse box, before any fetch", async () => {
    const box = await builtOf(sparseBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    await TH.expectRefusal(box.put({}))
    expect(world.mw.callsOf('get')).to.deep.equal([])
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("takes only the whisper and sidecar from a full patch, ignoring other fields", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ ...fullBoxRecord(), sidecar: { note: 'new' }, whisper: { apiKey: 'sk-test-0001' }, box_key_wrapped: undefined })
    expect(box._cheat_central).to.include({ revision_seq: 2, am: 'a' })
    expect(box.sidecar).to.deep.equal({ note: 'new' })
  })
})

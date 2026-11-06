/** A Box's put: rebirth over a tombstone, the lease's seal, the versioned replace, and a patch naming a half. */

import { ENCRYPTED, VEILED } from '../../src/helpers/consts'
import { describe, expect, it } from 'vitest'
import { type BoxHalves, type BoxRecord, type BoxSparse, type Fetched } from '../../src/shapes/shapes-vaultish'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { FakeBoxKeyWrapped, FakeWhisperCiphered, type TestableBox, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0, type TestableBoxListing } from '../test-helpers/models-world'

const held = useModelsWorld()

/** A box built of `record`, with the same record in storage. */
const builtOf = (record: Fetched<BoxRecord, BoxSparse>, listing: TestableBoxListing = boxListingOf(held.mw)): Promise<TestableBox> => {
  held.mw.seedStore(record)
  return listing.build(record)
}

// == [Rebirth]: an edit over a box gone or damaged

describe("box.put(patch): rebirth over a tombstone", () => {
  const TombstoneCases = [
    ["x", "rev-x2", 'a deleted box'],
  ] as const
  for (const [am, tok, blurb] of TombstoneCases) {
    it(`puts ${blurb} alive at the next revision, registered now under a new box_tok, over the tombstone's revision`, async () => {
      const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am), fakeSealBoxListingOf(held.mw))
      held.mw.setNow(T0 + 5000)
      await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'reborn' } })).resolves.to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box.box_tok).to.not.eq('box-tok-a')
      expect(box.registered_at).to.eq(T0 + 5000)
      const [put] = held.mw.callsOf('put')
      expect(put?.priorRevisionTok).to.equal(tok)
      expect(put?.record).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, written_at: T0 + 5000, sidecar: { note: 'reborn' } })
      expect(box._cheat_central).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, box_tok: box.box_tok })
    })

    it(`puts a sidecar with no whisper over ${blurb} alive, sealing an empty whisper`, async () => {
      const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am), fakeSealBoxListingOf(held.mw))
      held.mw.clearCalls()
      await box.put({ sidecar: { note: 'no whisper' } })
      expect(held.mw.callsOf('put')).to.have.lengthOf(1)
      expect(box.isPresent).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'no whisper' })
    })
  }
})
// --

// == [The seal in put]: the vault's lease seals what a put is given

describe("box.put(patch): the vault's lease seals the whisper and the sidecar", () => {
  it("seals a whisper with its sidecar over a full box at the next revision, its sealed parts the fake lease's", async () => {
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

  it("never seals over a sparse record", async () => {
    const box = await builtOf(sparseBoxRecord())
    held.mw.seedStore(fullBoxRecord())
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { account: 'home' } })
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("refuses a live box still sparse once hydrated, saying so, putting nothing", async () => {
    const box = await builtOf(sparseBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, sparseBoxRecord()))
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { account: 'home' } }), 'bad_option')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("holds nothing that carries the whisper, in the record in hand or the snapshot", async () => {
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
    it(`refuses 'stale_write' for a box that moved in storage, handing the box the revision stored, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
      held.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      const [put] = held.mw.callsOf('put')
      expect(put?.priorRevisionTok).to.eq('rev-a1')
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
      expect(box).to.include({ revision_tok: 'rev-stored', revision_seq: 4 })
    })

    it(`refuses it over a tombstone stored, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 1, revision_tok: 'rev-gone' }))
      held.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 1 })
    })
  }

  it("puts over the revision in hand, with ifPresent 'repl'", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'repl', ...asBuilt })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(2)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: box.revision_tok, revision_seq: 2 })
  })

  it("seals over the revision it took on entry: a frontier received during the seal is met as 'stale_write', not sealed over", async () => {
    const rival = fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-rival' })
    const listing = fakeSealBoxListingOf(held.mw, {}, () => { held.mw.seedStore(rival); box.receive(rival) })
    const box = await listing.build(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }), 'stale_write')
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-rival', revision_seq: 2 })
    expect(box.revision_tok).to.eq('rev-rival')
  })

  it("refuses 'camped' with ifPresent 'fail' over a live record, saving nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fail', ...asBuilt }), 'camped')
    expect(box.revision_seq).to.eq(1)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-a1', revision_seq: 1 })
  })

  it("resolves itself with ifPresent 'get' over a live record, holding that record and saving nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'get', ...asBuilt })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(1)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-a1', revision_seq: 1 })
  })

  it("takes the timely options beside ifPresent, handing the world its maxWorldMillis", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'repl', maxMillisSinceRefresh: Infinity, maxWorldMillis: 5 })).resolves.to.eq(box)
    expect(held.mw.callsOf('ensureTimely')[0]?.maxMillis).to.eq(5)
  })

  it("refuses an ifPresent off its menu, before putting anything", async () => {
    const box = await builtOf(fullBoxRecord())
    const before = box._cheat_central
    held.mw.clearCalls()
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fetch' as never, ...asBuilt }), 'bad_option')
    expect(box._cheat_central).to.deep.equal(before)
    expect(held.mw.callsOf('put')).to.deep.equal([])
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
    it(`refuses a put of ${blurb} as 'bad_option', putting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(box.put(patch as unknown as BoxHalves), 'bad_option')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("tells a patch that fails its check how an update of a box is written", async () => {
    const box = await builtOf(fullBoxRecord())
    const err = await TH.expectRefusal(box.put({ whisper: null } as never), 'bad_option')
    expect(err.message).to.contain(Phrases.BoxPatchAdvice)
  })

  it("refuses before its guards: a patch naming neither refuses while the vault is locked, too", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({}), 'bad_option')
  })

  it("seals nothing at an expose, a veil or an unexpose: they move only what the instance holds", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ whisper: { apiKey: 'sk-test-0000' } })
    const { revision_seq } = box
    held.mw.clearCalls()
    await box.expose()
    expect(box.whisper).to.deep.equal({ apiKey: 'sk-test-0000' })
    box.veil()
    expect(box.whisper).to.eq(VEILED)
    box.unexpose()
    expect(box.whisper).to.eq(ENCRYPTED)
    expect(box.revision_seq).to.eq(revision_seq)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("seals the sidecar given over a full box, carrying none over from the record in hand", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    expect(box.sidecar).to.deep.equal({})
  })
})
// --

describe("box.put checks its patch before it asks the lock", () => {
  it("refuses a patch that names neither half before it looks at the lock", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({}), 'bad_option')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses an empty patch over a sparse box, after its one fetch", async () => {
    const box = await builtOf(sparseBoxRecord())
    held.mw.seedStore(fullBoxRecord())
    await TH.expectRefusal(box.put({}), 'bad_option')
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("lays only the whisper and the sidecar of a full patch over the record, whatever else it carries", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ ...fullBoxRecord(), sidecar: { note: 'new' }, whisper: { apiKey: 'sk-test-0001' }, box_key_wrapped: undefined })
    expect(box._cheat_central).to.include({ revision_seq: 2, am: 'a' })
    expect(box.sidecar).to.deep.equal({ note: 'new' })
  })
})

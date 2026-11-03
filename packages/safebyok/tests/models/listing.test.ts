import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import * as TH from '../test-helpers'
import { TestableBox, TestableBoxListing, boxDnaOf, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

describe("listing.fetch(scope): nothing stored for a thing held alive", () => {
  it("refuses 'record_conflict' by the same-revision row same | gone | alive, the box as it was", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    const before = box._cheat_central
    held.mw.clearCalls()
    held.mw.willGet(held.mw.answerOf(box.scope, null))
    await TH.expectRefusal(listing.fetch(box.scope), 'record_conflict')
    expect(box._cheat_central).to.deep.equal(before)
    expect(listing.at(box.scope)).to.eq(box)
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'get'])
  })
})

describe("listing.ensureTimelyWorld(maxMillis)", () => {
  it("refuses 'bad_option' a span out of range, asking the world nothing", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.ensureTimelyWorld(-1), 'bad_option')
    expect(held.mw.callsOf('ensureTimely')).to.deep.equal([])
  })
})

describe("Listing's pipeline: what every answer takes", () => {
  describe("listing.hello()", () => {
    it("holds nothing of an empty listing, and still starts the watch", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      expect(listing.things).to.deep.equal([])
      expect(held.mw.callsOf('watch')).to.have.lengthOf(1)
    })

    it("fetches nothing: the instances held stay as they are", async () => {
      const listing = await seededListing()
      held.mw.clearCalls()
      await listing.hello()
      expect(held.mw.callsOf('get')).to.deep.equal([])
    })

    it("rejects, throwing nothing at its caller, where the store's watch refuses", async () => {
      const listing = boxListingOf(held.mw)
      vi.spyOn(held.mw.vaultDB, 'watch').mockImplementation(() => { throw new VaultError('storage_unavailable', "The store could not be reached.") })
      await expect(listing.hello()).rejects.toThrow(/could not be reached/)
    })

    it("starts one watch however often it is called", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      await listing.hello()
      expect(held.mw.callsOf('watch')).to.have.lengthOf(1)
    })
  })

  describe("listing.goodbye()", () => {
    it("ends the watch once, and leaves the instances as they are", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      listing.goodbye()
      listing.goodbye()
      expect(held.mw.callsOf('unwatch')).to.have.lengthOf(1)
      expect(held.mw.watches[0]?.active).to.be.false
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("does nothing before hello", () => {
      boxListingOf(held.mw).goodbye()
      expect(held.mw.calls).to.deep.equal([])
    })
  })

  describe("listing.put(duck, ante)", () => {
    it("puts a box over the revision it is given, and its answer is the box's", async () => {
      const { listing, box, next } = await putable()
      const answered = await listing.put(next, box)
      const [call] = held.mw.callsOf('put')
      expect(call?.priorRevisionTok).to.equal('rev-a1')
      expect(call?.record).to.deep.equal(next)
      expect(answered).to.eq(box)
      expect(box._cheat_central).to.deep.equal(next)
      expect(box.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("puts a box by the same path, reading its revision from a record as it reads it from a box", async () => {
      const { listing, box, next } = await putable()
      expect(await listing.put(next, fullBoxRecord())).to.eq(box)
      expect(held.mw.callsOf('put')[0]?.priorRevisionTok).to.equal('rev-a1')
    })

    it("sends no prior tok over no record, and holds the box that lands", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.put(fullBoxRecord({ revision_seq: 0 }), null)
      expect(held.mw.callsOf('put')[0]?.priorRevisionTok).to.be.null
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box?.isFull).to.be.true
    })

    for (const [label, ante] of [['missing', undefined], ['with no revision', {}], ['with only a seq', { revision_seq: 3 }]] as const) {
      it(`refuses an ante ${label} as 'bad_option' before storage is called`, async () => {
        const { listing, next } = await putable()
        held.mw.clearCalls()
        await TH.expectRefusal(listing.put(next, ante as never), 'bad_option')
        expect(held.mw.callsOf('put')).to.deep.equal([])
      })
    }

    it("refuses a box not full as 'bad_record' before storage is called", async () => {
      const listing = boxListingOf(held.mw)
      const sparse = await listing.build(sparseBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.put(sparse, sparse), 'bad_record')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })

    it("has tryPut resolve the outcome of a refusal, rejecting never", async () => {
      const { listing, box, next } = await putable()
      held.mw.willPut(held.mw.refusalOf(box.scope, new VaultError('not_permitted', "No.")))
      const outcome = await listing.tryPut(next, box)
      expect(outcome.ok).to.be.false
      expect(outcome.err?.refusalkind).to.eq('not_permitted')
    })
  })

  describe("listing.del(duck)", () => {
    it("deletes a box at central's revision, and delivers the tombstone to it", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
      held.mw.clearCalls()
      expect(await listing.del(box)).to.eq(box)
      expect(held.mw.callsOf('del')[0]?.priorRevisionTok).to.equal('rev-a1')
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.revision_seq).to.eq(2)
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("deletes a sparse record's box the same way", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord())
      await listing.del(sparseBoxRecord())
      expect(held.mw.callsOf('del')[0]?.priorRevisionTok).to.equal('rev-a1')
      expect(box.isPresent).to.be.false
    })

    it("goes over the sparse record's own revision for a box not held", async () => {
      const listing = boxListingOf(held.mw)
      await listing.del(sparseBoxRecord())
      expect(held.mw.callsOf('del')[0]?.priorRevisionTok).to.equal('rev-a1')
    })
  })

  describe("an answer refused or malformed", () => {
    it("throws a refusal as it came, delivering nothing", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      const err = new VaultError('not_permitted', "Not yours.")
      held.mw.willGet(held.mw.refusalOf(box.scope, err, 'a world'))
      const outcome = await listing.tryFetch(box.scope)
      expect(outcome.err).to.eq(err)
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
      expect(box.revision_seq).to.eq(1)
    })

    it("takes the world of a good answer", async () => {
      held.mw.seedStore(fullBoxRecord())
      held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord(), 'the world now'))
      await boxListingOf(held.mw).fetch(scopeOf())
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'the world now' }])
    })
    it("refuses a fetch of a scope that is no scope as 'bad_scope', before the world or storage is called", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch({ ...scopeOf(), boxlabel: 'Not A Label!' }), 'bad_scope')
      expect(held.mw.calls).to.deep.equal([])
    })

    it("refuses fetch options out of range as 'bad_option', before the world or storage is called", async () => {
      const listing = boxListingOf(held.mw)
      await TH.expectRefusal(listing.fetch(scopeOf(), { ifAbsent: 'create' } as never), 'bad_option')
      expect(held.mw.calls).to.deep.equal([])
    })

    it("hands the world its maxWorldMillis", async () => {
      held.mw.seedStore(fullBoxRecord())
      await boxListingOf(held.mw).fetch(scopeOf(), { maxWorldMillis: 5, ifAbsent: 'nil' })
      expect(held.mw.callsOf('ensureTimely')[0]?.maxMillis).to.eq(5)
    })
  })

  describe("a refusal met in delivering a record", () => {
    it("is thrown to a fetch, which cannot have the record it asked for: the box as it was, nothing told", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-other' }))
      held.mw.clearCalls()
      await TH.expectRefusal(listing.fetch(scopeOf()), 'record_conflict')
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a build(record), the box held kept as it was", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.build(fullBoxRecord({ revision_tok: 'rev-other' })), 'record_conflict')
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a put, the box as it was", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.clearCalls()
      held.mw.willPut(held.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      await TH.expectRefusal(listing.put(box, box), 'record_conflict')
      expect(box.revision_tok).to.eq('rev-a1')
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("is thrown to a fetch of a scope not held, and nothing is held, saved or told", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.seedStore(fullBoxRecord())
      const refused = vi.spyOn(Box.prototype, 'receive').mockImplementationOnce(() => { throw new VaultError('record_conflict', "Refused.") })
      try {
        await TH.expectRefusal(listing.fetch(scopeOf()), 'record_conflict')
      } finally {
        refused.mockRestore()
      }
      expect(listing.at(scopeOf())).to.be.null
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("lets a 'stale_write' reach its caller as it came, the carried record's conflict going to onBadNews", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(fullBoxRecord())
      held.mw.willPut(held.mw.staleWriteOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
      const err = await TH.expectRefusal(listing.put(box, box), 'stale_write')
      expect(err.meta).to.have.property('dbhas')
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['record_conflict'])
    })

    it("leaves the answer's own refusals to the caller: a world's, a refusal answer, the absent refusal", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.willGet(held.mw.refusalOf(scopeOf(), new VaultError('storage_unavailable', "Down."), null))
      await TH.expectRefusal(listing.fetch(scopeOf()), 'storage_unavailable')
      await TH.expectRefusal(listing.fetch(scopeOf()), 'absent_box')
      expect(held.mw.badnews).to.deep.equal([])
    })

  })

  describe("one instance for each scope", () => {
    for (const [blurb, record] of [["alive", fullBoxRecord()], ["deleted", tombstoneBoxRecord({ revision_seq: 2 })]] as const) {
      it(`refuses a create(dna) over the scope of a box held ${blurb} as 'bad_option': the box held kept, nothing put`, async () => {
        const listing = boxListingOf(held.mw)
        const box = await listing.build(record)
        held.mw.clearCalls()
        await TH.expectRefusal(listing.create(dnaOf()), 'bad_option')
        expect(listing.at(scopeOf())).to.eq(box)
        expect(box.revision_seq).to.eq(record.revision_seq)
        expect(held.mw.calls).to.deep.equal([])
      })
    }

    it("makes each scope's instance once, however it arrives: a build, a fetch, a put, a del, a notice", async () => {
      const made = vi.spyOn(TestableBoxListing.prototype as unknown as { makeThing: () => TestableBox }, 'makeThing')
      try {
        const listing = boxListingOf(held.mw)
        await listing.hello()
        const box = await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        await listing.build(fullBoxRecord({ boxlabel: 'built' }))
        held.mw.seedStore(fullBoxRecord({ boxlabel: 'fetched' }))
        await listing.fetch(scopeOf('fetched'))
        await listing.fetch(scopeOf('fetched'))
        held.mw.seedStore(fullBoxRecord({ boxlabel: 'built' }))
        await listing.put(fullBoxRecord({ boxlabel: 'built', revision_tok: 'rev-a2', revision_seq: 2 }), fullBoxRecord({ boxlabel: 'built' }))
        await listing.del(box)
        await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await held.mw.notify(fullBoxRecord({ boxlabel: 'noticed' }))
        await held.mw.notify(fullBoxRecord({ boxlabel: 'fetched', revision_tok: 'rev-a2', revision_seq: 2 }))
        expect(made).to.have.callCount(3)
        expect(listing.things).to.have.lengthOf(3)
      } finally {
        made.mockRestore()
      }
    })
  })

  describe("the watch's notices", () => {
    it("delivers a notice as a good answer: a box not held is built and held", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      held.mw.clearCalls()
      await held.mw.notify(fullBoxRecord(), 'a world')
      const box = listing.at(scopeOf())
      expect(box?.isFull).to.be.true
      expect(listing.snapshot).to.have.lengthOf(1)
      expect(held.mw.callsOf('takeWorld')).to.deep.equal([{ verb: 'takeWorld', world: 'a world' }])
      expect(held.mw.callsOf('get')).to.deep.equal([])
    })

    it("hands a notice to the box held, which receives it", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'pushed' } }))
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.revision_seq).to.eq(2)
      expect(box.sidecar).to.deep.equal({ note: 'pushed' })
    })

    it("delivers a notice of a deletion, which no fetch's ifAbsent judges: the box is held gone", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      const box = await listing.build(fullBoxRecord())
      await held.mw.notify(tombstoneBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      expect(box.isPresent).to.be.false
      expect(listing.snapshot).to.deep.equal([])
      expect(held.mw.badnews).to.deep.equal([])
    })

    it("tells a refusal met on the way to onBadNews, rather than throwing it", async () => {
      const listing = boxListingOf(held.mw)
      await listing.hello()
      await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['record_conflict'])
    })

    it("tells a refusal met on the way, with no onBadNews given, to nobody and still resolves", async () => {
      const listing = boxListingOf(held.mw, { onBadNews: undefined })
      await listing.hello()
      await listing.build(fullBoxRecord())
      await held.mw.notify(fullBoxRecord({ revision_tok: 'rev-other' }))
      expect(held.mw.badnews).to.deep.equal([])
    })
  })

  describe("listing.snapshot, getSnapshot and subscribe", () => {
    it("is empty, frozen and the same array before anything is held", () => {
      const listing = boxListingOf(held.mw)
      expect(listing.snapshot).to.deep.equal([])
      expect(Object.isFrozen(listing.snapshot)).to.be.true
      expect(listing.getSnapshot()).to.eq(listing.snapshot)
    })

    it("holds present things only, each as the thing's own snapshot", async () => {
      const listing = boxListingOf(held.mw)
      const full  = await listing.build(fullBoxRecord({ boxlabel: 'full_box' }))
      const draft = await listing.create(dnaOf('draft_box'))
      await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 }))
      await listing.build(tombstoneBoxRecord({ boxlabel: 'damaged_box', revision_seq: 2 }, 'd'))
      expect(listing.things).to.have.lengthOf(4)
      expect(listing.snapshot).to.have.lengthOf(2)
      expect(listing.snapshot[0]).to.eq(full.getSnapshot())
      expect(listing.snapshot[1]).to.eq(draft.getSnapshot())
      expect(Object.isFrozen(listing.snapshot)).to.be.true
    })

    it("is the same array until one thing's snapshot changes, and tells its listeners once per change", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      listing.subscribe(() => { told += 1 })
      await listing.build(fullBoxRecord())
      expect(told).to.eq(1)
      const before = listing.snapshot

      held.mw.seedStore(fullBoxRecord())
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.eq(before)
      expect(told).to.eq(1)

      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.not.eq(before)
      expect(listing.snapshot[0]).to.include({ revision_seq: 2 })
      expect(told).to.eq(2)
    })

    it("follows a thing's change that no delivery brought: a send, once", async () => {
      const listing = boxListingOf(held.mw)
      held.mw.seedStore(fullBoxRecord())
      const box = await listing.build(fullBoxRecord())
      let told = 0
      listing.subscribe(() => { told += 1 })
      await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'edited' } })
      expect(told).to.eq(1)
      expect(listing.snapshot[0]).to.eq(box.getSnapshot())
      expect(listing.snapshot[0]?.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("takes a box in when it comes back to life, and lets it go when it is deleted", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.build(tombstoneBoxRecord({ revision_seq: 2 }))
      expect(listing.snapshot).to.deep.equal([])
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
      await listing.fetch(scopeOf())
      expect(listing.snapshot).to.deep.equal([box.getSnapshot()])
      await listing.del(box)
      expect(listing.snapshot).to.deep.equal([])
    })

    it("lets a listener go, and tells none after", async () => {
      const listing = boxListingOf(held.mw)
      let told = 0
      const unsubscribe = listing.subscribe(() => { told += 1 })
      await listing.create(dnaOf('one'))
      unsubscribe()
      await listing.create(dnaOf('two'))
      expect(told).to.eq(1)
    })
  })
})

// == [Bad news told]: a handler that throws, a refusal told once

describe("listing: a host's onBadNews that fails", () => {
  it("reports a handler that throws to the platform and goes on, the rest of the news told", () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const told: string[] = []
      const listing = boxListingOf(held.mw, { onBadNews: (news) => { told.push(news.refusalkind); bust() } })
      listing.tellBadNews([new VaultError('storage_unavailable', "Down."), new VaultError('absent_box', "Gone.")])
      expect(told).to.deep.equal(['storage_unavailable', 'absent_box'])
      expect(reported).to.have.lengthOf(2)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("reports a handler whose promise rejects to the platform, with no unhandled rejection", async () => {
    const reported: unknown[] = []
    vi.stubGlobal('reportError', (err: unknown) => { reported.push(err) })
    try {
      const listing = boxListingOf(held.mw, { onBadNews: rejectingHandler })
      listing.tellBadNews([new VaultError('storage_unavailable', "Down.")])
      await vi.advanceTimersByTimeAsync(0)
      expect(reported).to.have.lengthOf(1)
      expect(reported[0]).to.have.property('message', "Rejected.")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe("listing: a record of another vault_tok meets no instance held", () => {
  const OtherVault = 'vault-tok-other'

  it("refuses 'unexpected_error' for a fetch answered with a record of another vault_tok, making nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault })))
    await TH.expectRefusal(listing.fetch(scopeOf()), 'unexpected_error')
    expect(listing.things).to.deep.equal([])
  })

  it("refuses it for a tombstone and a sparse record alike", async () => {
    const listing = boxListingOf(held.mw)
    for (const record of [tombstoneBoxRecord({ vault_tok: OtherVault, revision_seq: 2 }), sparseBoxRecord({ vault_tok: OtherVault })]) {
      held.mw.willGet(held.mw.answerOf(scopeOf(), record))
      await TH.expectRefusal(listing.fetch(scopeOf()), 'unexpected_error')
    }
    expect(listing.things).to.deep.equal([])
  })

  it("refuses it for build(record), and passes over a notice, as a row of another life is no row of this listing's", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.build(fullBoxRecord({ vault_tok: OtherVault })), 'unexpected_error')
    held.mw.seedStore(fullBoxRecord())
    await listing.hello()
    held.mw.clearCalls()
    await held.mw.notify(fullBoxRecord({ boxlabel: 'other_box', vault_tok: OtherVault }))
    expect(held.mw.badnews).to.deep.equal([])
    expect(listing.at(scopeOf('other_box'))).to.be.null
  })

  it("refuses it for a stale_write refusal's stored record, telling that one to onBadNews and throwing the stale_write", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.staleWriteOf(scopeOf(), fullBoxRecord({ vault_tok: OtherVault, revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), null), 'stale_write')
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    expect(listing.things).to.deep.equal([])
  })

  it("leaves a record of the vault's own vault_tok, and a dna, as they were", async () => {
    const listing = boxListingOf(held.mw)
    await expect(listing.build(fullBoxRecord())).resolves.to.be.instanceOf(Box)
    await expect(listing.create(dnaOf('draft_box'))).resolves.to.be.instanceOf(Box)
  })

  it("compares a record held under another vault_tok by reconcileCentral, so an instance held keeps refusing as it did", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ vault_tok: OtherVault, revision_seq: 2, revision_tok: 'rev-a2' })))
    const err = await TH.expectRefusal(listing.fetch(box.scope), 'unexpected_error')
    expect(err.message).to.contain('kept its own copy')
  })
})

describe("listing: an answer names the scope of the record it carries", () => {
  it("refuses 'bad_record' for a fetch answered with a record of another scope, making nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')), 'bad_record')
    expect(listing.things).to.deep.equal([])
  })

  it("leaves the instance held under the scope asked as it was, and the instance of the record's scope too", async () => {
    const listing = boxListingOf(held.mw)
    const asked = await listing.build(fullBoxRecord({ boxlabel: 'asked_box' }))
    const other = await listing.build(fullBoxRecord({ boxlabel: 'other_box' }))
    const [askedBefore, otherBefore] = [asked._cheat_central, other._cheat_central]
    held.mw.willGet(held.mw.answerOf(asked.scope, fullBoxRecord({ boxlabel: 'other_box', revision_seq: 2, revision_tok: 'rev-a2' })))
    await TH.expectRefusal(listing.fetch(asked.scope), 'bad_record')
    expect(asked._cheat_central).to.deep.equal(askedBefore)
    expect(other._cheat_central).to.deep.equal(otherBefore)
  })

  it("refuses it for a put and a del answered so, and for the record a stale_write carries, told to onBadNews with the stale_write thrown", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willPut(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 }), null), 'bad_record')
    held.mw.willDel(held.mw.answerOf(scopeOf('asked_box'), tombstoneBoxRecord({ boxlabel: 'other_box', revision_seq: 2 })))
    await TH.expectRefusal(listing.del(sparseBoxRecord({ boxlabel: 'asked_box' })), 'bad_record')
    held.mw.willPut(held.mw.staleWriteOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box', revision_seq: 5 })))
    await TH.expectRefusal(listing.put(fullBoxRecord({ boxlabel: 'asked_box', revision_seq: 0 }), null), 'stale_write')
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['bad_record'])
    expect(listing.things).to.deep.equal([])
  })

  it("takes a record of the scope asked, however the answer's scope object was made", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf({ ...scopeOf('asked_box') }, fullBoxRecord({ boxlabel: 'asked_box' })))
    await expect(listing.fetch(scopeOf('asked_box'))).resolves.to.be.instanceOf(Box)
  })
})

// --

// == [Helpers of the pipeline tests]: scopeOf, dnaOf, seededListing, putable, bust, rejectingHandler

const scopeOf = (boxlabel = 'anthropic_api_key') => held.mw.boxscope(boxlabel)
const dnaOf = (boxlabel = 'anthropic_api_key') => boxDnaOf(scopeOf(boxlabel))

/** A listing holding a full box and a deleted one, each of a record storage holds too, with no call made yet. */
const seededListing = async () => {
  const listing = boxListingOf(held.mw)
  const full = fullBoxRecord({ boxlabel: 'full_box' })
  const gone = tombstoneBoxRecord({ boxlabel: 'gone_box', revision_seq: 2 })
  held.mw.seedStore(full)
  held.mw.seedStore(gone)
  await listing.build(full)
  await listing.build(gone)
  held.mw.setNow(T0 + 660_000)
  held.mw.clearCalls()
  return listing
}

/** A listing holding a box of the record storage holds, and the next revision of it to put. */
const putable = async () => {
  const listing = boxListingOf(held.mw)
  held.mw.seedStore(fullBoxRecord())
  const box = await listing.build(fullBoxRecord())
  const next = fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'edited' } })
  held.mw.clearCalls()
  return { listing, box, next }
}

/** Handlers that fail: `bust` throws, and `rejectingHandler` answers a promise that rejects. */
const bust = (): never => { throw new Error("The handler is broken.") }
const rejectingHandler = (): Promise<never> => Promise.reject(new Error("Rejected."))
// --

describe("listing.put: the versioned replace", () => {
  it("makes the fake store refuse 'stale_write' over a box stored when none was expected, delivering the box stored", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), null), 'stale_write')
    expect(listing.things.map(({ revision_tok }) => revision_tok)).to.deep.equal(['rev-stored'])
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal([null])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
  })

  it("makes the fake store refuse 'stale_write' over a tombstone stored when none was expected, delivering the tombstone", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 }), null), 'stale_write')
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal([null])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 4 })
    expect(listing.things.map(({ isPresent }) => isPresent)).to.deep.equal([false])
  })

  it("makes the fake store keep the record exactly as given over no row", async () => {
    const box = await boxListingOf(held.mw).put(fullBoxRecord({ revision_tok: 'rev-new', revision_seq: 0 }), null)
    expect(box).to.include({ revision_tok: 'rev-new', revision_seq: 0 })
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-new', revision_seq: 0 })
  })
})

describe("listing: an answer is for the scope the call asked about", () => {
  it("refuses 'bad_record' a fetch answered with a record of another scope, making nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')), 'bad_record')
    expect(listing.things).to.deep.equal([])
  })
})

// == [ifPresent]: what the vaultDB decides over a live record, as the listing delivers it

describe("listing.put(duck, ante, { ifPresent }): over a live record", () => {
  const birth = fullBoxRecord({ revision_tok: 'rev-mine', revision_seq: 0 })
  const live  = fullBoxRecord()

  it("replaces it under 'repl', over its revision", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(live)
    const box = await listing.put(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }), live, { ifPresent: 'repl' })
    expect(box?.revision_tok).to.eq('rev-a2')
    expect(held.mw.stored.get(live.boxlabel)).to.include({ revision_tok: 'rev-a2' })
  })

  it("refuses 'camped' under 'fail', the box held taking the live record", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(live)
    const err = await TH.expectRefusal(listing.put(birth, null, { ifPresent: 'fail' }), 'camped')
    expect(err.meta).to.have.property('dbhas')
    expect(listing.at(scopeOf())?.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("saves nothing under 'get', and resolves the box held taking the live record", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(live)
    const box = await listing.put(birth, null, { ifPresent: 'get' })
    expect(box?.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("lands over nothing stored under 'fail' and under 'get'", async () => {
    for (const ifPresent of ['fail', 'get'] as const) {
      const listing = boxListingOf(held.mw)
      held.mw.stored.clear()
      const box = await listing.put(birth, null, { ifPresent })
      expect(box?.revision_tok).to.eq('rev-mine')
    }
  })
})
// --

// == [The versioned replace]: the prior tok the listing sends

const aliveRow = fullBoxRecord()

describe("listing.put and listing.del: the prior tok they send", () => {
  it("refuses 'invalid_input' a record at a revision other than 0 for a box not held, changing nothing", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 1 }), null), 'invalid_input')
    expect(listing.things).to.deep.equal([])
  })

  it("meets 'stale_write' for a record at revision 0 put over no record where storage holds one, the box held keeping its own", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 }), null), 'stale_write')
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal([null])
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("sends a record past central's seq + 1, which the vaultDB refuses 'invalid_input', changing nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }), aliveRow), 'invalid_input')
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal(['rev-a1'])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.equal(aliveRow)
    expect(box.revision_seq).to.eq(1)
  })

  it("sends central's tok with the staged record, which lands at central's seq + 1", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent' } })
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal(['rev-a1'])
    expect(held.mw.stored.get('anthropic_api_key')).to.include({ revision_seq: 2, revision_tok: box.revision_tok })
  })

  it("meets 'stale_write' carrying nothing from a put, and 'record_conflict' from a del, where the box held is stored no more", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(aliveRow)
    const putErr = await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent' } }), 'stale_write')
    expect(putErr.meta?.dbhas).to.be.null
    await TH.expectRefusal(box.del(), 'record_conflict')
    expect(box._cheat_central.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.size).to.eq(0)
  })

  it("meets a stored revision lower than the one held with 'stale_write' carrying it; the box judges it older and keeps its own, stuck there", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
    const box = await listing.build(fullBoxRecord({ revision_tok: 'rev-a5', revision_seq: 5 }))
    await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'once' } }), 'stale_write')
    await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'twice' } }), 'stale_write')
    expect(box._cheat_central.revision_seq).to.eq(5)
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal(['rev-a5', 'rev-a5'])
    expect(held.mw.stored.get('anthropic_api_key')).to.include({ revision_tok: 'rev-a3' })
  })
})
// --

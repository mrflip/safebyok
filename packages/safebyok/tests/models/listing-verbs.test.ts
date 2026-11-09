/** A Listing's storage verbs: fetch, put and del, the versioned replace, and what the vaultDB decides over a live record. */

import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as SX from '../../src/shapes/shapes-storage'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Helpers of the pipeline tests]: scopeOf, putable

const scopeOf = (boxlabel = 'anthropic_api_key') => held.mw.boxscope(boxlabel)

/** A listing holding a box of the record storage holds, and the next revision of it to put. */
const putable = async () => {
  const listing = boxListingOf(held.mw)
  held.mw.seedStore(fullBoxRecord())
  const box = await listing.build(fullBoxRecord())
  const next = fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'edited' } })
  held.mw.clearCalls()
  return { listing, box, next }
}
// --

describe("listing.fetch(scope): nothing stored for a thing held alive", () => {
  it("refuses by the same-revision row same | gone | alive, the box as it was", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    const before = box._cheat_central
    held.mw.clearCalls()
    held.mw.willGet(held.mw.answerOf(box.scope, null))
    await TH.expectRefusal(listing.fetch(box.scope))
    expect(box._cheat_central).to.deep.equal(before)
    expect(listing.at(box.scope)).to.eq(box)
    expect(held.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'get'])
  })
})

describe("Listing's pipeline: what every answer takes", () => {
  describe("listing.put(record, { prior })", () => {
    it("puts a box over the revision it is given, and its answer is the box's", async () => {
      const { listing, box, next } = await putable()
      const answered = await listing.put(next, { prior: box })
      const [call] = held.mw.callsOf('put')
      expect(call?.priorRevisionTok).to.equal('rev-a1')
      expect(call?.record).to.deep.equal(next)
      expect(answered).to.eq(box)
      expect(box._cheat_central).to.deep.equal(next)
      expect(box.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("puts a box by the same path, reading its revision from a record as it reads it from a box", async () => {
      const { listing, box, next } = await putable()
      expect(await listing.put(next, { prior: fullBoxRecord() })).to.eq(box)
      expect(held.mw.callsOf('put')[0]?.priorRevisionTok).to.equal('rev-a1')
    })

    it("sends no prior tok over no record, and holds the box that lands", async () => {
      const listing = boxListingOf(held.mw)
      const box = await listing.put(fullBoxRecord({ revision_seq: 0 }), { prior: SX.VoidRevision })
      expect(held.mw.callsOf('put')[0]?.priorRevisionTok).to.be.null
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.isFull).to.be.true
    })

    for (const [label, ante] of [['missing', undefined], ['with no revision', {}], ['with only a seq', { revision_seq: 3 }]] as const) {
      it(`refuses a prior ${label} before storage is called`, async () => {
        const { listing, next } = await putable()
        held.mw.clearCalls()
        await TH.expectRefusal(listing.put(next, { prior: ante } as never))
        expect(held.mw.callsOf('put')).to.deep.equal([])
      })
    }

    it("forwards ifAbsent and ifPresent, an upcreate where left out", async () => {
      const { listing, box, next } = await putable()
      await listing.put(next, { prior: box })
      expect(held.mw.callsOf('put')[0]).to.include({ ifAbsent: 'add', ifPresent: 'repl' })
      held.mw.clearCalls()
      await listing.tryPut(next, { prior: box, ifAbsent: 'fail', ifPresent: 'get' })
      expect(held.mw.callsOf('put')[0]).to.include({ ifAbsent: 'fail', ifPresent: 'get' })
    })

    it("refuses fetch's ifAbsent nil, before storage is called", async () => {
      const { listing, box, next } = await putable()
      held.mw.clearCalls()
      await TH.expectRefusal(listing.put(next, { prior: box, ifAbsent: 'nil' } as never))
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })

    it("refuses a box not full, before storage is called", async () => {
      const listing = boxListingOf(held.mw)
      const sparse = await listing.build(sparseBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(listing.put(sparse as never, { prior: sparse }))
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })

    it("has tryPut resolve the outcome of a refusal, rejecting never", async () => {
      const { listing, box, next } = await putable()
      held.mw.willPut(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "Storage is down.")))
      const outcome = await listing.tryPut(next, { prior: box })
      expect(outcome.ok).to.be.false
      expect(outcome.err?.refusalkind).to.eq('storage_unavailable')
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
})

describe("listing.put: the versioned replace", () => {
  it("refuses 'stale_write' over a box stored when none was expected, delivering the box stored", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(listing.things.map(({ revision_tok }) => revision_tok)).to.deep.equal(['rev-stored'])
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal([null])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
  })

  it("refuses 'stale_write' over a tombstone stored when none was expected, delivering the tombstone", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal([null])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 4 })
    expect(listing.things.map(({ isPresent }) => isPresent)).to.deep.equal([false])
  })

  it("makes the fake store keep the record exactly as given over no row", async () => {
    const box = await boxListingOf(held.mw).put(fullBoxRecord({ revision_tok: 'rev-new', revision_seq: 0 }), { prior: SX.VoidRevision })
    expect(box).to.include({ revision_tok: 'rev-new', revision_seq: 0 })
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-new', revision_seq: 0 })
  })
})

describe("listing: an answer is for the scope the call asked about", () => {
  it("refuses a fetch answered with a record of another scope, making nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.willGet(held.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')))
    expect(listing.things).to.deep.equal([])
  })
})

// == [ifPresent]: what the vaultDB decides over a live record, as the listing delivers it

describe("listing.put(record, { prior, ifPresent }): over a live record", () => {
  const birth = fullBoxRecord({ revision_tok: 'rev-mine', revision_seq: 0 })
  const live  = fullBoxRecord()

  it("refuses an ifPresent it does not take, calling nothing", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.put(birth, { prior: SX.VoidRevision, ifPresent: 'replace' } as never))
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("replaces the live record under 'repl', over its revision", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(live)
    const box = await listing.put(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }), { prior: live, ifPresent: 'repl' })
    expect(box.revision_tok).to.eq('rev-a2')
    expect(held.mw.stored.get(live.boxlabel)).to.include({ revision_tok: 'rev-a2' })
  })

  it("refuses 'camped' under 'fail', the box held taking the live record", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(live)
    const err = await TH.expectRefusal(listing.put(birth, { prior: SX.VoidRevision, ifPresent: 'fail' }), 'camped')
    expect(err.meta).to.have.property('dbhas')
    expect(listing.at(scopeOf())?.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("saves nothing under 'get', and resolves the box held taking the live record", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(live)
    const box = await listing.put(birth, { prior: SX.VoidRevision, ifPresent: 'get' })
    expect(box.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("lands over nothing stored under 'fail' and under 'get'", async () => {
    for (const ifPresent of ['fail', 'get'] as const) {
      const listing = boxListingOf(held.mw)
      held.mw.stored.clear()
      const box = await listing.put(birth, { prior: SX.VoidRevision, ifPresent })
      expect(box.revision_tok).to.eq('rev-mine')
    }
  })
})
// --

// == [The versioned replace]: the prior tok the listing sends

const aliveRow = fullBoxRecord()

describe("listing.put and listing.del: the prior tok they put", () => {
  it("refuses a record at a revision other than 0 for a box not held, changing nothing", async () => {
    const listing = boxListingOf(held.mw)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 1 }), { prior: SX.VoidRevision }))
    expect(listing.things).to.deep.equal([])
  })

  it("meets 'stale_write' for a record at revision 0 put over no record where storage holds one, the box held keeping its own", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 }), { prior: SX.VoidRevision }), 'stale_write')
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal([null])
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("sends a record past central's seq + 1, which the vaultDB refuses, changing nothing", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }), { prior: aliveRow }))
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal(['rev-a1'])
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.equal(aliveRow)
    expect(box.revision_seq).to.eq(1)
  })

  it("sends central's tok with the staged record, which lands at central's seq + 1", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(aliveRow)
    const box = await listing.build(aliveRow)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal(['rev-a1'])
    expect(held.mw.stored.get('anthropic_api_key')).to.include({ revision_seq: 2, revision_tok: box.revision_tok })
  })

  it("meets 'stale_write' carrying nothing from a put, and a refusal from a del, where the box held is stored no more", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(aliveRow)
    const putErr = await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } }), 'stale_write')
    expect(putErr.meta?.dbhas).to.be.null
    await TH.expectRefusal(box.del())
    expect(box._cheat_central.revision_tok).to.eq('rev-a1')
    expect(held.mw.stored.size).to.eq(0)
  })

  it("meets a stored revision lower than the held revision with 'stale_write' carrying it; the box judges it older and keeps its own, stuck there", async () => {
    const listing = boxListingOf(held.mw)
    held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
    const box = await listing.build(fullBoxRecord({ revision_tok: 'rev-a5', revision_seq: 5 }))
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'once' } }), 'stale_write')
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'twice' } }), 'stale_write')
    expect(box._cheat_central.revision_seq).to.eq(5)
    expect(held.mw.callsOf('put').map(({ priorRevisionTok }) => priorRevisionTok)).to.deep.equal(['rev-a5', 'rev-a5'])
    expect(held.mw.stored.get('anthropic_api_key')).to.include({ revision_tok: 'rev-a3' })
  })
})
// --

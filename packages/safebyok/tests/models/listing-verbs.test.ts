/** A Listing's storage verbs: fetch, put and del, the versioned replace, and what the vaultDB decides over a live record. */

import { describe, expect, it } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, sentinelBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld } from '../test-helpers/models-world'

const world = useModelsWorld()

// == [Helpers of the pipeline tests]: scopeOf, putable

const scopeOf = (boxlabel = 'anthropic_api_key') => world.mw.boxscope(boxlabel)

/** A listing with a box of the record storage has stored, and the next revision of it to put. */
const putable = async () => {
  const listing = boxListingOf(world.mw)
  world.mw.seedPut(fullBoxRecord())
  const box = await listing.build(fullBoxRecord())
  const next = fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2, sidecar: { note: 'edited' } })
  world.mw.clearCalls()
  return { listing, box, next }
}
// --

describe("listing.fetch(scope): nothing stored for a live listed box", () => {
  it("refuses, and leaves the box unchanged", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(fullBoxRecord())
    const before = box._cheat_central
    world.mw.clearCalls()
    world.mw.willGet(world.mw.answerOf(box.scope, null))
    await TH.expectRefusal(listing.fetch(box.scope))
    expect(box._cheat_central).to.deep.equal(before)
    expect(listing.at(box.scope)).to.eq(box)
    expect(world.mw.calls.map(({ verb }) => verb)).to.deep.equal(['ensureTimely', 'get'])
  })
})

describe("listing.fetch(scope): the row it says it expects", () => {
  it("expects the sentinel row for a box not listed, and the listed box's own row from then on", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(fullBoxRecord())
    await listing.fetch(scopeOf())
    await listing.fetch(scopeOf())
    expect(world.mw.callsOf('get').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal([null, 'rev-a1'])
  })
})

describe("Listing's pipeline: what every answer goes through", () => {
  describe("listing.put(record, { expected })", () => {
    it("puts a box over the row it is told to expect", async () => {
      const { listing, box, next } = await putable()
      const answered = await listing.put(next, { expected: box.sparse })
      const [call] = world.mw.callsOf('put')
      expect(call?.expectedRevisionTok).to.equal('rev-a1')
      expect(call?.record).to.deep.equal(next)
      expect(answered).to.eq(box)
      expect(box._cheat_central).to.deep.equal(next)
      expect(box.sidecar).to.deep.equal({ note: 'edited' })
    })

    it("reads the expected row from a full record as it does from a sparse one", async () => {
      const { listing, box, next } = await putable()
      expect(await listing.put(next, { expected: fullBoxRecord() })).to.eq(box)
      expect(world.mw.callsOf('put')[0]?.expectedRevisionTok).to.equal('rev-a1')
    })

    it("expects the sentinel row where no row is held", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.put(fullBoxRecord({ revision_seq: 0 }), { expected: sentinelBoxRecord() })
      expect(world.mw.callsOf('put')[0]?.expectedRevisionTok).to.be.null
      expect(listing.at(scopeOf())).to.eq(box)
      expect(box.isFull).to.be.true
    })

    for (const [label, ante] of [['missing', undefined], ['with no revision', {}], ['with only a seq', { revision_seq: 3 }]] as const) {
      it(`refuses an expected row ${label} before storage is called`, async () => {
        const { listing, next } = await putable()
        world.mw.clearCalls()
        await TH.expectRefusal(listing.put(next, { expected: ante } as never))
        expect(world.mw.callsOf('put')).to.deep.equal([])
      })
    }

    it("forwards ifAbsent and ifPresent, which default to 'add' and 'repl'", async () => {
      const { listing, box, next } = await putable()
      await listing.put(next, { expected: box.sparse })
      expect(world.mw.callsOf('put')[0]).to.include({ ifAbsent: 'add', ifPresent: 'repl' })
      world.mw.clearCalls()
      await listing.tryPut(next, { expected: box.sparse, ifAbsent: 'fail', ifPresent: 'get' })
      expect(world.mw.callsOf('put')[0]).to.include({ ifAbsent: 'fail', ifPresent: 'get' })
    })

    it("refuses fetch's ifAbsent nil, before storage is called", async () => {
      const { listing, box, next } = await putable()
      world.mw.clearCalls()
      await TH.expectRefusal(listing.put(next, { expected: box.sparse, ifAbsent: 'nil' } as never))
      expect(world.mw.callsOf('put')).to.deep.equal([])
    })

    it("refuses a box not full, before storage is called", async () => {
      const listing = boxListingOf(world.mw)
      const sparse = await listing.build(sparseBoxRecord())
      world.mw.clearCalls()
      await TH.expectRefusal(listing.put(sparse as never, { expected: sparse.sparse }))
      expect(world.mw.callsOf('put')).to.deep.equal([])
    })

    it("tryPut resolves a refusal as a bad Outcome and never rejects", async () => {
      const { listing, box, next } = await putable()
      world.mw.willPut(world.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "Storage is down.")))
      const outcome = await listing.tryPut(next, { expected: box.sparse })
      expect(outcome.ok).to.be.false
      expect(outcome.err?.refusalkind).to.eq('storage_unavailable')
    })
  })

  describe("listing.del(duck)", () => {
    it("deletes a box at central's revision, and delivers the tombstone to it", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.seedPut(fullBoxRecord())
      world.mw.clearCalls()
      expect(await listing.del(box.sparse)).to.eq(box)
      expect(world.mw.callsOf('del')[0]?.expectedRevisionTok).to.equal('rev-a1')
      expect(box.isPresent).to.be.false
      expect(box.am).to.eq('x')
      expect(box.revision_seq).to.eq(2)
      expect(listing.at(box.scope)).to.eq(box)
    })

    it("deletes a sparse record's box the same way", async () => {
      const listing = boxListingOf(world.mw)
      const box = await listing.build(fullBoxRecord())
      world.mw.seedPut(fullBoxRecord())
      await listing.del(sparseBoxRecord())
      expect(world.mw.callsOf('del')[0]?.expectedRevisionTok).to.equal('rev-a1')
      expect(box.isPresent).to.be.false
    })

    it("sends a del expecting the sparse record's own revision for a box not listed, which the vaultDB refuses over nothing stored", async () => {
      const listing = boxListingOf(world.mw)
      await TH.expectRefusal(listing.del(sparseBoxRecord()), 'record_conflict')
      expect(world.mw.callsOf('del')[0]?.expectedRevisionTok).to.equal('rev-a1')
    })

    it("sends a tombstone at the next revision, under a box_tok of its own", async () => {
      const listing = boxListingOf(world.mw)
      world.mw.seedPut(fullBoxRecord())
      const box = await listing.build(fullBoxRecord())
      await listing.del(box.sparse)
      const [call] = world.mw.callsOf('del')
      const stored = world.mw.stored.get('anthropic_api_key')
      expect(stored).to.deep.include({ am: 'x', revision_seq: 2, box_tok: box.box_tok })
      expect(box.box_tok).to.be.a('string').and.not.eq('box-tok-a')
      expect(call?.expectedRevisionTok).to.eq('rev-a1')
    })
  })
})

describe("listing.put: the versioned replace", () => {
  it("refuses 'stale_write' over a box stored when none was expected, delivering the box stored", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 0 }), { expected: sentinelBoxRecord() }), 'stale_write')
    expect(listing.things.map(({ revision_tok }) => revision_tok)).to.deep.equal(['rev-stored'])
    expect(world.mw.callsOf('put').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal([null])
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
  })

  it("refuses 'stale_write' over a tombstone stored when none was expected, delivering the tombstone", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(tombstoneBoxRecord({ revision_seq: 4 }))
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 }), { expected: sentinelBoxRecord() }), 'stale_write')
    expect(world.mw.callsOf('put').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal([null])
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 4 })
    expect(listing.things.map(({ isPresent }) => isPresent)).to.deep.equal([false])
  })

  it("stores the record exactly as given where there is no row", async () => {
    const box = await boxListingOf(world.mw).put(fullBoxRecord({ revision_tok: 'rev-new', revision_seq: 0 }), { expected: sentinelBoxRecord() })
    expect(box).to.include({ revision_tok: 'rev-new', revision_seq: 0 })
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-new', revision_seq: 0 })
  })
})

describe("listing: an answer is for the scope the call asked about", () => {
  it("refuses a fetch answered with a record of another scope, making nothing", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.willGet(world.mw.answerOf(scopeOf('asked_box'), fullBoxRecord({ boxlabel: 'other_box' })))
    await TH.expectRefusal(listing.fetch(scopeOf('asked_box')))
    expect(listing.things).to.deep.equal([])
  })

  it("refuses a put answered at a revision it did not send, the box unmoved", async () => {
    const { listing, box, next } = await putable()
    world.mw.willPut(world.mw.answerOf(box.scope, { ...next, revision_tok: 'rev-of-another' }))
    await TH.expectRefusal(listing.put(next, { expected: box.sparse }), 'storage_issue')
    expect(box._cheat_central).to.deep.equal(fullBoxRecord())
  })

  it("refuses a put answered good with no record, the box unmoved", async () => {
    const { listing, box, next } = await putable()
    world.mw.willPut(world.mw.answerOf(box.scope, null))
    await TH.expectRefusal(listing.put(next, { expected: box.sparse }), 'storage_issue')
    expect(box._cheat_central).to.deep.equal(fullBoxRecord())
  })

  it("refuses a del answered with a tombstone it did not send, the box unmoved", async () => {
    const { listing, box } = await putable()
    world.mw.willDel(({ scope }) => world.mw.answerOf(scope, tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-of-another' })))
    await TH.expectRefusal(listing.del(box.sparse), 'storage_issue')
    expect(box._cheat_central).to.deep.equal(fullBoxRecord())
  })

  it("adopts the record a passed put returns, at a revision it did not send", async () => {
    const { listing, box, next } = await putable()
    const stored = fullBoxRecord({ revision_tok: 'rev-a5', revision_seq: 5 })
    world.mw.willPut({ ...world.mw.answerOf(box.scope, stored), act: 'passed' })
    expect(await listing.put(next, { expected: box.sparse, ifPresent: 'get' })).to.eq(box)
    expect(box._cheat_central).to.deep.equal(stored)
  })

  it("refuses a passed put answered with a record of another scope", async () => {
    const { listing, box, next } = await putable()
    world.mw.willPut({ ...world.mw.answerOf(box.scope, fullBoxRecord({ boxlabel: 'other_box' })), act: 'passed' })
    await TH.expectRefusal(listing.put(next, { expected: box.sparse, ifPresent: 'get' }), 'storage_issue')
  })
})

// == [ifPresent]: what the vaultDB decides over a live record, as the listing delivers it

describe("listing.put(record, { expected, ifPresent }): over a live record", () => {
  const birth = fullBoxRecord({ revision_tok: 'rev-mine', revision_seq: 0 })
  const live  = fullBoxRecord()

  it("refuses an ifPresent it does not accept, calling nothing", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.put(birth, { expected: sentinelBoxRecord(), ifPresent: 'replace' } as never))
    expect(world.mw.callsOf('put')).to.deep.equal([])
  })

  it("replaces the live record under 'repl', over its revision", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(live)
    const box = await listing.put(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }), { expected: live, ifPresent: 'repl' })
    expect(box.revision_tok).to.eq('rev-a2')
    expect(world.mw.stored.get(live.boxlabel)).to.include({ revision_tok: 'rev-a2' })
  })

  it("refuses 'camped' under 'fail' over the live record it expects, and lists the box with it", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(live)
    const err = await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }), { expected: live, ifPresent: 'fail' }), 'camped')
    expect(err.meta).to.not.have.property('dbhas')
    expect(listing.at(scopeOf())?.revision_tok).to.eq('rev-a1')
    expect(world.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("refuses 'stale_write' under 'fail' over a live record where it expects none, and lists the box with it", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(live)
    await TH.expectRefusal(listing.put(birth, { expected: sentinelBoxRecord(), ifPresent: 'fail' }), 'stale_write')
    expect(listing.at(scopeOf())?.revision_tok).to.eq('rev-a1')
    expect(world.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("writes nothing under 'get', and returns the box with the live record", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(live)
    const box = await listing.put(birth, { expected: sentinelBoxRecord(), ifPresent: 'get' })
    expect(box.revision_tok).to.eq('rev-a1')
    expect(world.mw.stored.get(live.boxlabel)).to.deep.equal(live)
  })

  it("puts over nothing stored under 'fail' and under 'get'", async () => {
    for (const ifPresent of ['fail', 'get'] as const) {
      const listing = boxListingOf(world.mw)
      world.mw.stored.clear()
      const box = await listing.put(birth, { expected: sentinelBoxRecord(), ifPresent })
      expect(box.revision_tok).to.eq('rev-mine')
    }
  })
})
// --

// == [The versioned replace]: the row the listing says it expects

const aliveRow = fullBoxRecord()

describe("listing.put and listing.del: the row they say they expect", () => {
  it("refuses a record at a revision other than 0 for a box not listed, changing nothing", async () => {
    const listing = boxListingOf(world.mw)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_seq: 1 }), { expected: sentinelBoxRecord() }))
    expect(listing.things).to.deep.equal([])
  })

  it("refuses 'stale_write' for a first put where storage already has a row, and the listed box keeps its revision", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a0', revision_seq: 0 }), { expected: sentinelBoxRecord() }), 'stale_write')
    expect(world.mw.callsOf('put').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal([null])
    expect(box.revision_tok).to.eq('rev-a1')
  })

  it("sends a record past central's seq + 1, which the vaultDB refuses, changing nothing", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(aliveRow)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(listing.put(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }), { expected: aliveRow }))
    expect(world.mw.callsOf('put').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal(['rev-a1'])
    expect(world.mw.stored.get('anthropic_api_key')).to.deep.equal(aliveRow)
    expect(box.revision_seq).to.eq(1)
  })

  it("sends central's tok with the staged record, which is written at central's seq + 1", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(aliveRow)
    const box = await listing.build(aliveRow)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })
    expect(world.mw.callsOf('put').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal(['rev-a1'])
    expect(world.mw.stored.get('anthropic_api_key')).to.include({ revision_seq: 2, revision_tok: box.revision_tok })
  })

  it("refuses a put and a del when the listed box's row is no longer stored", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(aliveRow)
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } }), 'record_conflict')
    await TH.expectRefusal(box.del(box.scope), 'record_conflict')
    expect(box._cheat_central.revision_tok).to.eq('rev-a1')
    expect(world.mw.stored.size).to.eq(0)
  })

  it("refuses a put when storage has a lower revision than the listed box's, and the box keeps its own", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(fullBoxRecord({ revision_tok: 'rev-a3', revision_seq: 3 }))
    const box = await listing.build(fullBoxRecord({ revision_tok: 'rev-a5', revision_seq: 5 }))
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'once' } }), 'record_conflict')
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'twice' } }), 'record_conflict')
    expect(box._cheat_central.revision_seq).to.eq(5)
    expect(world.mw.callsOf('put').map(({ expectedRevisionTok }) => expectedRevisionTok)).to.deep.equal(['rev-a5', 'rev-a5'])
    expect(world.mw.stored.get('anthropic_api_key')).to.include({ revision_tok: 'rev-a3' })
  })
})
// --

describe("listing.tryPut and listing.tryFetch return the vaultDB's answer", () => {
  it("carries the put's act, req_params and world, with the instance listed as its val", async () => {
    const listing = boxListingOf(world.mw)
    const box = await listing.build(fullBoxRecord())
    world.mw.seedPut(fullBoxRecord())
    const answer = await listing.tryPut(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }), { expected: box.sparse })
    expect(answer).to.deep.include({ ok: true, val: box })
    expect(answer).to.have.property('act')
    expect(answer).to.have.property('world')
    expect(answer.req_params).to.include({ boxlabel: box.boxlabel })
  })

  it("returns a refusal made before the call as a bad answer whose act is the refusal kind", async () => {
    const listing = boxListingOf(world.mw)
    const answer = await listing.tryPut({ garbage: true } as never, { expected: sentinelBoxRecord() })
    expect(answer).to.deep.include({ ok: false, world: null, req_params: {} })
    expect(answer.act).to.eq(answer.err?.refusalkind)
  })

  it("returns a fetch's instance as val, with the vaultDB's act", async () => {
    const listing = boxListingOf(world.mw)
    world.mw.seedPut(fullBoxRecord())
    const answer = await listing.tryFetch(scopeOf())
    expect(answer.ok).to.be.true
    expect(answer.val).to.eq(listing.at(scopeOf()))
    expect(answer).to.have.property('act')
  })
})

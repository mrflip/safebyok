/** Storable's verbs through a Box: hydrate, fetch, put and del with their try forms, and what each refuses while locked or stale. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { cmpRevisions } from '../../src/models/storable'
import * as Phrases from '../../src/helpers/phrases'
import * as Refuse from '../../src/refusals/throwers'
import * as TH from '../test-helpers'
import { TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

// == [Hydrate]: when it fetches, the world first, the thing's horizon

/** A box listing of horizon `horizonMillis`, and its box `anthropic_api_key` built from the full record seeded in the VaultDB at revision 1: received at the clock's reading, so timely from then. Calls are cleared after. */
function timelyBoxOf(horizonMillis = 1000) {
  const { mw } = world
  const record = mw.fullBoxRecord()
  mw.seedPut(record)
  const listing = boxListingOf(mw, { maxMillisSinceRefresh: horizonMillis })
  const box = listing.deliverRecord(record)
  mw.clearCalls()
  return { listing, box }
}

/** A promise the test resolves when it chooses, to keep a call pending. */
function makePending() {
  const opener = { open: (): void => undefined }
  const promise = new Promise<void>((resolve) => { opener.open = () => { resolve() } })
  return { promise, open: () => { opener.open() } }
}

describe("storable.hydrate(opts): when it fetches", () => {
  const HorizonCases = [
    // by the horizon given:
    [999,       { maxMillisSinceRefresh: 1000 },     0, 'does not fetch a record timely by the maxMillisSinceRefresh given'],
    [1000,      { maxMillisSinceRefresh: 1000 },     1, 'fetches a record untimely by the maxMillisSinceRefresh given'],
    [1e12,      { maxMillisSinceRefresh: Infinity }, 0, 'fetches nothing under maxMillisSinceRefresh Infinity, however old the record'],
    // by the thing's own horizon:
    [999,       {},                                  0, 'does not fetch, given no horizon, before the thing is untimely'],
    [1000,      {},                                  1, 'fetches, given no horizon, once the thing is untimely'],
  ] as const
  for (const [elapsed, opts, gets, blurb] of HorizonCases) {
    it(blurb, async () => {
      const { box } = timelyBoxOf(1000)
      world.mw.setNow(T0 + elapsed)
      await expect(box.hydrate(opts)).resolves.to.eq(box)
      expect(world.mw.callsOf('get')).to.have.lengthOf(gets)
    })
  }

  const SparseCases = [
    [{ maxMillisSinceRefresh: Infinity }, 'under maxMillisSinceRefresh Infinity'],
    [{ maxMillisSinceRefresh: 60_000 },   'under a horizon it is timely by'],
    [{},                                  'under no horizon given'],
  ] as const
  for (const [opts, blurb] of SparseCases) {
    it(`fetches a sparse central however timely: ${blurb}`, async () => {
      const { listing, box } = timelyBoxOf(60_000)
      listing.deliverRecord(world.mw.sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      world.mw.seedPut(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      world.mw.clearCalls()
      expect(box.isFull).to.be.false
      expect(box.isTimely).to.be.true
      await box.hydrate(opts)
      expect(world.mw.callsOf('get')).to.have.lengthOf(1)
      expect(box.isFull).to.be.true
      await box.hydrate(opts)
      expect(world.mw.callsOf('get')).to.have.lengthOf(1)
    })
  }

  it("never fetches a box it created", async () => {
    const box = await boxListingOf(world.mw).create(boxDnaOf(world.mw.boxscope('anthropic_api_key')))
    expect(box.isFull).to.be.true
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })

  it("never fetches a deleted box while timely", async () => {
    const listing = boxListingOf(world.mw, { maxMillisSinceRefresh: 1000 })
    const box = listing.deliverRecord(world.mw.tombstoneBoxRecord())
    world.mw.clearCalls()
    expect(box.isPresent).to.be.false
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })

})

describe("storable.hydrate(opts): the world first", () => {
  it("calls the world's ensureTimely first every time, whether it fetches or not", async () => {
    const { box } = timelyBoxOf(1000)
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(world.mw.calls.map((call) => call.verb)).to.deep.equal(['ensureTimely'])
    world.mw.clearCalls()
    world.mw.setNow(T0 + 1000)
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    const verbs = world.mw.calls.map((call) => call.verb)
    expect(verbs[0]).to.eq('ensureTimely')
    expect(verbs).to.include('get')
  })

  it("never fetches under a stale world", async () => {
    const { box } = timelyBoxOf(1000)
    world.mw.setNow(T0 + 1000)
    const pending = makePending()
    world.mw.willEnsureTimely(() => pending.promise)
    const hydrating = box.hydrate()
    await vi.advanceTimersByTimeAsync(0)
    expect(world.mw.callsOf('get')).to.deep.equal([])
    pending.open()
    await hydrating
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("rejects with the world's refusal, fetching nothing", async () => {
    const { box } = timelyBoxOf(1000)
    world.mw.setNow(T0 + 1000)
    world.mw.willEnsureTimely(() => Promise.reject(new VaultError('storage_unavailable', "The vault could not be fetched.")))
    await expect(box.hydrate()).rejects.toThrow(/could not be fetched/)
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })
})

describe("storable.fetch(opts): one fetch at a time", () => {
  it("joins the fetch under way: overlapping calls make one get and share its answer", async () => {
    const { box } = timelyBoxOf(1000)
    const pending = makePending()
    const { scope } = box
    world.mw.willGet(async () => {
      await pending.promise
      return world.mw.answerOf(scope, world.mw.fullBoxRecord())
    })
    const first = box.fetch()
    await vi.advanceTimersByTimeAsync(0)
    const second = box.fetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
    pending.open()
    expect(await Promise.all([first, second])).to.deep.equal([box, box])
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("judges each call's ifAbsent for itself: a 'fail' refuses and a 'nil' resolves, though they share one get", async () => {
    const { box } = timelyBoxOf(1000)
    const pending = makePending()
    const { scope } = box
    world.mw.willGet(async () => {
      await pending.promise
      return world.mw.answerOf(scope, world.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-gone' }))
    })
    const failing = box.fetch({ ifAbsent: 'fail' })
    const nilling = box.fetch({ ifAbsent: 'nil' })
    await vi.advanceTimersByTimeAsync(0)
    pending.open()
    await TH.expectRefusal(failing, 'absent_box')
    await expect(nilling).resolves.to.eq(box)
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("starts a fetch of its own once the one under way has ended", async () => {
    const { box } = timelyBoxOf(1000)
    await box.fetch()
    await box.fetch()
    expect(world.mw.callsOf('get')).to.have.lengthOf(2)
  })
})

describe("storable.hydrate(opts): after a failed fetch", () => {
  it("rejects a hydrate whose fetch fails with its refusal, and fetches again on the next", async () => {
    const { box } = timelyBoxOf()
    world.mw.setNow(T0 + 2000)
    world.mw.willGet(world.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "The storage could not be reached.")))
    await expect(box.hydrate()).rejects.toThrow(/could not be reached/)
    await box.hydrate()
    expect(world.mw.callsOf('get')).to.have.lengthOf(2)
  })
})

describe("storable: no timer", () => {
  it("sets no timer, and fetches nothing as its record goes untimely", async () => {
    const { box } = timelyBoxOf(1000)
    expect(vi.getTimerCount()).to.eq(0)
    await world.mw.advance(5000)
    expect(box.isTimely).to.be.false
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })
})

describe("storable.hydrate(opts): a thing made with a horizon of Infinity", () => {
  it("fetches nothing for the record received, however long after", async () => {
    const { box } = timelyBoxOf(Infinity)
    await world.mw.advance(1e9)
    await box.hydrate()
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })
})
// --

// == [Put]: seal, then put

describe("storable.put(patch): seal, then put", () => {
  it("puts the sealed record over central's revision, and resolves once storage's answer is adopted", async () => {
    const { box } = timelyBoxOf()
    const pending = makePending()
    world.mw.willPut(async ({ record }) => {
      await pending.promise
      return world.mw.answerOf(box.scope, record)
    })
    let resolved = false
    const putting = (async () => {
      const sent = await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })
      resolved = true
      return sent
    })()
    await vi.advanceTimersByTimeAsync(0)
    const [put] = world.mw.callsOf('put')
    expect(put?.record).to.deep.include({ revision_seq: 2, sidecar: { note: 'sent' } })
    expect(put?.record.revision_tok).to.not.eq('rev-a1')
    expect(put?.expectedRevisionTok).to.equal('rev-a1')
    expect(resolved).to.be.false
    pending.open()
    expect(await putting).to.eq(box)
    expect(box._cheat_central).to.deep.equal(put?.record)
  })
})
// --

// == [Del]: deleted over central's revision, again where gone

describe("storable.del()", () => {
  it("deletes at central's revision, gone once the answer is adopted", async () => {
    const { box } = timelyBoxOf()
    const pending = makePending()
    world.mw.willDel(async ({ scope, tombstone }) => {
      await pending.promise
      return world.mw.answerOf(scope, tombstone)
    })
    const deleting = box.del(box.scope)
    await vi.advanceTimersByTimeAsync(0)
    expect(box.isPresent).to.be.true
    expect(world.mw.callsOf('del')[0]?.expectedRevisionTok).to.equal('rev-a1')
    pending.open()
    expect(await deleting).to.eq(box)
    expect(box._cheat_central).to.deep.include({ am: 'x', revision_seq: 2 })
  })

  it("deletes at the revision asked where central is at it, and refuses 'stale_write' at another, deleting nothing", async () => {
    const { box } = timelyBoxOf()
    const asked = box.sparse
    await TH.expectRefusal(box.del({ ...asked, revision_tok: 'rev-other', revision_seq: asked.revision_seq + 1 }), 'stale_write')
    expect(world.mw.callsOf('del')).to.deep.equal([])
    expect(box.isPresent).to.be.true
    await expect(box.del(asked)).resolves.to.eq(box)
    expect(world.mw.callsOf('del')[0]?.expectedRevisionTok).to.equal(asked.revision_tok)
  })

  it("refuses a malformed scope, deleting nothing", async () => {
    const { box } = timelyBoxOf()
    await TH.expectRefusal(box.del({ ...box.scope, boxlabel: '' }))
    expect(world.mw.callsOf('del')).to.deep.equal([])
  })

  it("refuses a malformed revision, deleting nothing", async () => {
    const { box } = timelyBoxOf()
    await TH.expectRefusal(box.del({ ...box.sparse, revision_seq: 1.5 }), 'bad_option')
    await TH.expectRefusal(box.del({ ...box.sparse, revision_tok: 42 } as never), 'bad_option')
    expect(world.mw.callsOf('del')).to.deep.equal([])
    expect(box.isPresent).to.be.true
  })

  it("deletes the thing handed in as its own revision", async () => {
    const { box } = timelyBoxOf()
    const { revision_tok } = box
    await expect(box.del(box)).resolves.to.eq(box)
    expect(world.mw.callsOf('del')[0]?.expectedRevisionTok).to.equal(revision_tok)
  })

  it("sends a delete of a deleted thing expecting its tombstone, which the vaultDB refuses", async () => {
    const { box } = timelyBoxOf()
    await box.del(box.scope)
    const tombstone = box._cheat_central
    world.mw.clearCalls()
    await TH.expectRefusal(box.del(box.scope), 'absent_box')
    const [del] = world.mw.callsOf('del')
    expect(del?.expectedRevisionTok).to.equal(tombstone.revision_tok)
    expect(box._cheat_central).to.deep.include({ am: 'x', revision_seq: tombstone.revision_seq })
  })

  it("keeps its tombstone when a repeat delete is refused with the same one", async () => {
    const { box } = timelyBoxOf()
    await box.del(box.scope)
    const tombstone = box._cheat_central
    world.mw.willDel(({ scope }) => ({ ...world.mw.refusalOf(scope, Refuse.actRefused('box', 'dubdel'), null, tombstone), act: 'dubdel' }))
    await TH.expectRefusal(box.del(box.scope), 'absent_box')
    expect(box._cheat_central).to.eq(tombstone)
    expect(box.isPresent).to.be.false
    expect(box.revision_seq).to.eq(tombstone.revision_seq)
  })

})
// --

// == [Locked]: refused at entry, never mid-flight

describe("storable verbs while the vault is locked", () => {
  const EntryCases = [
    [(box: TestableBox) => box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'locked' } }), 'put'],
    [(box: TestableBox) => box.del(box.scope),                                                          'del'],
  ] as const
  for (const [verb, verbname] of EntryCases) {
    it(`refuses ${verbname} at its entry with 'vault_locked', writing nothing`, async () => {
      const { box } = timelyBoxOf()
      world.mw.setLocked(true)
      await TH.expectRefusal(verb(box), 'vault_locked')
      expect(world.mw.calls.map((call) => call.verb)).not.to.include.members(['put', 'del'])
    })
  }

  it("reads the listing's isLocked afresh on each call", () => {
    const { box } = timelyBoxOf()
    expect(box.isLocked).to.be.false
    world.mw.setLocked(true)
    expect(box.isLocked).to.be.true
    world.mw.setLocked(false)
    expect(box.isLocked).to.be.false
  })
})
// --

// == [Try forms]: outcomes, never a rejection

/** The refusal a VaultDB that cannot be reached answers. */
function storageDown(): VaultError { return new VaultError('storage_unavailable', "The storage could not be reached.") }

describe("storable try forms: an outcome, never a rejection", () => {
  const GoodCases = [
    [(box: TestableBox) => box.tryFetch(),                                                   'tryFetch of a stored record'],
    [(box: TestableBox) => box.tryHydrate(),                                                 'tryHydrate of a timely record'],
    [(box: TestableBox) => box.tryPut({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'x' } }), 'tryPut that storage takes'],
    [(box: TestableBox) => box.tryDel(box.scope),                                                     'tryDel that storage takes'],
  ] as const
  for (const [tryVerb, blurb] of GoodCases) {
    it(`resolves a good outcome with the thing: ${blurb}`, async () => {
      const { box } = timelyBoxOf()
      expect(await tryVerb(box)).to.deep.include({ ok: true, val: box })
    })
  }

  const BadCases = [
    [(box: TestableBox) => box.tryFetch(),                                                   (box: TestableBox) => { world.mw.willGet(world.mw.refusalOf(box.scope, storageDown())) },  "storage_unavailable", 'tryFetch that storage refuses'],
    [(box: TestableBox) => box.tryFetch(),                                                   () => { world.mw.willGet(() => { throw new Error("socket closed") }) },         undefined,             'tryFetch whose VaultDB throws a plain Error'],
    [(box: TestableBox) => box.tryHydrate(),                                                 () => { world.mw.willEnsureTimely(() => Promise.reject(storageDown())) },         "storage_unavailable", "tryHydrate whose world's ensureTimely refuses"],
    [(box: TestableBox) => box.tryPut({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'x' } }), (box: TestableBox) => { world.mw.willPut(world.mw.staleWriteOf(box.scope, undefined)) }, "stale_write",         'tryPut that storage refuses as stale'],
    [(box: TestableBox) => box.tryDel(box.scope),                                                     () => { world.mw.setLocked(true) },                                      "vault_locked",        'tryDel while locked'],
  ] as const
  for (const [tryVerb, arrange, refusalkind, blurb] of BadCases) {
    it(`resolves a bad outcome with its refusal: ${blurb}`, async () => {
      const { box } = timelyBoxOf()
      arrange(box)
      await TH.expectBad(tryVerb(box), refusalkind)
    })
  }
})
// --

// == [Success by receive's verdict]: success noted on the fetch path

describe("storable.hydrate(opts): timeliness after a fetch", () => {
  it("fetches again after a fetch returned an older record", async () => {
    const { listing, box } = timelyBoxOf(1000)
    listing.deliverRecord(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
    world.mw.setNow(T0 + 1000)
    world.mw.willGet(world.mw.answerOf(box.scope, fullBoxRecord()))
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(box.revision_seq).to.eq(2)
    expect(box.isTimely).to.be.false
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(world.mw.callsOf('get')).to.have.lengthOf(2)
  })

  it("fetches again after a fetch returned only a sparse record", async () => {
    const { box } = timelyBoxOf(1000)
    world.mw.setNow(T0 + 1000)
    world.mw.willGet(world.mw.answerOf(box.scope, sparseBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })))
    await box.hydrate()
    expect(box.isTimely).to.be.false
    world.mw.willGet(world.mw.answerOf(box.scope, sparseBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })))
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(world.mw.callsOf('get')).to.have.lengthOf(2)
  })

  it("is timely for the whole horizon after a fetch returned a newer full record", async () => {
    const { box } = timelyBoxOf(1000)
    world.mw.setNow(T0 + 1000)
    world.mw.willGet(world.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })))
    await box.hydrate()
    expect(box.isTimely).to.be.true
    world.mw.setNow(T0 + 1999)
    expect(box.isTimely).to.be.true
    world.mw.setNow(T0 + 2000)
    expect(box.isTimely).to.be.false
  })

  it("throws a refusal of the fetched record to its caller, and stays untimely", async () => {
    const { box } = timelyBoxOf(1000)
    world.mw.setNow(T0 + 1000)
    world.mw.willGet(world.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
    await TH.expectRefusal(box.hydrate())
    expect(box.isTimely).to.be.false
    expect(world.mw.badnews).to.deep.equal([])
  })
})

// --

// == [Rebirth, sentences]: a deletion arriving again after a put, phrases.ts

describe("storable.listing.deliverRecord(rcvd): after a put over a deleted box", () => {
  it("keeps a rebirth when the old deletion arrives again", async () => {
    const gone = tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
    world.mw.seedPut(gone)
    const box = fakeSealBoxListingOf(world.mw).deliverRecord(gone)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    box.listing.deliverRecord(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    expect(box.isPresent).to.be.true
  })
})

describe("storable refusal sentences, from phrases.ts", () => {
  it("says a revision conflict is a bug to report", () => {
    const { box } = timelyBoxOf()
    const err = TH.expectSyncRefusal(() => box.listing.deliverRecord(tombstoneBoxRecord({ revision_seq: 1, revision_tok: 'rev-a1' })))
    expect(err.message).to.eq(Phrases.OneRevisionTwoFates)
    expect(err.family).to.eq('condition')
    const twoToks = TH.expectSyncRefusal(() => cmpRevisions({ revision_tok: 'a', revision_seq: 1 }, { revision_tok: 'b', revision_seq: 1 }))
    expect(twoToks.message).to.eq(Phrases.OneRevisionTwoToks)
    for (const message of [Phrases.OneRevisionTwoFates, Phrases.OneRevisionTwoToks, Phrases.OneRevisionTwoLives]) {
      expect(message).to.match(/report this as a bug/i)
    }
  })

  it("refuses a locked put and a record not full with the sentences phrases.ts has", async () => {
    const { box } = timelyBoxOf()
    world.mw.setLocked(true)
    const locked = await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} }), 'vault_locked')
    expect(locked.message).to.eq(Phrases.VaultLocked)
    world.mw.setLocked(false)
    const sparse = boxListingOf(world.mw).deliverRecord(sparseBoxRecord({ boxlabel: 'sparse_one' }))
    const notFull = TH.expectSyncRefusal(() => sparse.demandFull())
    expect(notFull.message).to.eq(Phrases.PartialLoad)
  })

  it("throws a box record under another vault_tok than its listing's with the sentence phrases.ts has", () => {
    const { box } = timelyBoxOf()
    const err = TH.expectSyncRefusal(() => box.listing.deliverRecord(fullBoxRecord({ revision_seq: 2, vault_tok: 'vault-tok-other' })))
    expect(err.message).to.eq(Phrases.rowOfOtherAddress(['vault_tok']))
  })
})
// --

// == [Timeliness of the record in hand]: hydrate, receive

describe("storable.hydrate(opts): timeliness depends only on the box's own record", () => {
  it("fetches a whole box once its record is older than the horizon, and not before", async () => {
    const { box } = timelyBoxOf(Infinity)
    world.mw.setNow(T0 + 30_000)
    await box.hydrate({ maxMillisSinceRefresh: 60_000 })
    expect(world.mw.callsOf('get')).to.deep.equal([])
    world.mw.setNow(T0 + 61_000)
    await box.hydrate({ maxMillisSinceRefresh: 60_000 })
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("fetches a sparse box whatever its age, until it has a full record", async () => {
    world.mw.seedPut(fullBoxRecord())
    const box = boxListingOf(world.mw).deliverRecord(sparseBoxRecord())
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
    expect(box.isFull).to.be.true
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(world.mw.callsOf('get')).to.have.lengthOf(1)
  })
})
// --

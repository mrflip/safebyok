/** Storable's verbs through a Box: hydrate, fetch, put and del with their try forms, and what each refuses while locked or stale. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import { cmpRevisions } from '../../src/models/storable'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Hydrate]: when it fetches, the world first, the thing's horizon

/** A box listing of horizon `horizonMillis`, and its box `anthropic_api_key` built from the full record seeded in the store at revision 1: received at the clock's reading, so timely from then. Calls are cleared after. */
const timelyBoxOf = async (horizonMillis = 1000) => {
  const { mw } = held
  const record = mw.fullBoxRecord()
  mw.seedStore(record)
  const listing = boxListingOf(mw, { maxMillisSinceRefresh: horizonMillis })
  const box = await listing.build(record)
  mw.clearCalls()
  return { listing, box }
}

/** A promise the test resolves when it chooses, to hold a call. */
const holdOf = () => {
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
      const { box } = await timelyBoxOf(1000)
      held.mw.setNow(T0 + elapsed)
      await expect(box.hydrate(opts)).resolves.to.eq(box)
      expect(held.mw.callsOf('get')).to.have.lengthOf(gets)
    })
  }

  const SparseCases = [
    [{ maxMillisSinceRefresh: Infinity }, 'under maxMillisSinceRefresh Infinity'],
    [{ maxMillisSinceRefresh: 60_000 },   'under a horizon it is timely by'],
    [{},                                  'under no horizon given'],
  ] as const
  for (const [opts, blurb] of SparseCases) {
    it(`fetches a sparse central however timely: ${blurb}`, async () => {
      const { listing, box } = await timelyBoxOf(60_000)
      await listing.build(held.mw.sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      held.mw.seedStore(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      held.mw.clearCalls()
      expect(box.isFull).to.be.false
      expect(box.isTimely).to.be.true
      await box.hydrate(opts)
      expect(held.mw.callsOf('get')).to.have.lengthOf(1)
      expect(box.isFull).to.be.true
      await box.hydrate(opts)
      expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    })
  }

  it("never fetches a created box for want of the whisperCiphered: the birth that landed is full", async () => {
    const box = await boxListingOf(held.mw).create(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
    expect(box.isFull).to.be.true
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })

  it("never fetches a deleted central for want of the whisperCiphered, while timely", async () => {
    const listing = boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 })
    const box = await listing.build(held.mw.tombstoneBoxRecord())
    held.mw.clearCalls()
    expect(box.isPresent).to.be.false
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })

})

describe("storable.hydrate(opts): the world first", () => {
  it("calls the world's ensureTimely first every time, whether it fetches or not", async () => {
    const { box } = await timelyBoxOf(1000)
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(held.mw.calls.map((call) => call.verb)).to.deep.equal(['ensureTimely'])
    held.mw.clearCalls()
    held.mw.setNow(T0 + 1000)
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    const verbs = held.mw.calls.map((call) => call.verb)
    expect(verbs[0]).to.eq('ensureTimely')
    expect(verbs).to.include('get')
  })

  it("never fetches under a stale world", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.setNow(T0 + 1000)
    const hold = holdOf()
    held.mw.willEnsureTimely(() => hold.promise)
    const hydrating = box.hydrate()
    await vi.advanceTimersByTimeAsync(0)
    expect(held.mw.callsOf('get')).to.deep.equal([])
    hold.open()
    await hydrating
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("rejects with the world's refusal, fetching nothing", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.setNow(T0 + 1000)
    held.mw.willEnsureTimely(() => Promise.reject(new VaultError('storage_unavailable', "The vault could not be fetched.")))
    await expect(box.hydrate()).rejects.toThrow(/could not be fetched/)
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })
})

describe("storable.fetch(opts): one fetch at a time", () => {
  it("joins the fetch under way: overlapping calls make one get and share its answer", async () => {
    const { box } = await timelyBoxOf(1000)
    const hold = holdOf()
    const { scope } = box
    held.mw.willGet(async () => {
      await hold.promise
      return held.mw.answerOf(scope, held.mw.fullBoxRecord())
    })
    const first = box.fetch()
    await vi.advanceTimersByTimeAsync(0)
    const second = box.fetch()
    await vi.advanceTimersByTimeAsync(0)
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    hold.open()
    expect(await Promise.all([first, second])).to.deep.equal([box, box])
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("judges each call's ifAbsent for itself: a 'fail' refuses and a 'nil' resolves, though they share one get", async () => {
    const { box } = await timelyBoxOf(1000)
    const hold = holdOf()
    const { scope } = box
    held.mw.willGet(async () => {
      await hold.promise
      return held.mw.answerOf(scope, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-gone' }))
    })
    const failing = box.fetch({ ifAbsent: 'fail' })
    const nilling = box.fetch({ ifAbsent: 'nil' })
    await vi.advanceTimersByTimeAsync(0)
    hold.open()
    await TH.expectRefusal(failing, 'absent_box')
    await expect(nilling).resolves.to.eq(box)
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("starts a fetch of its own once the one under way has ended", async () => {
    const { box } = await timelyBoxOf(1000)
    await box.fetch()
    await box.fetch()
    expect(held.mw.callsOf('get')).to.have.lengthOf(2)
  })
})

describe("storable.hydrate(opts): after a failed fetch", () => {
  it("rejects a hydrate whose fetch fails with its refusal, and fetches again on the next", async () => {
    const { box } = await timelyBoxOf()
    held.mw.setNow(T0 + 2000)
    held.mw.willGet(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "The store could not be reached.")))
    await expect(box.hydrate()).rejects.toThrow(/could not be reached/)
    await box.hydrate()
    expect(held.mw.callsOf('get')).to.have.lengthOf(2)
  })
})

describe("storable: no timer", () => {
  it("arms none, however long the record in hand sits: an untimely record waits for the next call that asks", async () => {
    const { box } = await timelyBoxOf(1000)
    expect(vi.getTimerCount()).to.eq(0)
    await held.mw.advance(5000)
    expect(box.isTimely).to.be.false
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })
})

describe("storable.hydrate(opts): a thing made with a horizon of Infinity", () => {
  it("fetches nothing for the record received, however long after", async () => {
    const { box } = await timelyBoxOf(Infinity)
    await held.mw.advance(1e9)
    await box.hydrate()
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })
})
// --

// == [Put]: seal, then put

describe("storable.put(patch): seal, then put", () => {
  it("puts the record sealed over central's revision, resolving this once storage's answer is adopted", async () => {
    const { box } = await timelyBoxOf()
    const hold = holdOf()
    held.mw.willPut(async ({ record }) => {
      await hold.promise
      return held.mw.answerOf(box.scope, record)
    })
    let resolved = false
    const putting = (async () => {
      const sent = await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })
      resolved = true
      return sent
    })()
    await vi.advanceTimersByTimeAsync(0)
    const [put] = held.mw.callsOf('put')
    expect(put?.record).to.deep.include({ revision_seq: 2, sidecar: { note: 'sent' } })
    expect(put?.record.revision_tok).to.not.eq('rev-a1')
    expect(put?.priorRevisionTok).to.equal('rev-a1')
    expect(resolved).to.be.false
    hold.open()
    expect(await putting).to.eq(box)
    expect(box._cheat_central).to.deep.equal(put?.record)
  })
})
// --

// == [Del]: deleted over central's revision, again where gone

describe("storable.del(): deleted over central's revision, again where gone", () => {
  it("deletes at central's revision, gone once the answer is adopted", async () => {
    const { box } = await timelyBoxOf()
    const hold = holdOf()
    held.mw.willDel(async ({ scope }) => {
      await hold.promise
      return held.mw.answerOf(scope, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    })
    const deleting = box.del()
    await vi.advanceTimersByTimeAsync(0)
    expect(box.isPresent).to.be.true
    expect(held.mw.callsOf('del')[0]?.priorRevisionTok).to.equal('rev-a1')
    hold.open()
    expect(await deleting).to.eq(box)
    expect(box._cheat_central).to.deep.include({ am: 'x', revision_tok: 'rev-x2' })
  })

  it("deletes again a thing deleted, at its tombstone's revision, which stays", async () => {
    const { box } = await timelyBoxOf()
    await box.del()
    const tombstone = box._cheat_central
    held.mw.clearCalls()
    await expect(box.del()).resolves.to.eq(box)
    const [del] = held.mw.callsOf('del')
    expect(del?.priorRevisionTok).to.equal(tombstone.revision_tok)
    expect(box._cheat_central).to.deep.include({ am: 'x', revision_seq: tombstone.revision_seq })
  })

  it("deletes again a thing deleted; the same tombstone answered reads 'same'", async () => {
    const { box } = await timelyBoxOf()
    await box.del()
    const tombstone = box._cheat_central
    held.mw.willDel(({ scope }) => held.mw.answerOf(scope, tombstone))
    await expect(box.del()).resolves.to.eq(box)
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
    [(box: TestableBox) => box.del(),                                                          'del'],
  ] as const
  for (const [verb, verbname] of EntryCases) {
    it(`refuses ${verbname} at its entry with 'vault_locked', storing nothing`, async () => {
      const { box } = await timelyBoxOf()
      held.mw.setLockState('locked')
      await TH.expectRefusal(verb(box), 'vault_locked')
      expect(held.mw.calls.map((call) => call.verb)).not.to.include.members(['put', 'del'])
    })
  }

  it("follows the listing's word on isLocked, reading it fresh each time", async () => {
    const { box } = await timelyBoxOf()
    expect(box.isLocked).to.be.false
    held.mw.setLockState('locked')
    expect(box.isLocked).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.isLocked).to.be.false
  })
})
// --

// == [Try forms]: outcomes, never a rejection

/** The refusal a store that cannot be reached answers. */
const storeDown = (): VaultError => new VaultError('storage_unavailable', "The store could not be reached.")

describe("storable try forms: an outcome, never a rejection", () => {
  const GoodCases = [
    [(box: TestableBox) => box.tryFetch(),                                                   'tryFetch of a stored record'],
    [(box: TestableBox) => box.tryHydrate(),                                                 'tryHydrate of a timely record'],
    [(box: TestableBox) => box.tryPut({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'x' } }), 'tryPut that storage takes'],
    [(box: TestableBox) => box.tryDel(),                                                     'tryDel that storage takes'],
  ] as const
  for (const [tryVerb, blurb] of GoodCases) {
    it(`resolves a good outcome holding the thing: ${blurb}`, async () => {
      const { box } = await timelyBoxOf()
      expect(await tryVerb(box)).to.deep.equal({ ok: true, val: box })
    })
  }

  const BadCases = [
    [(box: TestableBox) => box.tryFetch(),                                                   (box: TestableBox) => { held.mw.willGet(held.mw.refusalOf(box.scope, storeDown())) },  "storage_unavailable", 'tryFetch that storage refuses'],
    [(box: TestableBox) => box.tryFetch(),                                                   () => { held.mw.willGet(() => { throw new Error("socket closed") }) },         undefined,             'tryFetch whose store throws a plain Error'],
    [(box: TestableBox) => box.tryHydrate(),                                                 () => { held.mw.willEnsureTimely(() => Promise.reject(storeDown())) },         "storage_unavailable", "tryHydrate whose world's ensureTimely refuses"],
    [(box: TestableBox) => box.tryPut({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'x' } }), (box: TestableBox) => { held.mw.willPut(held.mw.staleWriteOf(box.scope, undefined)) }, "stale_write",         'tryPut that storage refuses as stale'],
    [(box: TestableBox) => box.tryDel(),                                                     () => { held.mw.setLockState('locked') },                                      "vault_locked",        'tryDel while locked'],
  ] as const
  for (const [tryVerb, arrange, refusalkind, blurb] of BadCases) {
    it(`resolves a bad outcome holding its refusal: ${blurb}`, async () => {
      const { box } = await timelyBoxOf()
      arrange(box)
      await TH.expectBad(tryVerb(box), refusalkind)
    })
  }
})
// --

// == [Success by receive's verdict]: success noted on the fetch path

describe("storable.hydrate(opts): success is receive's verdict on the record fetched", () => {
  it("notes no success for a fetch answered with an older record: the next hydrate fetches again", async () => {
    const { listing, box } = await timelyBoxOf(1000)
    await listing.build(fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 }))
    held.mw.setNow(T0 + 1000)
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord()))
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(box.revision_seq).to.eq(2)
    expect(box.isTimely).to.be.false
    await box.hydrate({ maxMillisSinceRefresh: 1000 })
    expect(held.mw.callsOf('get')).to.have.lengthOf(2)
  })

  it("notes no success for a fetch answered with a sparse record where nothing whole is held", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.setNow(T0 + 1000)
    held.mw.willGet(held.mw.answerOf(box.scope, sparseBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })))
    await box.hydrate()
    expect(box.isTimely).to.be.false
    held.mw.willGet(held.mw.answerOf(box.scope, sparseBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })))
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(held.mw.callsOf('get')).to.have.lengthOf(2)
  })

  it("notes success for a fetch answered with a newer full record, timely for the whole horizon after it", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.setNow(T0 + 1000)
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-a2', revision_seq: 2 })))
    await box.hydrate()
    expect(box.isTimely).to.be.true
    held.mw.setNow(T0 + 1999)
    expect(box.isTimely).to.be.true
    held.mw.setNow(T0 + 2000)
    expect(box.isTimely).to.be.false
  })

  it("throws a refusal of the record fetched to the hydrate's caller, and notes no success", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.setNow(T0 + 1000)
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ revision_tok: 'rev-other' })))
    await TH.expectRefusal(box.hydrate())
    expect(box.isTimely).to.be.false
    expect(held.mw.badnews).to.deep.equal([])
  })
})

// --

// == [Rebirth, sentences]: a deletion arriving again after a put, phrases.ts

describe("storable.receive(rcvd): after a put over a box held gone", () => {
  it("keeps a rebirth landed over a box held gone when the deletion held arrives again: an older record says nothing new", async () => {
    const gone = tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
    held.mw.seedStore(gone)
    const box = await fakeSealBoxListingOf(held.mw).build(gone)
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    box.receive(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    expect(box.isPresent).to.be.true
  })
})

describe("storable refusal sentences, from phrases.ts", () => {
  it("says a revision conflict is worth one fetch, and that one persisting means the system is not working", async () => {
    const { box } = await timelyBoxOf()
    const err = TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ revision_seq: 1, revision_tok: 'rev-a1' })))
    expect(err.message).to.eq(Phrases.OneRevisionTwoFates)
    expect(err.family).to.eq('condition')
    const twoToks = TH.expectSyncRefusal(() => cmpRevisions({ revision_tok: 'a', revision_seq: 1 }, { revision_tok: 'b', revision_seq: 1 }))
    expect(twoToks.message).to.eq(Phrases.OneRevisionTwoToks)
    for (const message of [Phrases.OneRevisionTwoFates, Phrases.OneRevisionTwoToks, Phrases.OneRevisionTwoLives]) {
      expect(message).to.contain('worth one try').and.to.contain('fundamentally not working')
    }
  })

  it("refuses a locked put and a record not full with the sentences phrases.ts holds", async () => {
    const { box } = await timelyBoxOf()
    held.mw.setLockState('locked')
    const locked = await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} }), 'vault_locked')
    expect(locked.message).to.eq(Phrases.VaultLocked)
    held.mw.setLockState('unlocked')
    const sparse = await boxListingOf(held.mw).build(sparseBoxRecord({ boxlabel: 'sparse_one' }))
    const notFull = TH.expectSyncRefusal(() => sparse.demandFull())
    expect(notFull.message).to.eq(Phrases.PartialLoad)
  })

  it("throws a record under another vault_tok with the sentence phrases.ts holds", async () => {
    const { box } = await timelyBoxOf()
    const err = TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: 2, vault_tok: 'vault-tok-other' })))
    expect(err.message).to.eq(Phrases.OtherVaultTok)
  })
})
// --

// == [Timeliness of the record in hand]: hydrate, receive

describe("storable.hydrate(opts): timeliness asks of the record in hand alone", () => {
  it("fetches a whole box once its record is older than the horizon, and not before", async () => {
    const { box } = await timelyBoxOf(Infinity)
    held.mw.setNow(T0 + 30_000)
    await box.hydrate({ maxMillisSinceRefresh: 60_000 })
    expect(held.mw.callsOf('get')).to.deep.equal([])
    held.mw.setNow(T0 + 61_000)
    await box.hydrate({ maxMillisSinceRefresh: 60_000 })
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("fetches a sparse box whatever its age, until a whole record is in hand", async () => {
    held.mw.seedStore(fullBoxRecord())
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(box.isFull).to.be.true
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })
})
// --

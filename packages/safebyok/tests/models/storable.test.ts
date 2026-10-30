import { describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../src/consts'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import { boxListingOf, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Timeliness, thread 4a]: hydrate, the trigger's horizon

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
    // by the launch the thing's own horizon scheduled, at eagerFrac 0.8 of it:
    [799,       {},                                  0, 'does not fetch, given no horizon, before the launch scheduled'],
    [800,       {},                                  1, 'fetches, given no horizon, once the launch scheduled is due'],
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
    [{},                                  'before the launch scheduled'],
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

  it("never fetches a never-stored central for want of the whisperCiphered: a draft's central is a tombstone, whole", async () => {
    const box = await boxListingOf(held.mw).build({ ...held.mw.boxscope('anthropic_api_key') })
    expect(box.isFull).to.be.false
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

  it("fetches nothing under maxMillisSinceRefresh Infinity for a thing never fetched, its central full", async () => {
    const { mw } = held
    const listing = boxListingOf(mw)
    const box = new Box(mw.world, listing, mw.fullBoxRecord(), null, { maxMillisSinceRefresh: 1000 })
    expect(box.isTimely).to.be.false
    await box.hydrate({ maxMillisSinceRefresh: Infinity })
    expect(mw.callsOf('get')).to.deep.equal([])
  })
})

describe("storable.hydrate(opts): the world first, and one fetch at a time", () => {
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

  it("waits on the world's ensureTimely before it fetches", async () => {
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

  it("joins the fetch under way: calls made during it make no fetch of their own", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.setNow(T0 + 1000)
    const hold = holdOf()
    const { scope } = box
    held.mw.willGet(async () => {
      await hold.promise
      return held.mw.answerOf(scope, held.mw.fullBoxRecord())
    })
    const first = box.hydrate()
    await vi.advanceTimersByTimeAsync(0)
    const second = box.hydrate()
    const third = box.hydrate({ maxMillisSinceRefresh: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    hold.open()
    expect(await Promise.all([first, second, third])).to.deep.equal([box, box, box])
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })
})

describe("storable.hydrate(opts): after a failed fetch", () => {
  it("schedules no launch after the scheduled one fails, and the next hydrate launches on demand", async () => {
    const { box } = await timelyBoxOf(1000)
    held.mw.willGet(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "The store could not be reached.")))
    await held.mw.advance(800)
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(vi.getTimerCount()).to.eq(0)
    await held.mw.advance(60_000)
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    await box.hydrate()
    expect(held.mw.callsOf('get')).to.have.lengthOf(2)
    expect(vi.getTimerCount()).to.eq(1)
  })

  it("rejects a hydrate whose fetch fails with its refusal, scheduling no launch, and launches again on the next", async () => {
    const box = await boxListingOf(held.mw).build({ ...held.mw.boxscope('anthropic_api_key') })
    held.mw.willGet(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "The store could not be reached.")))
    await expect(box.hydrate()).rejects.toThrow(/could not be reached/)
    expect(vi.getTimerCount()).to.eq(0)
    await box.hydrate()
    expect(held.mw.callsOf('get')).to.have.lengthOf(2)
  })
})

describe("storable.hydrate(opts): a horizon past MaxTimerMillis", () => {
  const horizonMillis = 2 * MaxTimerMillis
  const launchMillis = 0.8 * horizonMillis

  it("arms no timer, and reads stale once the launch it schedules is passed", async () => {
    const { box } = await timelyBoxOf(horizonMillis)
    expect(vi.getTimerCount()).to.eq(0)
    await held.mw.advance(launchMillis - 1)
    expect(box.isTimely).to.be.true
    await held.mw.advance(1)
    expect(box.isTimely).to.be.false
    expect(held.mw.callsOf('get')).to.deep.equal([])
    await box.hydrate()
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })

  it("fetches under that horizon given once it is passed, and not before", async () => {
    const { box } = await timelyBoxOf(horizonMillis)
    held.mw.setNow(T0 + horizonMillis - 1)
    await box.hydrate({ maxMillisSinceRefresh: horizonMillis })
    expect(held.mw.callsOf('get')).to.deep.equal([])
    held.mw.setNow(T0 + horizonMillis)
    await box.hydrate({ maxMillisSinceRefresh: horizonMillis })
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
  })
})
// --

describe("storable.hydrate(opts): a thing made with a horizon of Infinity", () => {
  it.todo("fetches nothing for a thing never fetched, given no horizon (Coach: does the thing's own maxMillisSinceRefresh of Infinity mean go ahead before its first success? Today the trigger is born due, so the first hydrate fetches once)")
})

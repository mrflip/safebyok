import { describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../src/consts'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import * as TH from '../test-helpers'
import { boxListingOf, fakeSealBoxListingOf, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Hydrate]: when it fetches, the world first, one fetch at a time, the trigger's horizon

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

describe("storable.hydrate(opts): a thing made with a horizon of Infinity", () => {
  it.todo("fetches nothing for a thing never fetched, given no horizon (Coach: does the thing's own maxMillisSinceRefresh of Infinity mean go ahead before its first success? Today the trigger is born due, so the first hydrate fetches once)")
})
// --

// == [Edit]: the record staged, the next revision kept until it is spent

describe("storable.edit(patch): the record staged", () => {
  it("stages a sidecar patch at the next revision, written now and registered when central was, leaving central untouched and storing nothing", async () => {
    const { box } = await timelyBoxOf()
    const { central } = box.cacheable
    held.mw.setNow(T0 + 500)
    await expect(box.edit({ sidecar: { note: 'edited' } })).resolves.to.eq(box)
    expect(box.hasStaged).to.be.true
    expect(box.cacheable.staged).to.deep.include({ revision_seq: 2, written_at: T0 + 500, registered_at: T0, am: 'a', sidecar: { note: 'edited' } })
    expect(box.cacheable.staged?.revision_tok).not.to.eq(central.revision_tok)
    expect(box.cacheable.central).to.eq(central)
    expect(box.revision_seq).to.eq(2)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("stages the same revision_tok for three edits in a row against central's revision", async () => {
    const { box } = await timelyBoxOf()
    const toks: string[] = []
    for (const note of ['one', 'two', 'three']) {
      await box.edit({ sidecar: { note } })
      toks.push(box.revision_tok)
    }
    expect(new Set(toks).size).to.eq(1)
    expect(box.revision_seq).to.eq(2)
    expect(box.sidecar).to.deep.equal({ note: 'three' })
  })

  const SentCases = [
    [(_box: Box) => undefined,                                                                                                        'storage takes the record'],
    [(box: Box) => { held.mw.willPut(held.mw.staleWriteOf(box.scope, held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-b2' }))) }, 'storage refuses it as stale, another revision stored'],
    [(box: Box) => { held.mw.willPut(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', "The store could not be reached."))) }, 'storage cannot be reached, central unmoved'],
  ] as const
  for (const [scriptPut, blurb] of SentCases) {
    it(`stages a fresh revision_tok after a send, whatever its outcome: ${blurb}`, async () => {
      const { box } = await timelyBoxOf()
      scriptPut(box)
      await box.trySend({ sidecar: { note: 'sent' } })
      const [put] = held.mw.callsOf('put')
      await box.edit({ sidecar: { note: 'after' } })
      expect(box.revision_tok).not.to.eq(put?.record.revision_tok)
      expect(box.revision_seq).to.eq(box.cacheable.central.revision_seq + 1)
    })
  }

  it("stages a fresh revision_tok once central changes", async () => {
    const { box } = await timelyBoxOf()
    await box.edit({ sidecar: { note: 'before' } })
    const before = box.revision_tok
    box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-b2' }))
    await box.edit({ sidecar: { note: 'after' } })
    expect(box.revision_tok).not.to.be.oneOf([before, 'rev-b2'])
    expect(box.revision_seq).to.eq(3)
  })
})
// --

// == [Send]: edit, then put

describe("storable.send(patch): edit, then put", () => {
  it("edits, then puts the record staged over central's revision, resolving this once storage's answer is adopted", async () => {
    const { box } = await timelyBoxOf()
    const hold = holdOf()
    held.mw.willPut(async ({ record }) => {
      await hold.promise
      return held.mw.answerOf(box.scope, record)
    })
    let resolved = false
    const sending = (async () => {
      const sent = await box.send({ sidecar: { note: 'sent' } })
      resolved = true
      return sent
    })()
    await vi.advanceTimersByTimeAsync(0)
    const [put] = held.mw.callsOf('put')
    expect(put?.record).to.deep.include({ revision_tok: box.revision_tok, revision_seq: 2, sidecar: { note: 'sent' } })
    expect(put?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
    expect(box.hasStaged).to.be.true
    expect(resolved).to.be.false
    hold.open()
    expect(await sending).to.eq(box)
    expect(box.hasStaged).to.be.false
    expect(box.cacheable.central).to.deep.equal(put?.record)
  })

  it("puts a draft under maxMillisSinceRefresh Infinity without fetching, at revision 0, expecting no record stored", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build({ ...held.mw.boxscope('anthropic_api_key') })
    held.mw.clearCalls()
    await box.send({ whisper: 'sk-test-0000' }, { maxMillisSinceRefresh: Infinity })
    expect(held.mw.callsOf('get')).to.deep.equal([])
    const [put] = held.mw.callsOf('put')
    expect(put?.expected).to.be.null
    expect(put?.record.revision_seq).to.eq(0)
    expect(box.isPresent).to.be.true
    expect(box.hasStaged).to.be.false
  })
})
// --

// == [Del]: a tombstone staged, then deleted, again where gone

describe("storable.del(): a tombstone staged, then deleted", () => {
  it("stages a tombstone at the next revision, then deletes at central's revision, gone once the answer is adopted", async () => {
    const { box } = await timelyBoxOf()
    const hold = holdOf()
    held.mw.willDel(async ({ scope, expected }) => {
      await hold.promise
      return held.mw.answerOf(scope, held.mw.tombstoneBoxRecord({ revision_seq: (expected?.revision_seq ?? 0) + 1, revision_tok: 'rev-x2' }))
    })
    const deleting = box.del()
    await vi.advanceTimersByTimeAsync(0)
    expect(box.isPresent).to.be.false
    expect(box.cacheable.staged).to.deep.include({ am: 'x', revision_seq: 2 })
    expect(held.mw.callsOf('del')[0]?.expected).to.deep.equal({ revision_tok: 'rev-a1', revision_seq: 1 })
    hold.open()
    expect(await deleting).to.eq(box)
    expect(box.hasStaged).to.be.false
    expect(box.cacheable.central).to.deep.include({ am: 'x', revision_tok: 'rev-x2' })
  })

  it("deletes again a thing deleted, at its tombstone's revision; a tombstone at the next revision answered reads 'gone' and drops the staged", async () => {
    const { box } = await timelyBoxOf()
    await box.del()
    const tombstone = box.cacheable.central
    held.mw.clearCalls()
    await expect(box.del()).resolves.to.eq(box)
    const [del] = held.mw.callsOf('del')
    expect(del?.expected).to.deep.equal({ revision_tok: tombstone.revision_tok, revision_seq: tombstone.revision_seq })
    expect(box.cacheable.central).to.deep.include({ am: 'x', revision_seq: tombstone.revision_seq + 1 })
    expect(box.hasStaged).to.be.false
  })

  it("deletes again a thing deleted; the same tombstone answered reads 'same', and the staged tombstone stays held", async () => {
    const { box } = await timelyBoxOf()
    await box.del()
    const tombstone = box.cacheable.central
    held.mw.willDel(({ scope }) => held.mw.answerOf(scope, tombstone))
    await expect(box.del()).resolves.to.eq(box)
    expect(box.cacheable.central).to.eq(tombstone)
    expect(box.hasStaged).to.be.true
    expect(box.revision_seq).to.eq(tombstone.revision_seq + 1)
  })

  it("deletes a damaged thing at the ouchstone's revision", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(held.mw.tombstoneBoxRecord({ revision_seq: 3, revision_tok: 'rev-d3' }, 'd'))
    held.mw.clearCalls()
    await expect(box.del()).resolves.to.eq(box)
    expect(held.mw.callsOf('del')[0]?.expected).to.deep.equal({ revision_tok: 'rev-d3', revision_seq: 3 })
    expect(box.cacheable.central).to.deep.include({ am: 'x', revision_seq: 4 })
  })
})
// --

// == [Locked]: refused at entry, never mid-flight

describe("storable verbs while the vault is locked", () => {
  const EntryCases = [
    [(box: Box) => box.edit({ sidecar: { note: 'locked' } }), 'edit'],
    [(box: Box) => box.send({ sidecar: { note: 'locked' } }), 'send'],
    [(box: Box) => box.del(),                                  'del'],
  ] as const
  for (const [verb, verbname] of EntryCases) {
    it(`refuses ${verbname} at its entry with 'vault_locked', staging and storing nothing`, async () => {
      const { box } = await timelyBoxOf()
      held.mw.setLockState('locked')
      await TH.expectRefusal(verb(box), 'vault_locked')
      expect(box.hasStaged).to.be.false
      expect(held.mw.calls.map((call) => call.verb)).not.to.include.members(['put', 'del'])
    })
  }

  it("completes an edit whose vault locks during makeStaged", async () => {
    const lock = { during: false }
    const listing = fakeSealBoxListingOf(held.mw, {}, () => { if (lock.during) { held.mw.setLockState('locked') } })
    const box = await listing.build(held.mw.fullBoxRecord())
    lock.during = true
    await expect(box.edit({ sidecar: { note: 'made while locking' } })).resolves.to.eq(box)
    expect(box.isLocked).to.be.true
    expect(box.cacheable.staged).to.deep.include({ sidecar: { note: 'made while locking' } })
  })

  it("completes a send whose vault locks between edit and put", async () => {
    const { box } = await timelyBoxOf()
    expect(box.snapshot.present).to.be.true
    box.subscribe(() => { held.mw.setLockState('locked') })
    await expect(box.send({ sidecar: { note: 'sent while locking' } })).resolves.to.eq(box)
    expect(box.isLocked).to.be.true
    expect(held.mw.callsOf('put')).to.have.lengthOf(1)
    expect(box.hasStaged).to.be.false
  })

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
    [(box: Box) => box.tryFetch(),                          'tryFetch of a stored record'],
    [(box: Box) => box.tryHydrate(),                        'tryHydrate of a timely record'],
    [(box: Box) => box.tryEdit({ sidecar: { note: 'x' } }), 'tryEdit of a full record'],
    [(box: Box) => box.trySend({ sidecar: { note: 'x' } }), 'trySend that storage takes'],
    [(box: Box) => box.tryDel(),                            'tryDel that storage takes'],
  ] as const
  for (const [tryVerb, blurb] of GoodCases) {
    it(`resolves a good outcome holding the thing: ${blurb}`, async () => {
      const { box } = await timelyBoxOf()
      expect(await tryVerb(box)).to.deep.equal({ ok: true, val: box })
    })
  }

  const BadCases = [
    [(box: Box) => box.tryFetch(),                          (box: Box) => { held.mw.willGet(held.mw.refusalOf(box.scope, storeDown())) },    "storage_unavailable", 'tryFetch that storage refuses'],
    [(box: Box) => box.tryFetch(),                          () => { held.mw.willGet(() => { throw new Error("socket closed") }) },           "unexpected_error",    'tryFetch whose store throws a plain Error'],
    [(box: Box) => box.tryHydrate(),                        () => { held.mw.willEnsureTimely(() => Promise.reject(storeDown())) },           "storage_unavailable", "tryHydrate whose world's ensureTimely refuses"],
    [(box: Box) => box.tryEdit({ sidecar: { note: 'x' } }), () => { held.mw.setLockState('locked') },                                        "vault_locked",        'tryEdit while locked'],
    [(box: Box) => box.trySend({ sidecar: { note: 'x' } }), (box: Box) => { held.mw.willPut(held.mw.staleWriteOf(box.scope, undefined)) }, "stale_write",         'trySend that storage refuses as stale'],
    [(box: Box) => box.tryDel(),                            () => { held.mw.setLockState('locked') },                                        "vault_locked",        'tryDel while locked'],
  ] as const
  for (const [tryVerb, arrange, refusalkind, blurb] of BadCases) {
    it(`resolves a bad outcome holding its refusal: ${blurb}`, async () => {
      const { box } = await timelyBoxOf()
      arrange(box)
      const outcome = await tryVerb(box)
      expect(outcome.ok).to.be.false
      expect(outcome.err?.refusalkind).to.eq(refusalkind)
    })
  }
})
// --

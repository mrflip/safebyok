import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import type { BoxRecord, BoxSparse, CentralPolicy, Fetched, RecordShape, Reconciled } from '../../src/models/models-shapes'
import * as MSX from '../../src/models/models-shapes'
import { Box } from '../../src/models/box'
import { cmpRevisions, Storable } from '../../src/models/storable'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'
import { type BoxAnswer, TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

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

/** Each policy `reconcileCentral` returned, in order, across every SpiedBox: a sealed storable takes no field of its own. */
const policies: CentralPolicy[] = []

beforeEach(() => { policies.length = 0 })

/** A Box that logs the policy of each row `reconcileCentral` takes, and does nothing else differently. */
class SpiedBox extends TestableBox {
  protected override reconcileCentral(rcvd: Fetched<BoxRecord, BoxSparse>, rcvdShape: RecordShape): Reconciled<BoxRecord, BoxSparse> {
    const reconciled = super.reconcileCentral(rcvd, rcvdShape)
    policies.push(reconciled.policy)
    return reconciled
  }
}

type Rec = Fetched<BoxRecord, BoxSparse>

const CentralRev = { revision_seq: 2, revision_tok: 'rev-c2' }
const OlderRev   = { revision_seq: 1, revision_tok: 'rev-o1', written_at: T0 - 1000 }
const SameRev    = { revision_seq: 2, revision_tok: 'rev-c2', written_at: T0 + 2000 }
const NewerRev   = { revision_seq: 3, revision_tok: 'rev-n3', written_at: T0 + 3000 }

/** The central held, by shape, at revision 2 under 'rev-c2'. */
const Centrals: Readonly<Record<RecordShape, () => Rec>> = {
  full:   () => fullBoxRecord(CentralRev),
  sparse: () => sparseBoxRecord(CentralRev),
  gone:   () => tombstoneBoxRecord(CentralRev),
}

/** A record storage delivers, by shape, at the revision given; a full one carries a sidecar of its own. */
const rcvdOf = (shape: RecordShape, rev: Partial<BoxSparse>): Rec => {
  if (shape === 'full')   { return fullBoxRecord({ ...rev, am: 'a', sidecar: { note: 'delivered' } }) }
  if (shape === 'sparse') { return sparseBoxRecord(rev) }
  return tombstoneBoxRecord(rev)
}

/** A box holding `central`, not held by the listing and not yet timely. */
const boxOf = (central: Rec): SpiedBox => (
  new SpiedBox(held.mw.world, boxListingOf(held.mw), central, { maxMillisSinceRefresh: 10 * 60_000 })
)

/** The box's held records and the own props that follow the record in hand, for comparing before and after. */
const stateOf = (box: TestableBox) => ({
  central:      box._cheat_central,
  revision_seq: box.revision_seq,
  revision_tok: box.revision_tok,
  written_at:   box.written_at,
})

/** Asserts `receive(rcvd)` took the row named by `policy`, leaving central as it was. */
const expectReceivedUnchanged = (box: SpiedBox, rcvd: Rec | null, policy: CentralPolicy): void => {
  const before = stateOf(box)
  box.receive(rcvd)
  expect(policies).to.deep.equal([policy])
  expect(stateOf(box)).to.deep.equal(before)
}

/** Asserts `receive(rcvd)` refused 'record_conflict', taking no row and leaving the box as it was. */
const expectReceiveConflict = (box: SpiedBox, rcvd: Rec | null): void => {
  const before = stateOf(box)
  TH.expectSyncRefusal(() => box.receive(rcvd), 'record_conflict')
  expect(policies).to.deep.equal([])
  expect(stateOf(box)).to.deep.equal(before)
}

const ShapesAll: readonly RecordShape[] = ['full', 'sparse', 'gone']
const ShapesAlive: readonly RecordShape[] = ['full', 'sparse']

describe("cmpRevisions(ante, post)", () => {
  const ante = { revision_seq: 2, revision_tok: 'rev-c2' }
  const cases: readonly (readonly [post: { revision_seq: number, revision_tok: string }, age: string, blurb: string])[] = [
    [{ revision_seq: 1, revision_tok: 'rev-o1' }, "older", 'a lower seq is older, whatever its tok'],
    [{ revision_seq: 1, revision_tok: 'rev-c2' }, "older", 'a lower seq under the same tok is still older'],
    [{ revision_seq: 3, revision_tok: 'rev-n3' }, "newer", 'a higher seq is newer, whatever its tok'],
    [{ revision_seq: 2, revision_tok: 'rev-c2' }, "same",  'the same seq under the same tok is the same revision'],
  ]
  for (const [post, age, blurb] of cases) {
    it(`reads ${String(post.revision_seq)}/${post.revision_tok} against 2/rev-c2 as '${age}': ${blurb}`, () => {
      expect(cmpRevisions(ante, post)).to.eq(age)
    })
  }

  it("refuses the same seq under another tok as 'record_conflict': two puts landed as one revision", () => {
    TH.expectSyncRefusal(() => cmpRevisions(ante, { revision_seq: 2, revision_tok: 'rev-other' }), 'record_conflict')
  })
})

describe("storable.receive(rcvd): the reconcileCentral table, through a Box", () => {
  beforeEach(() => { held.mw.setNow(T0 + 9000) })

  describe("an older rcvd", () => {
    for (const centralShape of ShapesAll) {
      for (const rcvdShape of ['full', 'sparse', 'gone'] as const) {
        it(`older | ${rcvdShape} | ${centralShape} takes 'older', central as it was`, () => {
          expectReceivedUnchanged(boxOf(Centrals[centralShape]()), rcvdOf(rcvdShape, OlderRev), 'older')
        })
      }
    }

    for (const rcvdShape of ShapesAll) {
      it(`older | ${rcvdShape} | full notes no success: an older record says nothing of the revision held`, () => {
        const box = boxOf(Centrals.full())
        box.receive(rcvdOf(rcvdShape, OlderRev))
        expect(box.isTimely).to.be.false
      })
    }
  })

  describe("success noted on a record not older, where the record in hand is whole", () => {
    it("same | sparse | sparse notes no success: nothing whole is held", () => {
      const box = boxOf(Centrals.sparse())
      box.receive(rcvdOf('sparse', SameRev))
      expect(box.isTimely).to.be.false
    })

    it("same | gone | gone notes success: a tombstone is whole", () => {
      const box = boxOf(Centrals.gone())
      box.receive(rcvdOf('gone', SameRev))
      expect(box.isTimely).to.be.true
    })
  })

  describe("the same revision", () => {
    it("the same seq under another tok refuses 'record_conflict' from cmpRevisions, whatever the shapes", () => {
      for (const centralShape of ShapesAll) {
        for (const rcvdShape of ShapesAll) {
          policies.length = 0
          expectReceiveConflict(boxOf(Centrals[centralShape]()), rcvdOf(rcvdShape, { ...SameRev, revision_tok: 'rev-other' }))
        }
      }
    })

    for (const centralShape of ShapesAlive) {
      it(`same | gone | alive (${centralShape}) refuses 'record_conflict': one revision, two fates`, () => {
        expectReceiveConflict(boxOf(Centrals[centralShape]()), rcvdOf('gone', SameRev))
      })
    }

    for (const rcvdShape of ShapesAlive) {
      it(`same | alive (${rcvdShape}) | gone refuses 'record_conflict': one revision, two fates`, () => {
        expectReceiveConflict(boxOf(Centrals.gone()), rcvdOf(rcvdShape, SameRev))
      })
    }

    for (const centralShape of ['full', 'sparse'] as const) {
      it(`same | sparse | any (${centralShape}) takes 'same', central as it was`, () => {
        expectReceivedUnchanged(boxOf(Centrals[centralShape]()), rcvdOf('sparse', SameRev), 'same')
      })
    }

    it("same | gone | gone takes 'same', central as it was", () => {
      expectReceivedUnchanged(boxOf(Centrals.gone()), rcvdOf('gone', SameRev), 'same')
    })

    it("same | full | full takes 'same', central as it was, though the delivered sidecar differs", () => {
      expectReceivedUnchanged(boxOf(Centrals.full()), rcvdOf('full', SameRev), 'same')
    })

    it("same | full | sparse takes 'fill': central becomes the delivered record", () => {
      const box = boxOf(Centrals.sparse())
      const rcvd = rcvdOf('full', SameRev)
      box.receive(rcvd)
      expect(policies).to.deep.equal(['fill'])
      expect(box._cheat_central).to.deep.equal(rcvd)
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'delivered' })
      expect(box.written_at).to.eq(SameRev.written_at)
    })

  })

  describe("a newer rcvd", () => {
    for (const centralShape of ShapesAll) {
      for (const rcvdShape of ShapesAlive) {
        it(`newer | ${rcvdShape} | any (${centralShape}) takes 'adopt': central becomes the delivered record, its revision the box's`, () => {
          const box = boxOf(Centrals[centralShape]())
          const rcvd = rcvdOf(rcvdShape, NewerRev)
          box.receive(rcvd)
          expect(policies).to.deep.equal(['adopt'])
          expect(box._cheat_central).to.deep.equal(rcvd)
          expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok: 'rev-n3', written_at: NewerRev.written_at })
        })
      }

      it(`newer | gone | any (${centralShape}) takes 'gone': central becomes the stored tombstone, whose revision moves the box's own props`, () => {
        const box = boxOf(Centrals[centralShape]())
        const rcvd = rcvdOf('gone', NewerRev)
        box.receive(rcvd)
        expect(policies).to.deep.equal(['gone'])
        expect(box._cheat_central).to.deep.equal(rcvd)
        expect(box.isPresent).to.be.false
        expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok: 'rev-n3', written_at: NewerRev.written_at })
      })

    }
  })

  describe("a rcvd of another life: another box_tok, in this vault", () => {
    /** The box made anew elsewhere under the same boxlabel: another `box_tok`, registered later. */
    const OtherLife = { box_tok: 'box-tok-b', registered_at: T0 + 50 }

    for (const rcvdShape of ShapesAll) {
      it(`other | older | ${rcvdShape} | full takes the older rows: a past life, its revisions ordered with this one's`, () => {
        expectReceivedUnchanged(boxOf(Centrals.full()), rcvdOf(rcvdShape, { ...OlderRev, ...OtherLife }), 'older')
      })
    }

    for (const rcvdShape of ShapesAll) {
      it(`other | same | ${rcvdShape} | full refuses 'record_conflict': one revision cannot begin a life and continue another`, () => {
        const box = boxOf(Centrals.full())
        const before = stateOf(box)
        const err = TH.expectSyncRefusal(() => box.receive(rcvdOf(rcvdShape, { ...SameRev, ...OtherLife })), 'record_conflict')
        expect(err.message).to.eq(Phrases.OneRevisionTwoLives)
        expect(policies).to.deep.equal([])
        expect(stateOf(box)).to.deep.equal(before)
      })
    }

    for (const centralShape of ShapesAll) {
      it(`other | newer | full | ${centralShape} takes 'adopt', a birthday: central, box_tok and registered_at become the delivered record's`, () => {
        const box = boxOf(Centrals[centralShape]())
        const rcvd = rcvdOf('full', { ...NewerRev, ...OtherLife })
        box.receive(rcvd)
        expect(policies).to.deep.equal(['adopt'])
        expect(box._cheat_central).to.deep.equal(rcvd)
        expect(box).to.include({ box_tok: 'box-tok-b', registered_at: T0 + 50, revision_seq: 3 })
      })
    }

    it("other | newer | full | never stored takes 'adopt': a box born elsewhere first is the one storage holds", () => {
      const box = boxOf(tombstoneBoxRecord({ revision_seq: MSX.VoidRevisionSeq, revision_tok: 'rev-never' }))
      const rcvd = fullBoxRecord({ revision_seq: 0, revision_tok: 'rev-b0', ...OtherLife })
      box.receive(rcvd)
      expect(box._cheat_central).to.deep.equal(rcvd)
      expect(box).to.include({ box_tok: 'box-tok-b', registered_at: T0 + 50 })
    })
  })
})

describe("storable.receive(null)", () => {
  it("for a thing never stored reads as 'same': nothing stored is the tombstone it was born with", () => {
    const box = boxOf(tombstoneBoxRecord({ revision_seq: MSX.VoidRevisionSeq, revision_tok: 'rev-never' }))
    expect(box._cheat_central.revision_seq).to.eq(MSX.VoidRevisionSeq)
    expectReceivedUnchanged(box, null, 'same')
  })

  for (const centralShape of ShapesAlive) {
    it(`for a thing held alive (${centralShape}) refuses 'record_conflict', by same | gone | alive`, () => {
      expectReceiveConflict(boxOf(Centrals[centralShape]()), null)
    })
  }

  it("for a thing held gone reads as 'same', by same | gone | gone", () => {
    expectReceivedUnchanged(boxOf(Centrals.gone()), null, 'same')
  })
})

/** A box holding `record`, by default the full box record `anthropic_api_key` at revision 1, with the same in storage. */
const builtBoxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<TestableBox> => {
  held.mw.seedStore(record)
  return boxListingOf(held.mw).build(record)
}

/** The own props that follow the record in hand, as the box holds them now. */
const followingPropsOf = (box: TestableBox) => ({ vault_tok: box.vault_tok, revision_tok: box.revision_tok, revision_seq: box.revision_seq, written_at: box.written_at })

/** Script the store's next `del` to hold until `release`, answering `tombstone`; `entered` resolves once the store has the call. The fake timers stay where they are: `vi.waitFor` would move them. */
const holdNextDel = (box: TestableBox, tombstone: ReturnType<typeof tombstoneBoxRecord>): { entered: Promise<void>, release: () => void } => {
  let release: (() => void) | undefined
  const gate = new Promise<BoxAnswer>((resolve) => { release = () => { resolve(held.mw.answerOf(box.scope, tombstone)) } })
  const entered = new Promise<void>((resolve) => {
    held.mw.willDel(() => {
      resolve()
      return gate
    })
  })
  return { entered, release: () => { release?.() } }
}

describe("Storable snapshot and subscription", () => {
  describe("getSnapshot", () => {
    it("answers one frozen object, the same one again and again", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      expect(Object.isFrozen(first)).to.be.true
      expect(box.getSnapshot()).to.eq(first)
      expect(box.snapshot).to.eq(first)
    })

    it("is one function with one identity, as useSyncExternalStore wants it, answering the current snapshot", async () => {
      const box = await builtBoxOf()
      expect(box.getSnapshot).to.eq(box.getSnapshot)
      const { getSnapshot } = box
      const first = getSnapshot()
      await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'changed' } })
      expect(getSnapshot()).to.not.eq(first)
      expect(getSnapshot()).to.eq(box.snapshot)
    })

    it("keeps the same object until a settle changes it, and the old one stays as it was", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      box.settle()
      expect(box.getSnapshot()).to.eq(first)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', sidecar: { note: 'two' } }))
      const second = box.getSnapshot()
      expect(second).to.not.eq(first)
      expect(Object.isFrozen(second)).to.be.true
      expect(second).to.include({ revision_seq: 2, revision_tok: 'rev-a2' })
      expect(first).to.include({ revision_seq: 1, revision_tok: 'rev-a1' })
      expect(box.getSnapshot()).to.eq(second)
    })

    it("is made on the first call, so that a settle before it has none to replace and tells nobody", () => {
      const { mw } = held
      const box = new TestableBox(mw.world, boxListingOf(mw), mw.fullBoxRecord(), { maxMillisSinceRefresh: 1000 })
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })

    it("is made by becomeNotifiable, which answers the box, so that the next change notifies; the snapshot it made is the one getSnapshot answers", () => {
      const { mw } = held
      const box = new TestableBox(mw.world, boxListingOf(mw), mw.fullBoxRecord(), { maxMillisSinceRefresh: 1000 })
      const listener = vi.fn()
      box.subscribe(listener)
      expect(box.becomeNotifiable()).to.eq(box)
      const made = box.getSnapshot()
      expect(box.becomeNotifiable().getSnapshot()).to.eq(made)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(1)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })
  })

  describe("settle", () => {
    it("notifies nobody when it changes nothing, and keeps the snapshot", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      expect(box.settle()).to.deep.equal({ badnews: [] })
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies nobody when a receive only confirms the record in hand", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(fullBoxRecord())
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies every listener once when it changes the snapshot", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const [one, other] = [vi.fn(), vi.fn()]
      box.subscribe(one)
      box.subscribe(other)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(one.mock.calls).to.have.lengthOf(1)
      expect(other.mock.calls).to.have.lengthOf(1)
    })

    it("hands each listener the new snapshot to find, already in place when it is called", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const seen: number[] = []
      box.subscribe(() => { seen.push(box.getSnapshot().revision_seq) })
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(seen).to.deep.equal([2])
    })

    it("notifies on a put and on a del, each a change", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent' } })
      const afterEdit = listener.mock.calls.length
      expect(afterEdit).to.be.greaterThan(0)
      await box.del()
      expect(listener.mock.calls.length).to.be.greaterThan(afterEdit)
      expect(box.getSnapshot().present).to.be.false
    })
  })

  describe("subscribe", () => {
    it("is one function with one identity, answering an unsubscribe", async () => {
      const box = await builtBoxOf()
      expect(box.subscribe).to.eq(box.subscribe)
      expect(box.subscribe(() => undefined)).to.be.a('function')
    })

    it("stops telling a listener once it unsubscribes, and leaves the others be", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const [leaving, staying] = [vi.fn(), vi.fn()]
      const unsubscribe = box.subscribe(leaving)
      box.subscribe(staying)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      unsubscribe()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3' }))
      expect(leaving.mock.calls).to.have.lengthOf(1)
      expect(staying.mock.calls).to.have.lengthOf(2)
    })

    it("takes an unsubscribe called twice as it takes one", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const [leaving, staying] = [vi.fn(), vi.fn()]
      const unsubscribe = box.subscribe(leaving)
      box.subscribe(staying)
      unsubscribe()
      unsubscribe()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(leaving.mock.calls).to.have.lengthOf(0)
      expect(staying.mock.calls).to.have.lengthOf(1)
    })
  })
})

describe("Storable forms", () => {
  describe("toJSON", () => {
    it("is the sparse form of central, with no sidecar and none of the sealed parts", async () => {
      const box = await builtBoxOf()
      expect(box.toJSON()).to.deep.equal(box.sparse)
      expect(box.sparse).to.deep.equal(held.mw.sparseBoxRecord())
      expect(JSON.stringify(box)).to.eq(JSON.stringify(held.mw.sparseBoxRecord()))
      expect(Object.keys(box.toJSON())).to.not.include.members(['sidecar', 'box_key_wrapped', 'whisper_ciphered'])
    })

    it("is the tombstone's sparse form for a gone box, which has no sidecar either", async () => {
      const gone = held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
      const box = await builtBoxOf(gone)
      expect(box.toJSON()).to.deep.equal(gone)
      expect(box.toJSON()).to.not.have.property('sidecar')
    })
  })
})

describe("Storable own props", () => {
  describe("the scope", () => {
    it("is a getter on the prototype over one frozen object, not an own prop of the box", async () => {
      const box = await builtBoxOf()
      expect(Object.getOwnPropertyDescriptor(box, 'scope')).to.be.undefined
      expect(Object.getOwnPropertyDescriptor(Storable.prototype, 'scope')).to.have.property('get').that.is.a('function')
      expect(box.scope).to.eq(box.scope)
      expect(Object.isFrozen(box.scope)).to.be.true
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
      expect(Object.keys(box)).to.not.include('scope')
      expect(JSON.stringify(box)).to.not.contain('"scope"')
    })

    it("is tattooed on the box as its own props, which nothing assigns or deletes", async () => {
      const box = await builtBoxOf()
      for (const ckey of ['applabel', 'user_id', 'vaultlabel', 'boxlabel'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(box, ckey)
        expect(descriptor, ckey).to.include({ enumerable: true, writable: false, configurable: false })
        expect(descriptor?.value, ckey).to.eq(box.scope[ckey])
        expect(Reflect.set(box, ckey, 'other'), ckey).to.be.false
        expect(Reflect.deleteProperty(box, ckey), ckey).to.be.false
        expect(box[ckey], ckey).to.eq(descriptor?.value)
      }
    })
  })

  describe("the props that follow the record in hand: revision_tok, revision_seq, written_at; and vault_tok, which never moves", () => {
    const writable = ['vault_tok', 'revision_tok', 'revision_seq', 'written_at'] as const

    it("start as the record the box was received with", async () => {
      const box = await builtBoxOf(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-a4', written_at: T0 + 40 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a4', revision_seq: 4, written_at: T0 + 40 })
    })

    it("are ordinary enumerable own props, but not configurable, so that nothing removes them", async () => {
      const box = await builtBoxOf()
      for (const ckey of writable) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, configurable: false })
      }
    })

    it("are plain assigned props for the revision and written_at, writable, and sealed with the rest of the box", async () => {
      const box = await builtBoxOf()
      expect(Object.isSealed(box)).to.be.true
      for (const ckey of ['revision_tok', 'revision_seq', 'written_at', 'registered_at'] as const) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, writable: true, configurable: false })
      }
    })

    it("follow a newer record received", async () => {
      const box = await builtBoxOf()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 1000 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("follow a received tombstone", async () => {
      const box = await builtBoxOf()
      box.receive(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 1000 }))
      expect(box.isPresent).to.be.false
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("keep the vault_tok of birth, not writable: a record under another vault_tok received over a tombstone throws 'unexpected_error', and neither it nor the scope moves", async () => {
      const box = await builtBoxOf(tombstoneBoxRecord())
      const { scope } = box
      TH.expectSyncRefusal(() => box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', vault_tok: 'vault-tok-u2' })), 'unexpected_error')
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(Object.getOwnPropertyDescriptor(box, 'vault_tok')).to.include({ writable: false, configurable: false })
      expect(box.scope).to.eq(scope)
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
    })

    it("stay with the record in hand when an older record is received", async () => {
      const box = await builtBoxOf(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3', written_at: T0 + 30 }))
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a3', revision_seq: 3, written_at: T0 + 30 })
    })

    it("follow the record a put lands, which is one revision on, written now", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent' } })
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(followingPropsOf(box)).to.include({ revision_tok: box._cheat_central.revision_tok, revision_seq: 2 })
    })

    it("follow the tombstone a del lands, once the store answers", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      const { entered, release } = holdNextDel(box, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 900 }))
      const deleting = box.del()
      await entered
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a1', revision_seq: 1, written_at: T0 })
      release()
      await deleting
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 900 })
    })
  })
})

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
      const sent = await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent' } })
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
    [(box: TestableBox) => box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'locked' } }), 'put'],
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
    [(box: TestableBox) => box.tryPut({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'x' } }), 'tryPut that storage takes'],
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
    [(box: TestableBox) => box.tryFetch(),                                                   () => { held.mw.willGet(() => { throw new Error("socket closed") }) },         "unexpected_error",    'tryFetch whose store throws a plain Error'],
    [(box: TestableBox) => box.tryHydrate(),                                                 () => { held.mw.willEnsureTimely(() => Promise.reject(storeDown())) },         "storage_unavailable", "tryHydrate whose world's ensureTimely refuses"],
    [(box: TestableBox) => box.tryPut({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'x' } }), (box: TestableBox) => { held.mw.willPut(held.mw.staleWriteOf(box.scope, undefined)) }, "stale_write",         'tryPut that storage refuses as stale'],
    [(box: TestableBox) => box.tryDel(),                                                     () => { held.mw.setLockState('locked') },                                      "vault_locked",        'tryDel while locked'],
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
    await TH.expectRefusal(box.hydrate(), 'record_conflict')
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
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    box.receive(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    expect(box.isPresent).to.be.true
  })
})

describe("storable refusal sentences, from phrases.ts", () => {
  it("says a record_conflict is worth one fetch, and that one persisting means the system is not working", async () => {
    const { box } = await timelyBoxOf()
    const err = TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ revision_seq: 1, revision_tok: 'rev-a1' })), 'record_conflict')
    expect(err.message).to.eq(Phrases.OneRevisionTwoFates)
    expect(err.family).to.eq('condition')
    const twoToks = TH.expectSyncRefusal(() => cmpRevisions({ revision_tok: 'a', revision_seq: 1 }, { revision_tok: 'b', revision_seq: 1 }), 'record_conflict')
    expect(twoToks.message).to.eq(Phrases.OneRevisionTwoToks)
    for (const message of [Phrases.OneRevisionTwoFates, Phrases.OneRevisionTwoToks, Phrases.OneRevisionTwoLives]) {
      expect(message).to.contain('worth one try').and.to.contain('fundamentally not working')
    }
  })

  it("refuses a locked put and a record not full with the sentences phrases.ts holds", async () => {
    const { box } = await timelyBoxOf()
    held.mw.setLockState('locked')
    const locked = await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} }), 'vault_locked')
    expect(locked.message).to.eq(Phrases.VaultLocked)
    held.mw.setLockState('unlocked')
    const sparse = await boxListingOf(held.mw).build(sparseBoxRecord({ boxlabel: 'sparse_one' }))
    const notFull = TH.expectSyncRefusal(() => sparse.demandFull(), 'bad_option')
    expect(notFull.message).to.eq(Phrases.PartialLoad)
  })

  it("throws a record under another vault_tok with the sentence phrases.ts holds", async () => {
    const { box } = await timelyBoxOf()
    const err = TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: 2, vault_tok: 'vault-tok-other' })), 'unexpected_error')
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

describe("Storable put guards: ensurePuttable, demandPuttable", () => {
  const Patch = { whisper: { val: 'sk-test-0000' } }

  it("demandPuttable answers the patch as parsed while the vault is unlocked, and refuses 'vault_locked' while it is locked", async () => {
    const box = await builtBoxOf()
    expect(box.demandPuttable({ ...box.scope, sidecar: { note: 'sent' } })).to.deep.include({ sidecar: { note: 'sent' } })
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'vault_locked')
  })

  it("demandPuttable refuses a bad patch first, 'bad_option' while locked and over a record not whole", async () => {
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => box.demandPuttable({}), 'bad_option')
    TH.expectSyncRefusal(() => box.demandPuttable({ ...Patch, boxlabel: 'openai_api_key' }), 'bad_option')
  })

  it("demandPuttable refuses 'disabled' before the lock, and the lock before a record not whole", async () => {
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'bad_option')
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'vault_locked')
    box.vacate()
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'disabled')
  })

  it("demandPuttable under ifPresent 'fail' refuses a whole record as 'bad_option', saying its data would be recycled", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const err = TH.expectSyncRefusal(() => box.demandPuttable({ ...fullBoxRecord() }, { ifPresent: 'fail' }), 'bad_option')
    expect(err.message).to.eq(Phrases.RecordForNewBox)
    expect(box.demandPuttable({ ...fullBoxRecord() })).to.deep.include({ sidecar: fullBoxRecord().sidecar })
    expect(box.demandPuttable(Patch, { ifPresent: 'fail' })).to.deep.include(Patch)
  })

  it("demandPuttable under ifAbsent 'fail' refuses a void record and a tombstone as 'absent_box'", async () => {
    const listing = boxListingOf(held.mw)
    const alive = await listing.build(fullBoxRecord({ boxlabel: 'alive_one' }))
    const gone  = await listing.build(tombstoneBoxRecord({ boxlabel: 'gone_one' }))
    const shell = listing.puttable(held.mw.boxscope('void_one'))
    expect(alive.demandPuttable(Patch, { ifAbsent: 'fail' })).to.deep.include(Patch)
    for (const box of [gone, shell]) {
      const err = TH.expectSyncRefusal(() => box.demandPuttable(Patch, { ifAbsent: 'fail' }), 'absent_box')
      expect(err.message).to.eq(Phrases.boxAbsent(box.boxlabel))
    }
  })

  it("demandPuttable takes a void record and a tombstone as whole", async () => {
    const listing = boxListingOf(held.mw)
    const shell = listing.puttable(held.mw.boxscope('anthropic_api_key'))
    expect(shell.demandPuttable(Patch)).to.deep.include(Patch)
    const tomb = await listing.build(held.mw.tombstoneBoxRecord({ boxlabel: 'openai_api_key' }))
    expect(tomb.demandPuttable(Patch)).to.deep.include(Patch)
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })

  it("ensurePuttable refreshes and demands nothing: it resolves while locked, where put refuses", async () => {
    const box = await builtBoxOf()
    held.mw.setLockState('locked')
    await expect(box.ensurePuttable()).resolves.to.eq(box)
    await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} }), 'vault_locked')
  })

  it("put ensures once, before its seal, and a bad patch heard after that ensure puts nothing", async () => {
    const box = await builtBoxOf()
    const putGuard = vi.spyOn(Box.prototype, 'ensurePuttable')
    await TH.expectRefusal(box.put({}), 'bad_option')
    expect(putGuard).toHaveBeenCalledOnce()
    expect(held.mw.callsOf('put')).to.deep.equal([])
    putGuard.mockClear()
    await expect(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'sent' } })).resolves.to.eq(box)
    expect(putGuard).toHaveBeenCalledOnce()
  })
})

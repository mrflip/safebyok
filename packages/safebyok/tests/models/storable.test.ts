import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MaxTimerMillis } from '../../src/consts'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import type { BoxRecord, BoxSparse, CentralPolicy, Fetched, RecordShape, Reconciled } from '../../src/models/models-shapes'
import * as MSX from '../../src/models/models-shapes'
import { cmpRevisions, Storable } from '../../src/models/storable'
import * as TH from '../test-helpers'
import { type BoxAnswer, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

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

/** Each policy `reconcileCentral` returned, in order, across every SpiedBox: a sealed storable takes no field of its own. */
const policies: CentralPolicy[] = []

beforeEach(() => { policies.length = 0 })

/** A Box that logs the policy of each row `reconcileCentral` takes, and does nothing else differently. */
class SpiedBox extends Box {
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
  ouch:   () => tombstoneBoxRecord(CentralRev, 'd'),
}

/** A record storage delivers, by shape, at the revision given; a full one carries a sidecar of its own. */
const rcvdOf = (shape: RecordShape, rev: Partial<BoxSparse>): Rec => {
  if (shape === 'full')   { return fullBoxRecord({ ...rev, sidecar: { note: 'delivered' } }) }
  if (shape === 'sparse') { return sparseBoxRecord(rev) }
  return tombstoneBoxRecord(rev, shape === 'ouch' ? 'd' : 'x')
}

/** An edit made here and not yet sent, at the revision after central's. */
const Staged = (): BoxRecord => fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-s3', written_at: T0 + 300, sidecar: { note: 'staged' } })

/** A box holding `central` and `staged`, as `hello` revives one from the device cache: not held by the listing, not yet timely. */
const boxOf = (central: Rec, staged: Rec | null = null): SpiedBox => (
  new SpiedBox(held.mw.world, boxListingOf(held.mw), central, staged, { maxMillisSinceRefresh: 10 * 60_000 })
)

/** The box's held records and the own props that follow the record in hand, for comparing before and after. */
const stateOf = (box: Box) => ({
  central:      box.cacheable.central,
  staged:       box.cacheable.staged,
  revision_seq: box.revision_seq,
  revision_tok: box.revision_tok,
  written_at:   box.written_at,
})

/** Asserts `receive(rcvd)` took the row named by `policy`, leaving central and the staged as they were. */
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

const ShapesAll: readonly RecordShape[] = ['full', 'sparse', 'gone', 'ouch']
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
        it(`older | ${rcvdShape} | ${centralShape} takes 'older', central and nothing staged as they were`, () => {
          expectReceivedUnchanged(boxOf(Centrals[centralShape]()), rcvdOf(rcvdShape, OlderRev), 'older')
        })
      }
      it(`older | ouch | ${centralShape} takes 'skip', central and nothing staged as they were`, () => {
        expectReceivedUnchanged(boxOf(Centrals[centralShape]()), rcvdOf('ouch', OlderRev), 'skip')
      })
    }

    it("older | any | any leaves a staged edit as it was", () => {
      expectReceivedUnchanged(boxOf(Centrals.full(), Staged()), rcvdOf('full', OlderRev), 'older')
    })

    it("older | ouch | any leaves a staged edit as it was", () => {
      expectReceivedUnchanged(boxOf(Centrals.full(), Staged()), rcvdOf('ouch', OlderRev), 'skip')
    })

    it("older | full | any marks the box timely, though it confirms nothing of central (pinned: the receive's doc says a full record that confirms central does)", () => {
      const box = boxOf(Centrals.full())
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf('full', OlderRev))
      expect(box.isTimely).to.be.true
    })
  })

  describe("the same revision", () => {
    it("the same seq under another tok refuses 'record_conflict' from cmpRevisions, whatever the shapes", () => {
      for (const centralShape of ShapesAll) {
        for (const rcvdShape of ShapesAll) {
          policies.length = 0
          expectReceiveConflict(boxOf(Centrals[centralShape](), Staged()), rcvdOf(rcvdShape, { ...SameRev, revision_tok: 'rev-other' }))
        }
      }
    })

    for (const centralShape of ShapesAlive) {
      it(`same | gone | alive (${centralShape}) refuses 'record_conflict': one revision, two fates`, () => {
        expectReceiveConflict(boxOf(Centrals[centralShape](), Staged()), rcvdOf('gone', SameRev))
      })
    }

    for (const rcvdShape of ShapesAlive) {
      it(`same | alive (${rcvdShape}) | gone refuses 'record_conflict': one revision, two fates`, () => {
        expectReceiveConflict(boxOf(Centrals.gone(), Staged()), rcvdOf(rcvdShape, SameRev))
      })
    }

    for (const centralShape of ['full', 'sparse', 'ouch'] as const) {
      it(`same | sparse | any (${centralShape}) takes 'same', central and the staged as they were`, () => {
        expectReceivedUnchanged(boxOf(Centrals[centralShape](), Staged()), rcvdOf('sparse', SameRev), 'same')
      })
    }

    it("same | gone | gone takes 'same', central and the staged as they were", () => {
      expectReceivedUnchanged(boxOf(Centrals.gone(), Staged()), rcvdOf('gone', SameRev), 'same')
    })

    it("same | full | full takes 'same', central and the staged as they were, though the delivered sidecar differs", () => {
      expectReceivedUnchanged(boxOf(Centrals.full(), Staged()), rcvdOf('full', SameRev), 'same')
    })

    it("same | full | sparse takes 'fill': central becomes the delivered record, nothing staged stays so", () => {
      const box = boxOf(Centrals.sparse())
      const rcvd = rcvdOf('full', SameRev)
      box.receive(rcvd)
      expect(policies).to.deep.equal(['fill'])
      expect(box.cacheable.central).to.deep.equal(rcvd)
      expect(box.cacheable.staged).to.be.null
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'delivered' })
      expect(box.written_at).to.eq(SameRev.written_at)
    })

    it("same | full | sparse takes 'fill', and a staged edit stays as it was: a full record at the same revision surpasses nothing", () => {
      const box = boxOf(Centrals.sparse(), Staged())
      box.receive(rcvdOf('full', SameRev))
      expect(policies).to.deep.equal(['fill'])
      expect(box.cacheable.central).to.deep.equal(rcvdOf('full', SameRev))
      expect(box.cacheable.staged).to.deep.equal(Staged())
      expect(box.revision_tok).to.eq('rev-s3')
      expect(box.sidecar).to.deep.equal({ note: 'staged' })
    })

    for (const centralShape of ShapesAll) {
      it(`same | ouch | any (${centralShape}) takes 'skip', central and the staged as they were`, () => {
        expectReceivedUnchanged(boxOf(Centrals[centralShape](), Staged()), rcvdOf('ouch', SameRev), 'skip')
      })
    }

    it("same | gone | ouch takes 'gone': central becomes the stored tombstone, the staged dropped", () => {
      const box = boxOf(Centrals.ouch(), Staged())
      const rcvd = rcvdOf('gone', SameRev)
      box.receive(rcvd)
      expect(policies).to.deep.equal(['gone'])
      expect(box.cacheable.central).to.deep.equal(rcvd)
      expect(box.cacheable.staged).to.be.null
      expect(box.isPresent).to.be.false
      expect(stateOf(box)).to.include({ revision_seq: 2, revision_tok: 'rev-c2', written_at: SameRev.written_at })
    })

    it("same | full | ouch matches no row, and refuses 'unexpected_error' as a bug in Storable today (pinned: see the todo below)", () => {
      const box = boxOf(Centrals.ouch(), Staged())
      const before = stateOf(box)
      TH.expectSyncRefusal(() => box.receive(rcvdOf('full', SameRev)), 'unexpected_error')
      expect(stateOf(box)).to.deep.equal(before)
    })
    it.todo("same | full | ouch: the table has no row for a healthy record delivered at the revision this device holds damaged; should it take 'fill' (central becomes the delivered record, the staged as it was), as same | full | sparse does?")
  })

  describe("a newer rcvd", () => {
    for (const centralShape of ShapesAll) {
      for (const rcvdShape of ShapesAlive) {
        it(`newer | ${rcvdShape} | any (${centralShape}) takes 'adopt': central becomes the delivered record, its revision the box's`, () => {
          const box = boxOf(Centrals[centralShape]())
          const rcvd = rcvdOf(rcvdShape, NewerRev)
          box.receive(rcvd)
          expect(policies).to.deep.equal(['adopt'])
          expect(box.cacheable.central).to.deep.equal(rcvd)
          expect(box.cacheable.staged).to.be.null
          expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok: 'rev-n3', written_at: NewerRev.written_at })
        })
      }

      it(`newer | gone | any (${centralShape}) takes 'gone': central becomes the stored tombstone, whose revision moves the box's own props`, () => {
        const box = boxOf(Centrals[centralShape]())
        const rcvd = rcvdOf('gone', NewerRev)
        box.receive(rcvd)
        expect(policies).to.deep.equal(['gone'])
        expect(box.cacheable.central).to.deep.equal(rcvd)
        expect(box.isPresent).to.be.false
        expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok: 'rev-n3', written_at: NewerRev.written_at })
      })

      it(`newer | ouch | any (${centralShape}) takes 'ouch': central becomes an ouchstone of the sparse props held, under the damaged record's revision, written now`, () => {
        const box = boxOf(Centrals[centralShape]())
        box.receive(tombstoneBoxRecord({ ...NewerRev, registered_at: T0 - 5 }, 'd'))
        expect(policies).to.deep.equal(['ouch'])
        expect(box.cacheable.central).to.deep.equal({ ...sparseBoxRecord(CentralRev), revision_seq: 3, revision_tok: 'rev-n3', written_at: T0 + 9000, am: 'd' })
        expect(box.cacheable.staged).to.be.null
        expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok: 'rev-n3', written_at: T0 + 9000 })
      })
    }
  })
})

describe("storable.receive(rcvd): the reconcileStaged table, through a Box", () => {
  beforeEach(() => { held.mw.setNow(T0 + 9000) })

  describe("adopt and gone drop a staged edit, whether or not its tok is the one storage now holds", () => {
    for (const rcvdShape of ['full', 'sparse', 'gone'] as const) {
      const policy = rcvdShape === 'gone' ? 'gone' : 'adopt'
      for (const [whose, revision_tok] of [['its own put landed', 'rev-s3'], ['another device put first', 'rev-n3']] as const) {
        it(`${policy}: a newer ${rcvdShape} record under ${revision_tok} (${whose}) drops the staged; the box holds central alone`, () => {
          const box = boxOf(Centrals.full(), Staged())
          const rcvd = rcvdOf(rcvdShape, { ...NewerRev, revision_tok })
          box.receive(rcvd)
          expect(policies).to.deep.equal([policy])
          expect(box.cacheable.central).to.deep.equal(rcvd)
          expect(box.cacheable.staged).to.be.null
          expect(box.hasStaged).to.be.false
          expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok, written_at: NewerRev.written_at })
        })
      }
    }
  })

  it("fill: a full record at the revision held over a sparse central leaves the staged as it was", () => {
    const box = boxOf(Centrals.sparse(), Staged())
    box.receive(rcvdOf('full', SameRev))
    expect(policies).to.deep.equal(['fill'])
    expect(box.cacheable.staged).to.deep.equal(Staged())
  })

  it("ouch: central becomes an ouchstone of the held sparse props, and the staged is carried to the revision after it, under a new tok", () => {
    const box = boxOf(Centrals.full(), Staged())
    box.receive(rcvdOf('ouch', NewerRev))
    expect(policies).to.deep.equal(['ouch'])
    expect(box.cacheable.central).to.deep.equal({ ...sparseBoxRecord(CentralRev), revision_seq: 3, revision_tok: 'rev-n3', written_at: T0 + 9000, am: 'd' })
    const { staged } = box.cacheable
    expect(staged?.revision_seq).to.eq(4)
    expect(staged?.revision_tok).to.be.a('string').and.not.oneOf(['rev-s3', 'rev-n3', 'rev-c2'])
    expect(staged).to.deep.equal({ ...Staged(), revision_seq: 4, revision_tok: staged?.revision_tok })
    expect(stateOf(box)).to.include({ revision_seq: 4, revision_tok: staged?.revision_tok, written_at: Staged().written_at })
    expect(box.sidecar).to.deep.equal({ note: 'staged' })
  })

  it("ouch: with nothing staged, nothing is staged after", () => {
    const box = boxOf(Centrals.full())
    box.receive(rcvdOf('ouch', NewerRev))
    expect(policies).to.deep.equal(['ouch'])
    expect(box.cacheable.staged).to.be.null
  })

  it("edit: the patch over central and the staged, under the revision after central's, a new tok each time", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(Centrals.full())
    await box.edit({ sidecar: { note: 'first' } })
    const first = box.cacheable.staged
    expect(first).to.deep.equal({ ...fullBoxRecord(CentralRev), sidecar: { note: 'first' }, revision_seq: 3, revision_tok: first?.revision_tok, written_at: T0 + 9000 })
    expect(first?.revision_tok).to.not.eq('rev-c2')
    held.mw.setNow(T0 + 9500)
    await box.edit({ sidecar: { note: 'second' } })
    const second = box.cacheable.staged
    expect(second).to.deep.equal({ ...fullBoxRecord(CentralRev), sidecar: { note: 'second' }, revision_seq: 3, revision_tok: second?.revision_tok, written_at: T0 + 9500 })
    expect(second?.revision_tok).to.not.be.oneOf([first?.revision_tok, 'rev-c2'])
    expect(box.cacheable.central).to.deep.equal(Centrals.full())
  })

  it("del: a deletion's tombstone of the held sparse props, staged under the revision after central's; storage's refusal leaves it staged", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(Centrals.full())
    held.mw.willDel(held.mw.refusalOf(box.scope, new VaultError('storage_unavailable', 'The fake store is down.')))
    await TH.expectRefusal(box.del(), 'storage_unavailable')
    const { staged } = box.cacheable
    expect(staged).to.deep.equal({ ...sparseBoxRecord(CentralRev), revision_seq: 3, revision_tok: staged?.revision_tok, written_at: T0 + 9000, am: 'x' })
    expect(box.isPresent).to.be.false
    expect(box.cacheable.central).to.deep.equal(Centrals.full())
  })
})

describe("storable.receive(null)", () => {
  it("for a thing never stored reads as 'same': nothing stored is the tombstone it was born with, and the draft stays staged", async () => {
    const listing = boxListingOf(held.mw)
    const built = await listing.build({ ...held.mw.boxscope('anthropic_api_key') })
    const box = new SpiedBox(held.mw.world, listing, built.cacheable.central, built.cacheable.staged, { maxMillisSinceRefresh: 10 * 60_000 })
    expect(box.cacheable.central.revision_seq).to.eq(MSX.NeverStoredSeq)
    expectReceivedUnchanged(box, null, 'same')
    expect(box.cacheable.staged?.revision_seq).to.eq(0)
  })

  for (const centralShape of ShapesAlive) {
    it(`for a thing held alive (${centralShape}) refuses 'record_conflict', by same | gone | alive`, () => {
      expectReceiveConflict(boxOf(Centrals[centralShape](), Staged()), null)
    })
  }

  it("for a thing held damaged takes 'gone', by same | gone | ouch: central becomes a deletion's tombstone at the revision held, the staged dropped", () => {
    held.mw.setNow(T0 + 9000)
    const box = boxOf(Centrals.ouch(), Staged())
    box.receive(null)
    expect(policies).to.deep.equal(['gone'])
    expect(box.cacheable.central).to.deep.equal({ ...Centrals.ouch(), written_at: T0 + 9000, am: 'x' })
    expect(box.cacheable.staged).to.be.null
    expect(box.isPresent).to.be.false
  })

  it("for a thing held gone reads as 'same', by same | gone | gone", () => {
    expectReceivedUnchanged(boxOf(Centrals.gone(), Staged()), null, 'same')
  })
})

/** A box holding `record` (the full box record `anthropic_api_key` at revision 1, by default) as received, through a listing over the test world. */
const builtBoxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<Box> => boxListingOf(held.mw).build(record)

/** The own props that follow the record in hand, as the box holds them now. */
const followingPropsOf = (box: Box) => ({ vault_tok: box.vault_tok, revision_tok: box.revision_tok, revision_seq: box.revision_seq, written_at: box.written_at })

/** Script the store's next `del` to hold until `release`, answering `tombstone`; `entered` resolves once the store has the call. The fake timers stay where they are: `vi.waitFor` would move them. */
const holdNextDel = (box: Box, tombstone: ReturnType<typeof tombstoneBoxRecord>): { entered: Promise<void>, release: () => void } => {
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

    it("is one function with one identity, as useSyncExternalStore wants it, answering the snapshot as it stands", async () => {
      const box = await builtBoxOf()
      expect(box.getSnapshot).to.eq(box.getSnapshot)
      const { getSnapshot } = box
      const first = getSnapshot()
      await box.edit({ sidecar: { note: 'changed' } })
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

    it("is made on the first call, so that a settle before it has none to replace and tells nobody", async () => {
      const box = await builtBoxOf()
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(0)
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

    it("notifies on an edit and on a del, each a change", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      await box.edit({ sidecar: { note: 'edited' } })
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

    it("is the sparse form of central whatever is staged", async () => {
      const box = await builtBoxOf()
      await box.edit({ sidecar: { note: 'staged only' } })
      expect(box.hasStaged).to.be.true
      expect(box.toJSON()).to.deep.equal(held.mw.sparseBoxRecord())
      expect(JSON.stringify(box)).to.not.contain('staged only')
    })

    it("is the tombstone's sparse form for a gone box, which has no sidecar either", async () => {
      const gone = held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
      const box = await builtBoxOf(gone)
      expect(box.toJSON()).to.deep.equal(gone)
      expect(box.toJSON()).to.not.have.property('sidecar')
    })
  })

  describe("cacheable", () => {
    it("is the sparse form of central with central and the staged beside it, the staged null where nothing is staged", async () => {
      const box = await builtBoxOf()
      expect(box.hasStaged).to.be.false
      expect(box.cacheable).to.deep.equal({ ...held.mw.sparseBoxRecord(), central: fullBoxRecord(), staged: null })
      expect(Object.isFrozen(box.cacheable)).to.be.true
    })

    it("carries the staged record, whole, once an edit has staged one; the sparse form stays central's", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      await box.edit({ sidecar: { note: 'staged' } })
      const { staged, central, ...sparse } = box.cacheable
      expect(central).to.deep.equal(fullBoxRecord())
      expect(staged).to.include({ revision_seq: 2, written_at: T0 + 500, am: 'a' })
      expect(staged).to.have.property('sidecar').that.deep.equals({ note: 'staged' })
      expect(sparse).to.deep.equal(held.mw.sparseBoxRecord())
    })

    it("has no sidecar on the sparse form nor on a tombstone, central or staged", async () => {
      const full = await builtBoxOf()
      const { staged, central, ...sparse } = full.cacheable
      expect(staged).to.be.null
      expect(central).to.have.property('sidecar')
      expect(sparse).to.not.have.property('sidecar')

      const gone = await builtBoxOf(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      expect(gone.cacheable.central).to.not.have.property('sidecar')
      expect(gone.cacheable).to.not.have.property('sidecar')

      const damaged = await builtBoxOf(held.mw.tombstoneBoxRecord({ revision_seq: 3, revision_tok: 'rev-d3' }, 'd'))
      expect(damaged.cacheable.central).to.not.have.property('sidecar')
      expect(damaged.cacheable).to.not.have.property('sidecar')

      await full.del()
      expect(full.hasStaged).to.be.false
      expect(full.cacheable.central).to.not.have.property('sidecar')
      expect(full.cacheable).to.not.have.property('sidecar')
    })

    it("is a staged tombstone, with no sidecar, while a del is in the store's hands", async () => {
      const box = await builtBoxOf()
      const { entered, release } = holdNextDel(box, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      const deleting = box.del()
      await entered
      expect(box.cacheable.staged).to.include({ am: 'x', revision_seq: 2 })
      expect(box.cacheable.staged).to.not.have.property('sidecar')
      expect(box.cacheable.central).to.deep.equal(fullBoxRecord())
      expect(box.getSnapshot().present).to.be.false
      release()
      await deleting
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

    it("is tattooed on the box as its own props, which nothing writes or removes", async () => {
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

  describe("the props that follow the record in hand: vault_tok, revision_tok, revision_seq, written_at", () => {
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

    it("follow the vault_tok of a record received under another vault_tok, and the scope does not", async () => {
      const box = await builtBoxOf()
      const { scope } = box
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', vault_tok: 'vault-tok-u2' }))
      expect(box.vault_tok).to.eq('vault-tok-u2')
      expect(box.scope).to.eq(scope)
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
    })

    it("stay with the record in hand when an older record is received", async () => {
      const box = await builtBoxOf(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3', written_at: T0 + 30 }))
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a3', revision_seq: 3, written_at: T0 + 30 })
    })

    it("follow the staged record after an edit, which is one revision on, written now; central is untouched", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      await box.edit({ sidecar: { note: 'edited' } })
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(box.cacheable.central).to.deep.equal(fullBoxRecord())
      expect(followingPropsOf(box)).to.include({ revision_tok: box.cacheable.staged?.revision_tok, revision_seq: 2 })
    })

    it("follow a tombstone staged by a del while the store has it, and the stored tombstone once it answers", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      const { entered, release } = holdNextDel(box, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 900 }))
      const deleting = box.del()
      await entered
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      release()
      await deleting
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 900 })
      expect(box.hasStaged).to.be.false
    })
  })
})

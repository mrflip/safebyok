import { beforeEach, describe, expect, it } from 'vitest'
import { VaultError } from '../../src/errors'
import { Box } from '../../src/models/box'
import type { BoxRecord, BoxSparse, CentralPolicy, Fetched, RecordShape, Reconciled } from '../../src/models/models-shapes'
import * as MSX from '../../src/models/models-shapes'
import { cmpRevisions } from '../../src/models/storable'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

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

    for (const centralShape of ['full', 'sparse', 'ouch'] as const) {
      it(`same | ouch | any (${centralShape}) takes 'skip', central and the staged as they were`, () => {
        expectReceivedUnchanged(boxOf(Centrals[centralShape](), Staged()), rcvdOf('ouch', SameRev), 'skip')
      })
    }

    it("same | ouch | gone refuses 'record_conflict' today, by same | alive | gone, reading alive as not gone (pinned: see the todo below)", () => {
      expectReceiveConflict(boxOf(Centrals.gone(), Staged()), rcvdOf('ouch', SameRev))
    })
    it.todo("same | ouch | any (gone) takes 'skip', as the table's row says: is 'alive' am 'a' (amVals), so that damage over a deletion at one revision skips, or not gone, so that it refuses 'record_conflict' as today?")

    it("same | gone | ouch refuses 'record_conflict' today, by same | gone | alive, reading alive as not gone (pinned: see the todo below)", () => {
      expectReceiveConflict(boxOf(Centrals.ouch(), Staged()), rcvdOf('gone', SameRev))
    })
    it.todo("same | gone | ouch: no row matches it when alive is am 'a'; should a deletion at the revision held damaged take 'gone' (central becomes the deletion, the staged dropped), or refuse 'record_conflict' as today?")

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

  it("for a thing held gone reads as 'same', by same | gone | gone", () => {
    expectReceivedUnchanged(boxOf(Centrals.gone(), Staged()), null, 'same')
  })
})

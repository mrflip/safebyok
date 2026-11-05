/** Storable.receive and reconcileCentral, through a Box: what each shape of record arriving does to the record in hand. */

import { beforeEach, describe, expect, it } from 'vitest'
import type { CentralPolicy, RecordShape } from '../../src/shapes/shapes-enums'
import * as VX from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse, Fetched, Reconciled } from '../../src/shapes/shapes-vaultish'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { TestableBox, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

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
      const box = boxOf(tombstoneBoxRecord({ revision_seq: VX.VoidRevisionSeq, revision_tok: 'rev-never' }))
      const rcvd = fullBoxRecord({ revision_seq: 0, revision_tok: 'rev-b0', ...OtherLife })
      box.receive(rcvd)
      expect(box._cheat_central).to.deep.equal(rcvd)
      expect(box).to.include({ box_tok: 'box-tok-b', registered_at: T0 + 50 })
    })
  })
})

describe("storable.receive(null)", () => {
  it("for a thing never stored reads as 'same': nothing stored is the tombstone it was born with", () => {
    const box = boxOf(tombstoneBoxRecord({ revision_seq: VX.VoidRevisionSeq, revision_tok: 'rev-never' }))
    expect(box._cheat_central.revision_seq).to.eq(VX.VoidRevisionSeq)
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

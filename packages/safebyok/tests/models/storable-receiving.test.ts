/** The receive table, through a box listing: what each shape of record a listed Box receives does to the record in hand. */

import { describe, expect, it } from 'vitest'
import type { DeliveryModification, RecordShape } from '../../src/shapes/shapes-enums'
import * as SX from '../../src/shapes/shapes-storage'
import type { Fetched } from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../../src/shapes/shapes-storage'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type TestableBox, type TestableBoxListing, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

type Rec = Fetched<BoxRecord, BoxSparse>

const CentralRev = { revision_seq: 2, revision_tok: 'rev-c2' }
const OlderRev   = { revision_seq: 1, revision_tok: 'rev-o1', written_at: T0 - 1000 }
const SameRev    = { revision_seq: 2, revision_tok: 'rev-c2', written_at: T0 + 2000 }
const NewerRev   = { revision_seq: 3, revision_tok: 'rev-n3', written_at: T0 + 3000 }

/** Past the listing's horizon of ten minutes: a box listed at T0 is no longer timely. */
const Later = T0 + 3_600_000

/** The central set, by shape, at revision 2 under 'rev-c2'. */
const Centrals: Readonly<Record<RecordShape, () => Rec>> = {
  full:   () => fullBoxRecord(CentralRev),
  sparse: () => sparseBoxRecord(CentralRev),
  gone:   () => tombstoneBoxRecord(CentralRev),
}

/** A record storage delivers, by shape, at the revision given; a full one carries a sidecar of its own. */
function rcvdOf(shape: RecordShape, rev: Partial<BoxSparse>): Rec {
  if (shape === 'full')   { return fullBoxRecord({ ...rev, am: 'a', sidecar: { note: 'delivered' } }) }
  if (shape === 'sparse') { return sparseBoxRecord(rev) }
  return tombstoneBoxRecord(rev)
}

/** A box listed with `central`, its listing, and the clock moved past the box's horizon, so it is no longer timely. */
function listedBoxOf(central: Rec): { listing: TestableBoxListing, box: TestableBox } {
  world.mw.setNow(T0)
  const listing = boxListingOf(world.mw)
  const box = listing.deliverRecord(central)
  world.mw.setNow(Later)
  return { listing, box }
}

/** The box's record in hand and the own props that follow it, for comparing before and after. */
function stateOf(box: TestableBox) {
  return {
    central:      box._cheat_central,
    revision_seq: box.revision_seq,
    revision_tok: box.revision_tok,
    written_at:   box.written_at,
  }
}

/** Asserts that `rcvd`, received at `central`'s box, did what `mod` says: the same box answered, its record replaced only under `adopt`, and still untimely under `older`. */
function expectReceived(central: Rec, rcvd: Rec, mod: DeliveryModification): TestableBox {
  const { listing, box } = listedBoxOf(central)
  const before = stateOf(box)
  expect(listing.deliverRecord(rcvd)).to.equal(box)
  if (mod === 'adopt') { expect(box._cheat_central).to.deep.equal(rcvd) } else { expect(stateOf(box)).to.deep.equal(before) }
  if (mod === 'older') { expect(box.isTimely).to.be.false }
  return box
}

/** Asserts that receiving `rcvd` at `central`'s box refused, leaving the box as it was. */
function expectReceiveConflict(central: Rec, rcvd: Rec): Error {
  const { listing, box } = listedBoxOf(central)
  const before = stateOf(box)
  const err = TH.expectSyncRefusal(() => listing.deliverRecord(rcvd))
  expect(stateOf(box)).to.deep.equal(before)
  return err
}

const ShapesAll: readonly RecordShape[] = ['full', 'sparse', 'gone']
const ShapesAlive: readonly RecordShape[] = ['full', 'sparse']

describe("listing.deliverRecord(rcvd): the receive table, through a box listing", () => {
  describe("an older rcvd", () => {
    for (const centralShape of ShapesAll) {
      for (const rcvdShape of ShapesAll) {
        it(`older | ${rcvdShape} | ${centralShape} is 'older': the record as it was, the box untimely`, () => {
          expectReceived(Centrals[centralShape](), rcvdOf(rcvdShape, OlderRev), 'older')
        })
      }
    }
  })

  describe("timeliness after a record that is not older", () => {
    it("same | sparse | sparse leaves the box untimely: a sparse record is never whole", () => {
      const box = expectReceived(Centrals.sparse(), rcvdOf('sparse', SameRev), 'same')
      expect(box.isTimely).to.be.false
    })

    it("same | gone | gone makes the box timely", () => {
      const box = expectReceived(Centrals.gone(), rcvdOf('gone', SameRev), 'same')
      expect(box.isTimely).to.be.true
    })
  })

  describe("the same revision", () => {
    for (const centralShape of ShapesAll) {
      for (const rcvdShape of ShapesAll) {
        it(`same seq under another tok | ${rcvdShape} | ${centralShape} refuses from cmpRevisions`, () => {
          expectReceiveConflict(Centrals[centralShape](), rcvdOf(rcvdShape, { ...SameRev, revision_tok: 'rev-other' }))
        })
      }
    }

    for (const centralShape of ShapesAlive) {
      it(`same | gone | alive (${centralShape}) refuses: one revision, two fates`, () => {
        expectReceiveConflict(Centrals[centralShape](), rcvdOf('gone', SameRev))
      })
    }

    for (const rcvdShape of ShapesAlive) {
      it(`same | alive (${rcvdShape}) | gone refuses: one revision, two fates`, () => {
        expectReceiveConflict(Centrals.gone(), rcvdOf(rcvdShape, SameRev))
      })
    }

    for (const centralShape of ShapesAlive) {
      it(`same | sparse | ${centralShape} is 'same': the record as it was`, () => {
        expectReceived(Centrals[centralShape](), rcvdOf('sparse', SameRev), 'same')
      })
    }

    it("same | full | full is 'same': the record as it was, though the delivered sidecar differs, and the box timely", () => {
      const box = expectReceived(Centrals.full(), rcvdOf('full', SameRev), 'same')
      expect(box.isTimely).to.be.true
    })

    it("same | full | sparse is 'adopt': the record becomes the delivered one, full", () => {
      const box = expectReceived(Centrals.sparse(), rcvdOf('full', SameRev), 'adopt')
      expect(box.isFull).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'delivered' })
      expect(box.written_at).to.eq(SameRev.written_at)
    })
  })

  describe("a newer rcvd", () => {
    for (const centralShape of ShapesAll) {
      for (const rcvdShape of ShapesAll) {
        it(`newer | ${rcvdShape} | ${centralShape} is 'adopt': the record becomes the delivered one, its revision the box's`, () => {
          const box = expectReceived(Centrals[centralShape](), rcvdOf(rcvdShape, NewerRev), 'adopt')
          expect(box.isPresent).to.eq(rcvdShape !== 'gone')
          expect(stateOf(box)).to.include({ revision_seq: 3, revision_tok: 'rev-n3', written_at: NewerRev.written_at })
        })
      }
    }
  })

  describe("a rcvd of another life: another box_tok, in this vault", () => {
    /** The box made anew elsewhere under the same boxlabel: another `box_tok`, registered later. */
    const OtherLife = { box_tok: 'box-tok-b', registered_at: T0 + 50 }

    for (const rcvdShape of ShapesAll) {
      it(`other | older | ${rcvdShape} | full is 'older': a past life, its revisions ordered with this one's`, () => {
        expectReceived(Centrals.full(), rcvdOf(rcvdShape, { ...OlderRev, ...OtherLife }), 'older')
      })
    }

    for (const rcvdShape of ShapesAll) {
      it(`other | same | ${rcvdShape} | full refuses: one revision cannot begin a life and continue another`, () => {
        const err = expectReceiveConflict(Centrals.full(), rcvdOf(rcvdShape, { ...SameRev, ...OtherLife }))
        expect(err.message).to.eq(Phrases.OneRevisionTwoLives)
      })
    }

    for (const centralShape of ShapesAll) {
      it(`other | newer | full | ${centralShape} is 'adopt', in the same Box: its box_tok and registered_at become the delivered record's`, () => {
        const box = expectReceived(Centrals[centralShape](), rcvdOf('full', { ...NewerRev, ...OtherLife }), 'adopt')
        expect(box).to.include({ box_tok: 'box-tok-b', registered_at: T0 + 50, revision_seq: 3 })
      })
    }

    it("other | newer | full | never stored is 'adopt'", () => {
      const box = expectReceived(tombstoneBoxRecord({ revision_seq: SX.VoidRevisionSeq, revision_tok: 'rev-never' }), fullBoxRecord({ revision_seq: 0, revision_tok: 'rev-b0', ...OtherLife }), 'adopt')
      expect(box).to.include({ box_tok: 'box-tok-b', registered_at: T0 + 50 })
    })
  })
})

/** Fetch `central`'s box, the vaultDB answering that nothing is stored. */
async function fetchVoid(central: Rec) {
  const { listing, box } = listedBoxOf(central)
  const before = stateOf(box)
  world.mw.willGet(world.mw.answerOf(box.scope, null))
  const answer = await listing.tryFetch(box.scope, { ifAbsent: 'nil' })
  return { answer, box, before }
}

describe("a get answered gotvoid: storage has nothing stored", () => {
  it("for a thing never stored is 'same': the record as it was, the box timely", async () => {
    const { answer, box, before } = await fetchVoid(tombstoneBoxRecord({ revision_seq: SX.VoidRevisionSeq, revision_tok: 'rev-never' }))
    expect(answer.ok).to.be.true
    expect(stateOf(box)).to.deep.equal(before)
    expect(box.isTimely).to.be.true
  })

  for (const centralShape of ShapesAlive) {
    it(`for a live thing (${centralShape}) refuses 'record_conflict', the box as it was`, async () => {
      const { answer, box, before } = await fetchVoid(Centrals[centralShape]())
      expect(answer.ok ? null : answer.err.refusalkind).to.eq('record_conflict')
      expect(stateOf(box)).to.deep.equal(before)
    })
  }

  it("for a deleted thing is 'same': the record as it was", async () => {
    const { answer, box, before } = await fetchVoid(Centrals.gone())
    expect(answer.ok).to.be.true
    expect(stateOf(box)).to.deep.equal(before)
  })
})

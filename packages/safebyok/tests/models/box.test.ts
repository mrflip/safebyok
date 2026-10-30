import { describe, expect, it } from 'vitest'
import type { BoxSparse, Fetched, BoxRecord } from '../../src/models/models-shapes'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Timeliness, thread 4a]: success noted on a whole record

describe("box.receive(rcvd): a whole record makes the box timely", () => {
  const ReceivedCases = [
    // whole:
    [() => fullBoxRecord(),                true,  'a full record'],
    [() => tombstoneBoxRecord(),           true,  'a deletion\'s tombstone'],
    [() => tombstoneBoxRecord({}, 'd'),    true,  'a damaged record, as the tombstone storage hands back'],
    [() => null,                           true,  'nothing stored, which reads as a tombstone'],
    // not whole:
    [() => sparseBoxRecord(),              false, 'a sparse record'],
  ] as const satisfies readonly (readonly [() => Fetched<BoxRecord, BoxSparse> | null, boolean, string])[]

  for (const [rcvdOf, timely, blurb] of ReceivedCases) {
    it(`${timely ? 'notes success on' : 'notes no success on'} ${blurb}, newer than a draft never fetched`, async () => {
      const box = await boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 }).build({ ...held.mw.boxscope('anthropic_api_key') })
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf())
      expect(box.isTimely).to.eq(timely)
    })
  }

  const ConfirmingCases = [
    [() => fullBoxRecord(),   true,  'a full record'],
    [() => sparseBoxRecord(), false, 'a sparse record'],
  ] as const

  for (const [rcvdOf, timely, blurb] of ConfirmingCases) {
    it(`${timely ? 'notes success on' : 'notes no success on'} ${blurb} that only confirms the full central held`, async () => {
      const box = await boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 }).build(fullBoxRecord())
      held.mw.setNow(T0 + 800)
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf())
      expect(box.isTimely).to.eq(timely)
      expect(box.revision_seq).to.eq(1)
    })
  }
})
// --

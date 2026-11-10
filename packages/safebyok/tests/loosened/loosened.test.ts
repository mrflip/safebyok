/** Behaviours an old guarantee forbids that the Coach has not ruled on, each pinned as the model does it today.
 * This file keeps the storable sprint's pins and the sections the newvault sprint's threads 2 to 4 appended;
 * a new pin goes in the loosened file of its model, one per model (`vault.test.ts`, `box.test.ts`,
 * `lease.test.ts`), named for what it pins. Each `it` names the guarantee's source and line in its title.
 */

import { describe, expect, it } from 'vitest'
import { fakeSealBoxListingOf, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

// == [Creation and re-creation]: registered_at over a rebirth, the tombstone's registered_at

describe("registered_at over a rebirth", () => {
  it("VOCABULARY.md:155 (registered_at is when this life of a box began, kept by every later revision of that life): a VaultDB that answers a rebirth with the buried record's registered_at, as a database default might keep it, is adopted quietly, and the box's registered_at follows it, the rebirth's own time lost with the staged copy that carried it", async () => {
    const box = await fakeSealBoxListingOf(world.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    world.mw.setNow(T0 + 5000)
    world.mw.willPut(({ record }) => world.mw.answerOf(box.scope, { ...record, registered_at: T0 }))
    await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_central).to.deep.include({ registered_at: T0 })
    expect(box.registered_at).to.eq(T0)
    expect(world.mw.badnews).to.deep.equal([])
  })
})

// --

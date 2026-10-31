/** Behaviours an old guarantee forbids that the Coach has not ruled on, each pinned as the model does it today.
 * One file for the sprint: each thread appends describes of its own at the end, and edits none another
 * wrote. Each `it` names the guarantee's source and line in its title.
 */

import { describe, expect, it, vi } from 'vitest'
import { TestableBox, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

describe("the staged edit reconcileStaged drops or carries", () => {
  const CentralRev = { revision_seq: 2, revision_tok: 'rev-c2' }
  const OtherRev   = { revision_seq: 3, revision_tok: 'rev-other', written_at: T0 + 3000 }
  const Staged = () => fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-s3', written_at: T0 + 300, sidecar: { note: 'staged' } })
  const boxOf = () => new TestableBox(held.mw.world, boxListingOf(held.mw), fullBoxRecord(CentralRev), Staged(), { maxMillisSinceRefresh: 10 * 60_000 }, held.mw.tell)

  it("README.md:1109, 'never merges two writes -- a write that lost must be seen': a fetch meeting another device's newer box drops the edit staged here, resolves, and tells no bad news", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord(CentralRev))
    await box.edit({ whisper: 'sk-test-0000', sidecar: { note: 'mine' } })
    expect(box.hasStaged).to.be.true
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ ...OtherRev, sidecar: { note: 'theirs' } })))
    await listing.fetch(box.scope)
    expect(box.hasStaged).to.be.false
    expect(box.sidecar).to.deep.equal({ note: 'theirs' })
    expect(held.mw.badnews).to.deep.equal([])
  })

  it("whiteboard/20261028-storable_base/receive-principles.md:9, 'Don't throw away customer data': a newer sparse record drops the staged edit, the only full copy of its sidecar, and keeps it nowhere", () => {
    const box = boxOf()
    const { badnews } = box.receive(sparseBoxRecord(OtherRev))
    expect(badnews).to.deep.equal([])
    expect(box._cheat_staged).to.be.null
    expect(box._cheat_central).to.deep.equal(sparseBoxRecord(OtherRev))
    expect(box.sidecar).to.be.null
  })

  it("whiteboard/20261028-storable_base/receive-principles.md:9, 'Don't throw away customer data': a deletion from another device drops the staged edit, and the box reads as gone", () => {
    const box = boxOf()
    const { badnews } = box.receive(tombstoneBoxRecord(OtherRev))
    expect(badnews).to.deep.equal([])
    expect(box._cheat_staged).to.be.null
    expect(box.isPresent).to.be.false
  })

  it("VOCABULARY.md:91, 'revision_tok ... is part of the box's stamp': the ouch carry gives the staged edit a new revision_tok and seq, its sealed parts as they were, not sealed again", () => {
    const box = boxOf()
    box.receive(tombstoneBoxRecord(OtherRev, 'd'))
    const staged = box._cheat_staged
    expect(staged?.revision_seq).to.eq(4)
    expect(staged?.revision_tok).to.not.be.oneOf(['rev-s3', 'rev-other'])
    expect(box.box_key_wrapped).to.deep.equal(Staged().box_key_wrapped)
    expect(box.whisper_ciphered).to.deep.equal(Staged().whisper_ciphered)
  })
})

// == [Creation and re-creation]: registered_at over a rebirth, the tombstone's registered_at

describe("registered_at over a rebirth", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): a box deleted and reborn is registered at the rebirth's edit, not its first store, nor the put that stores it", async () => {
    held.mw.seedStore(fullBoxRecord())
    const box = await fakeSealBoxListingOf(held.mw).build(fullBoxRecord())
    await box.del()
    held.mw.setNow(T0 + 5000)
    await box.edit({ whisper: 'sk-test-0000', sidecar: {} })
    held.mw.setNow(T0 + 9000)
    await box.send({ whisper: 'sk-test-0000', sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000, written_at: T0 + 9000 })
  })

  it("README.md:1282 (a record that will not decipher is written over with sidecar {} and its first-stored time now): a damaged box reborn is registered now, its sidecar the {} given", async () => {
    held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 2 }, 'd'))
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }, 'd'))
    held.mw.setNow(T0 + 5000)
    await box.send({ whisper: 'sk-test-0000', sidecar: {} })
    expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000, sidecar: {} })
  })

  it("VOCABULARY.md:153 (registered_at is when a box was first stored): a store that answers a rebirth with the buried record's registered_at, as a database default might keep it, is adopted, and the rebirth's own time is lost quietly", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    held.mw.setNow(T0 + 5000)
    held.mw.willPut(({ record }) => held.mw.answerOf(box.scope, { ...record, registered_at: T0 }))
    await box.send({ whisper: 'sk-test-0000', sidecar: {} })
    expect(box.registered_at).to.eq(T0)
    expect(held.mw.badnews).to.deep.equal([])
  })
})

describe("the tombstone's registered_at", () => {
  it("VOCABULARY.md:153 (registered_at is when a box was first stored): the tombstone a del stages keeps the buried record's registered_at, though nothing is stored", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setNow(T0 + 5000)
    held.mw.willDel(() => new Promise(() => undefined))
    void box.del()
    await vi.advanceTimersByTimeAsync(0)
    expect(box._cheat_staged).to.deep.include({ am: 'x', registered_at: T0 })
    expect(box.registered_at).to.eq(T0)
  })

  it("VOCABULARY.md:153 (registered_at is when a box was first stored): the ouchstone made of a newer damaged record keeps the held record's registered_at, never the damaged record's", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(tombstoneBoxRecord({ revision_seq: 2, registered_at: T0 + 3 }, 'd'))
    expect(box._cheat_central).to.deep.include({ am: 'd', revision_seq: 2, registered_at: T0 })
  })
})
// --

/** Behaviours an old guarantee forbids that the Coach has not ruled on, each pinned as the model does it today.
 * One file for the sprint: each thread appends describes of its own at the end, and edits none another
 * wrote. Each `it` names the guarantee's source and line in its title.
 */

import { describe, expect, it } from 'vitest'
import { Box } from '../../src/models/box'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

describe("the staged edit reconcileStaged drops or carries", () => {
  const CentralRev = { revision_seq: 2, revision_tok: 'rev-c2' }
  const OtherRev   = { revision_seq: 3, revision_tok: 'rev-other', written_at: T0 + 3000 }
  const Staged = () => fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-s3', written_at: T0 + 300, sidecar: { note: 'staged' } })
  const boxOf = () => new Box(held.mw.world, boxListingOf(held.mw), fullBoxRecord(CentralRev), Staged(), { maxMillisSinceRefresh: 10 * 60_000 })

  it("README.md:1109, 'never merges two writes -- a write that lost must be seen': a fetch meeting another device's newer box drops the edit staged here, resolves, and tells no bad news", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord(CentralRev))
    await box.edit({ sidecar: { note: 'mine' } })
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
    expect(box.cacheable.staged).to.be.null
    expect(box.cacheable.central).to.deep.equal(sparseBoxRecord(OtherRev))
    expect(box.sidecar).to.be.null
  })

  it("whiteboard/20261028-storable_base/receive-principles.md:9, 'Don't throw away customer data': a deletion from another device drops the staged edit, and the box reads as gone", () => {
    const box = boxOf()
    const { badnews } = box.receive(tombstoneBoxRecord(OtherRev))
    expect(badnews).to.deep.equal([])
    expect(box.cacheable.staged).to.be.null
    expect(box.isPresent).to.be.false
  })

  it("VOCABULARY.md:91, 'revision_tok ... is part of the box's stamp': the ouch carry gives the staged edit a new revision_tok and seq, its sealed parts as they were, not sealed again", () => {
    const box = boxOf()
    box.receive(tombstoneBoxRecord(OtherRev, 'd'))
    const { staged } = box.cacheable
    expect(staged?.revision_seq).to.eq(4)
    expect(staged?.revision_tok).to.not.be.oneOf(['rev-s3', 'rev-other'])
    expect(box.box_key_wrapped).to.deep.equal(Staged().box_key_wrapped)
    expect(box.whisper_ciphered).to.deep.equal(Staged().whisper_ciphered)
  })
})

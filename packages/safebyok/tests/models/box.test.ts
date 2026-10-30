import { describe, expect, it } from 'vitest'
import { LOCKED } from '../../src/models/box'
import type { BoxSparse, Fetched, BoxRecord } from '../../src/models/models-shapes'
import * as TH from '../test-helpers'
import { boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Receive]: success noted on a whole record, the own props following

describe("box.receive(rcvd): a whole record makes the box timely", () => {
  const ReceivedCases = [
    // whole:
    [() => fullBoxRecord(),                true,  'a full record'],
    [() => tombstoneBoxRecord(),           true,  "a deletion's tombstone"],
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

describe("box.receive(rcvd): the own props follow a newer record", () => {
  it("moves registered_at to a newer record's, registered at another time", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', registered_at: T0 + 7 }))
    expect(box.registered_at).to.eq(T0 + 7)
  })

  it("moves vault_tok to a newer record's, under another vault_tok", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', vault_tok: 'vault-tok-other' }))
    expect(box.vault_tok).to.eq('vault-tok-other')
  })
})
// --

// == [The absent contract]: a box gone or damaged has no whisper to open

describe("box.unsealWhisper(): refused from its guard", () => {
  const RefusedCases = [
    // absent, refused ahead of the seal:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      "unlocked", "absent_box",       'a deleted box'],
    [() => tombstoneBoxRecord({ revision_seq: 2 }, 'd'), "unlocked", "absent_box",       'a damaged box'],
    // locked, refused first:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      "locked",   "vault_locked",     'a deleted box while the vault is locked'],
    [() => fullBoxRecord(),                              "locked",   "vault_locked",     'a full box while the vault is locked'],
    // present and full, past the guard to the seal not yet written:
    [() => fullBoxRecord(),                              "unlocked", "unexpected_error", 'a full box, which reaches the unseal, not written yet'],
  ] as const
  for (const [recordOf, lockState, refusalkind, blurb] of RefusedCases) {
    it(`refuses '${refusalkind}' for ${blurb}`, async () => {
      const box = await boxListingOf(held.mw).build(recordOf())
      held.mw.setLockState(lockState)
      await TH.expectRefusal(box.unsealWhisper(), refusalkind)
    })
  }
})
// --

// == [Rebirth]: an edit over a box gone or damaged

describe("box.edit(patch): rebirth over a tombstone", () => {
  const TombstoneCases = [
    ["x", "rev-x2", 'a deleted box'],
    ["d", "rev-d2", 'a damaged box'],
  ] as const
  for (const [am, tok, blurb] of TombstoneCases) {
    it(`stages ${blurb} alive at the next revision, registered now; a second edit keeps both; send puts it over the tombstone's revision`, async () => {
      const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am))
      held.mw.setNow(T0 + 5000)
      await expect(box.edit({ whisper: 'sk-test-0000' })).resolves.to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box.cacheable.staged).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, written_at: T0 + 5000, sidecar: {} })
      const reborn = box.revision_tok
      held.mw.setNow(T0 + 6000)
      await box.edit({ sidecar: { note: 'reborn' } })
      expect(box.cacheable.staged).to.deep.include({ revision_tok: reborn, registered_at: T0 + 5000, written_at: T0 + 6000, sidecar: { note: 'reborn' } })
      await box.send({})
      const [put] = held.mw.callsOf('put')
      expect(put?.expected).to.deep.equal({ revision_tok: tok, revision_seq: 2 })
      expect(put?.record).to.deep.include({ revision_tok: reborn, revision_seq: 3, registered_at: T0 + 5000 })
      expect(box.cacheable.central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
    })

    it(`refuses a sidecar edit with no whisper over ${blurb} as 'bad_option', from makeStaged`, async () => {
      const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am))
      await TH.expectRefusal(box.edit({ sidecar: { note: 'no whisper' } }), 'bad_option')
      expect(box.hasStaged).to.be.false
    })
  }
})
// --

// == [Sending a sparse box]: no whisper to carry forward

describe("box.send(patch): a sparse box with no whisper", () => {
  it("refuses 'bad_option' from makeStaged when storage too holds it sparse, putting nothing", async () => {
    const sparse = sparseBoxRecord()
    held.mw.seedStore(sparse)
    const box = await boxListingOf(held.mw).build(sparse)
    held.mw.clearCalls()
    await TH.expectRefusal(box.send({ sidecar: { note: 'sent' } }), 'bad_option')
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })
})
// --

// == [The whisper while locked]

describe("box.whisper while the vault is locked", () => {
  it("reads LOCKED over a whisper exposed", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = 'sk-test-0000'
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it.todo("forgets the whisper exposed when the vault locks, as expose's doc says (Coach: today it reads again once unlocked, pinned in tests/loosened; who forgets it, the box at its next read or the vault's lock?)")
})
// --

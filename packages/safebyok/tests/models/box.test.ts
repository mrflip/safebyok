import { describe, expect, it, vi } from 'vitest'
import { type Box, type BoxSnapshot, LOCKED } from '../../src/models/box'
import type { BoxRecord, BoxSparse, Fetched } from '../../src/models/models-shapes'
import { StubBoxKeyWrapped, StubWhisperCiphered } from '../../src/models/stub-seal'
import * as TH from '../test-helpers'
import { boxListingOf, cacheableOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Receive]: success noted on a whole record, registered_at over a tombstone, another vault_tok throws

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
    [() => fullBoxRecord(),   'a full record'],
    [() => sparseBoxRecord(), 'a sparse record'],
  ] as const

  for (const [rcvdOf, blurb] of ConfirmingCases) {
    it(`notes success on ${blurb} that only confirms the full central held`, async () => {
      const box = await boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 }).build(fullBoxRecord())
      held.mw.setNow(T0 + 800)
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf())
      expect(box.isTimely).to.be.true
      expect(box.revision_seq).to.eq(1)
    })
  }
})

describe("box.receive(rcvd): registered_at, set over a tombstone; another vault_tok throws", () => {
  it("keeps registered_at over a newer living record registered at another time", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', registered_at: T0 + 7 }))
    expect(box.registered_at).to.eq(T0)
    expect(box.revision_seq).to.eq(2)
  })

  it("takes registered_at from a record received over a tombstone held", async () => {
    const box = await boxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    box.receive(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, vault_tok: 'vault-tok-u1', revision_seq: 3 })
  })

  const HeldCases = [
    ['a box held alive',          () => fullBoxRecord()],
    ['a box held deleted',        () => tombstoneBoxRecord({ revision_seq: 1 }, 'x')],
    ['a box held damaged',        () => tombstoneBoxRecord({ revision_seq: 1 }, 'd')],
  ] as const
  const OtherVaultCases = [
    [2, 'a newer record'],
    [1, 'a record at the revision held'],
    [0, 'an older record, which the revisions of another life of the vault do not order'],
  ] as const
  for (const [heldBlurb, heldOf] of HeldCases) {
    for (const [seq, blurb] of OtherVaultCases) {
      it(`throws 'unexpected_error' for ${blurb} under another vault_tok over ${heldBlurb}, keeping its own copy`, async () => {
        const box = await boxListingOf(held.mw).build(heldOf())
        const { central } = cacheableOf(box)
        TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: seq, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })), 'unexpected_error')
        expect(cacheableOf(box).central).to.eq(central)
        expect(box.vault_tok).to.eq('vault-tok-u1')
      })
    }
  }

  it("throws 'unexpected_error' over a draft's central never stored, and for a tombstone or a damaged record under another vault_tok", async () => {
    const box = await boxListingOf(held.mw).build({ ...held.mw.boxscope('drafted') })
    const other = { boxlabel: 'drafted', vault_tok: 'vault-tok-other' }
    TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ ...other, revision_seq: 1 })), 'unexpected_error')
    TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ ...other, revision_seq: 1 }, 'x')), 'unexpected_error')
    TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ ...other, revision_seq: 1 }, 'd')), 'unexpected_error')
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 0 })
  })

  it("throws 'unexpected_error' from a fetch that meets a record under another vault_tok", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })))
    await TH.expectRefusal(box.fetch(), 'unexpected_error')
    expect(box.revision_seq).to.eq(1)
  })

  it("tells 'unexpected_error' to onBadNews for a notice under another vault_tok, keeping its own copy", async () => {
    const listing = boxListingOf(held.mw)
    await listing.hello()
    const box = await listing.build(fullBoxRecord())
    await held.mw.notify(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' }))
    expect(held.mw.badnews.map(({ refusalkind }) => refusalkind)).to.deep.equal(['unexpected_error'])
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 1 })
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
      expect(cacheableOf(box).staged).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, written_at: T0 + 5000, sidecar: {} })
      const reborn = box.revision_tok
      held.mw.setNow(T0 + 6000)
      await box.edit({ sidecar: { note: 'reborn' } })
      expect(cacheableOf(box).staged).to.deep.include({ revision_tok: reborn, registered_at: T0 + 5000, written_at: T0 + 6000, sidecar: { note: 'reborn' } })
      await box.send({})
      const [put] = held.mw.callsOf('put')
      expect(put?.expected).to.deep.equal({ revision_tok: tok, revision_seq: 2 })
      expect(put?.record).to.deep.include({ revision_tok: reborn, revision_seq: 3, registered_at: T0 + 5000 })
      expect(cacheableOf(box).central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
    })

    it(`refuses a sidecar edit with no whisper over ${blurb} as 'bad_option', from makeStaged`, async () => {
      const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am))
      await TH.expectRefusal(box.edit({ sidecar: { note: 'no whisper' } }), 'bad_option')
      expect(box.hasStaged).to.be.false
    })
  }

  it("keeps the own registered_at over an edit made while a del is in flight, central being alive, though the record it stages is registered now", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build(fullBoxRecord())
    held.mw.willDel(() => new Promise(() => undefined))
    void box.del()
    await vi.advanceTimersByTimeAsync(0)
    held.mw.setNow(T0 + 5000)
    await box.edit({ whisper: 'sk-test-0000' })
    expect(box.registered_at).to.eq(T0)
    expect(cacheableOf(box).staged).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
  })
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

  it("keeps the whisper exposed while the vault locks, and reads it again once unlocked", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = 'sk-test-0000'
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
    expect(box.getSnapshot().exposed).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.eq('sk-test-0000')
  })
})
// --

/** A box holding `record` (the full box record `anthropic_api_key` at revision 1, by default) as received, through a listing over the test world. */
const boxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<Box> => boxListingOf(held.mw).build(record)

/** The snapshot of a box holding `record`, as `getSnapshot` answers it. */
const snapshotOf = async (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<BoxSnapshot> => {
  const box = await boxOf(record)
  return box.getSnapshot()
}

const SnapshotKeys = ['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'sidecar', 'full', 'present', 'exposed']

describe("Box snapshot", () => {
  it("carries the scope, the revision props, registered_at, written_at, the sidecar, and the states full, present and exposed, and no more", async () => {
    const box = await boxOf()
    expect(box.getSnapshot()).to.deep.equal({
      ...held.mw.boxscope('anthropic_api_key'),
      revision_tok:  'rev-a1',
      revision_seq:  1,
      registered_at: T0,
      written_at:    T0,
      sidecar:       { note: 'a test box' },
      full:          true,
      present:       true,
      exposed:       false,
    })
    expect(Object.keys(box.getSnapshot())).to.have.members(SnapshotKeys)
  })

  it("is plain data: no vault_tok, no sealed parts, no scope prop, no methods", async () => {
    const snapshot = await snapshotOf()
    for (const ckey of ['vault_tok', 'scope', 'fmt', 'box_key_wrapped', 'whisper_ciphered', 'whisper_codec', 'whisper_schema_version', 'am']) {
      expect(snapshot, ckey).to.not.have.property(ckey)
    }
    expect(Object.getPrototypeOf(snapshot)).to.eq(Object.prototype)
    expect(Object.values(snapshot).filter((val) => typeof val === 'function')).to.deep.equal([])
  })

  it("is flat in the scope, so that it ducks as one", async () => {
    const snapshot = await snapshotOf()
    expect(snapshot).to.deep.include(held.mw.boxscope('anthropic_api_key'))
  })

  describe("for a box in each state", () => {
    it("full: the sidecar of the record in hand, full and present", async () => {
      const snapshot = await snapshotOf()
      expect(snapshot).to.include({ full: true, present: true, exposed: false })
      expect(snapshot.sidecar).to.deep.equal({ note: 'a test box' })
    })

    it("sparse: present and not full, the sidecar null", async () => {
      const snapshot = await snapshotOf(held.mw.sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(snapshot).to.include({ full: false, present: true, exposed: false, sidecar: null, revision_seq: 2, written_at: T0 + 20 })
    })

    it("gone: not present and not full, the sidecar null", async () => {
      const snapshot = await snapshotOf(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      expect(snapshot).to.include({ full: false, present: false, exposed: false, sidecar: null, revision_seq: 2, revision_tok: 'rev-x2' })
    })

    it("damaged: as gone is", async () => {
      const snapshot = await snapshotOf(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-d2' }, 'd'))
      expect(snapshot).to.include({ full: false, present: false, exposed: false, sidecar: null, revision_seq: 2, revision_tok: 'rev-d2' })
    })

    it("born from a dna: present, full, the sidecar empty, at revision 0 registered and written now", async () => {
      held.mw.setNow(T0 + 7000)
      const box = await boxListingOf(held.mw).build(held.mw.boxscope('openai_api_key'))
      expect(box.getSnapshot()).to.deep.equal({
        ...held.mw.boxscope('openai_api_key'),
        revision_tok:  box.revision_tok,
        revision_seq:  0,
        registered_at: T0 + 7000,
        written_at:    T0 + 7000,
        sidecar:       {},
        full:          true,
        present:       true,
        exposed:       false,
      })
    })

    it("edited: the record in hand is the staged, so the sidecar and the revision are the edit's", async () => {
      const box = await boxOf()
      held.mw.setNow(T0 + 500)
      await box.edit({ sidecar: { note: 'edited' } })
      expect(box.getSnapshot()).to.deep.include({ sidecar: { note: 'edited' }, revision_seq: 2, written_at: T0 + 500, full: true, present: true })
    })

    it("exposed: follows the whisper the box keeps open", async () => {
      const box = await boxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.whisper = 'sk-ant-fake-for-test'
      expect(box.getSnapshot().exposed).to.be.true
      expect(listener.mock.calls).to.have.lengthOf(1)
      expect(JSON.stringify(box.getSnapshot())).to.not.contain('sk-ant-fake-for-test')
      box.whisper = null
      expect(box.getSnapshot().exposed).to.be.false
    })
  })
})

describe("Box sidecar while the vault is locked", () => {
  it("LOCKED is the registered symbol of that name, which the whisper answers itself", async () => {
    expect(LOCKED).to.eq(Symbol.for('LOCKED'))
    const box = await boxOf()
    expect(box.whisper).to.be.null
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("answers itself while unlocked, and the locked bag while locked", async () => {
    const box = await boxOf()
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    held.mw.setLockState('locked')
    expect(box.sidecar).to.have.property(LOCKED, true)
    expect(Object.keys(box.sidecar!)).to.deep.equal([])
    held.mw.setLockState('unlocked')
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
  })

  it("is one frozen bag, whatever the box holds", async () => {
    const full = await boxOf()
    const sparse = await boxOf(held.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    const gone = await boxOf(held.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    held.mw.setLockState('locked')
    expect(Object.isFrozen(full.sidecar)).to.be.true
    for (const box of [sparse, gone]) {
      expect(box.sidecar).to.eq(full.sidecar)
      expect(box.sidecar).to.have.property(LOCKED, true)
    }
  })

  it("is the snapshot's sidecar too, from the settle after the lock", async () => {
    const box = await boxOf()
    const unlocked = box.getSnapshot()
    held.mw.setLockState('locked')
    box.settle()
    const locked = box.getSnapshot()
    expect(locked).to.not.eq(unlocked)
    expect(locked.sidecar).to.have.property(LOCKED, true)
    expect(locked).to.deep.include({ full: true, present: true, revision_seq: 1 })
    held.mw.setLockState('unlocked')
    box.settle()
    expect(box.getSnapshot().sidecar).to.deep.equal({ note: 'a test box' })
  })

  it("is the bag in a snapshot even for a box whose sidecar is empty or absent, which differ from it only by the symbol", async () => {
    const empty = await boxOf(fullBoxRecord({ sidecar: {} }))
    const sparse = await boxOf(held.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    const [emptySnap, sparseSnap] = [empty.getSnapshot(), sparse.getSnapshot()]
    const listeners = [vi.fn(), vi.fn()]
    empty.subscribe(listeners[0]!)
    sparse.subscribe(listeners[1]!)
    held.mw.setLockState('locked')
    empty.settle()
    sparse.settle()
    expect(empty.getSnapshot()).to.not.eq(emptySnap)
    expect(empty.getSnapshot().sidecar).to.have.property(LOCKED, true)
    expect(sparse.getSnapshot()).to.not.eq(sparseSnap)
    expect(sparse.getSnapshot().sidecar).to.have.property(LOCKED, true)
    expect(listeners[0]!.mock.calls).to.have.lengthOf(1)
    expect(listeners[1]!.mock.calls).to.have.lengthOf(1)
  })

  it("lets nothing of the sidecar out through the snapshot's JSON, the box's JSON, or the sparse form", async () => {
    const box = await boxOf(fullBoxRecord({ sidecar: { note: 'a marked sidecar value' } }))
    held.mw.setLockState('locked')
    box.settle()
    for (const shown of [JSON.stringify(box.getSnapshot()), JSON.stringify(box), JSON.stringify(box.sparse)]) {
      expect(shown).to.not.contain('a marked sidecar value')
    }
    expect(JSON.stringify(box.getSnapshot())).to.contain('"sidecar":{}')
  })

  it("is never on the sparse form, toJSON or a tombstone, locked or not: those have no sidecar at all", async () => {
    const box = await boxOf()
    const gone = await boxOf(held.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    for (const lockState of ['unlocked', 'locked'] as const) {
      held.mw.setLockState(lockState)
      for (const form of [box.sparse, box.toJSON(), gone.sparse, gone.toJSON(), cacheableOf(gone).central]) {
        expect(form).to.not.have.property('sidecar')
        expect(Object.getOwnPropertySymbols(form)).to.deep.equal([])
      }
      const { central, staged, ...sparse } = cacheableOf(box)
      expect(sparse).to.not.have.property('sidecar')
      expect(Object.getOwnPropertySymbols(central)).to.deep.equal([])
      expect(staged).to.be.null
    }
  })

  it("leaves the record in hand as it is: the cacheable central keeps the sidecar it was stored with", async () => {
    const box = await boxOf()
    held.mw.setLockState('locked')
    expect(cacheableOf(box).central).to.deep.equal(fullBoxRecord())
  })

  it.todo("a lock coming down settles every box, so that a snapshot made before it stops carrying the sidecar")
})

describe("Box own props", () => {
  it("are exactly the nine the base tattoos: the four of the scope, registered_at, vault_tok and the three revision props", async () => {
    const box = await boxOf()
    expect(Object.keys(box)).to.have.members(['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'registered_at', 'vault_tok', 'revision_tok', 'revision_seq', 'written_at'])
    expect(Object.keys(box)).to.have.lengthOf(9)
  })

  it("stay nine through a receive, an edit and a del", async () => {
    const box = await boxOf()
    const keys = Object.keys(box)
    box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
    expect(Object.keys(box)).to.have.members(keys)
    await box.edit({ sidecar: { note: 'edited' } })
    expect(Object.keys(box)).to.have.members(keys)
    await box.del()
    expect(Object.keys(box)).to.have.members(keys)
  })

  it("leave out the world, the listing, the whisper exposed, the record's sealed parts and fmt, which are adorned, private or on the prototype", async () => {
    const box = await boxOf()
    for (const ckey of ['world', 'listing', 'whisper', 'sidecar', 'fmt', 'box_key_wrapped', 'whisper_codec', 'whisper_schema_version', 'whisper_ciphered', 'scope', 'am']) {
      expect(Object.keys(box), ckey).to.not.include(ckey)
    }
    expect(box.fmt).to.eq(fullBoxRecord().fmt)
    expect(box.box_key_wrapped).to.deep.equal(fullBoxRecord().box_key_wrapped)
  })

  it("duck as the record's sparse form where the host JSON-stringifies them", async () => {
    const box = await boxOf()
    expect(JSON.stringify(box)).to.eq(JSON.stringify(held.mw.sparseBoxRecord()))
  })
})

// == [Forgetting the whisper]: whisper = null or LOCKED while locked

describe("box.whisper = null while the vault is locked", () => {
  for (const [forget, blurb] of [[null, 'null'], [LOCKED, 'LOCKED']] as const) {
    it(`passes setting ${blurb}, forgetting the whisper exposed, which stays forgotten once unlocked`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      box.whisper = 'sk-test-0000'
      held.mw.setLockState('locked')
      box.whisper = forget
      expect(box.getSnapshot().exposed).to.be.false
      held.mw.setLockState('unlocked')
      expect(box.whisper).to.be.null
    })
  }

  it("refuses 'vault_locked' setting a new whisper, keeping the one exposed", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = 'sk-test-0000'
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = 'sk-test-1111' }, 'vault_locked')
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.eq('sk-test-0000')
  })
})
// --

// == [The stub seal in edit]: seal, edit, makeStaged

describe("box.edit(props) with a whisper: the stub seals it", () => {
  it("seals a whisper over a full box at the next revision, keeping its sidecar, its sealed parts the stub's", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.seal('sk-test-0000')
    expect(box.revision_seq).to.eq(2)
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.box_key_wrapped).to.deep.equal(StubBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(StubWhisperCiphered)
  })

  it("seals the sidecar given in place of the one the box carries", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.edit({ whisper: 'sk-test-0000', sidecar: { account: 'home' } })
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("seals a deleted box back to life with an empty sidecar, where none is given", async () => {
    const box = await boxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    await box.edit({ whisper: 'sk-test-0000' })
    expect(box.isPresent).to.be.true
    expect(box.isFull).to.be.true
    expect(box.sidecar).to.deep.equal({})
    expect(box.revision_seq).to.eq(3)
  })

  it("refuses 'bad_option' a live box still sparse once hydrated, given no sidecar, staging nothing", async () => {
    held.mw.seedStore(sparseBoxRecord())
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    await TH.expectRefusal(box.edit({ whisper: 'sk-test-0000' }), 'bad_option')
    expect(box.hasStaged).to.be.false
  })

  it("seals the sidecar given over a live box still sparse once hydrated", async () => {
    held.mw.seedStore(sparseBoxRecord())
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    await box.edit({ whisper: 'sk-test-0000', sidecar: { account: 'home' } })
    expect(box.isFull).to.be.true
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("seals the whisper exposed, where the edit gives none", async () => {
    const box = await boxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    box.whisper = 'sk-test-0000'
    await box.edit({})
    expect(box.isFull).to.be.true
    expect(box.whisper_ciphered).to.deep.equal(StubWhisperCiphered)
  })

  it("stages nothing that carries the whisper, in the record in hand, the cache's copy or the snapshot", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    await box.edit({ whisper: { key: 'sk-test-SECRET' } })
    for (const form of [box.toJSON(), cacheableOf(box), box.snapshot]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

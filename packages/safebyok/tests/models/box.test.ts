import { describe, expect, it, vi } from 'vitest'
import type { BoxProps, BoxSnapshot } from '../../src/models/box'
import type { BoxLease, BoxWorld } from '../../src/models/box-listing'
import { type BoxRecord, type BoxSparse, type Fetched, LOCKED } from '../../src/models/models-shapes'
import { Storable } from '../../src/models/storable'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'
import { FakeBoxKeyWrapped, FakeWhisperCiphered, type TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

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
      const box = await boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 }).build(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
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

describe("box.receive(rcvd): registered_at, set at a birthday; another vault_tok throws", () => {
  it("keeps registered_at over a newer living record registered at another time", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', registered_at: T0 + 7 }))
    expect(box.registered_at).to.eq(T0)
    expect(box.revision_seq).to.eq(2)
  })

  it("takes registered_at and box_tok from a record of another life received over a tombstone held", async () => {
    const box = await boxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    box.receive(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-b3', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', vault_tok: 'vault-tok-u1', revision_seq: 3 })
  })

  it("takes registered_at and box_tok from a newer record of another life received over a box held alive, a birthday elsewhere after a deletion this device never received", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-b4', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', revision_seq: 4 })
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
        const central = box._cheat_central
        TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: seq, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })), 'unexpected_error')
        expect(box._cheat_central).to.eq(central)
        expect(box.vault_tok).to.eq('vault-tok-u1')
      })
    }
  }

  it("throws 'unexpected_error' for a record under another vault_tok whose life tok path, joined, is the box's own", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const central = box._cheat_central
    TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-u1-box', box_tok: 'tok-a' })), 'unexpected_error')
    expect(box._cheat_central).to.eq(central)
  })

  it("throws 'unexpected_error' for a damaged record under another vault_tok at or before the revision held, the vault_tok weighed before damage", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const central = box._cheat_central
    TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ revision_seq: 1, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' }, 'd')), 'unexpected_error')
    TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ revision_seq: 0, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' }, 'd')), 'unexpected_error')
    expect(box._cheat_central).to.eq(central)
  })

  it("throws 'unexpected_error' over a draft's central never stored, and for a tombstone or a damaged record under another vault_tok", async () => {
    const box = await boxListingOf(held.mw).build(boxDnaOf(held.mw.boxscope('drafted')))
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
    // present and full, past the guard to a lease that never sealed it:
    [() => fullBoxRecord(),                              "unlocked", "damaged_box",      'a full box whose whisper will not open'],
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

// == [What the lease opens]: a whisper that opens to no whisper

describe("box.unsealWhisper(): what the lease opens that is no whisper", () => {
  const OpenedCases = [
    ['bytes that are no JSON',          'sk-test-SECRET {'],
    ['JSON that is no { val } holder',  '{"value":"sk-test-SECRET"}'],
  ] as const
  for (const [blurb, text] of OpenedCases) {
    it(`refuses 'damaged_box' for ${blurb}, quoting none of it, the opened bytes zeroed`, async () => {
      const opened = new TextEncoder().encode(text)
      const lease: BoxLease = { sealWith: () => Promise.reject(new Error('nothing is sealed here')), unsealWith: () => Promise.resolve(opened) }
      const { world } = held.mw
      const leasedWorld: BoxWorld = { clock: world.clock, scope: world.scope, vault_tok: world.vault_tok, lockState: () => world.lockState(), takeWorld: (taken) => { world.takeWorld(taken) }, ensureTimely: (opts) => world.ensureTimely(opts), demandLease: () => lease }
      const box = await boxListingOf(held.mw, { world: leasedWorld }).build(fullBoxRecord())
      const err = await TH.expectRefusal(box.unsealWhisper(), 'damaged_box')
      expect(err.message).to.eq(Phrases.UndecodedWhisper)
      expect(JSON.stringify({ meta: err.meta, cause: String(err.cause) })).to.not.include('SECRET')
      expect(opened.every((byte) => byte === 0)).to.be.true
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
    it(`stages ${blurb} alive at the next revision, registered now under a new box_tok; a second edit keeps all three; send puts it over the tombstone's revision`, async () => {
      const tombstone = tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am)
      held.mw.seedStore(tombstone)
      const box = await fakeSealBoxListingOf(held.mw).build(tombstone)
      held.mw.setNow(T0 + 5000)
      await expect(box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: {} })).resolves.to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box._cheat_staged).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, written_at: T0 + 5000, sidecar: {} })
      const reborn = box.revision_tok
      const { box_tok } = box
      expect(box_tok).to.not.eq('box-tok-a')
      expect(box.registered_at).to.eq(T0 + 5000)
      held.mw.setNow(T0 + 6000)
      await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'reborn' } })
      expect(box._cheat_staged).to.deep.include({ revision_tok: reborn, box_tok, registered_at: T0 + 5000, written_at: T0 + 6000, sidecar: { note: 'reborn' } })
      await box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'reborn' } })
      const [put] = held.mw.callsOf('put')
      expect(put?.priorRevisionTok).to.equal(tok)
      expect(put?.record).to.deep.include({ revision_tok: reborn, revision_seq: 3, registered_at: T0 + 5000 })
      expect(box._cheat_central).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
    })

    it(`refuses a sidecar edit with no whisper over ${blurb} as 'bad_option', before anything is staged`, async () => {
      const box = await fakeSealBoxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am))
      await TH.expectRefusal(box.edit({ sidecar: { note: 'no whisper' } } as unknown as BoxProps), 'bad_option')
      expect(box.hasStaged).to.be.false
    })
  }

  it("makes a birthday of an edit made while a del is in flight, central being alive: the record it stages, and the own props, take a new box_tok, registered now", async () => {
    const box = await fakeSealBoxListingOf(held.mw).build(fullBoxRecord())
    held.mw.willDel(() => new Promise(() => undefined))
    void box.del()
    await vi.advanceTimersByTimeAsync(0)
    held.mw.setNow(T0 + 5000)
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box._cheat_staged).to.deep.include({ am: 'a', registered_at: T0 + 5000 })
    expect(box._cheat_staged?.box_tok).to.be.a('string').and.not.eq('box-tok-a')
    expect(box).to.include({ registered_at: T0 + 5000, box_tok: box._cheat_staged?.box_tok })
  })
})
// --

// == [The whisper while locked]

describe("box.whisper while the vault is locked", () => {
  it("reads LOCKED over a whisper exposed", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("keeps the whisper exposed while the vault locks, and reads it again once unlocked", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
    expect(box.getSnapshot().exposed).to.be.true
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

/** A box holding `record` (the full box record `anthropic_api_key` at revision 1, by default) as received, through a listing over the test world. */
const boxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<TestableBox> => boxListingOf(held.mw).build(record)

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
      const box = await boxListingOf(held.mw).build(boxDnaOf(held.mw.boxscope('openai_api_key')))
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
      await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'edited' } })
      expect(box.getSnapshot()).to.deep.include({ sidecar: { note: 'edited' }, revision_seq: 2, written_at: T0 + 500, full: true, present: true })
    })

    it("exposed: follows the whisper the box keeps open", async () => {
      const box = await boxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.whisper = { val: 'sk-ant-fake-for-test' }
      expect(box.getSnapshot().exposed).to.be.true
      expect(listener.mock.calls).to.have.lengthOf(1)
      expect(JSON.stringify(box.getSnapshot())).to.not.contain('sk-ant-fake-for-test')
      box.whisper = null
      expect(box.getSnapshot().exposed).to.be.false
    })
  })
})

describe("Box sidecar, locked or not", () => {
  it("LOCKED is the bag the whisper answers while locked", async () => {
    const box = await boxOf()
    expect(box.whisper).to.be.null
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("answers itself, whether the vault is unlocked or locked", async () => {
    const box = await boxOf()
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    held.mw.setLockState('locked')
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
    held.mw.setLockState('unlocked')
    expect(box.sidecar).to.deep.equal({ note: 'a test box' })
  })

  it("is null where the record in hand is not full, locked or not", async () => {
    const sparse = await boxOf(held.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    const gone = await boxOf(held.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    for (const lockState of ['unlocked', 'locked'] as const) {
      held.mw.setLockState(lockState)
      expect(sparse.sidecar).to.be.null
      expect(gone.sidecar).to.be.null
    }
  })

  it("is the snapshot's sidecar too, and a lock leaves the snapshot and its listeners alone", async () => {
    const box = await boxOf()
    const unlocked = box.getSnapshot()
    const listener = vi.fn()
    box.subscribe(listener)
    held.mw.setLockState('locked')
    box.settle()
    expect(box.getSnapshot()).to.eq(unlocked)
    expect(box.getSnapshot().sidecar).to.deep.equal({ note: 'a test box' })
    expect(box.getSnapshot()).to.deep.include({ full: true, present: true, revision_seq: 1 })
    held.mw.setLockState('unlocked')
    box.settle()
    expect(box.getSnapshot()).to.eq(unlocked)
    expect(listener.mock.calls).to.have.lengthOf(0)
  })

  it("tells an empty sidecar from an absent one in the snapshot, locked or not", async () => {
    const empty = await boxOf(fullBoxRecord({ sidecar: {} }))
    const sparse = await boxOf(held.mw.sparseBoxRecord({ boxlabel: 'b_sparse' }))
    for (const lockState of ['unlocked', 'locked'] as const) {
      held.mw.setLockState(lockState)
      expect(empty.getSnapshot().sidecar).to.deep.equal({})
      expect(sparse.getSnapshot().sidecar).to.be.null
    }
  })

  it("follows a receive of a record with another sidecar into the snapshot while locked, telling its listeners", async () => {
    const box = await boxOf()
    held.mw.setLockState('locked')
    const before = box.getSnapshot()
    const listener = vi.fn()
    box.subscribe(listener)
    box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', sidecar: { note: 'newer' } }))
    expect(listener.mock.calls).to.have.lengthOf(1)
    expect(box.getSnapshot()).to.not.eq(before)
    expect(box.getSnapshot().sidecar).to.deep.equal({ note: 'newer' })
    expect(box.sidecar).to.deep.equal({ note: 'newer' })
  })

  it("is never on the sparse form or a tombstone, locked or not: those have no sidecar at all", async () => {
    const box = await boxOf()
    const gone = await boxOf(held.mw.tombstoneBoxRecord({ boxlabel: 'b_gone', revision_seq: 2 }))
    for (const lockState of ['unlocked', 'locked'] as const) {
      held.mw.setLockState(lockState)
      for (const form of [box.sparse, box.toJSON(), gone.sparse, gone.toJSON(), gone._cheat_central]) {
        expect(form).to.not.have.property('sidecar')
      }
      expect(box.sparse).to.not.have.property('sidecar')
      expect(box._cheat_central).to.deep.equal(fullBoxRecord())
      expect(box._cheat_staged).to.be.null
    }
  })
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
    const received = held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })
    held.mw.seedStore(received)
    box.receive(received)
    expect(Object.keys(box)).to.have.members(keys)
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'edited' } })
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
      box.whisper = { val: 'sk-test-0000' }
      held.mw.setLockState('locked')
      box.whisper = forget
      expect(box.getSnapshot().exposed).to.be.false
      held.mw.setLockState('unlocked')
      expect(box.whisper).to.be.null
    })
  }

  it("refuses 'vault_locked' setting a new whisper, keeping the one exposed", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = { val: 'sk-test-1111' } }, 'vault_locked')
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

// == [The seal in edit]: seal, edit, makeStaged

describe("box.edit(props) with a whisper: the vault's lease seals it", () => {
  it("seals a whisper with its sidecar over a full box at the next revision, its sealed parts the fake lease's", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.seal({ val: 'sk-test-0000' }, { account: 'work' })
    expect(box.revision_seq).to.eq(2)
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.box_key_wrapped).to.deep.equal(FakeBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(FakeWhisperCiphered)
  })

  it("seals the sidecar given in place of the one the box carries", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { account: 'home' } })
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("seals a deleted box back to life with the sidecar given", async () => {
    const box = await boxListingOf(held.mw).build(tombstoneBoxRecord({ revision_seq: 2 }))
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box.isPresent).to.be.true
    expect(box.isFull).to.be.true
    expect(box.sidecar).to.deep.equal({})
    expect(box.revision_seq).to.eq(3)
  })

  it("seals the sidecar given over a live box still sparse once hydrated", async () => {
    held.mw.seedStore(sparseBoxRecord())
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { account: 'home' } })
    expect(box.isFull).to.be.true
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("stages nothing that carries the whisper, in the record in hand, the cache's copy or the snapshot", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    await box.edit({ whisper: { val: { key: 'sk-test-SECRET' } }, sidecar: {} })
    for (const form of [box.toJSON(), { central: box._cheat_central, staged: box._cheat_staged }, box.snapshot]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

/** Options that leave the box as built: a fetch of storage's box first would show the box built is not the first. */
const asBuilt = { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity } as const

/** A box built from a dna, its scope held by storage already under another revision. */
const neverStoredBoxOf = async () => {
  held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
  const box = await boxListingOf(held.mw).build(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
  held.mw.clearCalls()
  return box
}

describe("box.send: the versioned replace, with or without ifPresent 'replace'", () => {
  for (const opts of [{}, { ifPresent: 'replace' }] as const) {
    it(`refuses 'stale_write' for a box this device believes never stored over a box stored, handing storage the revision none, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await neverStoredBoxOf()
      await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      const [put] = held.mw.callsOf('put')
      expect(put?.priorRevisionTok).to.be.null
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
      expect(box).to.include({ revision_tok: 'rev-stored', revision_seq: 4 })
    })

    it(`refuses it over a tombstone stored, with opts ${JSON.stringify(opts)}`, async () => {
      held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 4 }))
      const box = await boxListingOf(held.mw).build(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
      held.mw.clearCalls()
      await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      expect(held.mw.callsOf('put')[0]?.priorRevisionTok).to.be.null
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 4 })
    })
  }

  it("puts with nothing stored at the revision minted, with ifPresent 'replace'", async () => {
    const box = await boxListingOf(held.mw).build(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
    await expect(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'replace', ...asBuilt })).resolves.to.eq(box)
    expect(box.isPresent).to.be.true
    expect(box.revision_seq).to.eq(0)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: box.revision_tok, revision_seq: 0 })
  })

  it("takes the timely options beside ifPresent, handing the timely ones on", async () => {
    const box = await boxListingOf(held.mw).build(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
    await expect(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'replace', maxMillisSinceRefresh: Infinity, maxWorldMillis: 5 })).resolves.to.eq(box)
    expect(held.mw.callsOf('ensureTimely')[0]?.opts).to.deep.equal({ maxMillisSinceRefresh: Infinity, maxWorldMillis: 5 })
  })

  it("refuses 'bad_option' an ifPresent that is not 'replace', before staging or putting anything", async () => {
    const box = await neverStoredBoxOf()
    const before = { central: box._cheat_central, staged: box._cheat_staged }
    await TH.expectRefusal(box.send({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fetch' as never, ...asBuilt }), 'bad_option')
    expect({ central: box._cheat_central, staged: box._cheat_staged }).to.deep.equal(before)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })
})

// == [A whisper and a sidecar on every update]: edit, send, seal, the whisper setter

describe("box.edit(patch), send and seal: a whisper and a sidecar on every update", () => {
  const PatchCases = [
    [{ whisper: { val: 'sk-test-0000' } },                     'a whisper with no sidecar'],
    [{ sidecar: { note: 'x' } },                               'a sidecar with no whisper'],
    [{},                                                       'neither'],
    [{ whisper: undefined, sidecar: { note: 'x' } },           'a whisper given as undefined'],
    [{ whisper: { val: 'sk-test-0000' }, sidecar: undefined }, 'a sidecar given as undefined'],
    [{ whisper: null, sidecar: { note: 'x' } },                'a whisper given as null'],
    [{ whisper: { val: 'sk-test-0000' }, sidecar: null },      'a sidecar given as null'],
  ] as const

  for (const [patch, blurb] of PatchCases) {
    it(`refuses an edit of ${blurb} as 'bad_option', staging nothing and calling nothing`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      held.mw.clearCalls()
      const err = await TH.expectRefusal(box.edit(patch as unknown as BoxProps), 'bad_option')
      expect(err.message).to.include('whisper and its sidecar')
      expect(box.hasStaged).to.be.false
      expect(box.revision_seq).to.eq(1)
      expect(held.mw.calls).to.deep.equal([])
    })

    it(`refuses a send of ${blurb} as 'bad_option', putting nothing`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(box.send(patch as unknown as BoxProps), 'bad_option')
      expect(box.hasStaged).to.be.false
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses 'bad_option' a seal given no sidecar", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    await TH.expectRefusal(box.seal({ val: 'sk-test-0000' }, undefined as never), 'bad_option')
    expect(box.hasStaged).to.be.false
  })

  it("refuses 'bad_option' before its guards: a patch lacking a whisper refuses so while the vault is locked, too", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.edit({ sidecar: {} } as unknown as BoxProps), 'bad_option')
  })

  it("leaves a staged edit as it was when a later edit refuses", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'staged' } })
    const before = box._cheat_staged
    await TH.expectRefusal(box.edit({ sidecar: { note: 'later' } } as unknown as BoxProps), 'bad_option')
    expect(box._cheat_staged).to.deep.equal(before)
  })

  it("takes no whisper from the one exposed: an edit giving none refuses 'bad_option', though one is exposed", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    await TH.expectRefusal(box.edit({ sidecar: { note: 'x' } } as unknown as BoxProps), 'bad_option')
    expect(box.hasStaged).to.be.false
  })

  it("seals nothing when the whisper is set: the setter only exposes it", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.clearCalls()
    box.whisper = { val: 'sk-test-0000' }
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
    expect(box.hasStaged).to.be.false
    expect(box.revision_seq).to.eq(1)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("seals the sidecar given over a full box, carrying none over from the record in hand", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.edit({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box.sidecar).to.deep.equal({})
  })
})
// --

// == [LOCKED, a frozen bag]: LOCKED, Storable.isLockedFUBag, the whisper setter

describe("LOCKED and Storable.isLockedFUBag: a frozen bag of the package's own (the Coach, 2026-10-31)", () => {
  it("is frozen, and shows nothing as JSON", () => {
    expect(Object.isFrozen(LOCKED)).to.be.true
    expect(JSON.stringify(LOCKED)).to.eq('{}')
  })

  const LookalikeCases = [
    [Symbol.for('LOCKED'),          "Symbol.for('LOCKED'), the symbol it once was"],
    [{},                            'an empty bag'],
    [{ ...LOCKED },                 'a copy made by spreading it'],
    [Object.assign({}, LOCKED),     'a copy made by assigning it'],
    [{ val: 'sk-test-0000' },       'a whisper given as { val }'],
    [null,                          'null'],
    [undefined,                     'undefined'],
    ['LOCKED',                      'its name'],
  ] as const

  it("is true for LOCKED", () => {
    expect(Storable.isLockedFUBag(LOCKED)).to.be.true
  })

  for (const [lookalike, blurb] of LookalikeCases) {
    it(`is false for ${blurb}`, () => {
      expect(Storable.isLockedFUBag(lookalike)).to.be.false
    })
  }

  it("is what box.whisper answers while the vault is locked, over a whisper exposed or none", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setLockState('locked')
    expect(Storable.isLockedFUBag(box.whisper)).to.be.true
    held.mw.setLockState('unlocked')
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("forgets the whisper exposed when set, as null does, while unlocked", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    box.whisper = LOCKED
    expect(box.whisper).to.be.null
    expect(box.getSnapshot().exposed).to.be.false
  })

  it("never takes a whisper for it: a whisper set is exposed, and a copy of LOCKED is refused as no whisper", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: 'LOCKED' }
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
    TH.expectSyncRefusal(() => { box.whisper = { ...LOCKED } }, 'bad_option')
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
  })
})
// --

// == [The whisper as { val }]: the whisper setter, edit, send

describe("box.whisper and box.edit: the whisper given as { val }", () => {
  const BadWhisperCases = [
    ['sk-test-SECRET',                                          'a bare whisper'],
    [{ val: null },                                             'a val that is null'],
    [{ val: { apiKey: 'sk-test-SECRET', when: new Date(T0) } }, 'a val JSON would mangle'],
    [{ val: 'sk-test-SECRET', SECRET_NOTE: 'x' },               'a field beside the val'],
    [{ value: 'sk-test-SECRET' },                               'a whisper under another name'],
  ] as const

  for (const [whisper, blurb] of BadWhisperCases) {
    it(`refuses setting ${blurb} as 'bad_option', keeping the whisper exposed and quoting nothing`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      box.whisper = { val: 'sk-test-0000' }
      const err = TH.expectSyncRefusal(() => { box.whisper = whisper as never }, 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
    })

    it(`refuses an edit of ${blurb} as 'bad_option', staging nothing, calling nothing and quoting nothing`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      held.mw.clearCalls()
      const err = await TH.expectRefusal(box.edit({ whisper: whisper as never, sidecar: {} }), 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      expect(box.hasStaged).to.be.false
      expect(held.mw.calls).to.deep.equal([])
    })

    it(`refuses a send of ${blurb} as 'bad_option', putting nothing`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(box.send({ whisper: whisper as never, sidecar: {} }), 'bad_option')
      expect(box.hasStaged).to.be.false
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses 'bad_option' before its guards: a bare whisper refuses so while the vault is locked, set or edited", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = 'sk-test-0000' as never }, 'bad_option')
    await TH.expectRefusal(box.edit({ whisper: 'sk-test-0000' as never, sidecar: {} }), 'bad_option')
  })

  it("keeps a frozen copy of the whisper set: the host's later change to its own reaches no box, and the box's cannot be changed in place, val and all", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const given = { val: { apiKey: 'sk-test-0000' } }
    box.whisper = given
    given.val.apiKey = 'sk-test-changed'
    expect(box.whisper).to.deep.equal({ val: { apiKey: 'sk-test-0000' } })
    expect(Object.isFrozen(box.whisper)).to.be.true
    expect(() => { (box.whisper as { val: unknown }).val = 'sk-test-1111' }).to.throw(TypeError)
    expect(() => { ((box.whisper as { val: { apiKey: string } }).val).apiKey = 'sk-test-1111' }).to.throw(TypeError)
    expect(box.whisper).to.deep.equal({ val: { apiKey: 'sk-test-0000' } })
  })

  it("shows the whisper exposed in no snapshot or JSON of the box", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    box.whisper = { val: { apiKey: 'sk-test-SECRET' } }
    for (const form of [box.toJSON(), box, box.getSnapshot(), { central: box._cheat_central, staged: box._cheat_staged }]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

// == [Arguments first]: every entry of Box and Storable checks its arguments before any guard; edit and send take a duckish

describe("Box and Storable entries: arguments checked first of all, before any guard (the Coach, 2026-10-31)", () => {
  const whisper = { val: 'sk-test-0000' }
  const BadArgCases = [
    [(box: TestableBox) => box.edit(undefined as never),                                          'edit(undefined)'],
    [(box: TestableBox) => box.edit({ whisper, sidecar: 'a note' as never }),                     'edit with a sidecar that fails its check'],
    [(box: TestableBox) => box.edit({ whisper, sidecar: {} }, { maxWorldMillis: -1 }),            'edit with opts out of range'],
    [(box: TestableBox) => box.send({ whisper, sidecar: [] as never }),                           'send with a sidecar that fails its check'],
    [(box: TestableBox) => box.send({ whisper, sidecar: {} }, { maxMillisSinceRefresh: -1 }),     'send with opts out of range'],
    [(box: TestableBox) => box.seal(whisper, 7 as never),                                         'seal with a sidecar that fails its check'],
    [(box: TestableBox) => box.seal(whisper, {}, { maxWorldMillis: 'soon' as never }),            'seal with opts out of range'],
    [(box: TestableBox) => box.fetch({ ifAbsent: 'shrug' as never }),                             'fetch with an ifAbsent it does not take'],
    [(box: TestableBox) => box.hydrate({ maxMillisSinceRefresh: -1 }),                            'hydrate with opts out of range'],
    [(box: TestableBox) => box.del({ maxWorldMillis: -1 }),                                       'del with opts out of range'],
    [(box: TestableBox) => box.unsealWhisper({ maxWorldMillis: -1 }),                             'unsealWhisper with opts out of range'],
    [(box: TestableBox) => box.expose({ maxWorldMillis: -1 }),                                    'expose with opts out of range'],
  ] as const

  for (const [call, blurb] of BadArgCases) {
    it(`refuses ${blurb} as 'bad_option' while the vault is locked, calling nothing and staging nothing`, async () => {
      const box = await boxListingOf(held.mw).build(fullBoxRecord())
      held.mw.setLockState('locked')
      held.mw.clearCalls()
      await TH.expectRefusal(call(box), 'bad_option')
      expect(held.mw.calls).to.deep.equal([])
      expect(box.hasStaged).to.be.false
    })
  }

  it("refuses setting isWatchable to anything but a boolean as 'bad_option', keeping the flag", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const before = box.isWatchable
    TH.expectSyncRefusal(() => { box.isWatchable = 'yes' as never }, 'bad_option')
    expect(box.isWatchable).to.eq(before)
  })

  it("refuses subscribing anything but a function as 'bad_option'", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    TH.expectSyncRefusal(() => box.subscribe('call me' as never), 'bad_option')
  })

  it("refuses LOCKED handed to edit, send or seal as 'bad_option', naming whisper and saying LOCKED is no whisper", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setLockState('locked')
    held.mw.clearCalls()
    expect(box.whisper).to.eq(LOCKED)
    for (const call of [() => box.edit({ whisper: box.whisper as never, sidecar: {} }), () => box.send({ whisper: LOCKED as never, sidecar: {} }), () => box.seal(LOCKED as never, {})]) {
      const err = await TH.expectRefusal(call(), 'bad_option')
      expect(err.message).to.include('LOCKED is not a whisper: unseal or expose one first')
      expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
    }
    expect(held.mw.calls).to.deep.equal([])
  })

  it("refuses an edit whose scope fields name another box as 'bad_option', naming them, staging nothing", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.clearCalls()
    const err = await TH.expectRefusal(box.edit({ ...fullBoxRecord({ boxlabel: 'openai_api_key' }), whisper, sidecar: {} }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(box.hasStaged).to.be.false
    expect(held.mw.calls).to.deep.equal([])
  })

  it("refuses an edit whose factory field fails its check as 'bad_option', naming it, though the field would be ignored", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const err = await TH.expectRefusal(box.edit({ ...fullBoxRecord(), am: 'q' as never, whisper, sidecar: {} }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['am'])
    expect(box.hasStaged).to.be.false
  })

  it("refuses an edit carrying a field no box record has as 'bad_option', as a bag a person typed", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    await TH.expectRefusal(box.edit({ whisper, sidecar: {}, sidecarr: {} } as never), 'bad_option')
  })

  /** A record handed back as a patch, every field the box controls given and none of it heeded. */
  const roundTripOf = (record: BoxRecord) => ({
    ...record, revision_tok: 'rev-ignored', revision_seq: 99, am: 'x', written_at: T0 + 99, registered_at: T0 + 99,
    whisper: { val: 'sk-test-1111' }, sidecar: { note: 'round trip' },
  } as const)

  it("takes { ...record, whisper, sidecar } to edit, the fields the box controls checked and stripped", async () => {
    const record = fullBoxRecord()
    const box = await boxListingOf(held.mw).build(record)
    held.mw.setNow(T0 + 5000)
    await expect(box.edit(roundTripOf(record))).resolves.to.eq(box)
    expect(box._cheat_staged).to.deep.include({ am: 'a', revision_seq: 2, registered_at: T0, written_at: T0 + 5000, sidecar: { note: 'round trip' } })
    expect(box._cheat_staged?.revision_tok).to.not.be.oneOf(['rev-ignored', 'rev-a1'])
  })

  it("takes { ...record, whisper, sidecar } to send, putting the next revision over the one held", async () => {
    const record = fullBoxRecord()
    held.mw.seedStore(record)
    const box = await boxListingOf(held.mw).build(record)
    held.mw.clearCalls()
    await expect(box.send(roundTripOf(record), { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity })).resolves.to.eq(box)
    const [put] = held.mw.callsOf('put')
    expect(put?.priorRevisionTok).to.eq('rev-a1')
    expect(put?.record).to.deep.include({ am: 'a', revision_seq: 2, registered_at: T0, sidecar: { note: 'round trip' } })
    expect(box._cheat_central).to.deep.include({ revision_seq: 2, sidecar: { note: 'round trip' } })
  })
})
// --

describe("Storable.edit holds its patch to the concrete class's isFullPatch first of all (the Coach, 2026-10-31)", () => {
  it("refuses a patch that is not full, named for its field, before it looks at the opts or the lock", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    held.mw.setLockState('locked')
    held.mw.clearCalls()
    const err = await TH.expectRefusal(box.edit({ whisper: { val: 'sk-test-0000' } } as never, { maxWorldMillis: -1 }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['sidecar'])
    expect(held.mw.calls).to.deep.equal([])
  })

  it("lays only the whisper and the sidecar of a full patch over the record, whatever else it carries", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    await box.edit({ ...fullBoxRecord(), sidecar: { note: 'new' }, whisper: { val: 'sk-test-0001' }, box_key_wrapped: undefined })
    expect(box._cheat_staged).to.include({ revision_seq: 2, am: 'a' })
    expect(box.sidecar).to.deep.equal({ note: 'new' })
  })
})

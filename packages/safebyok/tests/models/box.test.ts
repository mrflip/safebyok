import { describe, expect, it, vi } from 'vitest'
import type { BoxHalves, BoxSnapshot } from '../../src/models/box'
import type { BoxWorld } from '../../src/models/box-listing'
import { type BoxRecord, type BoxSparse, type Fetched, LOCKED } from '../../src/models/models-shapes'
import { Storable } from '../../src/models/storable'
import * as Phrases from '../../src/phrases'
import * as TH from '../test-helpers'
import { FakeBoxKeyWrapped, FakeWhisperCiphered, type TestableBox, boxDnaOf, boxListingOf, fakeSealBoxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0, type TestableBoxListing } from '../test-helpers/models-world'

const held = useModelsWorld()

// == [Receive]: success noted on a whole record, registered_at over a tombstone, another vault_tok throws

describe("box.receive(rcvd): a whole record makes the box timely", () => {
  const ReceivedCases = [
    // whole:
    [() => fullBoxRecord(),                true,  'a full record'],
    [() => tombstoneBoxRecord(),           true,  "a deletion's tombstone"],
    // not whole:
    [() => sparseBoxRecord(),              false, 'a sparse record'],
  ] as const satisfies readonly (readonly [() => Fetched<BoxRecord, BoxSparse> | null, boolean, string])[]

  for (const [rcvdOf, timely, blurb] of ReceivedCases) {
    it(`${timely ? 'notes success on' : 'notes no success on'} ${blurb}, newer than a box just created and left to age`, async () => {
      const box = await boxListingOf(held.mw, { maxMillisSinceRefresh: 1000 }).create(boxDnaOf(held.mw.boxscope('anthropic_api_key')))
      held.mw.setNow(T0 + 1000)
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
      held.mw.setNow(T0 + 1000)
      expect(box.isTimely).to.be.false
      box.receive(rcvdOf())
      expect(box.isTimely).to.be.true
      expect(box.revision_seq).to.eq(1)
    })
  }
})

describe("box.receive(rcvd): registered_at, set at a birthday; another vault_tok throws", () => {
  it("keeps registered_at over a newer living record registered at another time", async () => {
    const box = await builtOf(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', registered_at: T0 + 7 }))
    expect(box.registered_at).to.eq(T0)
    expect(box.revision_seq).to.eq(2)
  })

  it("takes registered_at and box_tok from a record of another life received over a tombstone held", async () => {
    const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
    box.receive(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-b3', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', vault_tok: 'vault-tok-u1', revision_seq: 3 })
  })

  it("takes registered_at and box_tok from a newer record of another life received over a box held alive, a birthday elsewhere after a deletion this device never received", async () => {
    const box = await builtOf(fullBoxRecord())
    box.receive(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-b4', box_tok: 'box-tok-b', registered_at: T0 + 7 }))
    expect(box).to.include({ registered_at: T0 + 7, box_tok: 'box-tok-b', revision_seq: 4 })
  })

  const HeldCases = [
    ['a box held alive',          () => fullBoxRecord()],
    ['a box held deleted',        () => tombstoneBoxRecord({ revision_seq: 1 }, 'x')],
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
    const box = await builtOf(fullBoxRecord())
    const central = box._cheat_central
    TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-u1-box', box_tok: 'tok-a' })), 'unexpected_error')
    expect(box._cheat_central).to.eq(central)
  })

  it("throws 'unexpected_error' over a box just created, and for a tombstone under another vault_tok", async () => {
    const box = await boxListingOf(held.mw).create(boxDnaOf(held.mw.boxscope('drafted')))
    const other = { boxlabel: 'drafted', vault_tok: 'vault-tok-other' }
    TH.expectSyncRefusal(() => box.receive(fullBoxRecord({ ...other, revision_seq: 1 })), 'unexpected_error')
    TH.expectSyncRefusal(() => box.receive(tombstoneBoxRecord({ ...other, revision_seq: 1 }, 'x')), 'unexpected_error')
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 0 })
  })

  it("throws 'unexpected_error' from a fetch that meets a record under another vault_tok", async () => {
    const listing = boxListingOf(held.mw)
    const box = await listing.build(fullBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' })))
    await TH.expectRefusal(box.fetch(), 'unexpected_error')
    expect(box.revision_seq).to.eq(1)
  })

  it("passes over a notice under another vault_tok, keeping its own copy", async () => {
    const listing = boxListingOf(held.mw)
    await listing.hello()
    const box = await listing.build(fullBoxRecord())
    await held.mw.notify(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-other', vault_tok: 'vault-tok-other' }))
    expect(held.mw.badnews).to.deep.equal([])
    expect(box).to.include({ vault_tok: 'vault-tok-u1', revision_seq: 1 })
  })
})
// --

// == [The absent contract]: a box gone or damaged has no whisper to open

describe("box.extractWhisper(): refused from its guard", () => {
  const RefusedCases = [
    // absent, refused ahead of the seal:
    [() => tombstoneBoxRecord({ revision_seq: 2 }),      "unlocked", "absent_box",       'a deleted box'],
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
      await TH.expectRefusal(box.extractWhisper(), refusalkind)
    })
  }
})
// --

// == [What the lease opens]: a whisper that opens to no whisper

describe("box.extractWhisper(): what the lease opens that is no whisper", () => {
  const OpenedCases = [
    ['text that is no JSON',            'sk-test-SECRET {'],
    ['JSON that is no { val } holder',  '{"value":"sk-test-SECRET"}'],
  ] as const
  for (const [blurb, text] of OpenedCases) {
    it(`refuses 'damaged_box' for ${blurb}, quoting none of it`, async () => {
      const { world } = held.mw
      const leasedWorld: BoxWorld = { clock: world.clock, scope: world.scope, vault_tok: world.vault_tok, lockState: () => world.lockState(), demandBoxesUsable: () => world.demandBoxesUsable(), takeWorld: (taken) => { world.takeWorld(taken) }, ensureTimely: (maxMillis) => world.ensureTimely(maxMillis), sealStampedString: () => Promise.reject(new Error('nothing is sealed here')), unsealStampedString: () => Promise.resolve(text) }
      const box = await boxListingOf(held.mw, { world: leasedWorld }).build(fullBoxRecord())
      const err = await TH.expectRefusal(box.extractWhisper(), 'damaged_box')
      expect(err.message).to.eq(Phrases.UndecodedWhisper)
      expect(JSON.stringify({ meta: err.meta, cause: String(err.cause) })).to.not.include('SECRET')
    })
  }
})
// --

// == [Rebirth]: an edit over a box gone or damaged

describe("box.put(patch): rebirth over a tombstone", () => {
  const TombstoneCases = [
    ["x", "rev-x2", 'a deleted box'],
  ] as const
  for (const [am, tok, blurb] of TombstoneCases) {
    it(`puts ${blurb} alive at the next revision, registered now under a new box_tok, over the tombstone's revision`, async () => {
      const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am), fakeSealBoxListingOf(held.mw))
      held.mw.setNow(T0 + 5000)
      await expect(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'reborn' } })).resolves.to.eq(box)
      expect(box.isPresent).to.be.true
      expect(box.box_tok).to.not.eq('box-tok-a')
      expect(box.registered_at).to.eq(T0 + 5000)
      const [put] = held.mw.callsOf('put')
      expect(put?.priorRevisionTok).to.equal(tok)
      expect(put?.record).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, written_at: T0 + 5000, sidecar: { note: 'reborn' } })
      expect(box._cheat_central).to.deep.include({ am: 'a', revision_seq: 3, registered_at: T0 + 5000, box_tok: box.box_tok })
    })

    it(`puts a sidecar with no whisper over ${blurb} alive, sealing an empty whisper`, async () => {
      const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2, revision_tok: tok }, am), fakeSealBoxListingOf(held.mw))
      held.mw.clearCalls()
      await box.put({ sidecar: { note: 'no whisper' } })
      expect(held.mw.callsOf('put')).to.have.lengthOf(1)
      expect(box.isPresent).to.be.true
      expect(box.sidecar).to.deep.equal({ note: 'no whisper' })
    })
  }
})
// --

// == [The whisper while locked]

describe("box.whisper while the vault is locked", () => {
  it("reads LOCKED over a whisper exposed", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("keeps the whisper exposed while the vault locks, and reads it again once unlocked", async () => {
    const box = await builtOf(fullBoxRecord())
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
/** A box built of `record`, with the same record in storage. */
const builtOf = (record: Fetched<BoxRecord, BoxSparse>, listing: TestableBoxListing = boxListingOf(held.mw)): Promise<TestableBox> => {
  held.mw.seedStore(record)
  return listing.build(record)
}

const boxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<TestableBox> => builtOf(record)

/** The snapshot of a box holding `record`, as `getSnapshot` answers it. */
const snapshotOf = async (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<BoxSnapshot> => {
  const box = await boxOf(record)
  return box.getSnapshot()
}

const SnapshotKeys = ['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'revision_tok', 'revision_seq', 'registered_at', 'written_at', 'sidecar', 'full', 'present', 'exposed', 'lockState']

describe("Box snapshot", () => {
  it("carries the scope, the revision props, registered_at, written_at, the sidecar, and the states full, present, exposed and lockState, and no more", async () => {
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
      lockState:     'unlocked',
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

    it("born from a dna: present, full, the sidecar empty, at revision 0 registered and written now", async () => {
      held.mw.setNow(T0 + 7000)
      const box = await boxListingOf(held.mw).create(boxDnaOf(held.mw.boxscope('openai_api_key')))
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
        lockState:     'unlocked',
      })
    })

    it("put: the record put is the record in hand, so the sidecar and the revision are the put's", async () => {
      const box = await boxOf()
      held.mw.setNow(T0 + 500)
      await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'edited' } })
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

  it("is the snapshot's sidecar too, and a lock moves only the snapshot's lockState, telling its listeners, as a component reading box.whisper must repaint", async () => {
    const box = await boxOf()
    const listener = vi.fn()
    box.subscribe(listener)
    held.mw.setLockState('locked')
    box.settle()
    expect(box.getSnapshot()).to.deep.include({ lockState: 'locked', sidecar: { note: 'a test box' }, full: true, present: true, revision_seq: 1 })
    expect(listener.mock.calls).to.have.lengthOf(1)
    held.mw.setLockState('unlocked')
    box.settle()
    expect(box.getSnapshot().lockState).to.eq('unlocked')
    expect(listener.mock.calls).to.have.lengthOf(2)
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
    }
  })
})

describe("Box own props", () => {
  it("are exactly the nine the base tattoos: the four of the scope, registered_at, vault_tok and the three revision props", async () => {
    const box = await boxOf()
    expect(Object.keys(box)).to.have.members(['applabel', 'user_id', 'vaultlabel', 'boxlabel', 'registered_at', 'vault_tok', 'revision_tok', 'revision_seq', 'written_at'])
    expect(Object.keys(box)).to.have.lengthOf(9)
  })

  it("stay nine through a receive, a put and a del", async () => {
    const box = await boxOf()
    const keys = Object.keys(box)
    const received = held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })
    held.mw.seedStore(received)
    box.receive(received)
    expect(Object.keys(box)).to.have.members(keys)
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'edited' } })
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
      const box = await builtOf(fullBoxRecord())
      box.whisper = { val: 'sk-test-0000' }
      held.mw.setLockState('locked')
      box.whisper = forget
      expect(box.getSnapshot().exposed).to.be.false
      held.mw.setLockState('unlocked')
      expect(box.whisper).to.be.null
    })
  }

  it("refuses 'vault_locked' setting a new whisper, keeping the one exposed", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = { val: 'sk-test-1111' } }, 'vault_locked')
    held.mw.setLockState('unlocked')
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
  })
})
// --

// == [The seal in put]: the vault's lease seals what a put is given

describe("box.put(patch): the vault's lease seals the whisper and the sidecar", () => {
  it("seals a whisper with its sidecar over a full box at the next revision, its sealed parts the fake lease's", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { account: 'work' } })
    expect(box.revision_seq).to.eq(2)
    expect(box.sidecar).to.deep.equal({ account: 'work' })
    expect(box.box_key_wrapped).to.deep.equal(FakeBoxKeyWrapped)
    expect(box.whisper_ciphered).to.deep.equal(FakeWhisperCiphered)
  })

  it("seals the sidecar given in place of the one the box carries", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { account: 'home' } })
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("seals a deleted box back to life with the sidecar given", async () => {
    const box = await builtOf(tombstoneBoxRecord({ revision_seq: 2 }))
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
    expect(box.isPresent).to.be.true
    expect(box.isFull).to.be.true
    expect(box.sidecar).to.deep.equal({})
    expect(box.revision_seq).to.eq(3)
  })

  it("fetches the full record of a box held sparse before its seal", async () => {
    const box = await builtOf(sparseBoxRecord())
    held.mw.seedStore(fullBoxRecord())
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { account: 'home' } })
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(box.sidecar).to.deep.equal({ account: 'home' })
  })

  it("refuses a live box still sparse once hydrated as 'bad_option', saying so, putting nothing", async () => {
    const box = await builtOf(sparseBoxRecord())
    held.mw.willGet(held.mw.answerOf(box.scope, sparseBoxRecord()))
    await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { account: 'home' } }), 'bad_option')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("holds nothing that carries the whisper, in the record in hand or the snapshot", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ whisper: { val: { key: 'sk-test-SECRET' } }, sidecar: {} })
    for (const form of [box.toJSON(), { central: box._cheat_central }, box.snapshot]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

/** Options that leave the box as built: a fetch of storage's box first would show the box built is not the first. */
const asBuilt = { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity } as const

describe("box.put: the versioned replace, with or without ifPresent 'repl'", () => {
  for (const opts of [{}, { ifPresent: 'repl' }] as const) {
    it(`refuses 'stale_write' for a box that moved in storage, handing the box the revision stored, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.seedStore(fullBoxRecord({ revision_tok: 'rev-stored', revision_seq: 4 }))
      held.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      const [put] = held.mw.callsOf('put')
      expect(put?.priorRevisionTok).to.eq('rev-a1')
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-stored', revision_seq: 4 })
      expect(box).to.include({ revision_tok: 'rev-stored', revision_seq: 4 })
    })

    it(`refuses it over a tombstone stored, with opts ${JSON.stringify(opts)}`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.seedStore(tombstoneBoxRecord({ revision_seq: 1, revision_tok: 'rev-gone' }))
      held.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ...opts, ...asBuilt }), 'stale_write')
      expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_seq: 1 })
    })
  }

  it("puts over the revision in hand, with ifPresent 'repl'", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'repl', ...asBuilt })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(2)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: box.revision_tok, revision_seq: 2 })
  })

  it("seals over the revision it took on entry: a frontier received during the seal is met as 'stale_write', not sealed over", async () => {
    const rival = fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-rival' })
    const listing = fakeSealBoxListingOf(held.mw, {}, () => { held.mw.seedStore(rival); box.receive(rival) })
    const box = await listing.build(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }), 'stale_write')
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-rival', revision_seq: 2 })
    expect(box.revision_tok).to.eq('rev-rival')
  })

  it("refuses 'camped' with ifPresent 'fail' over a live record, saving nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fail', ...asBuilt }), 'camped')
    expect(box.revision_seq).to.eq(1)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-a1', revision_seq: 1 })
  })

  it("resolves itself with ifPresent 'get' over a live record, holding that record and saving nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'get', ...asBuilt })).resolves.to.eq(box)
    expect(box.revision_seq).to.eq(1)
    expect(held.mw.stored.get('anthropic_api_key')).to.deep.include({ revision_tok: 'rev-a1', revision_seq: 1 })
  })

  it("takes the timely options beside ifPresent, handing the world its maxWorldMillis", async () => {
    const box = await builtOf(fullBoxRecord())
    await expect(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'repl', maxMillisSinceRefresh: Infinity, maxWorldMillis: 5 })).resolves.to.eq(box)
    expect(held.mw.callsOf('ensureTimely')[0]?.maxMillis).to.eq(5)
  })

  it("refuses 'bad_option' an ifPresent off its menu, before putting anything", async () => {
    const box = await builtOf(fullBoxRecord())
    const before = box._cheat_central
    held.mw.clearCalls()
    await TH.expectRefusal(box.put({ whisper: { val: 'sk-test-0000' }, sidecar: { note: 'new' } }, { ifPresent: 'fetch' as never, ...asBuilt }), 'bad_option')
    expect(box._cheat_central).to.deep.equal(before)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })
})

// == [A whisper and a sidecar on every update]: put, the whisper setter

describe("box.put(patch): a patch naming a half", () => {
  const PatchCases = [
    [{},                                                       'neither'],
    [{ whisper: null, sidecar: { note: 'x' } },                'a whisper given as null'],
    [{ whisper: { val: 'sk-test-0000' }, sidecar: null },      'a sidecar given as null'],
  ] as const

  for (const [patch, blurb] of PatchCases) {
    it(`refuses a put of ${blurb} as 'bad_option', putting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(box.put(patch as unknown as BoxHalves), 'bad_option')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("refuses 'bad_option' before its guards: a patch naming neither refuses so while the vault is locked, too", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({}), 'bad_option')
  })

  it("seals nothing when the whisper is set: the setter only exposes it", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.clearCalls()
    box.whisper = { val: 'sk-test-0000' }
    expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
    expect(box.revision_seq).to.eq(1)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("seals the sidecar given over a full box, carrying none over from the record in hand", async () => {
    const box = await builtOf(fullBoxRecord({ sidecar: { account: 'work' } }))
    await box.put({ whisper: { val: 'sk-test-0000' }, sidecar: {} })
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
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    expect(Storable.isLockedFUBag(box.whisper)).to.be.true
    held.mw.setLockState('unlocked')
    box.whisper = { val: 'sk-test-0000' }
    held.mw.setLockState('locked')
    expect(box.whisper).to.eq(LOCKED)
  })

  it("forgets the whisper exposed when set, as null does, while unlocked", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'sk-test-0000' }
    box.whisper = LOCKED
    expect(box.whisper).to.be.null
    expect(box.getSnapshot().exposed).to.be.false
  })

  it("never takes a whisper for it: a whisper set is exposed, and a copy of LOCKED is refused as no whisper", async () => {
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: 'LOCKED' }
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
    TH.expectSyncRefusal(() => { box.whisper = { ...LOCKED } }, 'bad_option')
    expect(box.whisper).to.deep.equal({ val: 'LOCKED' })
  })
})
// --

// == [The whisper as { val }]: the whisper setter, put

describe("box.whisper and box.put: the whisper given as { val }", () => {
  const BadWhisperCases = [
    ['sk-test-SECRET',                                          'a bare whisper'],
    [{ val: null },                                             'a val that is null'],
    [{ val: { apiKey: 'sk-test-SECRET', when: new Date(T0) } }, 'a val JSON would mangle'],
    [{ val: 'sk-test-SECRET', SECRET_NOTE: 'x' },               'a field beside the val'],
    [{ value: 'sk-test-SECRET' },                               'a whisper under another name'],
  ] as const

  for (const [whisper, blurb] of BadWhisperCases) {
    it(`refuses setting ${blurb} as 'bad_option', keeping the whisper exposed and quoting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      box.whisper = { val: 'sk-test-0000' }
      const err = TH.expectSyncRefusal(() => { box.whisper = whisper as never }, 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
      expect(box.whisper).to.deep.equal({ val: 'sk-test-0000' })
    })

    it(`refuses a put of ${blurb} as 'bad_option', putting nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.clearCalls()
      await TH.expectRefusal(box.put({ whisper: whisper as never, sidecar: {} }), 'bad_option')
      expect(held.mw.callsOf('put')).to.deep.equal([])
    })
  }

  it("refuses 'bad_option' before its guards: a bare whisper refuses so while the vault is locked, set or sent", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => { box.whisper = 'sk-test-0000' as never }, 'bad_option')
    await TH.expectRefusal(box.put({ whisper: 'sk-test-0000' as never, sidecar: {} }), 'bad_option')
  })

  it("keeps a frozen copy of the whisper set: the host's later change to its own reaches no box, and the box's cannot be changed in place, val and all", async () => {
    const box = await builtOf(fullBoxRecord())
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
    const box = await builtOf(fullBoxRecord())
    box.whisper = { val: { apiKey: 'sk-test-SECRET' } }
    for (const form of [box.toJSON(), box, box.getSnapshot(), { central: box._cheat_central }]) {
      expect(JSON.stringify(form)).to.not.include('SECRET')
    }
  })
})
// --

// == [Arguments first]: every entry of Box and Storable checks its arguments before any guard; edit and put take a duckish

describe("Box and Storable entries: arguments checked before any demand (the Coach, 2026-10-31)", () => {
  const whisper = { val: 'sk-test-0000' }
  const BadArgCases = [
    [(box: TestableBox) => box.put({ whisper, sidecar: {} }, { maxMillisSinceRefresh: -1 }),     'put with opts out of range'],
    [(box: TestableBox) => box.fetch({ ifAbsent: 'shrug' as never }),                             'fetch with an ifAbsent it does not take'],
    [(box: TestableBox) => box.hydrate({ maxMillisSinceRefresh: -1 }),                            'hydrate with opts out of range'],
    [(box: TestableBox) => box.del({ maxWorldMillis: -1 }),                                       'del with opts out of range'],
    [(box: TestableBox) => box.extractWhisper({ maxWorldMillis: -1 }),                             'extractWhisper with opts out of range'],
    [(box: TestableBox) => box.expose({ maxWorldMillis: -1 }),                                    'expose with opts out of range'],
  ] as const

  for (const [call, blurb] of BadArgCases) {
    it(`refuses ${blurb} as 'bad_option' while the vault is locked, calling nothing`, async () => {
      const box = await builtOf(fullBoxRecord())
      held.mw.setLockState('locked')
      held.mw.clearCalls()
      await TH.expectRefusal(call(box), 'bad_option')
      expect(held.mw.calls).to.deep.equal([])
    })
  }

  it("refuses put with a sidecar that fails its check as 'bad_option' while the vault is locked, putting nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({ whisper, sidecar: [] as never }), 'bad_option')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses subscribing anything but a function as 'bad_option'", async () => {
    const box = await builtOf(fullBoxRecord())
    TH.expectSyncRefusal(() => box.subscribe('call me' as never), 'bad_option')
  })

  it("refuses LOCKED handed to put as 'bad_option', naming whisper and saying LOCKED is no whisper", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    held.mw.clearCalls()
    expect(box.whisper).to.eq(LOCKED)
    for (const call of [() => box.put({ whisper: box.whisper as never, sidecar: {} }), () => box.put({ whisper: LOCKED as never, sidecar: {} })]) {
      const err = await TH.expectRefusal(call(), 'bad_option')
      expect(err.message).to.include('LOCKED is not a whisper: unseal or expose one first')
      expect(err.meta?.fieldnames).to.deep.equal(['whisper'])
    }
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses a put whose scope fields name another box as 'bad_option', naming them, putting nothing", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.clearCalls()
    const err = await TH.expectRefusal(box.put({ ...fullBoxRecord({ boxlabel: 'openai_api_key' }), whisper, sidecar: {} }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses a put whose factory field fails its check as 'bad_option', naming it, though the field would be ignored", async () => {
    const box = await builtOf(fullBoxRecord())
    const err = await TH.expectRefusal(box.put({ ...fullBoxRecord(), am: 'q' as never, whisper, sidecar: {} }), 'bad_option')
    expect(err.meta?.fieldnames).to.deep.equal(['am'])
  })

  it("refuses a put carrying a field no box record has as 'bad_option', as a bag a person typed", async () => {
    const box = await builtOf(fullBoxRecord())
    await TH.expectRefusal(box.put({ whisper, sidecar: {}, sidecarr: {} } as never), 'bad_option')
  })

  /** A record handed back as a patch, every field the box controls given and none of it heeded. */
  const roundTripOf = (record: BoxRecord) => ({
    ...record, revision_tok: 'rev-ignored', revision_seq: 99, am: 'x' as never, written_at: T0 + 99, registered_at: T0 + 99,
    whisper: { val: 'sk-test-1111' }, sidecar: { note: 'round trip' },
  } as const)

  it("takes { ...record, whisper, sidecar } to put, putting the next revision over the one held", async () => {
    const record = fullBoxRecord()
    held.mw.seedStore(record)
    const box = await builtOf(record)
    held.mw.clearCalls()
    await expect(box.put(roundTripOf(record), { maxMillisSinceRefresh: Infinity, maxWorldMillis: Infinity })).resolves.to.eq(box)
    const [put] = held.mw.callsOf('put')
    expect(put?.priorRevisionTok).to.eq('rev-a1')
    expect(put?.record).to.deep.include({ am: 'a', revision_seq: 2, registered_at: T0, sidecar: { note: 'round trip' } })
    expect(box._cheat_central).to.deep.include({ revision_seq: 2, sidecar: { note: 'round trip' } })
  })
})
// --

describe("box.put holds its patch to boxPatch before any demand (the Coach, 2026-10-31)", () => {
  it("refuses a patch that names neither half before it looks at the lock", async () => {
    const box = await builtOf(fullBoxRecord())
    held.mw.setLockState('locked')
    await TH.expectRefusal(box.put({}), 'bad_option')
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("refuses it after the one fetch its ensure asks of a box held sparse", async () => {
    const box = await builtOf(sparseBoxRecord())
    held.mw.seedStore(fullBoxRecord())
    await TH.expectRefusal(box.put({}), 'bad_option')
    expect(held.mw.callsOf('get')).to.have.lengthOf(1)
    expect(held.mw.callsOf('put')).to.deep.equal([])
  })

  it("lays only the whisper and the sidecar of a full patch over the record, whatever else it carries", async () => {
    const box = await builtOf(fullBoxRecord())
    await box.put({ ...fullBoxRecord(), sidecar: { note: 'new' }, whisper: { val: 'sk-test-0001' }, box_key_wrapped: undefined })
    expect(box._cheat_central).to.include({ revision_seq: 2, am: 'a' })
    expect(box.sidecar).to.deep.equal({ note: 'new' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { BoxRecord, BoxSparse, Fetched } from '../../src/shapes/shapes-vaultish'
import { Box } from '../../src/models/box'
import { cmpRevisions, Storable } from '../../src/models/storable'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type BoxAnswer, TestableBox, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const held = useModelsWorld()

/** A box holding `record`, by default the full box record `anthropic_api_key` at revision 1, with the same in storage. */
const builtBoxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<TestableBox> => {
  held.mw.seedStore(record)
  return boxListingOf(held.mw).build(record)
}

/** The own props that follow the record in hand, as the box holds them now. */
const followingPropsOf = (box: TestableBox) => ({ vault_tok: box.vault_tok, revision_tok: box.revision_tok, revision_seq: box.revision_seq, written_at: box.written_at })

/** Script the store's next `del` to hold until `release`, answering `tombstone`; `entered` resolves once the store has the call. The fake timers stay where they are: `vi.waitFor` would move them. */
const holdNextDel = (box: TestableBox, tombstone: ReturnType<typeof tombstoneBoxRecord>): { entered: Promise<void>, release: () => void } => {
  let release: (() => void) | undefined
  const gate = new Promise<BoxAnswer>((resolve) => { release = () => { resolve(held.mw.answerOf(box.scope, tombstone)) } })
  const entered = new Promise<void>((resolve) => {
    held.mw.willDel(() => {
      resolve()
      return gate
    })
  })
  return { entered, release: () => { release?.() } }
}

describe("cmpRevisions(ante, post)", () => {
  const ante = { revision_seq: 2, revision_tok: 'rev-c2' }
  const cases: readonly (readonly [post: { revision_seq: number, revision_tok: string }, age: string, blurb: string])[] = [
    [{ revision_seq: 1, revision_tok: 'rev-o1' }, "older", 'a lower seq is older, whatever its tok'],
    [{ revision_seq: 1, revision_tok: 'rev-c2' }, "older", 'a lower seq under the same tok is still older'],
    [{ revision_seq: 3, revision_tok: 'rev-n3' }, "newer", 'a higher seq is newer, whatever its tok'],
    [{ revision_seq: 2, revision_tok: 'rev-c2' }, "same",  'the same seq under the same tok is the same revision'],
  ]
  for (const [post, age, blurb] of cases) {
    it(`reads ${String(post.revision_seq)}/${post.revision_tok} against 2/rev-c2 as '${age}': ${blurb}`, () => {
      expect(cmpRevisions(ante, post)).to.eq(age)
    })
  }

  it("refuses the same seq under another tok as 'record_conflict': two puts landed as one revision", () => {
    TH.expectSyncRefusal(() => cmpRevisions(ante, { revision_seq: 2, revision_tok: 'rev-other' }), 'record_conflict')
  })
})

describe("Storable own props", () => {
  describe("the scope", () => {
    it("is a getter on the prototype over one frozen object, not an own prop of the box", async () => {
      const box = await builtBoxOf()
      expect(Object.getOwnPropertyDescriptor(box, 'scope')).to.be.undefined
      expect(Object.getOwnPropertyDescriptor(Storable.prototype, 'scope')).to.have.property('get').that.is.a('function')
      expect(box.scope).to.eq(box.scope)
      expect(Object.isFrozen(box.scope)).to.be.true
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
      expect(Object.keys(box)).to.not.include('scope')
      expect(JSON.stringify(box)).to.not.contain('"scope"')
    })

    it("is tattooed on the box as its own props, which nothing assigns or deletes", async () => {
      const box = await builtBoxOf()
      for (const ckey of ['applabel', 'user_id', 'vaultlabel', 'boxlabel'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(box, ckey)
        expect(descriptor, ckey).to.include({ enumerable: true, writable: false, configurable: false })
        expect(descriptor?.value, ckey).to.eq(box.scope[ckey])
        expect(Reflect.set(box, ckey, 'other'), ckey).to.be.false
        expect(Reflect.deleteProperty(box, ckey), ckey).to.be.false
        expect(box[ckey], ckey).to.eq(descriptor?.value)
      }
    })
  })

  describe("the props that follow the record in hand: revision_tok, revision_seq, written_at; and vault_tok, which never moves", () => {
    const writable = ['vault_tok', 'revision_tok', 'revision_seq', 'written_at'] as const

    it("start as the record the box was received with", async () => {
      const box = await builtBoxOf(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-a4', written_at: T0 + 40 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a4', revision_seq: 4, written_at: T0 + 40 })
    })

    it("are ordinary enumerable own props, but not configurable, so that nothing removes them", async () => {
      const box = await builtBoxOf()
      for (const ckey of writable) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, configurable: false })
      }
    })

    it("are plain assigned props for the revision and written_at, writable, and sealed with the rest of the box", async () => {
      const box = await builtBoxOf()
      expect(Object.isSealed(box)).to.be.true
      for (const ckey of ['revision_tok', 'revision_seq', 'written_at', 'registered_at'] as const) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, writable: true, configurable: false })
      }
    })

    it("follow a newer record received", async () => {
      const box = await builtBoxOf()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 1000 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("follow a received tombstone", async () => {
      const box = await builtBoxOf()
      box.receive(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 1000 }))
      expect(box.isPresent).to.be.false
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("keep the vault_tok of birth, not writable: a record under another vault_tok received over a tombstone throws 'record_conflict', and neither it nor the scope moves", async () => {
      const box = await builtBoxOf(tombstoneBoxRecord())
      const { scope } = box
      TH.expectSyncRefusal(() => box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', vault_tok: 'vault-tok-u2' })), 'record_conflict')
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(Object.getOwnPropertyDescriptor(box, 'vault_tok')).to.include({ writable: false, configurable: false })
      expect(box.scope).to.eq(scope)
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
    })

    it("stay with the record in hand when an older record is received", async () => {
      const box = await builtBoxOf(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3', written_at: T0 + 30 }))
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a3', revision_seq: 3, written_at: T0 + 30 })
    })

    it("follow the record a put lands, which is one revision on, written now", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      await box.put({ whisper: 'sk-test-0000', sidecar: { note: 'sent' } })
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(followingPropsOf(box)).to.include({ revision_tok: box._cheat_central.revision_tok, revision_seq: 2 })
    })

    it("follow the tombstone a del lands, once the store answers", async () => {
      const box = await builtBoxOf()
      held.mw.setNow(T0 + 500)
      const { entered, release } = holdNextDel(box, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 900 }))
      const deleting = box.del()
      await entered
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a1', revision_seq: 1, written_at: T0 })
      release()
      await deleting
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 900 })
    })
  })
})

describe("Storable forms", () => {
  describe("toJSON", () => {
    it("is the sparse form of central, with no sidecar and none of the sealed parts", async () => {
      const box = await builtBoxOf()
      expect(box.toJSON()).to.deep.equal(box.sparse)
      expect(box.sparse).to.deep.equal(held.mw.sparseBoxRecord())
      expect(JSON.stringify(box)).to.eq(JSON.stringify(held.mw.sparseBoxRecord()))
      expect(Object.keys(box.toJSON())).to.not.include.members(['sidecar', 'box_key_wrapped', 'whisper_ciphered'])
    })

    it("is the tombstone's sparse form for a gone box, which has no sidecar either", async () => {
      const gone = held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
      const box = await builtBoxOf(gone)
      expect(box.toJSON()).to.deep.equal(gone)
      expect(box.toJSON()).to.not.have.property('sidecar')
    })
  })
})

describe("Storable snapshot and subscription", () => {
  describe("getSnapshot", () => {
    it("answers one frozen object, the same one again and again", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      expect(Object.isFrozen(first)).to.be.true
      expect(box.getSnapshot()).to.eq(first)
      expect(box.snapshot).to.eq(first)
    })

    it("is one function with one identity, answering the current snapshot", async () => {
      const box = await builtBoxOf()
      expect(box.getSnapshot).to.eq(box.getSnapshot)
      const { getSnapshot } = box
      const first = getSnapshot()
      await box.put({ whisper: 'sk-test-0000', sidecar: { note: 'changed' } })
      expect(getSnapshot()).to.not.eq(first)
      expect(getSnapshot()).to.eq(box.snapshot)
    })

    it("keeps the same object until a settle changes it, and the old one stays as it was", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      box.settle()
      expect(box.getSnapshot()).to.eq(first)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', sidecar: { note: 'two' } }))
      const second = box.getSnapshot()
      expect(second).to.not.eq(first)
      expect(Object.isFrozen(second)).to.be.true
      expect(second).to.include({ revision_seq: 2, revision_tok: 'rev-a2' })
      expect(first).to.include({ revision_seq: 1, revision_tok: 'rev-a1' })
      expect(box.getSnapshot()).to.eq(second)
    })

    it("is made on the first call, so that a settle before it has none to replace and tells nobody", () => {
      const { mw } = held
      const box = new TestableBox(mw.world, boxListingOf(mw), mw.fullBoxRecord(), { maxMillisSinceRefresh: 1000 })
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })

    it("is made by becomeNotifiable, which answers the box, so that the next change notifies; the snapshot it made is the one getSnapshot answers", () => {
      const { mw } = held
      const box = new TestableBox(mw.world, boxListingOf(mw), mw.fullBoxRecord(), { maxMillisSinceRefresh: 1000 })
      const listener = vi.fn()
      box.subscribe(listener)
      expect(box.becomeNotifiable()).to.eq(box)
      const made = box.getSnapshot()
      expect(box.becomeNotifiable().getSnapshot()).to.eq(made)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(1)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })
  })

  describe("settle", () => {
    it("changes nothing when there is nothing to settle", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      expect(box.settle()).to.deep.equal({ badnews: [] })
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies nobody when a receive only confirms the record in hand", async () => {
      const box = await builtBoxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(fullBoxRecord())
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies every listener once when it changes the snapshot", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const [one, other] = [vi.fn(), vi.fn()]
      box.subscribe(one)
      box.subscribe(other)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(one.mock.calls).to.have.lengthOf(1)
      expect(other.mock.calls).to.have.lengthOf(1)
    })

    it("hands each listener the new snapshot to find, already in place when it is called", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const seen: number[] = []
      box.subscribe(() => { seen.push(box.getSnapshot().revision_seq) })
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(seen).to.deep.equal([2])
    })

    it("notifies on a put and on a del, each a change", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      await box.put({ whisper: 'sk-test-0000', sidecar: { note: 'sent' } })
      const afterEdit = listener.mock.calls.length
      expect(afterEdit).to.be.greaterThan(0)
      await box.del()
      expect(listener.mock.calls.length).to.be.greaterThan(afterEdit)
      expect(box.getSnapshot().present).to.be.false
    })
  })

  describe("subscribe", () => {
    it("is one function with one identity, answering an unsubscribe", async () => {
      const box = await builtBoxOf()
      expect(box.subscribe).to.eq(box.subscribe)
      expect(box.subscribe(() => undefined)).to.be.a('function')
    })

    it("stops telling a listener once it unsubscribes, and leaves the others be", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const [leaving, staying] = [vi.fn(), vi.fn()]
      const unsubscribe = box.subscribe(leaving)
      box.subscribe(staying)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      unsubscribe()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3' }))
      expect(leaving.mock.calls).to.have.lengthOf(1)
      expect(staying.mock.calls).to.have.lengthOf(2)
    })

    it("takes an unsubscribe called twice as it takes one", async () => {
      const box = await builtBoxOf()
      box.getSnapshot()
      const [leaving, staying] = [vi.fn(), vi.fn()]
      const unsubscribe = box.subscribe(leaving)
      box.subscribe(staying)
      unsubscribe()
      unsubscribe()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(leaving.mock.calls).to.have.lengthOf(0)
      expect(staying.mock.calls).to.have.lengthOf(1)
    })
  })
})

describe("Storable put guards: ensurePuttable, demandPuttable", () => {
  const Patch = { whisper: 'sk-test-0000' }

  it("demandPuttable answers the patch as parsed while the vault is unlocked, and refuses 'vault_locked' while it is locked", async () => {
    const box = await builtBoxOf()
    expect(box.demandPuttable({ ...box.scope, sidecar: { note: 'sent' } })).to.deep.include({ sidecar: { note: 'sent' } })
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'vault_locked')
  })

  it("demandPuttable refuses a bad patch first, whether locked or over a record not whole", async () => {
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => box.demandPuttable({}), 'bad_option')
    TH.expectSyncRefusal(() => box.demandPuttable({ ...Patch, boxlabel: 'openai_api_key' }), 'bad_option')
  })

  it("demandPuttable refuses 'disabled' before the lock, and the lock before a record not whole", async () => {
    const box = await boxListingOf(held.mw).build(sparseBoxRecord())
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'bad_option')
    held.mw.setLockState('locked')
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'vault_locked')
    box.vacate()
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'disabled')
  })

  it("demandPuttable under ifPresent 'fail' refuses a whole record, saying its data would be recycled", async () => {
    const box = await boxListingOf(held.mw).build(fullBoxRecord())
    const err = TH.expectSyncRefusal(() => box.demandPuttable({ ...fullBoxRecord() }, { ifPresent: 'fail' }), 'bad_option')
    expect(err.message).to.eq(Phrases.RecordForNewBox)
    expect(box.demandPuttable({ ...fullBoxRecord() })).to.deep.include({ sidecar: fullBoxRecord().sidecar })
    expect(box.demandPuttable(Patch, { ifPresent: 'fail' })).to.deep.include(Patch)
  })

  it("demandPuttable takes a void record and a tombstone as whole", async () => {
    const listing = boxListingOf(held.mw)
    const shell = listing.puttable(held.mw.boxscope('anthropic_api_key'))
    expect(shell.demandPuttable(Patch)).to.deep.include(Patch)
    const tomb = await listing.build(held.mw.tombstoneBoxRecord({ boxlabel: 'openai_api_key' }))
    expect(tomb.demandPuttable(Patch)).to.deep.include(Patch)
    expect(held.mw.callsOf('get')).to.deep.equal([])
  })

  it("ensurePuttable refreshes and demands nothing: it resolves while locked, where put refuses", async () => {
    const box = await builtBoxOf()
    held.mw.setLockState('locked')
    await expect(box.ensurePuttable()).resolves.to.eq(box)
    await TH.expectRefusal(box.put({ whisper: 'sk-test-0000', sidecar: {} }), 'vault_locked')
  })

  it("put ensures once, before its seal, and a bad patch heard after that ensure puts nothing", async () => {
    const box = await builtBoxOf()
    const putGuard = vi.spyOn(Box.prototype, 'ensurePuttable')
    await TH.expectRefusal(box.put({}), 'bad_option')
    expect(putGuard).toHaveBeenCalledOnce()
    expect(held.mw.callsOf('put')).to.deep.equal([])
    putGuard.mockClear()
    await expect(box.put({ whisper: 'sk-test-0000', sidecar: { note: 'sent' } })).resolves.to.eq(box)
    expect(putGuard).toHaveBeenCalledOnce()
  })
})

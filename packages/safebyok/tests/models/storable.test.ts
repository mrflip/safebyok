import { describe, expect, it, vi } from 'vitest'
import type { Fetched } from '../../src/shapes/shapes-vaultish'
import type { BoxRecord, BoxSparse } from '../../src/shapes/shapes-storage'
import { Box } from '../../src/models/box'
import { cmpRevisions, Storable } from '../../src/models/storable'
import * as Phrases from '../../src/helpers/phrases'
import * as TH from '../test-helpers'
import { type BoxAnswer, TestableBox, boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const world = useModelsWorld()

/** A box with `record`, by default the full box record `anthropic_api_key` at revision 1, with the same in storage. */
function builtBoxOf(record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): TestableBox {
  world.mw.seedPut(record)
  return boxListingOf(world.mw).deliverRecord(record)
}

/** The own props that follow the record in hand, as the box has them now. */
function followingPropsOf(box: TestableBox) { return { vault_tok: box.vault_tok, revision_tok: box.revision_tok, revision_seq: box.revision_seq, written_at: box.written_at } }

/** Script the VaultDB's next `del` pending until `release`, answering `tombstone`; `entered` resolves once the VaultDB has the call. The fake timers stay where they are: `vi.waitFor` would move them. */
function pendingNextDel(box: TestableBox): { entered: Promise<void>, release: () => void, sentTok: () => string | undefined } {
  let release: (() => void) | undefined
  let sentTok: string | undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const entered = new Promise<void>((resolve) => {
    world.mw.willDel(async ({ tombstone }): Promise<BoxAnswer> => {
      sentTok = tombstone.revision_tok
      resolve()
      await gate
      return world.mw.answerOf(box.scope, tombstone)
    })
  })
  return { entered, release: () => { release?.() }, sentTok: () => sentTok }
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

  it("refuses the same seq under another tok: two puts written as one revision", () => {
    TH.expectSyncRefusal(() => cmpRevisions(ante, { revision_seq: 2, revision_tok: 'rev-other' }))
  })
})

describe("Storable own props", () => {
  describe("the scope", () => {
    it("is a getter on the prototype over one frozen object, not an own prop of the box", () => {
      const box = builtBoxOf()
      expect(Object.getOwnPropertyDescriptor(box, 'scope')).to.be.undefined
      expect(Object.getOwnPropertyDescriptor(Storable.prototype, 'scope')).to.have.property('get').that.is.a('function')
      expect(box.scope).to.eq(box.scope)
      expect(Object.isFrozen(box.scope)).to.be.true
      expect(box.scope).to.deep.equal(world.mw.boxscope('anthropic_api_key'))
      expect(Object.keys(box)).to.not.include('scope')
      expect(JSON.stringify(box)).to.not.contain('"scope"')
    })

    it("is copied onto the box as own props that cannot be assigned or deleted", () => {
      const box = builtBoxOf()
      for (const ckey of ['user_id', 'banklabel', 'vaultlabel', 'boxlabel'] as const) {
        const descriptor = Object.getOwnPropertyDescriptor(box, ckey)
        expect(descriptor, ckey).to.include({ enumerable: true, writable: false, configurable: false })
        expect(descriptor?.value, ckey).to.eq(box.scope[ckey])
        expect(Reflect.set(box, ckey, 'other'), ckey).to.be.false
        expect(Reflect.deleteProperty(box, ckey), ckey).to.be.false
        expect(box[ckey], ckey).to.eq(descriptor?.value)
      }
    })
  })

  describe("the record props: revision_tok, revision_seq, written_at and vault_tok", () => {
    const writable = ['vault_tok', 'revision_tok', 'revision_seq', 'written_at'] as const

    it("start as the record the box was received with", () => {
      const box = builtBoxOf(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-a4', written_at: T0 + 40 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a4', revision_seq: 4, written_at: T0 + 40 })
    })

    it("are enumerable own props that are not configurable", () => {
      const box = builtBoxOf()
      for (const ckey of writable) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, configurable: false })
      }
    })

    it("are plain assigned props for the revision and written_at, writable, and sealed with the rest of the box", () => {
      const box = builtBoxOf()
      expect(Object.isSealed(box)).to.be.true
      for (const ckey of ['revision_tok', 'revision_seq', 'written_at', 'registered_at'] as const) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, writable: true, configurable: false })
      }
    })

    it("follow a newer record received", () => {
      const box = builtBoxOf()
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 1000 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("follow a received tombstone", () => {
      const box = builtBoxOf()
      box.listing.deliverRecord(world.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 1000 }))
      expect(box.isPresent).to.be.false
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("keep the vault_tok of birth, which no received record changes", () => {
      const box = builtBoxOf(tombstoneBoxRecord())
      const { scope } = box
      TH.expectSyncRefusal(() => box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', vault_tok: 'vault-tok-u2' })))
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(Object.getOwnPropertyDescriptor(box, 'vault_tok')).to.include({ writable: false, configurable: false })
      expect(box.scope).to.eq(scope)
      expect(box.scope).to.deep.equal(world.mw.boxscope('anthropic_api_key'))
    })

    it("do not change when an older record is received", () => {
      const box = builtBoxOf(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3', written_at: T0 + 30 }))
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a3', revision_seq: 3, written_at: T0 + 30 })
    })

    it("follow the record a put writes, which is one revision on, written now", async () => {
      const box = builtBoxOf()
      world.mw.setNow(T0 + 500)
      await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(followingPropsOf(box)).to.include({ revision_tok: box._cheat_central.revision_tok, revision_seq: 2 })
    })

    it("follow the tombstone a del writes, once the VaultDB answers", async () => {
      const box = builtBoxOf()
      world.mw.setNow(T0 + 500)
      const { entered, release, sentTok } = pendingNextDel(box)
      const deleting = box.del(box.scope)
      await entered
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a1', revision_seq: 1, written_at: T0 })
      release()
      await deleting
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: sentTok(), revision_seq: 2, written_at: T0 + 500 })
    })
  })
})

describe("Storable forms", () => {
  describe("toJSON", () => {
    it("is the sparse form of central, with no sidecar and none of the sealed parts", () => {
      const box = builtBoxOf()
      expect(box.toJSON()).to.deep.equal(box.sparse)
      expect(box.sparse).to.deep.equal(world.mw.sparseBoxRecord())
      expect(JSON.stringify(box)).to.eq(JSON.stringify(world.mw.sparseBoxRecord()))
      expect(Object.keys(box.toJSON())).to.not.include.members(['sidecar', 'box_key_wrapped', 'whisper_ciphered'])
    })

    it("is the tombstone's sparse form for a gone box, which has no sidecar either", () => {
      const gone = world.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
      const box = builtBoxOf(gone)
      expect(box.toJSON()).to.deep.equal(gone)
      expect(box.toJSON()).to.not.have.property('sidecar')
    })
  })
})

describe("Storable snapshot and subscription", () => {
  describe("getSnapshot", () => {
    it("returns the same frozen object on every call", () => {
      const box = builtBoxOf()
      const first = box.getSnapshot()
      expect(Object.isFrozen(first)).to.be.true
      expect(box.getSnapshot()).to.eq(first)
      expect(box.snapshot).to.eq(first)
    })

    it("is a stable function that returns the current snapshot", async () => {
      const box = builtBoxOf()
      expect(box.getSnapshot).to.eq(box.getSnapshot)
      const { getSnapshot } = box
      const first = getSnapshot()
      await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'changed' } })
      expect(getSnapshot()).to.not.eq(first)
      expect(getSnapshot()).to.eq(box.snapshot)
    })

    it("keeps the same object until an align changes it, and the old one stays as it was", () => {
      const box = builtBoxOf()
      const first = box.getSnapshot()
      box.align()
      expect(box.getSnapshot()).to.eq(first)
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', sidecar: { note: 'two' } }))
      const second = box.getSnapshot()
      expect(second).to.not.eq(first)
      expect(Object.isFrozen(second)).to.be.true
      expect(second).to.include({ revision_seq: 2, revision_tok: 'rev-a2' })
      expect(first).to.include({ revision_seq: 1, revision_tok: 'rev-a1' })
      expect(box.getSnapshot()).to.eq(second)
    })

    it("notifies nobody of a change before its first call", () => {
      const { mw } = world
      const box = new TestableBox(mw.world, boxListingOf(mw), mw.fullBoxRecord())
      const listener = vi.fn()
      box.subscribe(listener)
      box.receiveRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })

    it("returns the snapshot becomeNotifiable made, and the next change notifies", () => {
      const { mw } = world
      const box = new TestableBox(mw.world, boxListingOf(mw), mw.fullBoxRecord())
      const listener = vi.fn()
      box.subscribe(listener)
      expect(box.becomeNotifiable()).to.eq(box)
      const made = box.getSnapshot()
      expect(box.becomeNotifiable().getSnapshot()).to.eq(made)
      box.receiveRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(1)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })
  })

  describe("align", () => {
    it("changes nothing when there is nothing to align", () => {
      const box = builtBoxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.align()
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies nobody when a receive only confirms the record it already has", () => {
      const box = builtBoxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.listing.deliverRecord(fullBoxRecord())
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies every listener once when it changes the snapshot", () => {
      const box = builtBoxOf()
      box.getSnapshot()
      const [one, other] = [vi.fn(), vi.fn()]
      box.subscribe(one)
      box.subscribe(other)
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(one.mock.calls).to.have.lengthOf(1)
      expect(other.mock.calls).to.have.lengthOf(1)
    })

    it("updates the snapshot before it calls each listener", () => {
      const box = builtBoxOf()
      box.getSnapshot()
      const seen: number[] = []
      box.subscribe(() => { seen.push(box.getSnapshot().revision_seq) })
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(seen).to.deep.equal([2])
    })

    it("notifies on a put and on a del, each a change", async () => {
      const box = builtBoxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      await box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })
      const afterEdit = listener.mock.calls.length
      expect(afterEdit).to.be.greaterThan(0)
      await box.del(box.scope)
      expect(listener.mock.calls.length).to.be.greaterThan(afterEdit)
      expect(box.getSnapshot().isPresent).to.be.false
    })
  })

  describe("subscribe", () => {
    it("is a stable function that returns an unsubscribe", () => {
      const box = builtBoxOf()
      expect(box.subscribe).to.eq(box.subscribe)
      expect(box.subscribe(() => undefined)).to.be.a('function')
    })

    it("stops telling a listener once it unsubscribes, and leaves the others be", () => {
      const box = builtBoxOf()
      box.getSnapshot()
      const [leaving, staying] = [vi.fn(), vi.fn()]
      const unsubscribe = box.subscribe(leaving)
      box.subscribe(staying)
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      unsubscribe()
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3' }))
      expect(leaving.mock.calls).to.have.lengthOf(1)
      expect(staying.mock.calls).to.have.lengthOf(2)
    })

    it("treats a second unsubscribe as a no-op", () => {
      const box = builtBoxOf()
      box.getSnapshot()
      const [leaving, staying] = [vi.fn(), vi.fn()]
      const unsubscribe = box.subscribe(leaving)
      box.subscribe(staying)
      unsubscribe()
      unsubscribe()
      box.listing.deliverRecord(world.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(leaving.mock.calls).to.have.lengthOf(0)
      expect(staying.mock.calls).to.have.lengthOf(1)
    })
  })
})

describe("Storable put guards: ensurePuttable, demandPuttable", () => {
  const Patch = { whisper: { apiKey: 'sk-test-0000' } }

  it("demandPuttable returns the parsed patch while unlocked, and refuses 'bank_locked' while locked", () => {
    const box = builtBoxOf()
    expect(box.demandPuttable({ ...box.scope, sidecar: { note: 'sent' } })).to.deep.include({ sidecar: { note: 'sent' } })
    world.mw.setLocked(true)
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'bank_locked')
  })

  it("demandPuttable refuses a bad patch first, whether locked or over a record not whole", () => {
    const box = boxListingOf(world.mw).deliverRecord(sparseBoxRecord())
    world.mw.setLocked(true)
    TH.expectSyncRefusal(() => box.demandPuttable({}))
    TH.expectSyncRefusal(() => box.demandPuttable({ ...Patch, boxlabel: 'openai_api_key' }))
  })

  it("demandPuttable refuses a vacated box before a locked vault, and a locked vault before a sparse record", () => {
    const box = boxListingOf(world.mw).deliverRecord(sparseBoxRecord())
    TH.expectSyncRefusal(() => box.demandPuttable(Patch))
    world.mw.setLocked(true)
    TH.expectSyncRefusal(() => box.demandPuttable(Patch), 'bank_locked')
    box.vacate()
    TH.expectSyncRefusal(() => box.demandPuttable(Patch))
  })

  it("demandPuttable accepts a patch of both halves over a sparse record", () => {
    const box = boxListingOf(world.mw).deliverRecord(sparseBoxRecord())
    const Both = { ...Patch, sidecar: { note: 'sent' } }
    expect(box.demandPuttable(Both)).to.deep.include(Both)
    world.mw.setLocked(true)
    TH.expectSyncRefusal(() => box.demandPuttable(Both), 'bank_locked')
  })

  it("demandPuttable under ifPresent 'fail' refuses a whole record, saying its data would be recycled", () => {
    const box = boxListingOf(world.mw).deliverRecord(fullBoxRecord())
    const err = TH.expectSyncRefusal(() => box.demandPuttable({ ...fullBoxRecord() }, { ifPresent: 'fail' }))
    expect(err.message).to.eq(Phrases.RecordForNewBox)
    expect(box.demandPuttable({ ...fullBoxRecord() })).to.deep.include({ sidecar: fullBoxRecord().sidecar })
    expect(box.demandPuttable(Patch, { ifPresent: 'fail' })).to.deep.include(Patch)
  })

  it("demandPuttable accepts a patch over a void record and over a tombstone", () => {
    const listing = boxListingOf(world.mw)
    const shell = listing.puttable(world.mw.boxscope('anthropic_api_key'))
    expect(shell.demandPuttable(Patch)).to.deep.include(Patch)
    const tomb = listing.deliverRecord(world.mw.tombstoneBoxRecord({ boxlabel: 'openai_api_key' }))
    expect(tomb.demandPuttable(Patch)).to.deep.include(Patch)
    expect(world.mw.callsOf('get')).to.deep.equal([])
  })

  it("ensurePuttable resolves while the vault is locked", async () => {
    const box = builtBoxOf()
    world.mw.setLocked(true)
    await expect(box.ensurePuttable({ whisper: { apiKey: 'sk-test-0000' } })).resolves.to.eq(box)
    await TH.expectRefusal(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: {} }), 'bank_locked')
  })

  it("put calls ensurePuttable once, and a bad patch puts nothing", async () => {
    const box = builtBoxOf()
    const putGuard = vi.spyOn(Box.prototype, 'ensurePuttable')
    await TH.expectRefusal(box.put({}))
    expect(putGuard).toHaveBeenCalledOnce()
    expect(world.mw.callsOf('put')).to.deep.equal([])
    putGuard.mockClear()
    await expect(box.put({ whisper: { apiKey: 'sk-test-0000' }, sidecar: { note: 'sent' } })).resolves.to.eq(box)
    expect(putGuard).toHaveBeenCalledOnce()
  })
})

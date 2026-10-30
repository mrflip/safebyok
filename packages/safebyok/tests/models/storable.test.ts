import { describe, expect, it, vi } from 'vitest'
import type { Box } from '../../src/models/box'
import { Storable } from '../../src/models/storable'
import type { BoxRecord, BoxSparse, Fetched } from '../../src/models/models-shapes'
import { type BoxAnswer, boxListingOf, fullBoxRecord, tombstoneBoxRecord, T0, useModelsWorld } from '../test-helpers/models-world'

const held = useModelsWorld()

/** A box holding `record` (the full box record `anthropic_api_key` at revision 1, by default) as received, through a listing over the test world. */
const boxOf = (record: Fetched<BoxRecord, BoxSparse> = fullBoxRecord()): Promise<Box> => boxListingOf(held.mw).build(record)

/** The own props that follow the record in hand, as the box holds them now. */
const followingPropsOf = (box: Box) => ({ vault_tok: box.vault_tok, revision_tok: box.revision_tok, revision_seq: box.revision_seq, written_at: box.written_at })

/** Script the store's next `del` to hold until `release`, answering `tombstone`; `entered` resolves once the store has the call. The fake timers stay where they are: `vi.waitFor` would move them. */
const holdNextDel = (box: Box, tombstone: ReturnType<typeof tombstoneBoxRecord>): { entered: Promise<void>, release: () => void } => {
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

describe("Storable snapshot and subscription", () => {
  describe("getSnapshot", () => {
    it("answers one frozen object, the same one again and again", async () => {
      const box = await boxOf()
      const first = box.getSnapshot()
      expect(Object.isFrozen(first)).to.be.true
      expect(box.getSnapshot()).to.eq(first)
      expect(box.snapshot).to.eq(first)
    })

    it("is one function with one identity, as useSyncExternalStore wants it, answering the snapshot as it stands", async () => {
      const box = await boxOf()
      expect(box.getSnapshot).to.eq(box.getSnapshot)
      const { getSnapshot } = box
      const first = getSnapshot()
      await box.edit({ sidecar: { note: 'changed' } })
      expect(getSnapshot()).to.not.eq(first)
      expect(getSnapshot()).to.eq(box.snapshot)
    })

    it("keeps the same object until a settle changes it, and the old one stays as it was", async () => {
      const box = await boxOf()
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

    it("is made on the first call, so that a settle before it has none to replace and tells nobody", async () => {
      const box = await boxOf()
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.include({ revision_seq: 2 })
    })
  })

  describe("settle", () => {
    it("notifies nobody when it changes nothing, and keeps the snapshot", async () => {
      const box = await boxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      expect(box.settle()).to.deep.equal({ badnews: [] })
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies nobody when a receive only confirms the record in hand", async () => {
      const box = await boxOf()
      const first = box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      box.receive(fullBoxRecord())
      expect(listener.mock.calls).to.have.lengthOf(0)
      expect(box.getSnapshot()).to.eq(first)
    })

    it("notifies every listener once when it changes the snapshot", async () => {
      const box = await boxOf()
      box.getSnapshot()
      const [one, other] = [vi.fn(), vi.fn()]
      box.subscribe(one)
      box.subscribe(other)
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(one.mock.calls).to.have.lengthOf(1)
      expect(other.mock.calls).to.have.lengthOf(1)
    })

    it("hands each listener the new snapshot to find, already in place when it is called", async () => {
      const box = await boxOf()
      box.getSnapshot()
      const seen: number[] = []
      box.subscribe(() => { seen.push(box.getSnapshot().revision_seq) })
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }))
      expect(seen).to.deep.equal([2])
    })

    it("notifies on an edit and on a del, each a change", async () => {
      const box = await boxOf()
      box.getSnapshot()
      const listener = vi.fn()
      box.subscribe(listener)
      await box.edit({ sidecar: { note: 'edited' } })
      const afterEdit = listener.mock.calls.length
      expect(afterEdit).to.be.greaterThan(0)
      await box.del()
      expect(listener.mock.calls.length).to.be.greaterThan(afterEdit)
      expect(box.getSnapshot().present).to.be.false
    })
  })

  describe("subscribe", () => {
    it("is one function with one identity, answering an unsubscribe", async () => {
      const box = await boxOf()
      expect(box.subscribe).to.eq(box.subscribe)
      expect(box.subscribe(() => undefined)).to.be.a('function')
    })

    it("stops telling a listener once it unsubscribes, and leaves the others be", async () => {
      const box = await boxOf()
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
      const box = await boxOf()
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

describe("Storable forms", () => {
  describe("toJSON", () => {
    it("is the sparse form of central, with no sidecar and none of the sealed parts", async () => {
      const box = await boxOf()
      expect(box.toJSON()).to.deep.equal(box.sparse)
      expect(box.sparse).to.deep.equal(held.mw.sparseBoxRecord())
      expect(JSON.stringify(box)).to.eq(JSON.stringify(held.mw.sparseBoxRecord()))
      expect(Object.keys(box.toJSON())).to.not.include.members(['sidecar', 'box_key_wrapped', 'whisper_ciphered'])
    })

    it("is the sparse form of central whatever is staged", async () => {
      const box = await boxOf()
      await box.edit({ sidecar: { note: 'staged only' } })
      expect(box.hasStaged).to.be.true
      expect(box.toJSON()).to.deep.equal(held.mw.sparseBoxRecord())
      expect(JSON.stringify(box)).to.not.contain('staged only')
    })

    it("is the tombstone's sparse form for a gone box, which has no sidecar either", async () => {
      const gone = held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' })
      const box = await boxOf(gone)
      expect(box.toJSON()).to.deep.equal(gone)
      expect(box.toJSON()).to.not.have.property('sidecar')
    })
  })

  describe("cacheable", () => {
    it("is the sparse form of central with central and the staged beside it, the staged null where nothing is staged", async () => {
      const box = await boxOf()
      expect(box.hasStaged).to.be.false
      expect(box.cacheable).to.deep.equal({ ...held.mw.sparseBoxRecord(), central: fullBoxRecord(), staged: null })
      expect(Object.isFrozen(box.cacheable)).to.be.true
    })

    it("carries the staged record, whole, once an edit has staged one; the sparse form stays central's", async () => {
      const box = await boxOf()
      held.mw.setNow(T0 + 500)
      await box.edit({ sidecar: { note: 'staged' } })
      const { staged, central, ...sparse } = box.cacheable
      expect(central).to.deep.equal(fullBoxRecord())
      expect(staged).to.include({ revision_seq: 2, written_at: T0 + 500, am: 'a' })
      expect(staged).to.have.property('sidecar').that.deep.equals({ note: 'staged' })
      expect(sparse).to.deep.equal(held.mw.sparseBoxRecord())
    })

    it("has no sidecar on the sparse form nor on a tombstone, central or staged", async () => {
      const full = await boxOf()
      const { staged, central, ...sparse } = full.cacheable
      expect(staged).to.be.null
      expect(central).to.have.property('sidecar')
      expect(sparse).to.not.have.property('sidecar')

      const gone = await boxOf(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      expect(gone.cacheable.central).to.not.have.property('sidecar')
      expect(gone.cacheable).to.not.have.property('sidecar')

      const damaged = await boxOf(held.mw.tombstoneBoxRecord({ revision_seq: 3, revision_tok: 'rev-d3' }, 'd'))
      expect(damaged.cacheable.central).to.not.have.property('sidecar')
      expect(damaged.cacheable).to.not.have.property('sidecar')

      await full.del()
      expect(full.hasStaged).to.be.false
      expect(full.cacheable.central).to.not.have.property('sidecar')
      expect(full.cacheable).to.not.have.property('sidecar')
    })

    it("is a staged tombstone, with no sidecar, while a del is in the store's hands", async () => {
      const box = await boxOf()
      const { entered, release } = holdNextDel(box, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2' }))
      const deleting = box.del()
      await entered
      expect(box.cacheable.staged).to.include({ am: 'x', revision_seq: 2 })
      expect(box.cacheable.staged).to.not.have.property('sidecar')
      expect(box.cacheable.central).to.deep.equal(fullBoxRecord())
      expect(box.getSnapshot().present).to.be.false
      release()
      await deleting
    })
  })
})

describe("Storable own props", () => {
  describe("the scope", () => {
    it("is a getter on the prototype over one frozen object, not an own prop of the box", async () => {
      const box = await boxOf()
      expect(Object.getOwnPropertyDescriptor(box, 'scope')).to.be.undefined
      expect(Object.getOwnPropertyDescriptor(Storable.prototype, 'scope')).to.have.property('get').that.is.a('function')
      expect(box.scope).to.eq(box.scope)
      expect(Object.isFrozen(box.scope)).to.be.true
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
      expect(Object.keys(box)).to.not.include('scope')
      expect(JSON.stringify(box)).to.not.contain('"scope"')
    })

    it("is tattooed on the box as its own props, which nothing writes or removes", async () => {
      const box = await boxOf()
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

  describe("the props that follow the record in hand: vault_tok, revision_tok, revision_seq, written_at", () => {
    const writable = ['vault_tok', 'revision_tok', 'revision_seq', 'written_at'] as const

    it("start as the record the box was received with", async () => {
      const box = await boxOf(fullBoxRecord({ revision_seq: 4, revision_tok: 'rev-a4', written_at: T0 + 40 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a4', revision_seq: 4, written_at: T0 + 40 })
    })

    it("are ordinary enumerable own props, but not configurable, so that nothing removes them", async () => {
      const box = await boxOf()
      for (const ckey of writable) {
        expect(Object.getOwnPropertyDescriptor(box, ckey), ckey).to.include({ enumerable: true, configurable: false })
      }
    })

    it("follow a newer record received", async () => {
      const box = await boxOf()
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 1000 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("follow a received tombstone", async () => {
      const box = await boxOf()
      box.receive(held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 1000 }))
      expect(box.isPresent).to.be.false
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 1000 })
    })

    it("follow the vault_tok of a record received under another vault_tok, and the scope does not", async () => {
      const box = await boxOf()
      const { scope } = box
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', vault_tok: 'vault-tok-u2' }))
      expect(box.vault_tok).to.eq('vault-tok-u2')
      expect(box.scope).to.eq(scope)
      expect(box.scope).to.deep.equal(held.mw.boxscope('anthropic_api_key'))
    })

    it("stay with the record in hand when an older record is received", async () => {
      const box = await boxOf(fullBoxRecord({ revision_seq: 3, revision_tok: 'rev-a3', written_at: T0 + 30 }))
      box.receive(held.mw.fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2', written_at: T0 + 20 }))
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-a3', revision_seq: 3, written_at: T0 + 30 })
    })

    it("follow the staged record after an edit, which is one revision on, written now; central is untouched", async () => {
      const box = await boxOf()
      held.mw.setNow(T0 + 500)
      await box.edit({ sidecar: { note: 'edited' } })
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      expect(box.vault_tok).to.eq('vault-tok-u1')
      expect(box.cacheable.central).to.deep.equal(fullBoxRecord())
      expect(followingPropsOf(box)).to.include({ revision_tok: box.cacheable.staged?.revision_tok, revision_seq: 2 })
    })

    it("follow a tombstone staged by a del while the store has it, and the stored tombstone once it answers", async () => {
      const box = await boxOf()
      held.mw.setNow(T0 + 500)
      const { entered, release } = holdNextDel(box, held.mw.tombstoneBoxRecord({ revision_seq: 2, revision_tok: 'rev-x2', written_at: T0 + 900 }))
      const deleting = box.del()
      await entered
      expect(box.revision_seq).to.eq(2)
      expect(box.revision_tok).to.not.eq('rev-a1')
      expect(box.written_at).to.eq(T0 + 500)
      release()
      await deleting
      expect(followingPropsOf(box)).to.deep.equal({ vault_tok: 'vault-tok-u1', revision_tok: 'rev-x2', revision_seq: 2, written_at: T0 + 900 })
      expect(box.hasStaged).to.be.false
    })
  })
})

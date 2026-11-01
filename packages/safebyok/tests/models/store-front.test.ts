import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import type { BoxRecord, BoxSparse, FoundRow, Notice } from '../../src/models/models-shapes'
import { type FrontedBoxStore, type RowSwap, StoreFront, localStoreFront } from '../../src/models/store-front'
import * as Scopepath from '../../src/scopepath'
import type { Boxscope } from '../../src/shapes/scopes'
import { type StringStore, memoryStore } from '../../src/string-store'
import * as TH from '../test-helpers'
import { boxListingOf, fullBoxRecord, sparseBoxRecord, tombstoneBoxRecord, useModelsWorld, T0 } from '../test-helpers/models-world'

const vaultScope = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
const bankScope = Object.freeze({ applabel: 'acme', user_id: 'u1' })
const boxscope = (boxlabel = 'anthropic_api_key'): Boxscope => ({ ...vaultScope, boxlabel })
const anthropic = boxscope()
const boxpath = Scopepath.box(anthropic)
const vaultpath = Scopepath.vault(vaultScope)
const Later = T0 + 5000

/** A local front over a fresh memory store, its tombstones stamped at {@link Later}, and the box store of the world's vault. */
const frontOf = (): { store: StringStore, front: StoreFront, boxes: FrontedBoxStore } => {
  const store = memoryStore()
  const front = localStoreFront({ store, clock: { now: () => Later } })
  return { store, front, boxes: front.boxStore(vaultScope) }
}

/** The row under {@link boxpath}, as JSON. */
const rowOf = (store: StringStore): unknown => {
  const text = store.get(boxpath)
  return text === null ? null : JSON.parse(text)
}

/** Each pending sweep and notice run out: a macrotask, after every microtask queued. */
const settle = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0) })

describe("localStoreFront", () => {
  it("refuses a store that is no StringStore, and a clock that is no clock, as 'bad_option'", () => {
    TH.expectSyncRefusal(() => localStoreFront({ store: {} as StringStore }), 'bad_option')
    TH.expectSyncRefusal(() => localStoreFront({ store: memoryStore(), clock: { now: 5 } as never }), 'bad_option')
  })

  it("answers nothing stored, with the vault's row as the world, as its example shows", async () => {
    const { store, boxes } = frontOf()
    expect(await boxes.get(anthropic)).to.deep.equal({ ok: true, val: null, scope: anthropic, world: null })
    store.put(vaultpath, JSON.stringify({ any: 'vault row' }))
    const { world } = await boxes.get(anthropic)
    expect(world).to.deep.equal({ any: 'vault row' })
  })

  it("answers a vault store's world as null, the bank's being its own", async () => {
    const { front } = frontOf()
    const { world } = await front.vaultStore(bankScope).get(vaultScope)
    expect(world).to.be.null
  })
})

describe("StoreFront's store: get", () => {
  it("answers a full record as stored, and a tombstone as stored", async () => {
    const { store, boxes } = frontOf()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    expect(await TH.expectGood(boxes.get(anthropic))).to.deep.equal(fullBoxRecord())
    store.put(boxpath, JSON.stringify(tombstoneBoxRecord({ revision_seq: 2 })))
    expect(await TH.expectGood(boxes.get(anthropic))).to.deep.equal(tombstoneBoxRecord({ revision_seq: 2 }))
  })

  const DamagedRows = [
    ["not json at all",                               'text that is no JSON'],
    [{ ...fullBoxRecord(), fmt: 4001 },               'a record of another format'],
    [sparseBoxRecord(),                               'a sparse form that is alive: a record missing its sealed parts'],
    [fullBoxRecord({ boxlabel: 'openai_api_key' }),   'a record of another scope than its scopepath'],
    [42,                                              'a number'],
  ] as const
  for (const [row, blurb] of DamagedRows) {
    it(`refuses ${blurb} by name, as 'damaged_box'`, async () => {
      const { store, boxes } = frontOf()
      store.put(boxpath, typeof row === 'string' ? row : JSON.stringify(row))
      const answer = await boxes.get(anthropic)
      await TH.expectBad(answer, 'damaged_box')
      expect(answer.scope).to.deep.equal(anthropic)
    })
  }

  it("refuses a damaged vault row as 'damaged_vault'", async () => {
    const { store, front } = frontOf()
    store.put(vaultpath, JSON.stringify({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }))
    await TH.expectBad(front.vaultStore(bankScope).get(vaultScope), 'damaged_vault')
  })

  it("refuses a scope outside the store's vault or bank as 'bad_scope', and a scope that fails its check too", async () => {
    const { front, boxes } = frontOf()
    await TH.expectRefusal(boxes.get({ ...anthropic, vaultlabel: 'work' }), 'bad_scope')
    await TH.expectRefusal(front.vaultStore(bankScope).get({ ...vaultScope, user_id: 'u2' }), 'bad_scope')
    await TH.expectRefusal(boxes.get({ ...anthropic, boxlabel: 'Not A Label' }), 'bad_scope')
    TH.expectSyncRefusal(() => front.boxStore({ ...vaultScope, vaultlabel: '' }), 'bad_scope')
  })
})

describe("StoreFront's store: put", () => {
  it("lands a first record over no row, keeping it exactly as given", async () => {
    const { store, boxes } = frontOf()
    const first = fullBoxRecord({ revision_seq: 0 })
    expect(await TH.expectGood(boxes.put(first, null))).to.deep.equal(first)
    expect(rowOf(store)).to.deep.equal(first)
  })

  it("lands the next revision over the row under the prior revision_tok", async () => {
    const { store, boxes } = frontOf()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    const next = fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })
    expect(await TH.expectGood(boxes.put(next, 'rev-a1'))).to.deep.equal(next)
    expect(rowOf(store)).to.deep.equal(next)
  })

  it("refuses a prior revision_tok over no row as 'stale_write', carrying nothing", async () => {
    const { store, boxes } = frontOf()
    const err = await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 2 }), 'rev-a1'), 'stale_write')
    expect(err.meta?.box_stored).to.be.null
    expect(store.scopepaths()).to.deep.equal([])
  })

  it("refuses a row under another revision_tok as 'stale_write', carrying the row, a tombstone included", async () => {
    const { store, boxes } = frontOf()
    const stored = tombstoneBoxRecord({ revision_seq: 3, revision_tok: 'rev-x3' })
    store.put(boxpath, JSON.stringify(stored))
    const overNull = await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 0 }), null), 'stale_write')
    expect(overNull.meta?.box_stored).to.deep.equal(stored)
    const overOther = await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 2 }), 'rev-a1'), 'stale_write')
    expect(overOther.meta?.box_stored).to.deep.equal(stored)
    expect(rowOf(store)).to.deep.equal(stored)
  })

  it("refuses a revision_seq other than the stored one's next as 'bad_record', storing nothing", async () => {
    const { store, boxes } = frontOf()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 3 }), 'rev-a1'), 'bad_record')
    expect(rowOf(store)).to.deep.equal(fullBoxRecord())
  })

  it("refuses a revision_seq that does not fit the prior revision_tok as 'bad_record', before reading", async () => {
    const { boxes } = frontOf()
    await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 1 }), null), 'bad_record')
    await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 0 }), 'rev-a1'), 'bad_record')
  })

  it("refuses a record that fails its check, or a prior revision_tok that is no tok, as 'bad_record'", async () => {
    const { boxes } = frontOf()
    await TH.expectRefusal(boxes.put({ ...fullBoxRecord(), box_tok: '' }, null), 'bad_record')
    await TH.expectRefusal(boxes.put(fullBoxRecord(), ''), 'bad_record')
  })

  it("refuses a damaged row as 'damaged_box', and stores nothing over it", async () => {
    const { store, boxes } = frontOf()
    store.put(boxpath, 'not json')
    await TH.expectBad(boxes.put(fullBoxRecord({ revision_seq: 0 }), null), 'damaged_box')
    expect(store.get(boxpath)).to.eq('not json')
  })
})

describe("StoreFront's store: del", () => {
  it("lands a tombstone at the next revision_seq under a fresh revision_tok, stamped by the front's clock", async () => {
    const { store, boxes } = frontOf()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    const tombstone = await TH.expectGood(boxes.del(anthropic, 'rev-a1'))
    const revision_tok = String(tombstone?.revision_tok)
    expect(revision_tok).to.not.eq('rev-a1')
    expect(tombstone).to.deep.equal({ ...sparseBoxRecord(), am: 'x', revision_seq: 2, revision_tok, written_at: Later })
    expect(rowOf(store)).to.deep.equal(tombstone)
  })

  it("lands nothing over no row with a null revision_tok, answering null", async () => {
    const { store, boxes } = frontOf()
    expect(await TH.expectGood(boxes.del(anthropic, null))).to.be.null
    expect(store.scopepaths()).to.deep.equal([])
  })

  it("refuses as a put does: a tok over no row, another tok, and a damaged row", async () => {
    const { store, boxes } = frontOf()
    const overNone = await TH.expectBad(boxes.del(anthropic, 'rev-a1'), 'stale_write')
    expect(overNone.meta?.box_stored).to.be.null
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    const overOther = await TH.expectBad(boxes.del(anthropic, 'rev-zz'), 'stale_write')
    expect(overOther.meta?.box_stored).to.deep.equal(fullBoxRecord())
    store.put(boxpath, 'not json')
    await TH.expectBad(boxes.del(anthropic, 'rev-a1'), 'damaged_box')
    expect(store.get(boxpath)).to.eq('not json')
  })
})

describe("StoreFront's store: delUnparsed", () => {
  it("removes a row that does not read, answering null", async () => {
    const { store, boxes } = frontOf()
    store.put(boxpath, 'not json')
    expect(await TH.expectGood(boxes.delUnparsed(anthropic))).to.be.null
    expect(store.get(boxpath)).to.be.null
  })

  it("leaves a row that reads, answering it, and answers null over no row", async () => {
    const { store, boxes } = frontOf()
    expect(await TH.expectGood(boxes.delUnparsed(anthropic))).to.be.null
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    expect(await TH.expectGood(boxes.delUnparsed(anthropic))).to.deep.equal(fullBoxRecord())
    expect(rowOf(store)).to.deep.equal(fullBoxRecord())
  })
})

describe("StoreFront's storage trouble", () => {
  it("rejects with a hook's refusal as it came, and anything else as 'storage_unavailable'", async () => {
    const store = memoryStore()
    const front = localStoreFront({ store: { ...store, get: () => { throw new Error('disk on fire') } } })
    await TH.expectRefusal(front.boxStore(vaultScope).get(anthropic), 'storage_unavailable')
    const revoked = localStoreFront({ store: { ...store, get: () => { throw new VaultError('identity_revoked', 'Signed out.') } } })
    await TH.expectRefusal(revoked.boxStore(vaultScope).get(anthropic), 'identity_revoked')
  })

  it("refuses rows answered in another number than asked as 'corrupt_record'", async () => {
    class ShortFront extends ProbeFront {
      protected override doGetRows(): Promise<readonly unknown[]> { return Promise.resolve([]) }
    }
    await TH.expectRefusal(new ShortFront().boxStore(vaultScope).get(anthropic), 'corrupt_record')
  })
})

/** A front whose hooks a test drives: rows in a map, a watch whose `onChange` and `onTrouble` the test rings. */
class ProbeFront extends StoreFront {
  readonly rows = new Map<string, unknown>()
  onChange: () => void = () => undefined
  onTrouble: (err: unknown) => void = () => undefined
  refusesRows: VaultError | null = null

  protected doGetRows(scopepaths: readonly string[]): Promise<readonly unknown[]> {
    if (this.refusesRows !== null) { return Promise.reject(this.refusesRows) }
    return Promise.resolve(scopepaths.map((scopepath) => this.rows.get(scopepath) ?? null))
  }

  protected doSwapRow(scopepath: string, swap: RowSwap): Promise<unknown> {
    const stored = this.rows.get(scopepath) ?? null
    const next = swap(stored)
    if (next === null) { this.rows.delete(scopepath) }
    if (next !== null && next !== undefined) { this.rows.set(scopepath, next) }
    return Promise.resolve(stored)
  }

  protected doFindRows(_prefix: string, isWithin: Scopepath.ScopepathPred): Promise<readonly FoundRow[]> {
    return Promise.resolve([...this.rows].filter(([scopepath]) => isWithin(scopepath)).map(([scopepath, row]) => ({ scopepath, row })))
  }

  protected override doWatch(_prefix: string, onChange: () => void, onTrouble: (err: unknown) => void): () => void {
    this.onChange = onChange
    this.onTrouble = onTrouble
    return () => { this.onChange = () => undefined }
  }
}

/** A watch of the world's vault's boxes through `front`, full records for the scopes in `full`: the notices it pushed, its `onChange` spy and its unwatch. */
const watchOf = (front: StoreFront, full: readonly Boxscope[] = []) => {
  const notices: Notice<BoxRecord, BoxSparse>[] = []
  const onChange = vi.fn()
  const onNotice = (notice: Notice<BoxRecord, BoxSparse>): Promise<void> => {
    notices.push(notice)
    return Promise.resolve()
  }
  const unwatch = front.boxStore(vaultScope).watch(onNotice, () => full, onChange)
  return { notices, onChange, unwatch }
}

describe("StoreFront's watch", () => {
  it("refuses an onNotice, fullFor or onChange that is no function as 'bad_option'", () => {
    const { boxes } = frontOf()
    TH.expectSyncRefusal(() => boxes.watch(() => Promise.resolve(), () => [], 'ring' as never), 'bad_option')
  })

  it("pushes nothing for the rows stored as it began, and a notice for each change after, full where fullFor names it and sparse elsewhere", async () => {
    const { store, front } = frontOf()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    store.put(vaultpath, JSON.stringify({ any: 'vault row' }))
    const { notices, onChange } = watchOf(front, [boxscope('openai_api_key')])
    await settle()
    expect(notices).to.deep.equal([])
    const openai = fullBoxRecord({ boxlabel: 'openai_api_key', revision_seq: 0, revision_tok: 'rev-o0' })
    store.put(Scopepath.box(openai), JSON.stringify(openai))
    await settle()
    expect(notices).to.deep.equal([{ record: openai, world: { any: 'vault row' } }])
    store.put(boxpath, JSON.stringify(fullBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' })))
    await settle()
    expect(notices.at(-1)).to.deep.equal({ record: sparseBoxRecord({ revision_seq: 2, revision_tok: 'rev-a2' }), world: { any: 'vault row' } })
    expect(onChange).not.toHaveBeenCalled()
  })

  it("rings onChange for a row that comes to not read, and for one that vanishes, sending no notice", async () => {
    const { store, front } = frontOf()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    const { notices, onChange } = watchOf(front)
    await settle()
    store.put(boxpath, 'not json')
    await settle()
    expect(onChange).toHaveBeenCalledTimes(1)
    store.del(boxpath)
    await settle()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(notices).to.deep.equal([])
  })

  it("rings onChange where the backend's watch fails, or a sweep is refused", async () => {
    const front = new ProbeFront()
    const { onChange } = watchOf(front)
    await settle()
    front.onTrouble(new Error('socket closed'))
    expect(onChange).toHaveBeenCalledTimes(1)
    front.refusesRows = new VaultError('identity_revoked', 'Signed out.')
    front.onChange()
    await settle()
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it("rings onChange on the next tick where the backend's watch throws as it starts", async () => {
    class ThrowingFront extends ProbeFront {
      protected override doWatch(): () => void { throw new Error('no socket') }
    }
    const { onChange } = watchOf(new ThrowingFront())
    expect(onChange).not.toHaveBeenCalled()
    await settle()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("rings and pushes nothing once unwatched", async () => {
    const front = new ProbeFront()
    const { notices, onChange, unwatch } = watchOf(front)
    await settle()
    const { onTrouble } = front
    unwatch()
    onTrouble(new Error('late'))
    front.rows.set(boxpath, fullBoxRecord())
    await settle()
    expect(onChange).not.toHaveBeenCalled()
    expect(notices).to.deep.equal([])
  })
})

describe("StoreFront behind a BoxListing", () => {
  const held = useModelsWorld({ fakeTimers: false })

  it("delivers a box a put landed elsewhere through the watch", async () => {
    const { store, boxes } = frontOf()
    const listing = boxListingOf(held.mw, { store: boxes })
    await listing.hello()
    store.put(boxpath, JSON.stringify(fullBoxRecord()))
    await settle()
    expect(listing.at(anthropic)?.revision_seq).to.eq(1)
    listing.goodbye()
  })

  it("fetches each box again when the watch fails, so a signed-out backend's 'identity_revoked' reaches onBadNews", async () => {
    const front = new ProbeFront()
    front.rows.set(boxpath, fullBoxRecord())
    const listing = boxListingOf(held.mw, { store: front.boxStore(vaultScope) })
    await listing.fetch(anthropic)
    await listing.hello()
    front.refusesRows = new VaultError('identity_revoked', 'Signed out.')
    front.onTrouble(new Error('socket closed'))
    await vi.waitFor(() => { expect(held.mw.badnews.map((news) => news.refusalkind)).to.include('identity_revoked') })
    listing.goodbye()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { Bank } from '../../src/models/bank'
import { Vault } from '../../src/models/vault'
import { type BadNews, type BoxUnsealed } from '../../src/shapes/shapes-bankish'
import { type BoxLabelpath, Lifeseq } from '../../src/shapes/primitives'
import { type BoxRecord, Shell, ThingFormat } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import { VaultMinder } from '../../src/minding/vault-minder'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { SortedVaultDB } from '../../src/storage/sorted-vault-db'
import type { GetAsk } from '../../src/shapes/shapes-asks'
import { refusedAnswerOf } from '../../src/storage/refused-answer'
import * as Phrases from '../../src/phrases'
import * as Throwers from '../../src/refusals/throwers'
import type { MinderEvent } from '../../src/shapes/shapes-minder'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The labelpath of the box the flows put. */
const Openai: BoxLabelpath = 'box/openai'

/** The scope of the Thing at `labelpath` in `bank`. */
function scopeAt<LabelpathT extends string>(bank: Bank, labelpath: LabelpathT) { return { ...bank.scope, labelpath } }

/** The rows of `bank`'s MemoryVaultDB, by labelpath, to plant a record as another device would, notifying no watch. */
function rowsOf(bank: Bank): Map<string, unknown> { return (bank.device.vaultDB as MemoryVaultDB)._cheat_things(bank.scope) }

/** Unseal the whole record `vault`'s minder gets of {@link Openai}, a box, or where it gets null, its tombstone. */
async function unsealedAt(vault: Vault): Promise<BoxUnsealed> {
  const scope  = scopeAt(vault.bank, Openai)
  const got    = await vault.minder.get(scope)
  const record = got ?? vault.minder.deadAt(scope)
  if (record === undefined) { throw new Error('no box is stored') }
  // A tombstone the minder got is whole, though its type admits the sparse one.
  return vault.bank.unsealBox(record as BoxRecord)
}

/** The design's put flow: get the box, add one to its count of apicalls, seal and put it over what it got, or over its labelpath where it got null. */
async function bumpApicalls(vault: Vault): Promise<BoxRecord> {
  const newest   = await vault.minder.get(scopeAt(vault.bank, Openai))
  const old      = (newest === null) ? null : await vault.bank.unsealBox(newest)
  const apicalls = Number(old?.whisper['apicalls'] ?? 0) + 1
  return vault.putBoxOnce(newest ?? Openai, { sidecar: { account: 'work' } }, { whisper: { ...TH.Whisper, apicalls } })
}

/** A vault of `bank` beside the one its device made, with a minder of its own, befriending the bank, that has not said `hello`. */
function vaultBesideOf(bank: Bank): Vault { return Vault.make(bank, VaultMinder.make({}, bank)) }

/** A SortedVaultDB of `bank`'s own over its device's vaultDB, for a minder beside the device's to hello. */
function sortedOf(bank: Bank): SortedVaultDB { return SortedVaultDB.make(bank.scope, { vaultDB: bank.device.vaultDB, makeThing: TH.makePlainThing }) }

describe("Vault.make(bank, minder)", () => {
  it("makes the vault of the bank's boxes, over the minder given, which waits for its hello", async () => {
    const { bank } = await TH.buildBornBank()
    const minder = VaultMinder.make({}, bank)
    const vault = Vault.make(bank, minder)
    expect(vault.bank).to.equal(bank)
    expect(vault.minder).to.equal(minder)
    expect(vault.minder.tryAt(scopeAt(bank, Openai))).to.include({ ok: false })
    expect(Object.isFrozen(vault)).to.be.true
  })

  it("refuses a swept bank", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.sweep()
    TH.expectSyncRefusal(() => Vault.make(bank, device.minder), 'disabled')
  })
})

/** A vault born on a device whose vaultDB counts the watches its minders stop, read as `unwatched.calls`. */
async function buildWatchedVault() {
  const vaultDB = new MemoryVaultDB()
  const watch   = vaultDB.watch.bind(vaultDB)
  const unwatched = vi.fn()
  vi.spyOn(vaultDB, 'watch').mockImplementation((...args) => {
    const unwatch = watch(...args)
    return () => { unwatched(); unwatch() }
  })
  const born = await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB }) })
  return { ...born, unwatched: unwatched.mock }
}

/** Each way to sweep a born vault's bank, by what is swept, and how many watches of the host's vaultDB it stops. */
const SweepCases: readonly (readonly [(born: TH.BornVault) => unknown, string, number])[] = [
  [(born) => born.bank.sweep(),   'its bank',   0],
  [(born) => born.device.sweep(), 'its device', 1],
]

describe("bank.sweep() and device.sweep(), over the vaults made on the bank", () => {
  for (const [sweepOf, blurb, unwatchCount] of SweepCases) {
    it(`sweep each vault when ${blurb} is swept: its cache emptied, telling each listener of the removal`, async () => {
      const born = await buildWatchedVault()
      const { bank, minder, vault, unwatched } = born
      vaultBesideOf(bank).minder.hello(sortedOf(bank))
      await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      const events: MinderEvent[] = []
      minder.listen((event) => { events.push(event) }, ThingFormat)
      sweepOf(born)
      expect(minder.at(scopeAt(bank, Openai))).to.be.undefined
      expect(minder.tryAt(scopeAt(bank, Openai))).to.include({ ok: false })
      expect(events.map(({ type }) => type)).to.include('removed')
      // A minder's goodbye ends its listen, and stops no watch. The device's minders share its SortedVaultDB's one watch, which only the device's sweep stops.
      expect(unwatched.calls).to.have.lengthOf(unwatchCount)
    })
  }

  it("leave each vault's minder to start again at a hello, on a vaultDB the host still has", async () => {
    const { bank, minder } = await TH.buildBornVault()
    await minder.get(scopeAt(bank, Openai))
    bank.sweep()
    minder.hello(sortedOf(bank))
    expect(await minder.get(scopeAt(bank, Openai))).to.be.null
  })

  it("go on past a watch whose stop throws, telling onBadNews", async () => {
    const vaultDB   = new MemoryVaultDB()
    const watch     = vaultDB.watch.bind(vaultDB)
    vi.spyOn(vaultDB, 'watch').mockImplementation((...args) => {
      const unwatch = watch(...args)
      return () => { unwatch(); throw new Error('a bug in the host') }
    })
    const onBadNews = vi.fn()
    const { bank, device } = await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB, onBadNews }) })
    vaultBesideOf(bank).minder.hello(sortedOf(bank))
    expect(() => device.sweep()).not.to.throw()
    expect(device.getSnapshot().bank).to.include({ stage: 'swept' })
    // The device's sweep stops its SortedVaultDB's watch, which its minders share; the vault beside's minder only ends its listen.
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews.mock.calls.map(([badNews]) => (badNews as BadNews).news.refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("tell the bank's subscribers once, and nothing after", async () => {
    const { bank, device } = await TH.buildBornVault()
    const listener = vi.fn()
    bank.subscribe(listener)
    bank.sweep()
    bank.lock()
    bank.dismissUnlock()
    await TH.expectRefusal(bank.ensureUnlocked(), 'disabled')
    device.sweep()
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe("the box flows, through a vault and its bank's MemoryVaultDB", () => {
  it("lists no boxes under the bank's root box, before any is put", async () => {
    const { minder } = await TH.buildBornVault()
    expect(await minder.list('box')).to.deep.include({ items: {}, gones: {} })
  })

  it("gets null for a box not stored, and its first put by labelpath cites the shell under the root box's life", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    expect(await minder.get(scopeAt(bank, Openai))).to.be.null
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(written.mock.calls[0]![0].cited).to.include({ revseq: -1, am: 'x', lifeseq: Shell.VoidLifeseq, lifepath: `${bank.rootBox.lifeseq}/${Shell.VoidLifeseq}` })
  })

  it("puts a box over its shell, and again over itself, each put unsealing what the one before sealed", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await bumpApicalls(vault)
    expect(first).to.include({ revseq: 0, am: 'a', lifepath: `${bank.rootBox.lifeseq}/${Lifeseq.ofLifenum(0)}` })
    await bumpApicalls(vault)
    const unsealed = await unsealedAt(vault)
    expect(unsealed).to.include({ revseq: 1, am: 'a' })
    expect(unsealed.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 2 })
    expect(await minder.list('box')).to.deep.include({ items: { openai: { lifeseq: Lifeseq.ofLifenum(0) } }, gones: {} })
  })

  it("deletes a box by its sealed tombstone, which unseals, is listed, and which a put brings back to life", async () => {
    const { vault, minder } = await TH.buildBornVault()
    await bumpApicalls(vault)
    await vault.delBoxOnce(Openai)
    const unsealed = await unsealedAt(vault)
    expect(unsealed).to.include({ am: 'x', lifeseq: Lifeseq.ofLifenum(1) })
    expect(unsealed.whisper).to.deep.equal({})
    expect(await minder.list('box')).to.deep.include({ items: {}, gones: { openai: { lifeseq: Lifeseq.ofLifenum(1) } } })

    const reborn = await bumpApicalls(vault)
    expect(reborn).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2) })
    const unsealedAgain = await unsealedAt(vault)
    expect(unsealedAgain.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 1 })
  })
})

describe("vault.tryPutBoxOnce(cited, patch, secrets)", () => {
  it("answers the stored box, already in its item", async () => {
    // tryPutBoxOnce @example
    const { bank, vault, minder } = await TH.buildBornVault()
    const { ok, val: box, err } = await vault.tryPutBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(ok).to.be.true
    expect(err).to.be.undefined
    expect(box).to.include({ labelpath: Openai, revseq: 0, am: 'a' })
    expect(minder.at(scopeAt(bank, Openai))).to.deep.equal(box!)
  })

  it("writes a put ask over the box it was given, cited sparse, in its bank's scope, tracking its roots", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const shell   = Shell.of(scopeAt(bank, Openai), bank.rootBox)
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    const box     = await TH.expectGood(vault.tryPutBoxOnce(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    expect(written).toHaveBeenCalledTimes(1)
    expect(written.mock.calls[0]![0]).to.deep.include({ ...bank.scope, op: 'put', labelpath: Openai, modelkind: 'box', cited: Thing.sparseOf(shell), record: box, track: TH.trackOf(bank.pickle(), bank.gate.pickle(), bank.rootBox) })
  })

  it("answers stale_write over an older revision, with the revision stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await bank.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    const answer = await vault.tryPutBoxOnce(Openai, {}, { whisper: TH.Whisper })
    await TH.expectBad(answer, 'stale_write')
    expect(answer).to.have.nested.property('dbhas.revtok', stored.revtok)
  })

  it("answers a refusal met before the write, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    bank.lock()
    await TH.expectBad(vault.tryPutBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectBad(vault.tryPutBoxOnce('gate' as never, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })
})

describe("vault.putBoxOnce(cited, patch, secrets)", () => {
  it("resolves a birth with the stored box already in its item", async () => {
    // putBoxOnce @example
    const { bank, vault, minder } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(box).to.include({ labelpath: Openai, revseq: 0, am: 'a' })
    expect(minder.at(scopeAt(bank, Openai))).to.deep.equal(box)
    expect(await bank.unsealBox(box)).to.deep.include({ whisper: TH.Whisper, sidecar: TH.Sidecar })
  })

  it("given a labelpath, writes over the newest revision cached, carrying over its sidecar", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const next = await vault.putBoxOnce(Openai, {}, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ revseq: 1 })
    expect(next.sidecar).to.deep.equal(TH.Sidecar)
    expect(minder.at(scopeAt(bank, Openai))).to.deep.equal(next)
  })

  it("given a labelpath with nothing cached, gets the newest revision to write over", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const other = vaultBesideOf(bank)
    other.minder.hello(sortedOf(bank))
    const next = await other.putBoxOnce(Openai, {}, { whisper: TH.Whisper })
    expect(next).to.include({ revseq: 1 })
    expect(other.minder.at(scopeAt(bank, Openai))).to.deep.equal(next)
  })

  it("refuses stale_write over an older revision, and writes nothing, the item left at the one stored", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await bank.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    expect(minder.at(scopeAt(bank, Openai))!).to.include({ revtok: first.revtok })
    await TH.expectRefusal(vault.putBoxOnce(Openai, {}, { whisper: TH.Whisper }), 'stale_write')
    expect(minder.at(scopeAt(bank, Openai))!).to.include({ revtok: stored.revtok })
    expect(rowsOf(bank).get(Openai)).to.include({ revtok: stored.revtok })
  })

  it("refuses a sparse cached newest record when the patch gives no sidecar", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await bank.sealBox(first, {}, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, stored)
    await minder.list('box')
    expect(minder.soonAt(scopeAt(bank, Openai))).to.include({ revtok: stored.revtok })
    await TH.expectRefusal(vault.putBoxOnce(Openai, {}, { whisper: TH.Whisper }), 'bad_record')
    expect(await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })).to.include({ revseq: 2 })
  })

  it("refuses a sparse cited box when the patch gives no sidecar, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(vault.putBoxOnce(Thing.sparseOf(first), {}, { whisper: TH.Whisper }), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })

  it("writes nothing of an unsealed box's whisper, cited or sealed", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await vault.putBoxOnce(await bank.unsealBox(first), {}, { whisper: { apiKey: 'sk-test-1111' } })
    expect(written).toHaveBeenCalledTimes(1)
    expect(written.mock.calls[0]![0].cited).to.deep.equal(Thing.sparseOf(first))
    expect(JSON.stringify(written.mock.calls)).to.not.include('sk-test-0000').and.not.include('sk-test-1111')
  })

  it("refuses without secrets, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, undefined as never), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })

  it("refuses a labelpath that is not a box's", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.putBoxOnce('gate' as never, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_record')
  })

  it("refuses the root box's labelpath, fetching and writing nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const fetched = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    const err = await TH.expectRefusal(vault.putBoxOnce('box', { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_record')
    expect(err.message).to.include(Phrases.VaultBoxIsRoot)
    expect(fetched).not.toHaveBeenCalled()
    expect(written).not.toHaveBeenCalled()
  })

  it("refuses while the bank is locked, or once its bank is swept, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    bank.lock()
    await TH.expectRefusal(vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    bank.sweep()
    await TH.expectRefusal(vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    expect(written).not.toHaveBeenCalled()
  })
})

describe("vault.tryDelBoxOnce(labelpath)", () => {
  it("answers the stored tombstone", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(await TH.expectGood(vault.tryDelBoxOnce(Openai))).to.include({ labelpath: Openai, am: 'x', revseq: box.revseq + 1 })
  })

  it("writes a del ask over the newest revision, cited sparse, in its bank's scope, tracking its roots", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const box       = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written   = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    const tombstone = await TH.expectGood(vault.tryDelBoxOnce(Openai))
    expect(written).toHaveBeenCalledTimes(1)
    expect(written.mock.calls[0]![0]).to.deep.include({ ...bank.scope, op: 'del', labelpath: Openai, modelkind: 'box', cited: Thing.sparseOf(box), record: tombstone, track: TH.trackOf(bank.pickle(), bank.gate.pickle(), bank.rootBox) })
  })

  it("answers a refusal for a box never stored, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await TH.expectBad(vault.tryDelBoxOnce(Openai), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })
})

describe("vault.delBoxOnce(labelpath)", () => {
  it("writes the tombstone over the newest revision: its item is null, and its dead record has the tombstone", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.delBoxOnce(Openai)
    expect(tombstone).to.include({ labelpath: Openai, am: 'x', revseq: box.revseq + 1 })
    expect(minder.at(scopeAt(bank, Openai))).to.be.null
    expect(minder.deadAt(scopeAt(bank, Openai))).to.deep.equal(tombstone)
  })

  it("refuses a box never stored, or already deleted", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.delBoxOnce(Openai), 'bad_record')
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await vault.delBoxOnce(Openai)
    await TH.expectRefusal(vault.delBoxOnce(Openai), 'bad_record')
  })
})

describe("vault.withWhisper(labelpath, fn)", () => {
  it("calls fn with the box unsealed, and resolves what fn resolves", async () => {
    // withWhisper @example
    const { vault } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const fn = vi.fn(({ whisper }: BoxUnsealed) => Promise.resolve(`asked with ${String(whisper['apiKey'])}`))
    expect(await vault.withWhisper(Openai, fn)).to.equal('asked with sk-test-0000')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn.mock.calls[0]![0]).to.deep.include({ labelpath: Openai, revtok: box.revtok, whisper: TH.Whisper, sidecar: TH.Sidecar })
  })

  it("resolves what a synchronous fn returns", async () => {
    const { vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(await vault.withWhisper(Openai, ({ sidecar }) => sidecar)).to.deep.equal(TH.Sidecar)
  })

  it("unseals the newest revision stored, where the minder has it only sparse", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await bank.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await minder.list('box')
    expect(minder.soonAt(scopeAt(bank, Openai))).to.include({ revtok: stored.revtok })
    expect(await vault.withWhisper(Openai, ({ whisper, revtok }) => ({ whisper, revtok }))).to.deep.equal({ whisper: { apiKey: 'sk-test-1111' }, revtok: stored.revtok })
  })

  it("unseals a box its vault has only listed, on an unlocked bank", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const other = vaultBesideOf(bank)
    other.minder.hello(sortedOf(bank))
    await other.minder.list('box')
    expect(await other.withWhisper(Openai, ({ whisper }) => whisper)).to.deep.equal(TH.Whisper)
  })

  it("unseals the item's revision where a newer sparse record of the same life is cached and storage answers no newer", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await bank.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await minder.list('box')
    rowsOf(bank).set(Openai, first)
    expect(await vault.withWhisper(Openai, ({ whisper, revtok }) => ({ whisper, revtok }))).to.deep.equal({ whisper: TH.Whisper, revtok: first.revtok })
    expect(minder.soonAt(scopeAt(bank, Openai))).to.include({ revtok: stored.revtok })
  })

  it("unseals the cached item where its get is refused", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await bank.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await minder.list('box')
    const asked = refuseGets(bank)
    expect(await vault.withWhisper(Openai, ({ whisper, revtok }) => ({ whisper, revtok }))).to.deep.equal({ whisper: TH.Whisper, revtok: first.revtok })
    expect(boxGetsOf(asked)).to.equal(1)
  })

  it("rejects with its get's own refusal where it is refused and nothing at all is cached for the box, never calling fn", async () => {
    const { bank, vault } = await TH.buildBornVault()
    refuseGets(bank)
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'storage_unavailable')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses 'stale_read' where its get is refused and only a sparse record of the box is cached, never calling fn", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const stored = await bank.sealBox(Shell.of(scopeAt(bank, Openai), bank.rootBox), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, stored)
    await minder.list('box')
    refuseGets(bank)
    expect(minder.at(scopeAt(bank, Openai))).toBeUndefined()
    expect(minder.soonAt(scopeAt(bank, Openai))).toBeDefined()
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'stale_read')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses 'stale_read' for a deleted box whose newer life is cached only sparse, never calling fn", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.delBoxOnce(Openai)
    const reborn = await bank.sealBox(tombstone, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, reborn)
    await minder.list('box')
    rowsOf(bank).set(Openai, tombstone)
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'stale_read')
    expect(minder.at(scopeAt(bank, Openai))).to.be.null
    expect(minder.deadAt(scopeAt(bank, Openai))).to.include({ revtok: tombstone.revtok })
    expect(fn).not.toHaveBeenCalled()
  })

  it("on a locked bank, wants an `unlock` gating, and calls fn once it lands", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const fn = vi.fn(({ whisper }: BoxUnsealed) => String(whisper['apiKey']))
    const using = vault.withWhisper(Openai, fn)
    expect(bank.getSnapshot().isUnlockWanted).to.be.true
    expect(fn).not.toHaveBeenCalled()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await using).to.equal('sk-test-0000')
    expect(bank.isUnlocked).to.be.true
  })

  it("on a locked bank, gets the box once, after the unlock lands", async () => {
    const onBadNews = vi.fn()
    const { bank, vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { onBadNews }) })
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const other = vaultBesideOf(bank)
    other.minder.hello(sortedOf(bank))
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    const using = other.withWhisper(Openai, ({ revseq }) => revseq)
    await vi.advanceTimersByTimeAsync(0)
    expect(boxGetsOf(asked)).to.equal(0)
    expect(bank.getSnapshot().isUnlockWanted).to.be.true
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await using).to.equal(0)
    expect(boxGetsOf(asked)).to.equal(1)
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("on a locked bank, waits for the unlock before it refuses 'absent_box' for a box never stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    bank.lock()
    const fn = vi.fn()
    const refused = TH.expectRefusal(vault.withWhisper(Openai, fn), 'absent_box')
    expect(bank.getSnapshot().isUnlockWanted).to.be.true
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    await refused
    expect(fn).not.toHaveBeenCalled()
  })

  it("resumes two calls on a locked bank after one unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const firstUsing  = vault.withWhisper(Openai, ({ revseq }) => revseq)
    const secondUsing = vault.withWhisper(Openai, ({ revseq }) => revseq + 1)
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await Promise.all([firstUsing, secondUsing])).to.deep.equal([0, 1])
  })

  it("rejects 'dismissed' when the unlock is dismissed, never calling fn", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const fn = vi.fn()
    const using = TH.expectRefusal(vault.withWhisper(Openai, fn), 'dismissed')
    bank.dismissUnlock()
    await using
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses once the device is swept, never calling fn", async () => {
    const { device, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    device.sweep()
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'disabled')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses 'absent_box' for a box never stored, and for one deleted, never calling fn", async () => {
    const { vault } = await TH.buildBornVault()
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'absent_box')
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await vault.delBoxOnce(Openai)
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'absent_box')
    expect(fn).not.toHaveBeenCalled()
  })

  it("rethrows what fn throws unchanged", async () => {
    const { vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const thrown = new Error('the host could not reach the model')
    await expect(vault.withWhisper(Openai, () => { throw thrown })).rejects.to.equal(thrown)
    await expect(vault.withWhisper(Openai, () => Promise.reject(thrown))).rejects.to.equal(thrown)
  })

  it("leaves no trace of the whisper in the minder's cache or a snapshot", async () => {
    const { bank, device, vault, minder } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const using = vault.withWhisper(Openai, () => 'done')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await using).to.equal('done')
    const traces = JSON.stringify([minder.at(scopeAt(bank, Openai)), minder.listingAt(scopeAt(bank, 'box')), bank.getSnapshot(), device.getSnapshot()])
    expect(traces).to.include(Openai).and.not.include('sk-test-0000')
  })

  it("refuses an fn that is not a function, or a labelpath that is not a box's, wanting no unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    bank.lock()
    await TH.expectRefusal(vault.withWhisper(Openai, undefined as never), 'bad_record')
    await TH.expectRefusal(vault.withWhisper(Openai, 'apiKey' as never), 'bad_record')
    await TH.expectRefusal(vault.withWhisper('gate' as never, () => undefined), 'bad_record')
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })

  it("refuses the root box's labelpath, wanting no unlock and fetching nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const fetched = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    bank.lock()
    const err = await TH.expectRefusal(vault.withWhisper('box', () => undefined), 'bad_record')
    expect(err.message).to.include(Phrases.VaultBoxIsRoot)
    expect(fetched).not.toHaveBeenCalled()
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })
})

describe("vault.withUnlockedWhisper(labelpath, fn)", () => {
  it("calls fn with the box unsealed on an unlocked bank, and resolves what fn resolves", async () => {
    // withUnlockedWhisper @example
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(bank.isUnlocked).to.be.true
    expect(await vault.withUnlockedWhisper(Openai, ({ whisper }) => `asked with ${String(whisper['apiKey'])}`)).to.equal('asked with sk-test-0000')
  })

  it("refuses 'bank_locked' on a locked bank, wanting no unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    const fn = vi.fn()
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, fn), 'bank_locked')
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
    expect(boxGetsOf(asked)).to.equal(0)
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses once the device is swept, never calling fn", async () => {
    const { device, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    device.sweep()
    const fn = vi.fn()
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, fn), 'disabled')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses 'absent_box' for a box never stored, never calling fn", async () => {
    const { vault } = await TH.buildBornVault()
    const fn = vi.fn()
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, fn), 'absent_box')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses an fn that is not a function, or a labelpath that is not a box's", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, undefined as never), 'bad_record')
    await TH.expectRefusal(vault.withUnlockedWhisper('gate' as never, () => undefined), 'bad_record')
  })
})

describe("vault.forceTimelyUnlocked(labelpath, opts)", () => {
  it("asks the vaultDB for a timely box under a staleTime of 0", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    await vault.forceTimelyUnlocked(Openai, { staleTime: 0 })
    expect(boxGetsOf(asked)).to.equal(1)
  })

  it("leaves a timely box unfetched under no staleTime of its own", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    await vault.forceTimelyUnlocked(Openai)
    expect(boxGetsOf(asked)).to.equal(0)
  })

  it("rejects 'dismissed' when the unlock is dismissed", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const forcing = TH.expectRefusal(vault.forceTimelyUnlocked(Openai), 'dismissed')
    bank.dismissUnlock()
    await forcing
  })

  it("rejects with the get's refusal, for a box with a cached item and for one with none", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    refuseGets(bank)
    await TH.expectRefusal(vault.forceTimelyUnlocked(Openai, { staleTime: 0 }), 'storage_unavailable')
    await TH.expectRefusal(vault.forceTimelyUnlocked('box/anthropic'), 'storage_unavailable')
  })

  it("rejects with the gating's refusal where the get is refused too", async () => {
    const { bank, vault } = await TH.buildBornVault()
    bank.lock()
    refuseGets(bank)
    const forcing = TH.expectRefusal(vault.forceTimelyUnlocked(Openai), 'dismissed')
    bank.dismissUnlock()
    await forcing
  })

  it("refuses a staleTime that is not one, or a labelpath that is not a box's, wanting no unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    bank.lock()
    await TH.expectRefusal(vault.forceTimelyUnlocked(Openai, { staleTime: -1 }), 'bad_record')
    await TH.expectRefusal(vault.forceTimelyUnlocked('gate' as never), 'bad_record')
    expect(bank.getSnapshot().isUnlockWanted).to.be.false
  })
})

/** How many of the gets `asked` saw were of the box at {@link Openai}. */
function boxGetsOf(asked: { mock: { calls: [GetAsk][] } }): number {
  return asked.mock.calls.filter(([ask]) => ask.labelpath === Openai).length
}

/** Make `bank`'s vaultDB refuse every get from now on, `storage_unavailable`, and return the spy that saw them. */
function refuseGets(bank: Bank) {
  const refusal = Throwers.storageUnavailable(new Error('connection refused'))
  return vi.spyOn(bank.device.vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, refusal)))
}


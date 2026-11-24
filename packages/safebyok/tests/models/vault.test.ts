import { describe, expect, it, vi } from 'vitest'
import { Bank } from '../../src/models/bank'
import { Box } from '../../src/models/box'
import { Vault } from '../../src/models/vault'
import { VaultTSQ } from '../../src/minding/vault-tsq'
import { type BadNews, type BoxUnsealed } from '../../src/shapes/shapes-bankish'
import type { LiveOf, TombstoneOf } from '../../src/shapes/shapes-sealers'
import { type BoxLabelpath, Lifeseq } from '../../src/shapes/primitives'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import { BoxChecks } from '../../src/shapes/shapes-thingkinds'
import { Thing } from '../../src/models/thing'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { GetAsk } from '../../src/shapes/shapes-asks'
import { refusedAnswerOf } from '../../src/storage/refused-answer'
import * as Phrases from '../../src/phrases'
import * as Throwers from '../../src/refusals/throwers'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The labelpath of the box the flows put. */
const Openai: BoxLabelpath = 'box/openai'

/** The lifeseqs of a box's first lives: live, gone, live again, gone again. Life 0 is the root box's too. */
const Life0 = Lifeseq.ofLifenum(0)
const Life1 = Lifeseq.ofLifenum(1)
const Life2 = Lifeseq.ofLifenum(2)
const Life3 = Lifeseq.ofLifenum(3)

/** The scope of the box at {@link Openai} in `bank`. */
function openaiScopeOf(bank: Bank) { return { ...bank.scope, labelpath: Openai } }

/** The rows of `bank`'s MemoryVaultDB, by labelpath, to plant a record as another device would, notifying no watch. */
function rowsOf(bank: Bank): Map<string, unknown> { return (bank.device.vaultDB as MemoryVaultDB)._cheat_things(bank.scope) }

/** The Thing `vault`'s device's world holds at {@link Openai}, or undefined for none. */
function boxAt(vault: Vault): Box | undefined {
  const thing = vault.bank.device.world.demandVaultMinder().thingAt(openaiScopeOf(vault.bank))
  return (thing instanceof Box) ? thing : undefined
}

/** What `vault`'s device's QueryClient keeps in the item of {@link Openai}. */
function itemAt(vault: Vault): unknown {
  return vault.bank.device.vaultTsqClient.getQueryData(VaultTSQ.itemQueryKeyOf(openaiScopeOf(vault.bank)))
}

/** Unseal the whole record `vault`'s box at {@link Openai} holds once its vault TSQ gets it: the live box or its tombstone. */
async function unsealedAt(vault: Vault): Promise<BoxUnsealed> {
  await vault.bank.device.vaultTSQ.getOnce(openaiScopeOf(vault.bank))
  const record = boxAt(vault)?.pickle()
  if (record === undefined) { throw new Error('no box is stored') }
  // A tombstone the vaultDB answered is whole, though its type admits the shell.
  return vault.unsealBox(record as BoxRecord)
}

/** The design's put flow: get the box, add one to its count of apicalls, seal and put it over what it got, or over its labelpath where it got null. */
async function bumpApicalls(vault: Vault): Promise<LiveOf<BoxRecord>> {
  const newest   = await vault.bank.device.vaultTSQ.getOnce(openaiScopeOf(vault.bank)) as LiveOf<BoxRecord> | null
  const old      = (newest === null) ? null : await vault.unsealBox(newest)
  const apicalls = Number(old?.whisper['apicalls'] ?? 0) + 1
  return vault.putBoxOnce(newest ?? Openai, { sidecar: { account: 'work' } }, { whisper: { ...TH.Whisper, apicalls } })
}

/** Have `bank`'s vaultDB answer each write with a `read_tc` that is no time code, which the box's Thing refuses as it is told. */
function answerWritesUntimed(bank: Bank): void {
  const { vaultDB } = bank.device
  const write = vaultDB.tryWriteThing.bind(vaultDB)
  vi.spyOn(vaultDB, 'tryWriteThing').mockImplementation(async (ask) => ({ ...(await write(ask)), read_tc: crypto.randomUUID() }))
}

/** The vault of a second device signed in to `bank`'s bank over the same vaultDB, unlocked, which has seen no box. */
async function buildVaultBeside(bank: Bank): Promise<Vault> {
  const device = TH.makeDevice({}, { vaultDB: bank.device.vaultDB })
  await device.signin(TH.WorldScope.userid)
  await device.bank!.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
  return device.vault!
}

describe("Vault.make(bank, vaultTSQ)", () => {
  it("makes the vault of the bank's boxes, over the vault TSQ given", async () => {
    const { bank, device } = await TH.buildBornBank()
    const vault = Vault.make(bank, device.vaultTSQ)
    expect(vault.bank).to.equal(bank)
    expect(Object.isFrozen(vault)).to.be.true
  })

  it("refuses a swept bank", async () => {
    const { bank, device } = await TH.buildBornBank()
    bank.sweep()
    TH.expectSyncRefusal(() => Vault.make(bank, device.vaultTSQ), 'disabled')
  })
})

/** A vault born on a device whose vaultDB counts the watches stopped, read as `unwatched.calls`. */
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
    it(`sweep each vault when ${blurb} is swept: the vault TSQ hears no more`, async () => {
      const born = await buildWatchedVault()
      const { bank, vault, unwatched } = born
      const first  = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      const stored = await vault.sealBox(first, {}, { whisper: TH.Whisper })
      sweepOf(born)
      rowsOf(bank).set(Openai, stored)
      await bank.device.world.demandVaultMinder().tryGetOnce(openaiScopeOf(bank))
      expect(boxAt(vault)).to.include({ revtok: stored.revtok })
      expect(itemAt(vault)).to.deep.equal(first)
      // The device's VaultMinder has the one watch, which only the device's sweep stops.
      expect(unwatched.calls).to.have.lengthOf(unwatchCount)
    })
  }

  it("go on past a watch whose stop throws, telling onBadNews", async () => {
    const vaultDB   = new MemoryVaultDB()
    const watch     = vaultDB.watch.bind(vaultDB)
    vi.spyOn(vaultDB, 'watch').mockImplementation((...args) => {
      const unwatch = watch(...args)
      return () => { unwatch(); throw new Error('a bug in the host') }
    })
    const onBadNews = vi.fn()
    const { device } = await TH.buildBornVault({ device: TH.makeDevice({}, { vaultDB, onBadNews }) })
    expect(() => device.sweep()).not.to.throw()
    expect(device.world.getSnapshot()).to.include({ stage: 'swept' })
    await TH.eventually(() => onBadNews.mock.calls.length === 1)
    expect(onBadNews.mock.calls.map(([badNews]) => (badNews as BadNews).news.refusalkind)).to.deep.equal(['unexpected_error'])
  })

  it("tell the world's subscribers once, and nothing after", async () => {
    const { bank, device } = await TH.buildBornVault()
    const listener = vi.fn()
    bank.device.world.subscribe(listener)
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
    const { vaultTSQ } = await TH.buildBornVault()
    expect(await vaultTSQ.listOnce('box')).to.deep.include({ items: {}, gones: {} })
  })

  it("gets null for a box not stored, and its first put by labelpath cites the shell under the root box's life", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    expect(await vaultTSQ.getOnce(openaiScopeOf(bank))).to.be.null
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(written.mock.calls[0]![0].cited).to.include({ revseq: -1, am: 'x', lifeseq: Shell.VoidLifeseq, lifepath: `${bank.rootBox.lifeseq}/${Shell.VoidLifeseq}` })
  })

  it("puts a box over its shell, and again over itself, each put unsealing what the one before sealed", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    const first = await bumpApicalls(vault)
    expect(first).to.include({ revseq: 0, am: 'a', lifepath: `${bank.rootBox.lifeseq}/${Life0}` })
    await bumpApicalls(vault)
    const unsealed = await unsealedAt(vault)
    expect(unsealed).to.include({ revseq: 1, am: 'a' })
    expect(unsealed.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 2 })
    expect(await vaultTSQ.listOnce('box')).to.deep.include({ items: { openai: { lifeseq: Life0 } }, gones: {} })
  })

  it("deletes a box by its sealed tombstone, which unseals, is listed, and which a put brings back to life", async () => {
    const { vault, vaultTSQ } = await TH.buildBornVault()
    await bumpApicalls(vault)
    await vault.delBoxOnce(Openai)
    const unsealed = await unsealedAt(vault)
    expect(unsealed).to.include({ am: 'x', lifeseq: Life1 })
    expect(unsealed.whisper).to.deep.equal({})
    expect(await vaultTSQ.listOnce('box')).to.deep.include({ items: {}, gones: { openai: { lifeseq: Life1 } } })

    const reborn = await bumpApicalls(vault)
    expect(reborn).to.include({ am: 'a', lifeseq: Life2 })
    const unsealedAgain = await unsealedAt(vault)
    expect(unsealedAgain.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 1 })
  })
})

describe("vault.tryPutBoxOnce(cited, patch, secrets)", () => {
  it("answers the record stored, which its box then holds, and its item", async () => {
    // tryPutBoxOnce @example
    const { vault } = await TH.buildBornVault()
    const { ok, val: box, err } = await vault.tryPutBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(ok).to.be.true
    expect(err).to.be.undefined
    expect(box).to.include({ labelpath: Openai, revseq: 0, am: 'a' })
    expect(box).to.deep.equal(boxAt(vault)!.pickle())
    expect(itemAt(vault)).to.deep.equal(box)
  })

  it("writes a put ask over the box it was given, cited sparse, in its bank's scope, tracking its roots", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const shell   = Shell.of(openaiScopeOf(bank), bank.rootBox)
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    const box     = await TH.expectGood(vault.tryPutBoxOnce(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    expect(written).toHaveBeenCalledTimes(1)
    expect(written.mock.calls[0]![0]).to.deep.include({ ...bank.scope, op: 'put', labelpath: Openai, modelkind: 'box', cited: Thing.sparseOf(shell), record: box, track: TH.trackOf(bank.pickle(), bank.gate.pickle(), bank.rootBox) })
  })

  it("answers stale_write over an older revision, with the revision stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await vault.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    const answer = await vault.tryPutBoxOnce(Openai, {}, { whisper: TH.Whisper })
    await TH.expectBad(answer, 'stale_write')
    expect(answer).to.have.nested.property('dbhas.revtok', stored.revtok)
  })

  it("answers the refusal its box raises at the record its answer carries, though stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    answerWritesUntimed(bank)
    await TH.expectBad(vault.tryPutBoxOnce(Openai, {}, { whisper: TH.Whisper }), 'bad_record')
    expect(rowsOf(bank).get(Openai)).to.include({ revseq: 1 })
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
  it("resolves a birth with the record stored, which is its item", async () => {
    // putBoxOnce @example
    const { vault } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(box).to.include({ labelpath: Openai, revseq: 0, am: 'a' })
    expect(itemAt(vault)).to.deep.equal(box)
    expect(await vault.unsealBox(box)).to.deep.include({ whisper: TH.Whisper, sidecar: TH.Sidecar })
  })

  it("given a labelpath, writes over the newest revision seen, carrying over its sidecar", async () => {
    const { vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const next = await vault.putBoxOnce(Openai, {}, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ revseq: 1 })
    expect(next.sidecar).to.deep.equal(TH.Sidecar)
    expect(itemAt(vault)).to.deep.equal(next)
  })

  it("given a labelpath this device has seen nothing of, gets the newest revision to write over", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const other = await buildVaultBeside(bank)
    expect(boxAt(other)).to.be.undefined
    const next = await other.putBoxOnce(Openai, {}, { whisper: TH.Whisper })
    expect(next).to.include({ revseq: 1 })
    expect(next).to.deep.equal(boxAt(other)!.pickle())
  })

  it("refuses stale_write over an older revision, and writes nothing, the box then holding the one stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const firstRevtok = first.revtok
    const stored = await vault.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await TH.expectRefusal(vault.putBoxOnce(Openai, {}, { whisper: TH.Whisper }), 'stale_write')
    expect(firstRevtok).to.not.eq(stored.revtok)
    expect(boxAt(vault)).to.include({ revtok: stored.revtok })
    expect(rowsOf(bank).get(Openai)).to.include({ revtok: stored.revtok })
  })

  it("refuses over a newest revision seen only sparse when the patch gives no sidecar", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await vault.sealBox(first, {}, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, stored)
    await vaultTSQ.listOnce('box')
    expect(boxAt(vault)!.citable).to.include({ revtok: stored.revtok })
    await TH.expectRefusal(vault.putBoxOnce(Openai, {}, { whisper: TH.Whisper }), 'bad_record')
    expect(await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })).to.include({ revseq: 2 })
  })

  it("refuses a sparse cited box when the patch gives no sidecar, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    const cited = Thing.sparseOf(first)
    await TH.expectRefusal(vault.putBoxOnce(cited, {}, { whisper: TH.Whisper }), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })

  it("writes nothing of an unsealed box's whisper, cited or sealed", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await vault.putBoxOnce(await vault.unsealBox(first), {}, { whisper: { apiKey: 'sk-test-1111' } })
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
  it("answers the tombstone stored, which its box then holds", async () => {
    const { vault } = await TH.buildBornVault()
    const { revseq } = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await TH.expectGood(vault.tryDelBoxOnce(Openai))
    expect(tombstone).to.include({ labelpath: Openai, am: 'x', revseq: revseq + 1 })
    expect(tombstone).to.deep.equal(boxAt(vault)!.pickle())
  })

  it("writes a del ask over the newest revision, cited sparse, in its bank's scope, tracking its roots", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const box       = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written   = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    const tombstone = await TH.expectGood(vault.tryDelBoxOnce(Openai))
    expect(written).toHaveBeenCalledTimes(1)
    expect(written.mock.calls[0]![0]).to.deep.include({ ...bank.scope, op: 'del', labelpath: Openai, modelkind: 'box', cited: Thing.sparseOf(box), record: tombstone, track: TH.trackOf(bank.pickle(), bank.gate.pickle(), bank.rootBox) })
  })

  it("answers the refusal its box raises at the tombstone its answer carries, though stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    answerWritesUntimed(bank)
    await TH.expectBad(vault.tryDelBoxOnce(Openai), 'bad_record')
    expect(rowsOf(bank).get(Openai)).to.include({ am: 'x' })
  })

  it("answers a refusal for a box never stored, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
    await TH.expectBad(vault.tryDelBoxOnce(Openai), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })
})

describe("vault.delBoxOnce(labelpath)", () => {
  it("writes the tombstone over the newest revision: its item is null, and the box holds the tombstone", async () => {
    const { vault } = await TH.buildBornVault()
    const { revseq } = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.delBoxOnce(Openai)
    expect(tombstone).to.include({ labelpath: Openai, am: 'x', revseq: revseq + 1 })
    expect(itemAt(vault)).to.be.null
    expect(boxAt(vault)!.pickle()).to.deep.equal(tombstone)
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

  it("unseals the newest revision stored, where this device has seen it only sparse", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await vault.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await vaultTSQ.listOnce('box')
    expect(boxAt(vault)!.citable).to.include({ revtok: stored.revtok })
    expect(await vault.withWhisper(Openai, ({ whisper, revtok }) => ({ whisper, revtok }))).to.deep.equal({ whisper: { apiKey: 'sk-test-1111' }, revtok: stored.revtok })
  })

  it("unseals a box its device has only listed, on an unlocked bank", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const other = await buildVaultBeside(bank)
    await other.bank.device.vaultTSQ.listOnce('box')
    expect(boxAt(other)).to.include({ agekind: 'bare' })
    expect(await other.withWhisper(Openai, ({ whisper }) => whisper)).to.deep.equal(TH.Whisper)
  })

  it("unseals the revision it holds where a newer sparse record of the same life is seen and storage answers no newer", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const stored = await vault.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await vaultTSQ.listOnce('box')
    rowsOf(bank).set(Openai, first)
    expect(await vault.withWhisper(Openai, ({ whisper, revtok }) => ({ whisper, revtok }))).to.deep.equal({ whisper: TH.Whisper, revtok: first.revtok })
    expect(boxAt(vault)!.citable).to.include({ revtok: stored.revtok })
  })

  it("unseals the revision it holds where its get is refused", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const firstRevtok = first.revtok
    const stored = await vault.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    await vaultTSQ.listOnce('box')
    const asked = refuseGets(bank)
    expect(await vault.withWhisper(Openai, ({ whisper, revtok }) => ({ whisper, revtok }))).to.deep.equal({ whisper: TH.Whisper, revtok: firstRevtok })
    expect(boxGetsOf(asked)).to.equal(1)
  })

  it("rejects with its get's own refusal where it is refused and this device has seen nothing of the box, never calling fn", async () => {
    const { bank, vault } = await TH.buildBornVault()
    refuseGets(bank)
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'storage_unavailable')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses 'stale_read' where its get is refused and this device has seen the box only sparse, never calling fn", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    const stored = await vault.sealBox(Shell.of(openaiScopeOf(bank), bank.rootBox), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, stored)
    await vaultTSQ.listOnce('box')
    refuseGets(bank)
    expect(boxAt(vault)).to.include({ agekind: 'bare' })
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'stale_read')
    expect(fn).not.toHaveBeenCalled()
  })

  it("refuses 'stale_read' for a deleted box whose newer life is seen only sparse, never calling fn", async () => {
    const { bank, vault, vaultTSQ } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.delBoxOnce(Openai)
    const reborn = await vault.sealBox(tombstone, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, reborn)
    await vaultTSQ.listOnce('box')
    rowsOf(bank).set(Openai, tombstone)
    const fn = vi.fn()
    await TH.expectRefusal(vault.withWhisper(Openai, fn), 'stale_read')
    expect(boxAt(vault)).to.include({ agekind: 'bare', revtok: tombstone.revtok })
    const itemKey = VaultTSQ.itemQueryKeyOf(openaiScopeOf(bank))
    expect([itemAt(vault), bank.device.vaultTsqClient.getQueryState(itemKey)?.isInvalidated]).to.deep.equal([null, true])
    expect(fn).not.toHaveBeenCalled()
  })

  it("on a locked bank, wants an `unlock` gating, and calls fn once it lands", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const fn = vi.fn(({ whisper }: BoxUnsealed) => String(whisper['apiKey']))
    const using = vault.withWhisper(Openai, fn)
    expect(bank.device.world.getSnapshot().isUnlockWanted).to.be.true
    expect(fn).not.toHaveBeenCalled()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await using).to.equal('sk-test-0000')
    expect(bank.isUnlocked).to.be.true
  })

  it("on a locked bank, gets the box once, after the unlock lands", async () => {
    const onBadNews = vi.fn()
    const { bank, vault } = await TH.buildBornVault({ device: TH.makeDevice({}, { onBadNews }) })
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const other = await buildVaultBeside(bank)
    other.bank.lock()
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    const using = other.withWhisper(Openai, ({ revseq }) => revseq)
    await vi.advanceTimersByTimeAsync(0)
    expect(boxGetsOf(asked)).to.equal(0)
    expect(other.bank.device.world.getSnapshot().isUnlockWanted).to.be.true
    await other.bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await using).to.equal(0)
    expect(boxGetsOf(asked)).to.equal(1)
    expect(onBadNews).not.toHaveBeenCalled()
  })

  it("on a locked bank, waits for the unlock before it refuses 'absent_box' for a box never stored", async () => {
    const { bank, vault } = await TH.buildBornVault()
    bank.lock()
    const fn = vi.fn()
    const refused = TH.expectRefusal(vault.withWhisper(Openai, fn), 'absent_box')
    expect(bank.device.world.getSnapshot().isUnlockWanted).to.be.true
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

  it("leaves no trace of the whisper in the box, the device's QueryClient or a snapshot", async () => {
    const { bank, device, vault, vaultTSQ } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await vaultTSQ.listOnce('box')
    bank.lock()
    const using = vault.withWhisper(Openai, () => 'done')
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    expect(await using).to.equal('done')
    const kept   = device.vaultTsqClient.getQueryCache().getAll().map(({ state }) => state.data)
    const traces = JSON.stringify([boxAt(vault)!.pickle(), kept, device.world.getSnapshot()])
    expect(traces).to.include(Openai).and.not.include('sk-test-0000')
  })

  it("refuses an fn that is not a function, or a labelpath that is not a box's, wanting no unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    bank.lock()
    await TH.expectRefusal(vault.withWhisper(Openai, undefined as never), 'bad_record')
    await TH.expectRefusal(vault.withWhisper(Openai, 'apiKey' as never), 'bad_record')
    await TH.expectRefusal(vault.withWhisper('gate' as never, () => undefined), 'bad_record')
    expect(bank.device.world.getSnapshot().isUnlockWanted).to.be.false
  })

  it("refuses the root box's labelpath, wanting no unlock and fetching nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const fetched = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    bank.lock()
    const err = await TH.expectRefusal(vault.withWhisper('box', () => undefined), 'bad_record')
    expect(err.message).to.include(Phrases.VaultBoxIsRoot)
    expect(fetched).not.toHaveBeenCalled()
    expect(bank.device.world.getSnapshot().isUnlockWanted).to.be.false
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

  it("gets nothing for a box it holds the newest revision of", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    vi.advanceTimersByTime(2 * 60 * 60_000)
    expect(await vault.withUnlockedWhisper(Openai, ({ revseq }) => revseq)).to.equal(0)
    expect(boxGetsOf(asked)).to.equal(0)
  })

  it("refuses 'bank_locked' on a locked bank, wanting no unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    const asked = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
    const fn = vi.fn()
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, fn), 'bank_locked')
    expect(bank.device.world.getSnapshot().isUnlockWanted).to.be.false
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

  it("runs on the box it holds where storage is out of reach, the box's item showing the refusal beside its record", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const queryKey = VaultTSQ.itemQueryKeyOf(openaiScopeOf(bank))
    await bank.device.vaultTsqClient.invalidateQueries({ queryKey })
    const asked = refuseGets(bank)
    expect(await vault.withUnlockedWhisper(Openai, ({ whisper }) => String(whisper['apiKey']))).to.equal('sk-test-0000')
    expect(boxGetsOf(asked)).to.equal(1)
    expect(bank.device.vaultTsqClient.getQueryState(queryKey)).to.deep.include({ status: 'error', data: box })
    expect(bank.device.vaultTsqClient.getQueryState(queryKey)?.error).to.include({ refusalkind: 'storage_unavailable' })
  })

  it("rejects with any other refusal of the get, for a box it holds, never calling fn", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await bank.device.vaultTsqClient.invalidateQueries({ queryKey: VaultTSQ.itemQueryKeyOf(openaiScopeOf(bank)) })
    refuseGets(bank, Throwers.storageIssue())
    const fn = vi.fn()
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, fn), 'storage_issue')
    expect(fn).not.toHaveBeenCalled()
  })

  it("rejects with the get's refusal for a box it has seen nothing of", async () => {
    const { bank, vault } = await TH.buildBornVault()
    refuseGets(bank)
    await TH.expectRefusal(vault.withUnlockedWhisper(Openai, () => undefined), 'storage_unavailable')
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

  it("rejects with the get's refusal, for a box it holds and for one it has seen nothing of", async () => {
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
    expect(bank.device.world.getSnapshot().isUnlockWanted).to.be.false
  })
})

describe("a vault of a bank over the shell", () => {
  it("refuses a seal and an unseal, and its try forms resolve the refusal", async () => {
    const { device } = await TH.buildBornBank()
    const vault = Vault.make(Bank.make(TH.bankShellOf(), { device }), device.vaultTSQ)
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'absent_thing')
    await TH.expectRefusal(vault.unsealBox(TH.boxThingOf()), 'absent_thing')
    expect(await vault.trySealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })).to.deep.include({ ok: false })
    expect(await vault.tryUnsealBox(TH.boxThingOf())).to.deep.include({ ok: false })
  })
})

describe("vault.sealBox(donor, publicProps, secretProps) and vault.unsealBox(box)", () => {
  it("seals a new box over its shell: the first revision of its first life, born now", async () => {
    const { vault } = await TH.buildBornVault()
    vi.setSystemTime(TH.T0 + 7)
    const shell = TH.boxShellOf()
    const box = await vault.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(box).to.include({ labelpath: 'box/anthropic_api_key', am: 'a', revseq: 0, lifeseq: Life0, lifepath: `${Life0}/${Life0}`, born_at: TH.T0 + 7, written_at: TH.T0 + 7 })
    expect(box.revtok).to.not.eq(shell.revtok)
    expect(box.sidecar).to.deep.equal(TH.Sidecar)
    expect(box.whisper_sealed).to.include({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect(JSON.stringify(box)).to.not.include('sk-test-0000')
    expect(BoxChecks.record.parse(box)).to.deep.equal(box)
  })

  it("unseals the box's whisper in place of its sealed one", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const unsealed = await vault.unsealBox(box)
    const { whisper_sealed: _sealed, ...rest } = box
    expect(unsealed).to.deep.equal({ ...rest, whisper: TH.Whisper })
    expect(Object.isFrozen(unsealed)).to.be.true
  })

  it("seals the next revision of a live box, in the same life, from the stored box with a new sidecar", async () => {
    // sealBox @example
    const { vault } = await TH.buildBornVault()
    const first = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 9)
    const next = await vault.sealBox(first, { sidecar: { account: 'home' } }, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ lifeseq: first.lifeseq, lifepath: first.lifepath, born_at: first.born_at, revseq: 1, written_at: TH.T0 + 9, am: 'a' })
    expect(next.revtok).to.not.eq(first.revtok)
    expect(await vault.unsealBox(next)).to.deep.include({ whisper: { apiKey: 'sk-test-1111' }, sidecar: { account: 'home' } })
  })

  it("seals the same whisper differently each time: a fresh part key and cipher iv", async () => {
    const { vault } = await TH.buildBornVault()
    const shell = TH.boxShellOf()
    const one = await vault.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const two = await vault.sealBox(shell, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(one.whisper_sealed.ciphered.ciphertext_b64).to.not.eq(two.whisper_sealed.ciphered.ciphertext_b64)
    expect(one.whisper_sealed.key_wrapped.ciphertext_b64).to.not.eq(two.whisper_sealed.key_wrapped.ciphertext_b64)
  })

  it("unseals a box sealed before the bank locked and unlocked again", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    await bank.gate.unlock({ passphraseCleartext: TH.TestPassphrase })
    const { whisper } = await vault.unsealBox(box)
    expect(whisper).to.deep.equal(TH.Whisper)
  })

  // The seal leaves the sidecar out.
  it("unseals with its sidecar altered", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const unsealed = await vault.unsealBox({ ...box, sidecar: { account: 'home' } })
    expect(unsealed).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  // Each alteration still passes the box's check, so only the seal can catch it. The box's userid and banklabel are bound
  // too, but a box claiming another bank is refused before the unseal, below.
  const AlteredCases = [
    [(box: LiveOf<BoxRecord>) => ({ ...box, revtok: TH.OtherRevtok }),                          'its revtok'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, revseq: box.revseq + 1 }),                                             'its revseq'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, born_at: box.born_at + 1 }),                                           'its born_at'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, written_at: box.written_at + 1 }),                                     'its written_at'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, labelpath: 'box/openai_api_key', label: 'openai_api_key' }),           'its labelpath and label'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, lifeseq: Life2, lifepath: `${Life0}/${Life2}` }),                       'its lifeseq'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, codectag: 'json_v2' } }),     'its codectag'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, schematag: 'whisper_v2' } }), 'its schematag'],
  ] as const

  for (const [alter, blurb] of AlteredCases) {
    it(`refuses 'damaged_whisper' for a box with ${blurb} altered`, async () => {
      const { vault } = await TH.buildBornVault()
      const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(vault.unsealBox(alter(box)), 'damaged_whisper')
    })
  }

  const UncheckedCases = [
    [(box: LiveOf<BoxRecord>) => ({ ...box, fmt: 'a010502' }),                                                 'its fmt not its one value'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, am: 'd' }),                                                        'am d'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, label: 'openai_api_key' }),                                        'a label not the last of its labelpath'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, codectag: 'JSON v1' } }), 'a codectag that is not a label'],
    [(box: LiveOf<BoxRecord>) => ({ ...box, whisper_sealed: { ...box.whisper_sealed, extra: 'field' } }),      'a field no sealed part has'],
    [(box: LiveOf<BoxRecord>) => TH.omitting(box, 'whisper_sealed'),                                           'no sealed whisper'],
    [() => null,                                                                                       'null'],
  ] as const

  for (const [alter, blurb] of UncheckedCases) {
    it(`refuses a box with ${blurb}, before unsealing`, async () => {
      const { vault } = await TH.buildBornVault()
      const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(vault.unsealBox(alter(box) as never), 'bad_record')
    })
  }

  it("refuses 'damaged_whisper' for one box's sealed whisper on another box", async () => {
    const { vault } = await TH.buildBornVault()
    const one = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const two = await vault.sealBox(TH.boxShellOf({ labelpath: 'box/openai_api_key', label: 'openai_api_key' }), { sidecar: TH.Sidecar }, { whisper: { apiKey: 'sk-test-2222' } })
    await TH.expectRefusal(vault.unsealBox({ ...two, whisper_sealed: one.whisper_sealed }), 'damaged_whisper')
    await TH.expectRefusal(vault.unsealBox({ ...two, whisper_sealed: { ...two.whisper_sealed, ciphered: one.whisper_sealed.ciphered } }), 'damaged_whisper')
    await TH.expectRefusal(vault.unsealBox({ ...two, whisper_sealed: { ...two.whisper_sealed, key_wrapped: one.whisper_sealed.key_wrapped } }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for tampered ciphertext, quoting none of it", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const ciphertext_b64 = TH.tweakB64(box.whisper_sealed.ciphered.ciphertext_b64)
    const whisper_sealed = { ...box.whisper_sealed, ciphered: { ...box.whisper_sealed.ciphered, ciphertext_b64 } }
    const err = await TH.expectRefusal(vault.unsealBox({ ...box, whisper_sealed }), 'damaged_whisper')
    expect(TH.thrownText(err)).to.not.include(ciphertext_b64)
  })

  it("refuses 'damaged_whisper' for a box another bank of the same stamp sealed", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const { vault: other } = await TH.buildBornVault()
    const box = await other.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(vault.unsealBox(box), 'damaged_whisper')
    expect(bank.isUnlocked).to.be.true
  })

  const OtherBanks = [
    [{ userid: 'u2' },       "another user's"],
    [{ banklabel: 'other' }, 'another banklabel'],
  ] as const

  for (const [moved, blurb] of OtherBanks) {
    it(`refuses 'record_conflict' at the seal, the tombstone and the unseal for a box claiming ${blurb}`, async () => {
      const { bank, vault } = await TH.buildBornVault()
      await TH.expectRefusal(vault.sealBox(TH.boxShellOf(moved), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'record_conflict')
      const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      await TH.expectRefusal(vault.sealBox({ ...box, ...moved }, { am: 'x' }), 'record_conflict')
      await TH.expectRefusal(vault.unsealBox({ ...box, ...moved }), 'record_conflict')
      expect(bank.isUnlocked).to.be.true
    })
  }

  // A box sealed under another life of the bank's root box would refuse 'damaged_whisper' at the unseal, as its root
  // lifeseq is bound; the bank refuses it before any seal.
  it("refuses at the seal, the tombstone and the unseal a box under another life of the root box", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf({ lifepath: `${Life2}/${Shell.VoidLifeseq}` }), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'record_conflict')
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const moved = { lifepath: `${Life2}/${box.lifeseq}` }
    await TH.expectRefusal(vault.sealBox({ ...box, ...moved }, { am: 'x' }), 'record_conflict')
    await TH.expectRefusal(vault.unsealBox({ ...box, ...moved }), 'record_conflict')
    expect(bank.isUnlocked).to.be.true
  })

  it("refuses 'bank_locked' at the seal, the tombstone and the unseal once the bank locks", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    bank.lock()
    await TH.expectRefusal(vault.unsealBox(box), 'bank_locked')
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectRefusal(vault.sealBox(box, { am: 'x' }), 'bank_locked')
  })

  it("refuses at the seal, the tombstone and the unseal on a swept device", async () => {
    const { device, vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    device.sweep()
    await TH.expectRefusal(vault.unsealBox(box), 'disabled')
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    await TH.expectRefusal(vault.sealBox(box, { am: 'x' }), 'disabled')
  })

  const DonorCases = [
    [() => ({ ...TH.boxShellOf(), am: 'd' }),                'a donor of a damaged row'],
    [() => ({ ...TH.boxShellOf(), revseq: 0 }),              'half the shell: its revseq moved, its revtok and lifeseq not'],
    [() => ({ ...TH.boxShellOf(), labelpath: 'gate/main' }), 'a donor of another kind'],
    [() => ({ ...TH.boxShellOf(), revseq: -2 }),             'a revseq below the shell'],
    [() => null,                                             'null'],
  ] as const

  for (const [donorOf, blurb] of DonorCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { vault } = await TH.buildBornVault()
      await TH.expectRefusal(vault.sealBox(donorOf() as never, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_record')
    })
  }

  it("refuses a misspelt key in publicProps, and a key beside the whisper in secretProps", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { sidcar: TH.Sidecar } as never, { whisper: TH.Whisper }), 'bad_record')
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper, sidecar: TH.Sidecar } as never), 'bad_record')
  })

  it("refuses to seal a box when neither the donor nor publicProps has a sidecar", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), {}, { whisper: TH.Whisper }), 'bad_record')
  })

  const WhisperCases = [
    [{ whisper: 'sk-test-0000' },    'a whisper that is a string'],
    [{ whisper: null },              'a null whisper'],
    [{},                             'no whisper'],
    [null,                           'no cleartexts at all'],
  ] as const

  for (const [cleartexts, blurb] of WhisperCases) {
    it(`refuses to seal ${blurb}`, async () => {
      const { vault } = await TH.buildBornVault()
      await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, cleartexts as never))
    })
  }
})

describe("vault.sealBox(donor, { am: 'x' }), and the unseal of a tombstone", () => {
  it("makes the tombstone of a live box: its next revision, at the next lifeseq, with the sidecar `{}`, born when the box was", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    vi.setSystemTime(TH.T0 + 11)
    const tombstone = await vault.sealBox(box, { am: 'x' })
    expect(tombstone).to.include({ am: 'x', revseq: box.revseq + 1, lifeseq: Life1, lifepath: `${Life0}/${Life1}`, born_at: box.born_at, written_at: TH.T0 + 11 })
    expect(tombstone.revtok).to.not.eq(box.revtok)
    expect(tombstone.sidecar).to.deep.equal({})
    expect(tombstone.whisper_sealed).to.include({ codectag: 'json_v1', schematag: 'whisper_v1' })
    expect(BoxChecks.record.parse(tombstone)).to.deep.equal(tombstone)
  })

  it("writes the tombstone at the written_at given, and seals it: a tombstone whose written_at moved will not unseal", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.sealBox(box, { written_at: TH.T0 + 21, am: 'x' })
    expect(tombstone).to.include({ am: 'x', written_at: TH.T0 + 21 })
    expect(await vault.unsealBox(tombstone)).to.deep.include({ whisper: {} })
    await TH.expectRefusal(vault.unsealBox({ ...tombstone, written_at: TH.T0 + 22 }), 'damaged_whisper')
  })

  it("refuses a tombstone given secret props", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(vault.sealBox(box, { am: 'x' }, { whisper: TH.Whisper }), 'bad_record')
  })

  it("writes a tombstone given the sidecar `{}`, a tombstone's own", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.sealBox(box, { sidecar: {}, am: 'x' })
    expect(tombstone).to.deep.include({ am: 'x', sidecar: {} })
  })

  it("refuses a tombstone given any other sidecar", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await TH.expectRefusal(vault.sealBox(box, { sidecar: TH.Sidecar, am: 'x' }), 'bad_record')
  })

  it("unseals a tombstone to its Thing fields and an empty whisper", async () => {
    const { vault } = await TH.buildBornVault()
    const live = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.sealBox(live, { am: 'x' })
    const { whisper_sealed: _sealed, ...rest } = tombstone
    expect(await vault.unsealBox(tombstone)).to.deep.equal({ ...rest, whisper: {} })
  })

  it("starts the box's next life over its tombstone, born now", async () => {
    const { vault } = await TH.buildBornVault()
    const live = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.sealBox(live, { am: 'x' })
    vi.setSystemTime(TH.T0 + 13)
    const reborn = await vault.sealBox(tombstone, { sidecar: { account: 'home' } }, { whisper: TH.Whisper })
    expect(reborn).to.include({ am: 'a', revseq: tombstone.revseq + 1, lifeseq: Life2, lifepath: `${Life0}/${Life2}`, born_at: TH.T0 + 13 })
    expect(await vault.unsealBox(reborn)).to.deep.include({ whisper: TH.Whisper, sidecar: { account: 'home' } })
  })

  it("refuses the tombstone of a tombstone or of the shell", async () => {
    const { vault } = await TH.buildBornVault()
    const live = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.sealBox(live, { am: 'x' })
    await TH.expectRefusal(vault.sealBox(tombstone, { am: 'x' }), 'bad_record')
    await TH.expectRefusal(vault.sealBox(TH.boxShellOf(), { am: 'x' }), 'bad_record')
  })

  // A tombstone's seal is its sealed empty whisper, and the unseal is its check.
  it("refuses 'damaged_whisper' for a tombstone made up without the bankKey, or sealed with its live box's seal", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const madeUp = { ...box, sidecar: {}, revtok: TH.revtokOf('madeup'), revseq: box.revseq + 1, am: 'x', lifeseq: Life1, lifepath: `${Life0}/${Life1}`, whisper_sealed: TH.FakeSealed } as const
    await TH.expectRefusal(vault.unsealBox(madeUp), 'damaged_whisper')
    await TH.expectRefusal(vault.unsealBox({ ...madeUp, whisper_sealed: box.whisper_sealed }), 'damaged_whisper')
  })

  it("refuses 'damaged_whisper' for a tombstone carrying another tombstone's seal", async () => {
    const { vault } = await TH.buildBornVault()
    const box = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const one = await vault.sealBox(box, { am: 'x' })
    const two = await vault.sealBox(box, { am: 'x' })
    await TH.expectRefusal(vault.unsealBox({ ...two, whisper_sealed: one.whisper_sealed }), 'damaged_whisper')
  })

  const AlteredCases = [
    [(tombstone: TombstoneOf<BoxRecord>) => ({ ...tombstone, revtok: TH.OtherRevtok }),          'its revtok'],
    [(tombstone: TombstoneOf<BoxRecord>) => ({ ...tombstone, written_at: tombstone.written_at + 1 }),            'its written_at'],
    [(tombstone: TombstoneOf<BoxRecord>) => ({ ...tombstone, lifeseq: Life3, lifepath: `${Life0}/${Life3}` }),   'its lifeseq'],
  ] as const

  for (const [alter, blurb] of AlteredCases) {
    it(`refuses 'damaged_whisper' for a tombstone with ${blurb} altered`, async () => {
      const { vault } = await TH.buildBornVault()
      const live = await vault.sealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
      const tombstone = await vault.sealBox(live, { am: 'x' })
      await TH.expectRefusal(vault.unsealBox(alter(tombstone)), 'damaged_whisper')
    })
  }
})

describe("vault.trySealBox(donor, publicProps, secretProps) and vault.tryUnsealBox(box)", () => {
  it("resolve a good outcome of what sealBox and unsealBox resolve, and the refusal they throw", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const box = await TH.expectGood(vault.trySealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }))
    expect(await TH.expectGood(vault.tryUnsealBox(box))).to.deep.include({ whisper: TH.Whisper })
    bank.lock()
    await TH.expectBad(vault.trySealBox(TH.boxShellOf(), { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    await TH.expectBad(vault.tryUnsealBox(box), 'bank_locked')
  })
})

/** How many of the gets `asked` saw were of the box at {@link Openai}. */
function boxGetsOf(asked: { mock: { calls: [GetAsk][] } }): number {
  return asked.mock.calls.filter(([ask]) => ask.labelpath === Openai).length
}

/** Make `bank`'s vaultDB refuse every get from now on with `refusal`, by default `storage_unavailable`, and return the spy that saw them. */
function refuseGets(bank: Bank, refusal = Throwers.storageUnavailable(new Error('connection refused'))) {
  return vi.spyOn(bank.device.vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, refusal)))
}

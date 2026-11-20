import { describe, expect, it, vi } from 'vitest'
import type { Bank } from '../../src/models/bank'
import { Vault } from '../../src/models/vault'
import type { BoxUnsealed } from '../../src/shapes/shapes-bankish'
import { type BoxLabelpath, Lifeseq } from '../../src/shapes/primitives'
import { type BoxRecord, Shell } from '../../src/shapes/shapes-thing'
import { Thing } from '../../src/models/thing'
import { carOf } from '../../src/minding/thing-car'
import type { ThingMinder } from '../../src/minding/thing-minder'
import type { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The labelpath of the box the flows put. */
const Openai: BoxLabelpath = 'box/openai'

/** The scope of the Thing at `labelpath` in `bank`. */
function scopeAt<LabelpathT extends string>(bank: Bank, labelpath: LabelpathT) { return { ...bank.scope, labelpath } }

/** The rows of `bank`'s MemoryVaultDB, by labelpath, to plant a record as another device would, telling no watch. */
function rowsOf(bank: Bank): Map<string, unknown> { return (bank.vaultDB as MemoryVaultDB)._cheat_things(bank.scope) }

/** Unseal the newest revision `vault`'s minder gets of {@link Openai}, a box or a tombstone. */
async function unsealedAt(vault: Vault): Promise<BoxUnsealed> {
  const car = await vault.minder.get(scopeAt(vault.bank, Openai))
  if ((car.liveness !== 'full') && (car.liveness !== 'gone')) { throw new Error(`the car is ${car.liveness}`) }
  // A gone car's newest is the whole tombstone, though its type is the sparse one's.
  return vault.bank.unsealBox(car.newest as BoxRecord)
}

/** The design's put flow: get the box or its shell, add one to its count of apicalls, seal and put it over what it got. */
async function bumpApicalls(vault: Vault): Promise<BoxRecord> {
  const { newest } = await vault.minder.get(scopeAt(vault.bank, Openai))
  const old      = (newest.am === 'a') ? await vault.bank.unsealBox(newest as BoxRecord) : null
  const apicalls = Number(old?.whisper['apicalls'] ?? 0) + 1
  return vault.putBoxOnce(newest, { sidecar: { account: 'work' } }, { whisper: { ...TH.Whisper, apicalls } })
}

describe("Vault.make(bank)", () => {
  it("makes the vault of the bank's boxes, with a minder of that bank that waits for its hello", async () => {
    const { bank } = await TH.buildBornBank()
    const vault = Vault.make(bank)
    expect(vault.bank).to.equal(bank)
    expect(vault.minder.scope).to.deep.equal({ userid: bank.userid, banklabel: bank.banklabel })
    expect(vault.minder.tryAt(scopeAt(bank, Openai))).to.include({ ok: false })
    expect(Object.isFrozen(vault)).to.be.true
  })

  it("refuses anything but a bank", () => {
    TH.expectSyncRefusal(() => Vault.make({} as never), 'bad_record')
    TH.expectSyncRefusal(() => Vault.make(null as never), 'bad_record')
  })
})

describe("the box flows, through a vault and its bank's MemoryVaultDB", () => {
  it("lists no boxes under the bank's root box, before any is put", async () => {
    const { minder } = await TH.buildBornVault()
    expect(await minder.list('box')).to.deep.equal([])
  })

  it("gets the shell of a box not stored, under the root box's life, for its first revision to cite", async () => {
    const { bank, minder } = await TH.buildBornVault()
    const car = await minder.get(scopeAt(bank, Openai))
    expect(car.liveness).to.equal('void')
    expect(car.newest).to.include({ ...bank.scope, labelpath: Openai, label: 'openai', am: 'x', lifeseq: Shell.VoidLifeseq, lifepath: `${bank.rootBox.lifeseq}/${Shell.VoidLifeseq}` })
  })

  it("puts a box over its shell, and again over itself, each put unsealing what the one before sealed", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await bumpApicalls(vault)
    expect(first).to.include({ revseq: 0, am: 'a', lifepath: `${bank.rootBox.lifeseq}/${Lifeseq.ofLifenum(0)}` })
    await bumpApicalls(vault)
    const unsealed = await unsealedAt(vault)
    expect(unsealed).to.include({ revseq: 1, am: 'a' })
    expect(unsealed.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 2 })
    expect(await minder.list('box')).to.deep.equal([Openai])
  })

  it("deletes a box by its signed tombstone, which unseals, lists, and a put brings back to life", async () => {
    const { vault, minder } = await TH.buildBornVault()
    await bumpApicalls(vault)
    await vault.delBoxOnce(Openai)
    const unsealed = await unsealedAt(vault)
    expect(unsealed).to.include({ am: 'x', lifeseq: Lifeseq.ofLifenum(1) })
    expect(unsealed.whisper).to.deep.equal({})
    expect(await minder.list('box')).to.deep.equal([Openai])

    const reborn = await bumpApicalls(vault)
    expect(reborn).to.include({ am: 'a', lifeseq: Lifeseq.ofLifenum(2) })
    const unsealedAgain = await unsealedAt(vault)
    expect(unsealedAgain.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 1 })
  })
})

describe("vault.putBoxOnce(cited, patch, secrets)", () => {
  it("resolves a birth with the box as stored already in its car and in its parent's listing", async () => {
    // putBoxOnce @example
    const { bank, vault, minder } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    expect(box).to.include({ labelpath: Openai, revseq: 0, am: 'a' })
    expect(minder.at(scopeAt(bank, Openai))).to.deep.equal(carOf(box))
    expect(minder.listingAt(scopeAt(bank, 'box'))).to.deep.equal([Openai])
    expect(await bank.unsealBox(box)).to.deep.include({ whisper: TH.Whisper, sidecar: TH.Sidecar })
  })

  it("given a labelpath, writes over the newest revision cached, keeping its sidecar", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const next = await vault.putBoxOnce(Openai, {}, { whisper: { apiKey: 'sk-test-1111' } })
    expect(next).to.include({ revseq: 1 })
    expect(next.sidecar).to.deep.equal(TH.Sidecar)
    expect(minder.at(scopeAt(bank, Openai))).to.deep.equal(carOf(next))
  })

  it("given a labelpath with nothing cached, gets the newest revision to write over", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const other = Vault.make(bank)
    other.minder.hello()
    const next = await other.putBoxOnce(Openai, {}, { whisper: TH.Whisper })
    expect(next).to.include({ revseq: 1 })
    expect(other.minder.at(scopeAt(bank, Openai))).to.deep.equal(carOf(next))
  })

  it("refuses stale_write over an older revision, and writes nothing, the car's newest left at the one stored", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const { record: stored } = await bank.sealBox(first, {}, { whisper: { apiKey: 'sk-test-1111' } })
    rowsOf(bank).set(Openai, stored)
    expect(minder.at(scopeAt(bank, Openai))?.newest).to.include({ revtok: first.revtok })
    await TH.expectRefusal(vault.putBoxOnce(Openai, {}, { whisper: TH.Whisper }), 'stale_write')
    expect(minder.at(scopeAt(bank, Openai))?.newest).to.include({ revtok: stored.revtok })
    expect(rowsOf(bank).get(Openai)).to.include({ revtok: stored.revtok })
  })

  it("given a labelpath cached sparse, gets the box whole and keeps its stored sidecar", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const { record: stored } = await bank.sealBox(first, {}, { whisper: TH.Whisper })
    rowsOf(bank).set(Openai, stored)
    await minder.list('box')
    expect(minder.at(scopeAt(bank, Openai))?.liveness).to.equal('bhnd')
    const next = await vault.putBoxOnce(Openai, {}, { whisper: TH.Whisper })
    expect(next).to.include({ revseq: 2 })
    expect(next.sidecar).to.deep.equal(TH.Sidecar)
  })

  it("refuses a sparse cited box when the patch gives no sidecar, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written = vi.spyOn(bank.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(vault.putBoxOnce(Thing.sparseOf(first), {}, { whisper: TH.Whisper }), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })

  it("writes nothing of an unsealed box's whisper, cited or sealed", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const first = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const written = vi.spyOn(bank.vaultDB, 'tryWriteThing')
    await vault.putBoxOnce(await bank.unsealBox(first), {}, { whisper: { apiKey: 'sk-test-1111' } })
    expect(written).toHaveBeenCalledTimes(1)
    expect(written.mock.calls[0]![0].cited).to.deep.equal(Thing.sparseOf(first))
    expect(JSON.stringify(written.mock.calls)).to.not.include('sk-test-0000').and.not.include('sk-test-1111')
  })

  it("refuses without secrets, and writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.vaultDB, 'tryWriteThing')
    await TH.expectRefusal(vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, undefined as never), 'bad_record')
    expect(written).not.toHaveBeenCalled()
  })

  it("refuses a labelpath that is not a box's", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.putBoxOnce('gate' as never, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bad_record')
  })

  it("refuses while the bank is locked, or once its device is swept, and writes nothing", async () => {
    const { bank, device, vault } = await TH.buildBornVault()
    const written = vi.spyOn(bank.vaultDB, 'tryWriteThing')
    bank.lock()
    await TH.expectRefusal(vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'bank_locked')
    device.sweep()
    const err = await TH.expectRefusal(vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper }), 'disabled')
    expect(err).to.equal(device.endCause)
    expect(written).not.toHaveBeenCalled()
  })
})

describe("vault.delBoxOnce(labelpath)", () => {
  it("writes the tombstone over the newest revision: its car is gone, and it stays listed", async () => {
    const { bank, vault, minder } = await TH.buildBornVault()
    const box = await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const tombstone = await vault.delBoxOnce(Openai)
    expect(tombstone).to.include({ labelpath: Openai, am: 'x', revseq: box.revseq + 1 })
    expect(minder.at(scopeAt(bank, Openai))).to.deep.include({ liveness: 'gone', newest: tombstone })
    expect(minder.listingAt(scopeAt(bank, 'box'))).to.deep.equal([Openai])
  })

  it("refuses a box never stored, or already deleted", async () => {
    const { vault } = await TH.buildBornVault()
    await TH.expectRefusal(vault.delBoxOnce(Openai), 'bad_record')
    await vault.putBoxOnce(Openai, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    await vault.delBoxOnce(Openai)
    await TH.expectRefusal(vault.delBoxOnce(Openai), 'bad_record')
  })
})

/** The revtok of `minder`'s car at `labelpath` at the moment each write the vaultDB answers comes back to its caller. */
function carsOnAnswer(bank: Bank, minder: ThingMinder, labelpath: string): (string | undefined)[] {
  const tryWriteThing = bank.vaultDB.tryWriteThing.bind(bank.vaultDB)
  const seen: (string | undefined)[] = []
  vi.spyOn(bank.vaultDB, 'tryWriteThing').mockImplementation(async (ask) => {
    const answer = await tryWriteThing(ask)
    seen.push(minder.at(scopeAt(bank, labelpath))?.newest.revtok)
    return answer
  })
  return seen
}

// Bank.put and the gate verbs write through the vaultDB, not the minder. The MemoryVaultDB tells each watch of a write
// on a microtask it queues before the write answers, so a minder of the bank holds the record before the verb resumes.
describe("a vault's minder, beside the bank's own writes", () => {
  it("holds the bank's Thing that bank.put wrote before it resolves", async () => {
    const { bank, minder } = await TH.buildBornVault()
    const seen = carsOnAnswer(bank, minder, 'bank')
    const written = await bank.put({ cited: bank.pickle(), record: { ...bank.pickle(), revtok: TH.revtokOf('bank1'), revseq: bank.revseq + 1, written_at: bank.written_at + 1 } })
    expect(seen).to.deep.equal([written.revtok])
    expect(minder.at(scopeAt(bank, 'bank'))?.newest).to.include({ revtok: written.revtok, revseq: 1 })
  })

  it("holds the main gate a gate verb wrote before the verb resolves", async () => {
    const { bank, device, minder } = await TH.buildBornVault()
    const seen = carsOnAnswer(bank, minder, 'gate')
    const after = await TH.answerPrompt(device, bank.launchReplacePassphrasePrompt(), { antePassphraseClear: TH.TestPassphrase, nextPassphraseClear: 'another horse battery staple' })
    expect(seen).to.deep.equal([after.maingate.revtok])
    expect(minder.at(scopeAt(bank, 'gate'))?.newest).to.include({ revtok: after.maingate.revtok })
  })
})

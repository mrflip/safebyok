import { describe, expect, it, vi } from 'vitest'
import { Errors } from 'safebyok-big/internals'
import type { Bank, BoxShell, BoxUnsealed } from '../../src/models/bank'
import type { BoxRecord } from '../../src/shapes/shapes-sealers'
import { type BoxThing, VoidLifeseq, getAskOf, lifeseqOfLifenum, sparseOf } from '../../src/shapes/shapes-thing'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The labelpath of the box the flows put. */
const Openai = 'box/openai'

/** A {@link TH.buildBornBank} bank, unlocked, whose bank, main gate and root box are born in its device's MemoryVaultDB. */
async function storedBank(): Promise<Bank> {
  const { bank } = await TH.buildBornBank()
  return bank
}

/** The box at {@link Openai} in `bank`'s vaultDB, or its shell where none is stored. */
async function priorOf(bank: Bank): Promise<BoxThing | BoxShell> {
  const got = await bank.tryGetBox({ labelpath: Openai, ifAbsent: 'shell' })
  if (! got.ok) { throw got.err }
  return got.val
}

/** Unseal what `bank` has put at {@link Openai}, a box or a tombstone. */
async function unsealedAt(bank: Bank): Promise<BoxUnsealed> {
  const got = await bank.tryGetBox({ labelpath: Openai })
  if (! got.ok || got.val === null) { throw new Error('nothing stored') }
  return bank.unsealBox(got.val)
}

/** The design's put flow: get the box or its shell, add one to its count of apicalls, seal and put it. */
async function bumpApicalls(bank: Bank): Promise<BoxRecord> {
  const prior    = await priorOf(bank)
  const old      = (prior.am === 'a') ? await bank.unsealBox(prior) : null
  const apicalls = Number(old?.whisper['apicalls'] ?? 0) + 1
  const record   = await bank.sealBox(prior, { sidecar: { account: 'work' } }, { whisper: { ...TH.Whisper, apicalls } })
  const answer   = await bank.tryPutBox({ cited: prior, record })
  if (! answer.ok) { throw answer.err }
  return record
}

describe("the box flows, through a bank and its MemoryVaultDB", () => {
  it("lists no boxes under the bank's root box, before any is put", async () => {
    const bank = await storedBank()
    const listed = await bank.tryListBoxes()
    expect(listed).to.include({ ok: true, act: 'gotlive' })
    expect(listed.ok && listed.val).to.deep.equal([])
    expect(listed.parent).to.deep.equal(sparseOf(bank.rootBox))
  })

  it("gives the shell of a box not stored, under the root box's life, for its first revision to cite", async () => {
    const bank = await storedBank()
    const shell = await priorOf(bank)
    expect(shell).to.include({ ...bank.scope, labelpath: Openai, label: 'openai', am: 'x', lifeseq: VoidLifeseq, lifepath: `${bank.rootBox.lifeseq}/${VoidLifeseq}` })
  })

  it("puts a box over its shell, and again over itself, each put unsealing what the one before sealed", async () => {
    const bank = await storedBank()
    const first = await bumpApicalls(bank)
    expect(first).to.include({ revseq: 0, am: 'a', lifepath: `${bank.rootBox.lifeseq}/${lifeseqOfLifenum(0)}` })
    await bumpApicalls(bank)
    const unsealed = await unsealedAt(bank)
    expect(unsealed).to.include({ revseq: 1, am: 'a' })
    expect(unsealed.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 2 })
    const listed = await bank.tryListBoxes()
    expect(listed.ok && listed.val.map((box) => [box.labelpath, box.revseq])).to.deep.equal([[Openai, 1]])
  })

  it("deletes a box by its signed tombstone, which unseals, lists, and a put brings back to life", async () => {
    const bank = await storedBank()
    await bumpApicalls(bank)
    const prior = await priorOf(bank)
    const tombstone = await bank.tombstoneBox(prior)
    const deleted = await bank.tryDelBox({ cited: prior, record: tombstone })
    expect(deleted).to.include({ ok: true, act: 'deleted' })
    const unsealed = await unsealedAt(bank)
    expect(unsealed).to.include({ am: 'x', lifeseq: lifeseqOfLifenum(1) })
    expect(unsealed.whisper).to.deep.equal({})
    const listed = await bank.tryListBoxes()
    expect(listed.ok && listed.val.map((box) => box.am)).to.deep.equal(['x'])

    const reborn = await bumpApicalls(bank)
    expect(reborn).to.include({ am: 'a', lifeseq: lifeseqOfLifenum(2) })
    const unsealedAgain = await unsealedAt(bank)
    expect(unsealedAgain.whisper).to.deep.equal({ ...TH.Whisper, apicalls: 1 })
  })
})

describe("the bank's box methods refuse, never throwing", () => {
  it("tryPutBox answers the device's refusal while it is disabled, and writes nothing", async () => {
    const bank = await storedBank()
    const prior = await priorOf(bank)
    const record = await bank.sealBox(prior, { sidecar: {} }, { whisper: TH.Whisper })
    bank.device.sweep()
    const answer = await bank.tryPutBox({ cited: prior, record })
    await TH.expectBad(answer, 'disabled')
    expect(answer).to.include({ dbhas: null, err: bank.device.endCause })
    const got = await bank.device.vaultDB.tryGetThing(getAskOf({ ...bank.scope, labelpath: Openai }))
    expect(got).to.include({ ok: true, val: null })
  })

  it("tryGetBox answers null for a box not stored, by default", async () => {
    const bank = await storedBank()
    const got = await bank.tryGetBox({ labelpath: Openai })
    expect(got).to.include({ ok: true, act: 'gotvoid', val: null })
  })

  it("tryGetBox refuses a labelpath that is not a box's", async () => {
    const bank = await storedBank()
    const got = await bank.tryGetBox({ labelpath: 'gate' })
    expect(got.ok).to.equal(false)
  })

  it("tryGetBox answers each of its refusals on a disabled device with the device's one refusal", async () => {
    const bank = await storedBank()
    bank.device.sweep()
    const one = await bank.tryGetBox({ labelpath: Openai })
    const two = await bank.tryListBoxes()
    expect(one.ok || one.err).to.equal(bank.device.endCause)
    expect(two.ok || two.err).to.equal(bank.device.endCause)
  })

  // A vaultDB that answers a gate to a box's get is broken: its row reaches the refusal's rows, never its message or meta.
  it("tryGetBox refuses a row the vaultDB answers that is not a box, as a storage issue", async () => {
    const bank = await storedBank()
    const { vaultDB } = bank.device
    const gate = TH.gateThingOf()
    vi.spyOn(vaultDB, 'tryGetThing').mockImplementation((ask) => Promise.resolve({ ok: true, ask, act: 'gotlive', world: null, val: gate }))
    const got = await bank.tryGetBox({ labelpath: Openai })
    expect(got).to.include({ ok: false, act: 'unclassified_storing', dbhas: null })
    if (got.ok) { return }
    expect(got.err.refusalkind).to.eq('storage_issue')
    expect(Errors.rowsOfRefusal(got.err).dbhas).to.equal(gate)
    expect(JSON.stringify(got.err)).to.not.include('ciphertext_b64')
  })

  it("tryPutBox refuses a record of another bank, and writes nothing", async () => {
    const bank = await storedBank()
    const prior = await priorOf(bank)
    const record = await bank.sealBox(prior, { sidecar: {} }, { whisper: TH.Whisper })
    const answer = await bank.tryPutBox({ cited: prior, record: { ...record, banklabel: 'other' } })
    expect(answer.ok).to.equal(false)
    expect(await bank.tryGetBox({ labelpath: Openai })).to.include({ ok: true, val: null })
  })

  it("tryDelBox refuses a record of another bank, and writes nothing", async () => {
    const bank = await storedBank()
    const record = await bumpApicalls(bank)
    const tombstone = await bank.tombstoneBox(record)
    const answer = await bank.tryDelBox({ cited: record, record: { ...tombstone, userid: 'u2' } })
    expect(answer.ok).to.equal(false)
    expect(await priorOf(bank)).to.include({ am: 'a', revseq: 0 })
  })
})

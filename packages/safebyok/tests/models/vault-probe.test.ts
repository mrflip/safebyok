import { describe, expect, it, vi } from 'vitest'
import type { Bank } from '../../src/models/bank'
import { Vault } from '../../src/models/vault'
import { type ProbeReport, ProbeLabelpath } from '../../src/shapes/shapes-vault-probe'
import type { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { refusedAnswerOf } from '../../src/storage/refused-answer'
import * as Throwers from '../../src/refusals/throwers'
import * as TH from '../test-helpers'

TH.useFakeClock()

/** The rows of `bank`'s MemoryVaultDB, by labelpath, to plant a record as another device would, notifying no watch. */
function rowsOf(bank: Bank): Map<string, unknown> { return (bank.device.vaultDB as MemoryVaultDB)._cheat_things(bank.scope).box }

/** The asks `bank`'s vaultDB was sent for the box at `labelpath`, of each verb, in the order they came. */
function spyAsksAt(bank: Bank, labelpath: string) {
  const got     = vi.spyOn(bank.device.vaultDB, 'tryGetThing')
  const written = vi.spyOn(bank.device.vaultDB, 'tryWriteThing')
  return {
    gets:   () => got.mock.calls.filter(([ask]) => ask.labelpath === labelpath).length,
    writes: () => written.mock.calls.filter(([ask]) => ask.labelpath === labelpath).map(([ask]) => ask.op),
  }
}

/** Have `bank`'s vaultDB run `before` ahead of each get once the probe's box is stored, answering a refusal it throws in place of the get.
 * Call it before {@link spyAsksAt}, whose spy then keeps this one's answers.
 */
function getAfterPut(bank: Bank, before: () => unknown): void {
  const { vaultDB } = bank.device
  const get = vaultDB.tryGetThing.bind(vaultDB)
  vi.spyOn(vaultDB, 'tryGetThing').mockImplementation(async (ask) => {
    if (rowsOf(bank).has(ProbeLabelpath)) {
      try { await before() } catch (err) { return refusedAnswerOf(ask, err) }
    }
    return get(ask)
  })
}

/** Make `bank`'s vaultDB lose the probe's put, though it answers the put ok. */
function loseProbePut(bank: Bank): void {
  const { vaultDB } = bank.device
  const write = vaultDB.tryWriteThing.bind(vaultDB)
  vi.spyOn(vaultDB, 'tryWriteThing').mockImplementation(async (ask) => {
    if ((ask.labelpath !== ProbeLabelpath) || (ask.op !== 'put')) { return await write(ask) }

    const before = rowsOf(bank).get(ProbeLabelpath)
    const answer = await write(ask)
    if (before === undefined) { rowsOf(bank).delete(ProbeLabelpath) } else { rowsOf(bank).set(ProbeLabelpath, before) }
    return answer
  })
}

describe("vault.probe(args)", () => {
  it("probes storage and keys end to end", async () => {
    // probe @example
    const { bank, vault } = await TH.buildBornVault()
    const asks = spyAsksAt(bank, ProbeLabelpath)
    const { whisperMatched, steps } = await vault.probe()
    expect(whisperMatched).to.be.true
    expect(Object.keys(steps)).to.deep.equal(['put', 'get', 'unseal', 'del'])
    expect(asks.writes()).to.deep.equal(['put', 'del'])
    expect(asks.gets()).to.equal(2)
    expect(rowsOf(bank).get(ProbeLabelpath)).to.include({ am: 'x' })
  })

  it("times each step in milliseconds", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const get = bank.device.vaultDB.tryGetThing.bind(bank.device.vaultDB)
    vi.spyOn(bank.device.vaultDB, 'tryGetThing').mockImplementation(async (ask) => {
      vi.advanceTimersByTime(7)
      return get(ask)
    })
    const { steps } = await vault.probe()
    expect(steps.get).to.deep.equal({ millis: 7 })
    expect(steps.unseal).to.deep.equal({ millis: 0 })
  })

  it("puts the whisper and sidecar asked at the labelpath asked, and reports no whisper", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const asks   = spyAsksAt(bank, 'box/selftest')
    const report = await vault.probe({ labelpath: 'box/selftest', whisper: TH.Whisper, sidecar: TH.Sidecar })
    expect(report).to.deep.include({ labelpath: 'box/selftest', whisperMatched: true })
    expect(asks.writes()).to.deep.equal(['put', 'del'])
    expect(JSON.stringify(report)).to.not.include(TH.Whisper.apiKey)
  })

  it("writes over a box left at its labelpath, and deletes it", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(ProbeLabelpath, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    const { whisperMatched } = await vault.probe()
    expect(whisperMatched).to.be.true
    expect(rowsOf(bank).get(ProbeLabelpath)).to.include({ am: 'x', revseq: 2 })
  })

  it("probes again over its own tombstone", async () => {
    const { vault } = await TH.buildBornVault()
    await vault.probe()
    const { whisperMatched } = await vault.probe()
    expect(whisperMatched).to.be.true
  })

  it("reports a whisper that did not match, where the box unseals to another, and still deletes the box", async () => {
    const { bank, vault } = await TH.buildBornVault()
    // Storage cannot bring this about, since the seal authenticates the revision: the unseal is stubbed.
    vi.spyOn(Vault.prototype, 'unsealBox').mockResolvedValue({ whisper: { apiKey: 'sk-test-1111' } } as never)
    const { whisperMatched } = await vault.probe()
    expect(whisperMatched).to.be.false
    expect(rowsOf(bank).get(ProbeLabelpath)).to.include({ am: 'x' })
  })

  it("refuses at the get where storage answers the put ok but writes nothing", async () => {
    const { bank, vault } = await TH.buildBornVault()
    loseProbePut(bank)
    const err = await TH.expectRefusal(vault.probe(), 'stale_read')
    expect(err.meta?.stepkind).to.equal('get')
  })

  it("refuses at the get where storage answers the revision before the put", async () => {
    const { bank, vault } = await TH.buildBornVault()
    await vault.putBoxOnce(ProbeLabelpath, { sidecar: TH.Sidecar }, { whisper: TH.Whisper })
    loseProbePut(bank)
    const err = await TH.expectRefusal(vault.probe(), 'stale_read')
    expect(err.meta?.stepkind).to.equal('get')
    expect(rowsOf(bank).get(ProbeLabelpath)).to.include({ am: 'a', revseq: 0 })
  })

  it("refuses on a locked bank before it gets or writes anything, never asking for an unlock", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const asks = spyAsksAt(bank, ProbeLabelpath)
    bank.lock()
    const err = await TH.expectRefusal(vault.probe(), 'bank_locked')
    expect(err.meta?.stepkind).to.be.undefined
    expect(asks.gets()).to.equal(0)
    expect(asks.writes()).to.deep.equal([])
    expect(bank.device.bank.getSnapshot().isUnlockWanted).to.be.false
  })

  it("refuses the root box's labelpath, an unknown key or a bad whisper, before it gets or writes anything", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const asks = spyAsksAt(bank, 'box')
    await TH.expectRefusal(vault.probe({ labelpath: 'box' }), 'bad_record')
    await TH.expectRefusal(vault.probe({ boxlabel: 'box1' } as never), 'bad_record')
    await TH.expectRefusal(vault.probe({ whisper: 'shh' }), 'bad_record')
    expect(asks.gets()).to.equal(0)
    expect(asks.writes()).to.deep.equal([])
  })

  it("refuses at the step that failed", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const refusal = Throwers.storageUnavailable(new Error('connection refused'))
    getAfterPut(bank, () => { throw refusal })
    const asks    = spyAsksAt(bank, ProbeLabelpath)
    const err = await TH.expectRefusal(vault.probe(), 'storage_unavailable')
    expect(err.meta?.stepkind).to.equal('get')
    expect(err.cause).to.equal(refusal)
    expect(asks.writes()).to.deep.equal(['put'])
  })

  it("refuses at the put where storage refuses it", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const refusal = Throwers.storageUnavailable(new Error('connection refused'))
    vi.spyOn(bank.device.vaultDB, 'tryWriteThing').mockImplementation((ask) => Promise.resolve(refusedAnswerOf(ask, refusal)))
    const err = await TH.expectRefusal(vault.probe(), 'storage_unavailable')
    expect(err.meta?.stepkind).to.equal('put')
  })
})

describe("vault.tryProbe(args)", () => {
  it("answers a good outcome of the report, and the refusal probe throws", async () => {
    const { bank, vault } = await TH.buildBornVault()
    const report: ProbeReport = await TH.expectGood(vault.tryProbe())
    expect(report).to.deep.include({ labelpath: ProbeLabelpath, whisperMatched: true })
    bank.lock()
    await TH.expectBad(vault.tryProbe(), 'bank_locked')
  })
})

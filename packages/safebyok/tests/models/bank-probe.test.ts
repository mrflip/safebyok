/** bank.tryProbe: a trial of a bank's whole storage path, on real seals and a real gating. */

import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import { type BankWorld, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'

useBankWorlds()

const HomeBox = { vaultlabel: 'home', boxlabel: 'box1' }

async function readyBankOn(world: BankWorld = makeBankWorld()) {
  const bank = await world.bankOn()
  return { world, bank }
}

/** What opening the probe's box answers now. */
async function whisperIn(bank: Awaited<ReturnType<typeof readyBankOn>>['bank'], vaultlabel = 'home', boxlabel = 'box1'): Promise<unknown> {
  const box = await bank.vaultAt({ vaultlabel })?.fetchBox(boxlabel)
  return box?.extractWhisper()
}

describe("bank.tryProbe", () => {
  it("builds the vault 'home' and box 'box1' on an empty bank, reporting each step", async () => {
    const { world, bank } = await readyBankOn()
    const report = await TH.expectGood(bank.tryProbe())
    expect(report.timely).to.deep.include({ box: null, boxRefreshedAt: null })
    expect(report.timely.vault).to.include({ vaultlabel: 'home' })
    expect(report.timely.vaultRefreshedAt).to.be.a('number')
    expect(report.put).to.deep.include({ ok: true, act: 'born' })
    expect(report.put.val).to.include(HomeBox)
    expect(report.fetch).to.deep.include({ ok: true, act: 'gotlive' })
    expect(report.fetch.val).to.include(HomeBox)
    expect(report.unseal.ok).to.be.true
    expect(world.leaseRows()).to.have.lengthOf(1)
    expect(await whisperIn(bank)).to.deep.equal({ note: 'Shhh, this is a whisper' })
    const box = await bank.vaultAt({ vaultlabel: 'home' })?.getBox('box1')
    expect(box?.sidecar).to.deep.equal({ example: true })
  })

  it("stamps each step with when it came back, in order", async () => {
    const { world, bank } = await readyBankOn()
    const tryPutBox = world.bankDB.tryPutBox.bind(world.bankDB)
    vi.spyOn(world.bankDB, 'tryPutBox').mockImplementationOnce((...args) => { world.advance(10); return tryPutBox(...args) })
    const report = await TH.expectGood(bank.tryProbe())
    expect(report.put.timestamp).to.eq(report.timely.timestamp + 10)
    expect(report.fetch.timestamp).to.be.at.least(report.put.timestamp)
    expect(report.unseal.timestamp).to.be.at.least(report.fetch.timestamp)
  })

  it("surfaces no whisper, ciphertext or wrapped key in its report", async () => {
    const { world, bank } = await readyBankOn()
    const put = vi.spyOn(world.bankDB, 'tryPutBox')
    const report = await TH.expectGood(bank.tryProbe({ whisper: { token: 'sk-test-0000' } }))
    const said = JSON.stringify(report)
    expect(said).to.not.include('sk-test-0000')
    const sent = await put.mock.results[0]?.value as { val: { whisper_ciphered: { ciphertext_b64: string }, box_key_wrapped: { ciphertext_b64: string } } }
    expect(said).to.not.include(sent.val.whisper_ciphered.ciphertext_b64)
    expect(said).to.not.include(sent.val.box_key_wrapped.ciphertext_b64)
    expect(said).to.not.include(bank.maingate.wayins.main.vault_key_wayin_wrapped.ciphertext_b64)
  })

  it("replaces an existing box rather than adding a second", async () => {
    const { bank } = await readyBankOn()
    const first = await TH.expectGood(bank.tryProbe({ whisper: { note: 'first' } }))
    const again = await TH.expectGood(bank.tryProbe({ whisper: { note: 'again' } }))
    expect(again.timely.box?.revision_seq).to.eq(first.put.val.revision_seq)
    expect(again.timely.boxRefreshedAt).to.be.a('number')
    expect(again.put).to.deep.include({ act: 'replaced' })
    expect(again.put.val.revision_seq).to.be.greaterThan(first.put.val.revision_seq)
    expect(await whisperIn(bank)).to.deep.equal({ note: 'again' })
    expect(bank.vaultAt({ vaultlabel: 'home' })?.boxListing.things.map((listed) => listed.boxlabel)).to.deep.equal(['box1'])
  })

  it("takes the labels, whisper and sidecar it is given", async () => {
    const { bank } = await makeBankWithVault()
    const report = await TH.expectGood(bank.tryProbe({ vaultlabel: 'main', boxlabel: 'trial', whisper: { token: 'sk-test-0000' }, sidecar: { kind: 'trial' } }))
    expect(report.put.val).to.include({ vaultlabel: 'main', boxlabel: 'trial' })
    expect(await whisperIn(bank, 'main', 'trial')).to.deep.equal({ token: 'sk-test-0000' })
  })

  it("asks the user for a vault that is locked, and opens it", async () => {
    const { bank } = await readyBankOn()
    await TH.expectGood(bank.tryProbe())
    bank.vaultAt({ vaultlabel: 'home' })?.lock()
    await TH.expectGood(bank.tryProbe())
    expect(bank.vaultAt({ vaultlabel: 'home' })?.isUnlocked).to.be.true
  })

  it("replaces a box another device changed, once its record is past maxMillisSinceRefresh", async () => {
    const world = makeBankWorld()
    const { bank } = await readyBankOn(world)
    await TH.expectGood(bank.tryProbe({ whisper: { note: 'mine' } }))
    const elsewhere = await world.bankOnAnotherDevice()
    await TH.expectGood(elsewhere.tryProbe({ whisper: { note: 'theirs' } }))
    world.advance(2000)
    await TH.expectGood(bank.tryProbe({ whisper: { note: 'mine again' } }))
    expect(await whisperIn(bank)).to.deep.equal({ note: 'mine again' })
  })

  it("uses the maxMillisSinceRefresh it is given, not the bank's refresh settings", async () => {
    const world = makeBankWorld()
    const { bank } = await readyBankOn(world)
    await TH.expectGood(bank.tryProbe({ whisper: { note: 'mine' } }))
    const elsewhere = await world.bankOnAnotherDevice()
    await TH.expectGood(elsewhere.tryProbe({ whisper: { note: 'theirs' } }))
    world.advance(2000)
    await TH.expectBad(bank.tryProbe({ whisper: { note: 'late' } }, { maxMillisSinceRefresh: 60_000 }), 'stale_write')
  })

  it("returns a step's refusal as a bad Outcome naming the call", async () => {
    const { world, bank } = await readyBankOn()
    await TH.expectGood(bank.tryProbe())
    vi.spyOn(world.bankDB as unknown as { doPutBox: () => unknown }, 'doPutBox').mockImplementationOnce(() => { throw new VaultError('storage_blocked', 'blocked for the test') })
    const err = await TH.expectBad(bank.tryProbe({ whisper: { note: 'refused' } }), 'storage_blocked')
    expect(err.meta?.oplabel).to.eq('putBox')
  })

  it("returns a bad Outcome once its device is swept, and for an invalid label or horizon", async () => {
    const { bank: swept } = await readyBankOn()
    swept.device.sweep()
    await TH.expectBad(swept.tryProbe(), 'disabled')
    const { bank } = await readyBankOn()
    await TH.expectBad(bank.tryProbe({ boxlabel: '' }), 'bad_option')
    await TH.expectBad(bank.tryProbe({}, { maxMillisSinceRefresh: -1 }), 'bad_option')
  })
})

/** bank.probe: a trial of a bank's whole storage path, on real seals and a real gating. */

import { describe, expect, it, vi } from 'vitest'
import type { Box } from '../../src/models/box'
import { VaultError } from '../../src/refusals/errors'
import * as TH from '../test-helpers'
import { type BankWorld, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'

useBankWorlds()

const HomeBox = { vaultlabel: 'home', boxlabel: 'box1' }

const readyBankOn = async (world: BankWorld = makeBankWorld()) => {
  const bank = world.bankOn()
  await bank.hello()
  return { world, bank }
}

const whisperOf = async (box: Box): Promise<unknown> => await box.extractWhisper()

describe("bank.probe", () => {
  it("makes the vault 'home' on a bank with none, and leaves 'box1' holding the default whisper and sidecar", async () => {
    const { bank } = await readyBankOn()
    const box = await bank.probe()
    expect(box).to.include(HomeBox)
    expect(box.sidecar).to.deep.equal({ example: true })
    expect(await whisperOf(box)).to.deep.equal({ note: 'Shhh, this is a whisper' })
  })

  it("replaces what the box held, its record moving on, and adds no second box", async () => {
    const { bank } = await readyBankOn()
    const first = await bank.probe({ whisper: { note: 'first' } })
    const firstSeq = first.revision_seq
    const again = await bank.probe({ whisper: { note: 'again' } })
    expect(again.revision_seq).to.be.greaterThan(firstSeq)
    expect(await whisperOf(again)).to.deep.equal({ note: 'again' })
    const vault = bank.vaultAt({ vaultlabel: 'home' })
    expect(vault?.boxListing.things.map((listed) => listed.boxlabel)).to.deep.equal(['box1'])
  })

  it("takes the labels, whisper and sidecar it is given", async () => {
    const { world, bank } = await makeBankWithVault()
    const box = await bank.probe({ vaultlabel: 'main', boxlabel: 'trial', whisper: { token: 'sk-test-0000' }, sidecar: { kind: 'trial' } })
    expect(box).to.include({ vaultlabel: 'main', boxlabel: 'trial' })
    expect(box.sidecar).to.deep.equal({ kind: 'trial' })
    expect(await whisperOf(box)).to.deep.equal({ token: 'sk-test-0000' })
    expect(world.leaseRows()).to.have.lengthOf(1)
  })

  it("asks the user for a vault that is locked, and opens it", async () => {
    const { bank } = await readyBankOn()
    await bank.probe()
    bank.vaultAt({ vaultlabel: 'home' })?.lock()
    const box = await bank.probe()
    expect(bank.vaultAt({ vaultlabel: 'home' })?.isUnlocked).to.be.true
    expect(await whisperOf(box)).to.deep.equal({ note: 'Shhh, this is a whisper' })
  })

  it("replaces a box another device changed, once its record is past maxRefreshMillis", async () => {
    const world = makeBankWorld()
    const { bank } = await readyBankOn(world)
    await bank.probe({ whisper: { note: 'mine' } })
    const elsewhere = world.bankOnAnotherDevice()
    await elsewhere.hello()
    await elsewhere.probe({ whisper: { note: 'theirs' } })
    world.advance(2000)
    const box = await bank.probe({ whisper: { note: 'mine again' } })
    expect(await whisperOf(box)).to.deep.equal({ note: 'mine again' })
  })

  it("holds to a maxRefreshMillis of its own, apart from the bank's refresh settings", async () => {
    const world = makeBankWorld()
    const { bank } = await readyBankOn(world)
    await bank.probe({ whisper: { note: 'mine' } })
    const elsewhere = world.bankOnAnotherDevice()
    await elsewhere.hello()
    await elsewhere.probe({ whisper: { note: 'theirs' } })
    world.advance(2000)
    await TH.expectRefusal(bank.probe({ whisper: { note: 'late' } }, { maxRefreshMillis: 60_000 }), 'stale_write')
  })

  it("says a store that will not write, by the refusal its put meets", async () => {
    const { world, bank } = await readyBankOn()
    await bank.probe()
    vi.spyOn(world.vaultDB as unknown as { doPutBox: () => unknown }, 'doPutBox').mockImplementationOnce(() => { throw new VaultError('storage_blocked', 'blocked for the test') })
    await TH.expectBad(bank.tryProbe({ whisper: { note: 'refused' } }), 'storage_blocked')
  })

  it("refuses before hello, and a label it cannot use", async () => {
    const world = makeBankWorld()
    await TH.expectRefusal(world.bankOn().probe())
    const { bank } = await readyBankOn(world)
    await TH.expectRefusal(bank.probe({ boxlabel: '' }), 'bad_option')
  })

  it("refuses a maxRefreshMillis it cannot use", async () => {
    const { bank } = await readyBankOn()
    await TH.expectRefusal(bank.probe({}, { maxRefreshMillis: -1 }), 'bad_option')
  })
})

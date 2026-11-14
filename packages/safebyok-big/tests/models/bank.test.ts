/** The bank of `src/models/` end to end, over a real bankDB and deviceDB: ensureVault, its device row and its snapshot. */

import { describe, expect, it, vi } from 'vitest'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import * as TH from '../test-helpers'
import { BankScopeGiven, OtherScopeGiven, VaultScopeGiven, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
import { Dna, Passphrase, byPassphrase } from '../test-helpers/vault-world'

useBankWorlds()
const nothing = (): void => undefined


describe("bank.ensureVault", () => {
  it("refuses once its device is swept, asking nobody", async () => {
    const requestCleartext = vi.fn()
    const bank = await makeBankWorld().bankOn({ requestCleartext })
    bank.device.sweep()
    await TH.expectRefusal(bank.ensureVault(VaultScopeGiven), 'disabled')
    TH.expectSyncRefusal(() => bank.vaultAt(VaultScopeGiven), 'disabled')
    expect(requestCleartext).not.toHaveBeenCalled()
  })

  // BankedVaultScope @example
  it("puts a vault in a bank unlocked by asking, then returns the same vault without asking again", async () => {
    const { bank, vault } = await makeBankWithVault()
    expect(vault).to.include({ ...BankScopeGiven, ...VaultScopeGiven })
    expect(bank.isUnlocked).to.be.true
    expect(bank.vaultListing.snapshot).to.deep.equal([Dna.vaultlabel])
    expect(bank.snapshot.isLocked).to.be.false
    const seen = vi.fn()
    bank.subscribe(seen)
    bank.lock()
    expect(seen).toHaveBeenCalled()
    expect(bank.snapshot.isLocked).to.be.true
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
    expect(bank.isLocked).to.be.true
  })

  it("stores a vault not yet stored in a locked bank", async () => {
    const requestCleartext = vi.fn<RequestCleartext>(async (gating) => { await gating.attempt(byPassphrase(Passphrase)) })
    const { world, bank } = await makeBankWithVault(makeBankWorld(), { requestCleartext })
    requestCleartext.mockClear()
    bank.lock()
    const vault = await bank.ensureVault(OtherScopeGiven)
    expect(vault.isPresent).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(bank.isLocked).to.be.true
    expect(bank.vaultListing.snapshot).to.have.members([Dna.vaultlabel, vault.vaultlabel])
    expect(world.bankDB._cheat_shelfOf(BankScopeGiven).vaultrows.size).to.eq(2)
  })

  it("stores a vault while an unlock's gating is open", async () => {
    const world = makeBankWorld()
    let closeDialog = nothing
    let showDialog = nothing
    const shown = new Promise<void>((resolve) => { showDialog = resolve })
    const bank = await world.bankOn({ requestCleartext: async (gating) => {
      showDialog()
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase))
    } })
    const asking = bank.ensureUnlocked()
    await shown
    const vault = await bank.ensureVault(OtherScopeGiven)
    expect(vault.isPresent).to.be.true
    expect(bank.isLocked).to.be.true
    closeDialog()
    await asking
    expect(bank.isUnlocked).to.be.true
  })

  it("tryEnsureVault returns a refusal as an Outcome", async () => {
    const bank = await makeBankWorld().bankOn()
    bank.device.sweep()
    await TH.expectBad(bank.tryEnsureVault(VaultScopeGiven), 'disabled')
  })

  it("returns a stored vault in a fresh bank still locked, which unlocks with the device's cached lease without asking", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const requestCleartext = vi.fn()
    const fresh = await world.bankOn({ requestCleartext })
    expect(await fresh.ensureVault(VaultScopeGiven)).to.include({ ...VaultScopeGiven, isPresent: true })
    expect(fresh.isLocked).to.be.true
    await fresh.ensureUnlocked()
    expect(fresh.isUnlocked).to.be.true
    expect(requestCleartext).not.toHaveBeenCalled()
  })
})

describe("the bank's device_tok", () => {
  it("is the token of its device's row, which another page on the device shares", async () => {
    const world = makeBankWorld()
    const first = await world.bankOn()
    const second = await world.bankOn()
    const elsewhere = await world.bankOnAnotherDevice()
    const { device_tok } = await world.deviceDB.ensureCachedDevice(BankScopeGiven)
    expect([first.device_tok, first.snapshot.device_tok, second.device_tok]).to.deep.equal([device_tok, device_tok, device_tok])
    expect(elsewhere.device_tok).to.not.eq(device_tok)
  })
})

describe("the bank's snapshot", () => {
  it("is frozen, and the bank serializes as its row", async () => {
    const { bank } = await makeBankWithVault()
    expect(Object.isFrozen(bank.snapshot)).to.be.true
    expect(bank.toJSON()).to.deep.equal(bank.sparse)
  })
})

/** The bank of `src/models/` end to end, over a real vaultDB and deviceDB: ensureVault, its device row and its snapshot. */

import { describe, expect, it, vi } from 'vitest'
import * as TH from '../test-helpers'
import { BankScopeGiven, OtherScopeGiven, VaultScopeGiven, labelsOf, makeBankWithVault, makeBankWorld, useBankWorlds } from '../test-helpers/bank-world'
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
  it("builds an unlocked vault by asking, then returns the same vault without asking again", async () => {
    const { bank, vault } = await makeBankWithVault()
    expect(vault).to.include({ ...BankScopeGiven, ...VaultScopeGiven })
    expect(vault.isUnlocked).to.be.true
    expect(labelsOf(bank.snapshot)).to.deep.equal([Dna.vaultlabel])
    expect(bank.snapshot.vaults[0]?.isLocked).to.be.false
    const seen = vi.fn()
    bank.subscribe(seen)
    vault.lock()
    expect(seen).toHaveBeenCalled()
    expect(bank.snapshot.vaults[0]?.isLocked).to.be.true
    expect(await bank.ensureVault(VaultScopeGiven)).to.equal(vault)
    expect(vault.isLocked).to.be.true
  })

  it("refuses while a gating is open", async () => {
    const world = makeBankWorld()
    let closeDialog = nothing
    const bank = await world.bankOn({ requestCleartext: async (gating) => {
      await new Promise<void>((resolve) => { closeDialog = resolve })
      await gating.attempt(byPassphrase(Passphrase))
    } })
    const asking = bank.ensureVault(VaultScopeGiven)
    await TH.expectRefusal(bank.ensureVault(OtherScopeGiven))
    closeDialog()
    await asking
  })

  it("tryEnsureVault returns a refusal as an Outcome", async () => {
    const bank = await makeBankWorld().bankOn()
    bank.device.sweep()
    await TH.expectBad(bank.tryEnsureVault(VaultScopeGiven), 'disabled')
  })

  it("unlocks a fresh bank's vault with the device's cached lease, without asking", async () => {
    const world = makeBankWorld()
    await makeBankWithVault(world)
    const requestCleartext = vi.fn()
    const fresh = await world.bankOn({ requestCleartext })
    const vault = await fresh.ensureVault(VaultScopeGiven)
    expect(vault.isLocked).to.be.true
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
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
  it("is frozen, and serializes as itself", async () => {
    const { bank } = await makeBankWithVault()
    expect(Object.isFrozen(bank.snapshot)).to.be.true
    expect(bank.toJSON()).to.equal(bank.snapshot)
  })
})

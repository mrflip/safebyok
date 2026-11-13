/** The bank's and the gate's listings at their entrypoints: what each refuses, calling no bankDB verb, and what each answers where nothing is stored. */

import { describe, expect, it, vi } from 'vitest'
import { BankListing } from '../../src/models/bank-listing'
import { GateListing } from '../../src/models/gate-listing'
import { actRefused, mainGateMissing, rowOfOtherWorld, writtenByOwnVerbs } from '../../src/refusals/throwers'
import * as TH from '../test-helpers'
import { Dna, listingOptsOf, makeBornVault, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

const BankScope = Object.freeze({ user_id: Dna.user_id, banklabel: Dna.banklabel })
const GateScope = Object.freeze({ ...BankScope, gatelabel: 'main' as const })

/** The message of the refusal `operation` rejects with: which thrower refused, where the kind is no contract. */
async function refusalMessageOf(operation: Promise<unknown>): Promise<string> {
  const refusal = await TH.expectRefusal(operation)
  return refusal.message
}

describe("BankListing's entrypoints", () => {
  it("refuses the generic put", async () => {
    const { bank, bankDB, storedBankNow } = await makeBornVault()
    const building = vi.spyOn(bankDB, 'tryBuildBank')
    const putting = bank.listing.put(storedBankNow() as never, { expected: bank.sparse })
    expect(await refusalMessageOf(putting)).to.eq(writtenByOwnVerbs().message)
    expect(building).not.toHaveBeenCalled()
    expect(bank.isPresent).to.be.true
  })

  it("deletes the bank by its own del, unlocked, as the bank listing's del does", async () => {
    const { bank, bankDB, storedBankNow } = await makeBornVault()
    const deleting = vi.spyOn(bankDB, 'tryDelBank')
    expect(await bank.del(bank.scope)).to.equal(bank)
    expect(deleting).toHaveBeenCalledOnce()
    expect(storedBankNow()).to.include({ am: 'x' })
    expect(bank.isPresent).to.be.false
    expect(bank.device.openGating).to.be.null
  })

  it("refuses the gate's own del, as no bankDB verb deletes a gate alone", async () => {
    const { bank, bankDB } = await makeBornVault()
    const deleting = vi.spyOn(bankDB, 'tryDelBank')
    expect(await refusalMessageOf(bank.maingate.del(bank.maingate.scope))).to.eq(writtenByOwnVerbs().message)
    expect(deleting).not.toHaveBeenCalled()
    expect(bank.isPresent).to.be.true
  })

  it("refuses a del over an ante that is no bank row", async () => {
    const { bank, bankDB } = await makeBornVault()
    const deleting = vi.spyOn(bankDB, 'tryDelBank')
    await TH.expectRefusal(bank.listing.del({ ...BankScope } as never))
    expect(deleting).not.toHaveBeenCalled()
    expect(bank.isPresent).to.be.true
  })

  it("answers null for a bank never stored, and refuses one demanded", async () => {
    const world = makeVaultWorld()
    const listing = new BankListing(world.device, listingOptsOf(world))
    expect(await listing.get(BankScope, { ifAbsent: 'nil' })).to.be.null
    expect(await listing.list()).to.deep.equal([])
    expect(await refusalMessageOf(listing.get(BankScope, { ifAbsent: 'fail' }))).to.eq(actRefused('vault', 'bank_void').message)
  })

  it("refuses a scope not the device's, calling no bankDB verb", async () => {
    const world = makeVaultWorld()
    const ensuring = vi.spyOn(world.bankDB, 'tryEnsureBank')
    const listing = new BankListing(world.device, listingOptsOf(world))
    await TH.expectRefusal(listing.get({ ...BankScope, user_id: 'someone_else' }))
    expect(ensuring).not.toHaveBeenCalled()
  })
})

describe("GateListing's entrypoints", () => {
  it("refuses the generic put and del, as only the gate verbs write a gate row, calling no bankDB verb", async () => {
    const { bank, bankDB } = await makeBornVault()
    const replacing = vi.spyOn(bankDB, 'tryReplacePassphrase')
    const gate = bank.maingate
    const putting = bank.gateListing.put(gate.pickle(), { expected: gate.sparse })
    expect(await refusalMessageOf(putting)).to.eq(writtenByOwnVerbs().message)
    expect(await refusalMessageOf(bank.gateListing.del(gate.sparse))).to.eq(writtenByOwnVerbs().message)
    expect(replacing).not.toHaveBeenCalled()
  })

  it("refuses each gate verb over an ante that is no gate row, calling no bankDB verb", async () => {
    const { bank, bankDB } = await makeBornVault()
    const spies = [vi.spyOn(bankDB, 'tryReplacePassphrase'), vi.spyOn(bankDB, 'tryAddPasskey'), vi.spyOn(bankDB, 'tryRevokePasskey')]
    const notGate = { ...GateScope } as never
    await TH.expectRefusal(bank.gateListing.replacePassphrase(notGate, bank.maingate.wayins.main))
    await TH.expectRefusal(bank.gateListing.addPasskey(notGate, { ...TH.passkeyWayin, wayinlabel: 'passkey0' }))
    await TH.expectRefusal(bank.gateListing.revokePasskey(notGate))
    for (const spy of spies) { expect(spy).not.toHaveBeenCalled() }
  })

  it("refuses a gate verb whose wayin does not check, the gate unmoved", async () => {
    const { bank } = await makeBornVault()
    const ante = bank.maingate.pickle()
    await TH.expectRefusal(bank.gateListing.replacePassphrase(ante, { wayinlabel: 'main' } as never))
    expect(bank.maingate.pickle()).to.deep.equal(ante)
  })

  it("refuses a gate row of another bank life, delivering nothing", async () => {
    const { bank } = await makeBornVault()
    const ante = bank.maingate.pickle()
    const other = { ...ante, bank_tok: 'bank-tok-of-another-life' }
    expect(() => bank.gateListing.deliverRecord(other)).to.throw(rowOfOtherWorld(other, 'bank_tok').message)
    expect(bank.maingate.pickle()).to.deep.equal(ante)
  })

  it("refuses a gate demanded of a bank the bankDB no longer has", async () => {
    const world = await makeBornVault()
    const { bankDB, maxMillisSinceRefresh } = listingOptsOf(world)
    const listing = new GateListing(world.bank, { bankDB, maxMillisSinceRefresh })
    world.bankDB._cheat_shelfOf(BankScope).bank = null
    world.bankDB._cheat_shelfOf(BankScope).gaterows.clear()
    expect(await refusalMessageOf(listing.get(GateScope, { ifAbsent: 'fail' }))).to.eq(mainGateMissing(world.bank.sparse).message)
  })
})

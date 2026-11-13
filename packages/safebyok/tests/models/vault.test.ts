import { describe, expect, it, vi } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'
import { Vault } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, T0, listingOptsOf, makeBornVault, makeBornVaultAndFriend, makeVaultWorld, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("bank.ensureVault", () => {
  it("stores a new vault record of the bank, at its first revision", async () => {
    const { bank, vault, storedNow } = await makeBornVault()
    expect(vault.bank_tok).to.eq(bank.bank_tok)
    expect(vault.revision_seq).to.eq(0)
    expect(vault.registered_at).to.eq(T0)
    expect(storedNow()).to.deep.equal(vault.toJSON())
  })

  it("builds no bank when the dialog throws", async () => {
    const { device, bankDB } = makeVaultWorld({ requestCleartext: () => { throw new Error("the user closed the dialog") } })
    await TH.expectRefusal(device.ensureBank())
    expect(bankDB._cheat_shelfOf(Dna).bank).to.be.null
  })

  it("answers the vault already listed at its scope, without asking", async () => {
    const { bank, vault, dialog } = await makeBornVault()
    const requestCleartext = vi.fn()
    dialog.requestCleartext = requestCleartext
    await expect(bank.ensureVault({ vaultlabel: Dna.vaultlabel })).resolves.to.equal(vault)
    expect(requestCleartext).not.toHaveBeenCalled()
  })
})

describe("VaultListing.build of a record, and its constructor", () => {
  it("listing.recordOf(vault) returns the record the vault was built from", async () => {
    const { listing, vault, demandStored } = await makeBornVault()
    expect(listing.recordOf(vault)).to.deep.equal(demandStored())
  })

  it("refuses a device in place of its bank, and an option it does not take", async () => {
    const born = await makeBornVault()
    const { bank } = born
    const { bankDB, maxMillisSinceRefresh } = listingOptsOf(born)
    expect(new VaultListing(bank, { bankDB, maxMillisSinceRefresh })).to.be.instanceOf(VaultListing)
    TH.expectSyncRefusal(() => new VaultListing(bank.device as never, { bankDB, maxMillisSinceRefresh }), 'bad_option')
    TH.expectSyncRefusal(() => new VaultListing(bank, { bankDB, maxMillisSinceRefresh, askUser: null } as never), 'bad_option')
  })

  it("refuses what is not a listing, and a central that fails its check, where a vault is made", async () => {
    const { vault, listing } = await makeBornVault()
    TH.expectSyncRefusal(() => new Vault(listing.bank as never, vault.toJSON()), 'bad_option')
    TH.expectSyncRefusal(() => new Vault(listing, { am: 'a' } as never), 'bad_option')
  })
})

describe("proving.buildLease(friend, gate)", () => {
  it("grants a lease to the bank and gate the proving belongs to, caching nothing", async () => {
    const { deviceDB, proving, friend, gate } = await makeBornVaultAndFriend()
    deviceDB.tryStow.mockClear()
    const lease = await proving.buildLease(friend, gate)
    expect(lease.isGranted).to.be.true
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
    lease.evict()
  })

  it("refuses a gate of another life, before any key is touched", async () => {
    const { deviceDB, proving, friend, gate } = await makeBornVaultAndFriend()
    deviceDB.tryStow.mockClear()
    const err = await TH.expectRefusal(proving.buildLease(friend, { ...gate, gate_tok: 'gate-tok-other' }))
    expect(err.message).to.eq(Phrases.LeaseOfOtherGate)
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })
})

describe("the friend a bank hands its leases", () => {
  it("calls the deviceDB under the bank's own scope", async () => {
    const { bank, deviceDB, friend } = await makeBornVaultAndFriend()
    await friend.peekLease()
    await friend.forgetLease()
    const asked = { ...bank.scope, bank_tok: bank.bank_tok }
    expect(deviceDB.peek).toHaveBeenCalledWith(asked)
    expect(deviceDB.forget).toHaveBeenCalledWith(asked)
  })
})

describe("vault.receiveParent(parent)", () => {
  it("refuses a parent that is no vault row", async () => {
    const { vault } = await makeBornVault()
    TH.expectSyncRefusal(() => { vault.receiveParent({ am: 'nope' }) }, 'record_conflict')
  })
})

const Horizon = 10 * 60_000

async function bornWithGets() {
  const born = await makeBornVault()
  return { ...born, gets: vi.spyOn(born.bankDB, 'tryGetVault') }
}

describe("vault.ensureTimely(maxMillis)", () => {
  it("fetches only once its record is older than maxMillis", async () => {
    const { vault, advance, gets } = await bornWithGets()
    advance(999)
    await expect(vault.ensureTimely(1000)).resolves.to.equal(vault)
    expect(gets).not.toHaveBeenCalled()
    advance(1)
    await expect(vault.ensureTimely(1000)).resolves.to.equal(vault)
    expect(gets).toHaveBeenCalledOnce()
  })

  it("goes by the vault's own horizon when given no maxMillis", async () => {
    const { vault, advance, gets } = await bornWithGets()
    advance(Horizon - 1)
    await vault.ensureTimely()
    expect(gets).not.toHaveBeenCalled()
    advance(1)
    await vault.ensureTimely()
    expect(gets).toHaveBeenCalledOnce()
  })

  it("always fetches under a maxMillis of zero", async () => {
    const { vault, gets } = await bornWithGets()
    await vault.ensureTimely(0)
    expect(gets).toHaveBeenCalledOnce()
  })

  it("overlapping calls share one get", async () => {
    const { vault, gets } = await bornWithGets()
    await expect(Promise.all([vault.ensureTimely(0), vault.ensureTimely(0)])).resolves.to.deep.equal([vault, vault])
    expect(gets).toHaveBeenCalledOnce()
  })

  it("adopts what it fetches on the instance", async () => {
    const { vault, demandStored, putBehindOurBack } = await bornWithGets()
    const moved = putBehindOurBack(demandStored())
    await vault.ensureTimely(0)
    expect(vault.revision_tok).to.eq(moved.revision_tok)
  })

  it("refuses for a vault its fetch finds deleted, which then answers nothing", async () => {
    const { vault, demandStored, restoreRow } = await bornWithGets()
    const stored = demandStored()
    restoreRow({ ...stored, am: 'x' as const, revision_seq: stored.revision_seq + 1, revision_tok: 'rev-gone' })
    await TH.expectRefusal(vault.ensureTimely(0), 'vault_gone')
    expect(vault.isEnabled).to.be.false
    TH.expectSyncRefusal(() => vault.demandEnabled(), 'vault_gone')
    TH.expectSyncRefusal(() => vault.demandWatchable(), 'vault_gone')
  })

  it("refuses a maxMillis out of range", async () => {
    const { vault } = await bornWithGets()
    await TH.expectRefusal(vault.ensureTimely(-1))
  })
})


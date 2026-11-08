import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import * as Phrases from '../../src/helpers/phrases'
import { Vault } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, Passphrase, T0, makeBornVault, makeBornVaultAndFriend, makeVaultWorld, makeProving, storedVaultRecord, useVaultWorlds, buildTyping, byPassphrase } from '../test-helpers/vault-world'

useVaultWorlds()

describe("VaultListing.buildVault: the gate is built before the vault is born, and stored in the vault record alone", () => {
  it("builds the vault's gate from what the closure answers, and stores the record with it over no record", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await buildTyping(listing, Dna, byPassphrase(Passphrase))
    expect(vault.gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(vault.gate.passkey_wayin).to.be.null
    expect(vault.gate.stamp).to.deep.equal({ ...Dna, vault_tok: vault.vault_tok, registered_at: T0 })
    expect(vault.revision_seq).to.eq(0)
    expect(storedNow()?.gate).to.deep.include(vault.gate.pickle())
  })

  it("holds no vault where the dialog throws: the refusal is sanitized, and a second buildVault is not refused as already held", async () => {
    const { listing, storedNow } = makeVaultWorld(null, { requestCleartext: () => { throw new Error("the user closed the dialog") } })
    await TH.expectRefusal(listing.buildVault(Dna))
    expect(listing.things).to.have.lengthOf(0)
    const vault = await buildTyping(listing, Dna, byPassphrase(Passphrase))
    expect(storedNow()?.gate).to.deep.include(vault.gate.pickle())
  })

  it("refuses a dna for a scope already held, before the dialog is shown", async () => {
    const { listing, fakeBank } = makeVaultWorld()
    const vault = await buildTyping(listing, Dna, byPassphrase(Passphrase))
    const dialog = vi.fn()
    fakeBank.requestCleartext = dialog
    await TH.expectRefusal(listing.buildVault(Dna))
    expect(dialog).not.toHaveBeenCalled()
    expect(listing.at(Dna)).to.equal(vault)
  })
})

describe("VaultListing.build of a record, and its constructor", () => {
  it("holds the vault with the gate its record carries", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(record)
    expect(vault.gate.pickle()).to.deep.equal(record.gate)
    expect(vault.gate).to.equal(vault.gate)
  })

  it("ducks as its record, the gate_epoch riding on the Gate: listing.recordOf(vault) answers the record it holds", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(record)
    expect(listing.recordOf(vault)).to.deep.equal(record)
  })

  it("has no gate in hand while it holds a sparse record, and refuses until it is hydrated", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    TH.expectSyncRefusal(() => vault.gate)
    await vault.hydrate()
    expect(vault.gate.pickle()).to.deep.equal(record.gate)
  })

  it("refuses a world without what a vault's gate and lease need", () => {
    const { fakeBank, opts } = makeVaultWorld()
    TH.expectSyncRefusal(() => new VaultListing(TH.omitting(fakeBank, 'deviceDB'), opts))
    TH.expectSyncRefusal(() => new VaultListing(TH.omitting(fakeBank, 'keyDeriver'), opts))
    TH.expectSyncRefusal(() => new VaultListing(TH.omitting(fakeBank, 'leaseMillis'), opts))
    TH.expectSyncRefusal(() => new VaultListing(TH.omitting(fakeBank, 'boxRefreshMillis'), opts))
  })

  it("refuses a deviceDB that is a duck of one, and a host's bare function or logger where the bank holds it guarded", () => {
    const { fakeBank, opts } = makeVaultWorld()
    const duck = { tryPeek: vi.fn(), tryStow: vi.fn(), tryForget: vi.fn() }
    const err = TH.expectSyncRefusal(() => new VaultListing({ ...fakeBank, deviceDB: duck as never }, opts))
    expect(err.message).to.include(Phrases.DeviceDBExpected)
    TH.expectSyncRefusal(() => new VaultListing(fakeBank, { ...opts, panic: vi.fn() as never }))
    TH.expectSyncRefusal(() => new VaultListing({ ...fakeBank, askUser: vi.fn() as never }, opts))
    TH.expectSyncRefusal(() => new VaultListing({ ...fakeBank, logger: TH.quietLogger }, opts))
    TH.expectSyncRefusal(() => new VaultListing({ ...fakeBank, keyDeriver: TH.testDeriver as never }, opts))
  })

  it("refuses a panic the bank did not brand, where a vault is made", async () => {
    const { vault, fakeBank, listing } = await makeBornVault(byPassphrase(Passphrase))
    TH.expectSyncRefusal(() => new Vault(fakeBank, listing, vault.fullRecord, vi.fn() as never), 'bad_option')
  })
})

describe("proving.buildLease(friend): the vault is taken at the grant", () => {
  it("grants the vault whose stamp the proving is of a lease, caching nothing of itself", async () => {
    const { vault, deviceDB, friend } = await makeBornVaultAndFriend()
    const proving = await makeProving(vault)
    deviceDB.tryStow.mockClear()
    const lease = await proving.buildLease(friend)
    expect(lease.isPresent).to.be.true
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
    lease.evict()
  })

  it("refuses a vault of another stamp, before any key is touched", async () => {
    const { deviceDB, friend } = await makeBornVaultAndFriend()
    const proving = await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })
    deviceDB.tryStow.mockClear()
    const err = await TH.expectRefusal(proving.buildLease(friend))
    expect(err.message).to.eq(Phrases.LeaseOfOtherVault)
    expect(deviceDB.tryStow).not.toHaveBeenCalled()
  })
})

describe("the friend a vault hands its leases", () => {
  it("calls the deviceDB under the vault's own scope", async () => {
    const { vault, deviceDB, friend } = await makeBornVaultAndFriend()
    await friend.tryPeekLease()
    await friend.tryForgetLease()
    const asked = { ...vault.scope, vault_tok: vault.vault_tok }
    expect(deviceDB.peek).toHaveBeenCalledWith(asked)
    expect(deviceDB.tryForget).toHaveBeenCalledWith(asked)
  })
})

describe("vault.takeWorld(world)", () => {
  it("refuses a world that is no vault row", async () => {
    const { vault } = await makeBornVault()
    TH.expectSyncRefusal(() => { vault.takeWorld({ am: 'nope' }) }, 'damaged_row')
  })
})

const Horizon = 10 * 60_000

const bornWithGets = async () => {
  const born = await makeBornVault()
  return { ...born, gets: vi.spyOn(born.opts.vaultDB, 'tryGetVault') }
}

describe("vault.ensureTimely(maxMillis)", () => {
  it("answers itself with no fetch while the record in hand is younger than maxMillis, and fetches once it is not", async () => {
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

  it("joins the fetch under way: overlapping calls make one get and share its answer", async () => {
    const { vault, gets } = await bornWithGets()
    await expect(Promise.all([vault.ensureTimely(0), vault.ensureTimely(0)])).resolves.to.deep.equal([vault, vault])
    expect(gets).toHaveBeenCalledOnce()
  })

  it("lands what it fetches on the instance", async () => {
    const { vault, demandStored, storeBehindOurBack } = await bornWithGets()
    const landed = storeBehindOurBack(demandStored())
    await vault.ensureTimely(0)
    expect(vault.revision_tok).to.eq(landed.revision_tok)
  })

  it("resolves over a vault its fetch finds gone, leaving demandEnabled to refuse", async () => {
    const { vault, demandStored, restoreRow } = await bornWithGets()
    const stored = demandStored()
    restoreRow({ ...omit(stored, ['gate']), am: 'x' as const, revision_seq: stored.revision_seq + 1, revision_tok: 'rev-gone' })
    await expect(vault.ensureTimely(0)).resolves.to.equal(vault)
    TH.expectSyncRefusal(() => vault.demandEnabled())
  })

  it("refuses a maxMillis out of range", async () => {
    const { vault } = await bornWithGets()
    await TH.expectRefusal(vault.ensureTimely(-1))
  })
})


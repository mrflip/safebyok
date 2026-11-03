import { omit } from 'es-toolkit'
import { describe, expect, it, vi } from 'vitest'
import * as MSX from '../../src/models/models-shapes'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, Passphrase, T0, makeBornVault, makeVaultWorld, makeProving, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("VaultListing.create: the gate is built before the vault is born, and stored in the vault record alone", () => {
  it("builds the vault's gate from what the closure answers, and stores the record with it over no record", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    expect(vault.gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(vault.gate.passkey_wayin).to.be.null
    expect(vault.gate.stamp).to.deep.equal({ ...Dna, vault_tok: vault.vault_tok, registered_at: T0 })
    expect(vault.revision_seq).to.eq(0)
    expect(storedNow()?.gate).to.deep.include(vault.gate.pickle())
  })

  it("refuses a dna without a closure as 'bad_option', holding no vault", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.create(Dna), 'bad_option')
    expect(listing.things).to.have.lengthOf(0)
  })

  it("holds no vault where the closure throws: the refusal is the sanitized 'unexpected_error', and a second create is not refused as already held", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.create(Dna, () => { throw new Error('the user closed the dialog') }), 'unexpected_error')
    expect(listing.things).to.have.lengthOf(0)
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    expect(storedNow()?.gate).to.deep.include(vault.gate.pickle())
  })

  it("refuses 'bad_option' a dna for a scope already held, before the closure is asked anything", async () => {
    const { listing } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const closure = vi.fn(() => ({ passphrase: Passphrase }))
    await TH.expectRefusal(listing.create(Dna, closure), 'bad_option')
    expect(closure).not.toHaveBeenCalled()
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

  it("has no gate in hand while it holds a sparse record, and refuses 'bad_option' until it is hydrated", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    TH.expectSyncRefusal(() => vault.gate, 'bad_option')
    await vault.hydrate()
    expect(vault.gate.pickle()).to.deep.equal(record.gate)
  })

  it("refuses 'bad_option' a world without what a vault's gate and lease need", () => {
    const { opts } = makeVaultWorld()
    TH.expectSyncRefusal(() => new VaultListing({ ...opts, world: TH.omitting(opts.world, 'deviceDB') }), 'bad_option')
    TH.expectSyncRefusal(() => new VaultListing({ ...opts, world: TH.omitting(opts.world, 'keyDeriver') }), 'bad_option')
  })

  it("refuses 'bad_option' a deviceDB missing a verb the friend binds, and an onPanic that is no function", () => {
    const { opts } = makeVaultWorld()
    for (const verb of ['peek', 'tryCache', 'tryVacate']) {
      const missing = { peek: vi.fn(), tryCache: vi.fn(), tryVacate: vi.fn(), [verb]: undefined }
      TH.expectSyncRefusal(() => new VaultListing({ ...opts, world: { ...opts.world, deviceDB: missing as never } }), 'bad_option')
    }
    TH.expectSyncRefusal(() => new VaultListing({ ...opts, world: { ...opts.world, onPanic: 'call me' as never } }), 'bad_option')
  })
})

describe("proving.buildLease(friend): the vault is taken at the grant", () => {
  it("grants the vault whose stamp the proving is of a lease, caching nothing of itself", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const proving = await makeProving(vault)
    deviceDB.tryCache.mockClear()
    const lease = await proving.buildLease(vault.leaseFriend())
    expect(lease.isInForce).to.be.true
    expect(deviceDB.tryCache).not.toHaveBeenCalled()
    lease.evict()
  })

  it("refuses 'bad_option' a vault of another stamp, before any key is touched", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const proving = await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })
    deviceDB.tryCache.mockClear()
    await TH.expectRefusal(proving.buildLease(vault.leaseFriend()), 'bad_option')
    expect(deviceDB.tryCache).not.toHaveBeenCalled()
  })
})

describe("vault.leaseFriend()", () => {
  it("binds the deviceDB's lease verbs to the vault's scope, so no verb takes one", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const friend = vault.leaseFriend()
    await friend.peekLease()
    await friend.tryUncacheLease()
    const asked = { ...vault.scope, vault_tok: vault.vault_tok }
    expect(deviceDB.peek).toHaveBeenCalledWith(asked)
    expect(deviceDB.tryVacate).toHaveBeenCalledWith(asked)
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

  it("refuses 'vault_gone' a vault its fetch finds gone", async () => {
    const { vault, demandStored, restoreRow } = await bornWithGets()
    const stored = demandStored()
    restoreRow({ ...omit(stored, ['gate']), am: 'x' as const, revision_seq: stored.revision_seq + 1, revision_tok: 'rev-gone' })
    await TH.expectRefusal(vault.ensureTimely(0), 'vault_gone')
  })

  it("refuses a maxMillis out of range as 'bad_option'", async () => {
    const { vault } = await bornWithGets()
    await TH.expectRefusal(vault.ensureTimely(-1), 'bad_option')
  })
})

describe("vault.ensureReadyToChangeGate(): a gate is changed over a record fetched within Promptly", () => {
  it("fetches nothing under 2,000 ms since the last fetch, and fetches at 2,000 ms", async () => {
    expect(MSX.Promptly).to.eq(2000)
    const { vault, opts, advance } = await makeBornVault()
    const gets = vi.spyOn(opts.vaultDB, 'tryGetVault')
    advance(MSX.Promptly - 1)
    await vault.ensureReadyToChangeGate()
    expect(gets).not.toHaveBeenCalled()
    advance(1)
    await vault.ensureReadyToChangeGate()
    expect(gets).toHaveBeenCalledOnce()
  })
})

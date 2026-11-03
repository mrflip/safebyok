import { describe, expect, it, vi } from 'vitest'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, Passphrase, T0, makeVaultWorld, makeProving, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

describe("VaultListing.create: the gate is built before the vault is born, and stored in the vault record alone", () => {
  it("builds the vault's gate from what the closure answers, and stores the record with it over no record", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    expect(vault.gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(vault.gate.passkey_wayin).to.be.null
    expect(vault.gate.stamp).to.deep.equal({ ...Dna, vault_tok: vault.vault_tok, registered_at: T0 })
    expect(vault.revision_seq).to.eq(0)
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
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
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
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
})

describe("Proving.makeLease(vault, dbfriend, opts): the vault is taken at the grant", () => {
  it("grants the vault whose stamp the proving is of a lease, through the vault's dbfriend", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const proving = await makeProving(vault)
    deviceDB.tryPutLease.mockClear()
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: 60_000 })
    expect(lease.isInForce).to.be.true
    expect(lease.vault).to.equal(vault)
    expect(deviceDB.tryPutLease).toHaveBeenCalledOnce()
    await lease.forget()
  })

  it("refuses 'bad_option' a vault of another stamp, before any key is touched", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const proving = await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })
    deviceDB.tryPutLease.mockClear()
    await TH.expectRefusal(proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: 60_000 }), 'bad_option')
    expect(deviceDB.tryPutLease).not.toHaveBeenCalled()
  })
})

describe("Vault.leaseDBFriend", () => {
  it("binds the world's lease verbs to the vault's scope, so no verb takes one", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.create(Dna, () => ({ passphrase: Passphrase }))
    const dbfriend = vault.leaseDBFriend()
    await dbfriend.tryGetLease()
    await dbfriend.tryDelLease()
    expect(deviceDB.tryGetLease).toHaveBeenCalledWith(vault.scope)
    expect(deviceDB.tryDelLease).toHaveBeenCalledWith(vault.scope)
  })
})

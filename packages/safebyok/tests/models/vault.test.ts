import { describe, expect, it } from 'vitest'
import type { Vault } from '../../src/models/vault'
import { VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'
import { Dna, Passphrase, T0, byPassphrase, makeBornVault, makeVaultWorld, makeProving, storedVaultRecord, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** The gate of a vault of `Dna` proved under another passphrase entirely: one this test's vault never proved. */
const unprovedGateOf = async () => {
  const { gate } = await storedVaultRecord('another passphrase entirely')
  return gate
}

describe("VaultListing.ensure: the gate is built before the vault is born, and the vault is held only as stored", () => {
  it("builds the vault's gate of the cleartexts handed in and stores the vault record with it, unlocked under its lease", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    expect(vault.gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(vault.gate.passkey_wayin).to.be.null
    expect(vault.gate.stamp).to.deep.equal({ ...Dna, vault_tok: vault.vault_tok, registered_at: T0 })
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
    expect(storedNow()?.vault_tok).to.eq(vault.vault_tok)
    expect(vault.isLocked).to.be.false
  })

  it("refuses a dna handed to build as 'bad_option', holding no vault", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.build(Dna), 'bad_option')
    expect(listing.things).to.have.lengthOf(0)
  })

  it("holds and stores nothing where the passphrase is refused: a weak one refuses 'weak_passphrase', and the next ensure stores the vault", async () => {
    const { listing, storedNow, strengthChecker } = makeVaultWorld()
    strengthChecker.mockReturnValueOnce({ strong: false, reason: 'Add another word or two.' })
    await TH.expectRefusal(listing.ensure(Dna, byPassphrase('pw')), 'weak_passphrase')
    expect(listing.things).to.have.lengthOf(0)
    expect(storedNow()).to.be.null
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
  })

  it("holds the vault another device stored first, meeting 'stale_write': locked, its gate the stored one, and the record stored untouched", async () => {
    const theirs = await storedVaultRecord('another passphrase entirely')
    const { listing, storedNow, storeBehindOurBack } = makeVaultWorld()
    const landed = storeBehindOurBack(theirs)
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    expect(vault.vault_tok).to.eq(theirs.vault_tok)
    expect(vault.gate.pickle()).to.deep.equal(theirs.gate)
    expect(vault.isLocked).to.be.true
    expect(storedNow()).to.deep.equal(landed)
    expect(listing.at(Dna)).to.equal(vault)
  })

  it("answers the vault already held where it is ensured again, storing nothing new", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    const stored = storedNow()
    expect(await listing.ensure(Dna, byPassphrase(Passphrase))).to.equal(vault)
    expect(storedNow()).to.deep.equal(stored)
  })
})

/** A world whose next lease put lets `overtake` land first, then waits two ticks, so an erase nothing holds back lands before the put. */
const worldOvertakenAtPut = (overtake: (vault: Vault) => void) => {
  const world = makeVaultWorld()
  const put = world.deviceDB.tryPutLease.getMockImplementation()!
  world.deviceDB.tryPutLease.mockImplementationOnce(async (record) => {
    overtake(world.listing.at(Dna)!)
    await TH.wakeupAtNextTick()
    await TH.wakeupAtNextTick()
    return put(record)
  })
  return world
}

describe("VaultListing.ensure overtaken by the vault's lock or let-go before its birth lease is taken up (G4)", () => {
  it("leaves the vault locked where vault.lock() lands as the birth lease is put, and the lock's erase, landing after the put, keeps no lease", async () => {
    const { listing, deviceDB } = worldOvertakenAtPut((vault) => { vault.lock() })
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    expect(vault.isLocked).to.be.true
    TH.expectSyncRefusal(() => vault.demandLease(), 'vault_locked')
    await TH.eventually(() => deviceDB.tryDelLease.mock.calls.length > 0)
    expect(deviceDB.cachedNow()).to.be.null
    expect(deviceDB.tryDelLease.mock.invocationCallOrder.at(-1)).to.be.greaterThan(deviceDB.tryPutLease.mock.invocationCallOrder.at(-1) ?? Infinity)
  })

  it("leaves the vault locked where letLeaseGo lands as the birth lease is put, keeping the lease put for the next session, as a let-go keeps any", async () => {
    const { listing, deviceDB } = worldOvertakenAtPut((vault) => { vault.letLeaseGo() })
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
    expect(deviceDB.tryDelLease).not.toHaveBeenCalled()
  })

  it("stores the vault all the same: the next ensure answers it, locked, storing nothing new", async () => {
    const { listing, storedNow } = worldOvertakenAtPut((vault) => { vault.lock() })
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    const stored = storedNow()
    expect(stored?.vault_tok).to.eq(vault.vault_tok)
    expect(await listing.ensure(Dna, byPassphrase(Passphrase))).to.equal(vault)
    expect(storedNow()).to.deep.equal(stored)
  })
})

describe("VaultListing.fetch: a vault it gives birth to takes up the lease this device keeps", () => {
  it("answers unlocked, asking nothing, a vault the fetch gives birth to whose lease the device keeps", async () => {
    const { listing, demandStored, anotherSession, requestCleartext } = await makeBornVault()
    const record = demandStored()
    const later = anotherSession()
    const vault = await later.fetch(Dna)
    expect(vault?.vault_tok).to.eq(record.vault_tok)
    expect(vault?.isLocked).to.be.false
    expect(requestCleartext).not.toHaveBeenCalled()
    expect(listing.at(Dna)).to.not.equal(vault)
  })

  it("answers locked a vault the fetch gives birth to where the device keeps no lease", async () => {
    const { vault: born, deviceDB, anotherSession } = await makeBornVault()
    born.lock()
    await TH.eventually(() => deviceDB.cachedNow() === null)
    const vault = await anotherSession().fetch(Dna)
    expect(vault?.isLocked).to.be.true
  })

  it("takes up nothing for a vault it already held: one locked stays locked", async () => {
    const { listing, vault, deviceDB } = await makeBornVault()
    vault.letLeaseGo()
    expect(await listing.fetch(Dna)).to.equal(vault)
    expect(vault.isLocked).to.be.true
    expect(deviceDB.cachedNow()).to.not.be.null
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

describe("Vault.edit and Vault.send: the gate of the record in hand rides every edit, and no patch can change it", () => {
  it("keeps the gate through an edit over a sparse vault record, fetching the full record first", async () => {
    const record = await storedVaultRecord()
    const { listing, storedNow } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    await vault.edit({})
    expect(vault.gate.pickle()).to.deep.equal(record.gate)
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(record.gate)
    expect(storedNow()?.revision_seq).to.eq(record.revision_seq + 1)
  })

  it("sends a vault held sparse, with no edit before, by fetching its full record first, so the record it stores carries the gate: no vault is sent without one", async () => {
    const record = await storedVaultRecord()
    const { listing, storedNow } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(record.gate)
    expect(storedNow()?.revision_seq).to.eq(record.revision_seq + 1)
  })

  it("keeps the gate of the record another device stored, where its newer sparse record arrived as a box's world since the last fetch", async () => {
    const record = await storedVaultRecord()
    const { listing, storedNow, storeBehindOurBack } = makeVaultWorld(record)
    const vault = await listing.build(record)
    const theirs = storeBehindOurBack({ ...record, gate: await unprovedGateOf() })
    vault.takeWorld(listing.sparseOf(theirs))
    expect(vault.revision_seq).to.eq(theirs.revision_seq)
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(theirs.gate)
    expect(storedNow()?.revision_seq).to.eq(theirs.revision_seq + 1)
  })

  it("ignores a patch's gate, as it does every other prop of the patch: the one stored is the one proved at birth", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    const { gate } = vault
    const unproved = await unprovedGateOf()
    await vault.edit({ gate: unproved })
    expect(vault.gate).to.equal(gate)
    await vault.send({ gate: unproved })
    expect(storedNow()?.gate).to.deep.equal(gate.pickle())
  })
})

describe("Proving.makeLease(vault, dbfriend, opts): the vault is taken at the grant", () => {
  it("grants the vault whose stamp the proving is of a lease, through the vault's dbfriend", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
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
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    const proving = await makeProving({ vault_tok: 'vault-tok-other', registered_at: T0 })
    deviceDB.tryPutLease.mockClear()
    await TH.expectRefusal(proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: 60_000 }), 'bad_option')
    expect(deviceDB.tryPutLease).not.toHaveBeenCalled()
  })
})

describe("Vault.leaseDBFriend", () => {
  it("binds the world's lease verbs to the vault's scope, so no verb takes one", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.ensure(Dna, byPassphrase(Passphrase))
    const dbfriend = vault.leaseDBFriend()
    await dbfriend.tryGetLease()
    await dbfriend.tryDelLease()
    expect(deviceDB.tryGetLease).toHaveBeenCalledWith(vault.scope)
    expect(deviceDB.tryDelLease).toHaveBeenCalledWith(vault.scope)
  })
})

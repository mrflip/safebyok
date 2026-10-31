import { describe, expect, it, vi } from 'vitest'
import type { VaultScope } from '../../src/shapes/scopes'
import type { VaultRecord, VaultSparse } from '../../src/models/models-shapes'
import { type VaultListingOpts, type VaultWorld, VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'

const T0 = Date.UTC(2026, 9, 31)
const Dna = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
const ok = <ValT>(val: ValT) => Promise.resolve({ ok: true as const, val, err: null })
const nothing = (): void => undefined

/** A vault listing over a vaultDB of one row, `stored0` to begin with, a cache that keeps nothing, and a world whose deviceDB logs each lease verb. */
const makeVaultWorld = (stored0: VaultRecord | null = null) => {
  let stored = stored0
  const deviceDB = { tryGetLease: vi.fn(() => ok(null)), tryPutLease: vi.fn((record: unknown) => ok(record)), tryDelLease: vi.fn(() => ok(undefined)) }
  const world: VaultWorld = {
    clock:        { now: () => T0 },
    lockState:    () => 'unlocked',
    ensureTimely: () => Promise.resolve(),
    takeWorld:    nothing,
    scope:        { applabel: Dna.applabel, user_id: Dna.user_id },
    logger:       TH.quietLogger,
    keyDeriver:   TH.testDeriver,
    device_id:    'device-1',
    leaseMillis:  60 * 60_000,
    deviceDB:     deviceDB as unknown as VaultWorld['deviceDB'],
  }
  const answerOf = (scope: VaultScope, val: VaultRecord | VaultSparse | null) => ({ scope, ok: true as const, val, world: null })
  const opts: VaultListingOpts = {
    world,
    store: {
      get:   (scope) => Promise.resolve(answerOf(scope, stored)),
      put:   (record) => { stored = record; return Promise.resolve(answerOf(record, record)) },
      del:   () => Promise.reject(new Error('not in these tests')),
      watch: () => nothing,
    },
    cache: { load: () => Promise.resolve([]), save: () => Promise.resolve() },
    maxMillisSinceRefresh: 10 * 60_000,
  }
  const listing = new VaultListing(opts)
  return { listing, opts, deviceDB, storedNow: () => stored }
}

/** The one vault a listing holds; throws where it holds none. */
const heldVault = (listing: VaultListing) => {
  const [vault] = listing.things
  if (vault === undefined) { throw new Error('no vault held') }
  return vault
}

/** The record of a vault built of `Dna`, gated and sent, as a vaultDB holds it. */
const storedVaultRecord = async () => {
  const { listing, storedNow } = makeVaultWorld()
  const vault = await listing.build(Dna, () => ({ passphrase: 'correct horse battery staple' }))
  await vault.send({})
  const record = storedNow()
  if (record === null) { throw new Error('nothing stored') }
  return record
}

describe("VaultListing.build of a dna, and Vault.buildGate: the gate is built at birth and stored in the vault record alone", () => {
  it("builds the vault's gate from what the closure answers, stages it, and `send` stores it in the vault record", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: 'correct horse battery staple' }))
    expect(vault.gate?.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(vault.gate?.passkey_wayin).to.be.null
    expect(storedNow()).to.be.null
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(vault.gate?.pickle())
  })

  it("refuses a dna without a closure as 'bad_option', holding no vault", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.build(Dna), 'bad_option')
    expect(listing.things).to.have.lengthOf(0)
  })

  it("holds the vault without a gate where the closure throws, refuses to send it as 'bad_option', and `buildGate` gives it one", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.build(Dna, () => { throw new Error('the user closed the dialog') }), 'unexpected_error')
    const vault = heldVault(listing)
    expect(vault.gate).to.be.null
    await TH.expectRefusal(vault.send({}), 'bad_option')
    expect(storedNow()).to.be.null
    await vault.buildGate(() => ({ passphrase: 'correct horse battery staple' }))
    await vault.send({})
    expect(storedNow()?.gate).to.not.be.null
  })

  it("refuses 'bad_option' the one of two overlapping `buildGate` calls whose gate found the other's there, and stores the other's", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.build(Dna, () => { throw new Error('the user closed the dialog') }), 'unexpected_error')
    const vault = heldVault(listing)
    const attempts = await Promise.allSettled([
      vault.buildGate(() => ({ passphrase: 'correct horse battery staple' })),
      vault.buildGate(() => ({ passphrase: 'another passphrase entirely' })),
    ])
    const landed  = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const refused = attempts.filter((attempt) => attempt.status === 'rejected')
    expect(landed).to.have.lengthOf(1)
    expect(refused).to.have.lengthOf(1)
    expect(refused[0]?.reason).to.have.property('refusalkind', 'bad_option')
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(vault.gate?.pickle())
  })

  it("`buildGate` on a vault held sparse hydrates first, and refuses 'bad_option' the gate stored without asking the closure anything", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    const vault = await listing.build(listing.sparseOf(record))
    expect(vault.gate).to.be.null
    const proofClosure = vi.fn(() => ({ passphrase: 'another passphrase entirely' }))
    await TH.expectRefusal(vault.buildGate(proofClosure), 'bad_option')
    expect(proofClosure).not.toHaveBeenCalled()
    expect(vault.gate?.pickle()).to.deep.equal(record.gate)
  })

  it("refuses a second gate as 'bad_option', and ignores a patch's gate once it has one", async () => {
    const { listing } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: 'correct horse battery staple' }))
    const { gate } = vault
    await TH.expectRefusal(vault.buildGate(() => ({ passphrase: 'another passphrase entirely' })), 'bad_option')
    await vault.edit({ gate: null })
    expect(vault.gate).to.equal(gate)
  })
})

describe("VaultListing.build of a record, and its constructor", () => {
  it("holds the vault with the gate its record carries, and takes no closure with a record: one handed refuses 'bad_option', holding nothing", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    await TH.expectRefusal(listing.build(record, () => ({ passphrase: 'correct horse battery staple' })), 'bad_option')
    expect(listing.things).to.have.lengthOf(0)
    const vault = await listing.build(record)
    expect(vault.gate?.pickle()).to.deep.equal(record.gate)
  })

  it("refuses 'bad_option' a world without what a vault's gate and lease need", () => {
    const { opts } = makeVaultWorld()
    TH.expectSyncRefusal(() => new VaultListing({ ...opts, world: TH.omitting(opts.world, 'deviceDB') }), 'bad_option')
    TH.expectSyncRefusal(() => new VaultListing({ ...opts, world: TH.omitting(opts.world, 'keyDeriver') }), 'bad_option')
  })
})

describe("Vault.leaseDBFriend", () => {
  it("binds the world's lease verbs to the vault's scope, so no verb takes one", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: 'correct horse battery staple' }))
    const dbfriend = vault.leaseDBFriend()
    await dbfriend.tryGetLease()
    await dbfriend.tryDelLease()
    expect(deviceDB.tryGetLease).toHaveBeenCalledWith(vault.scope)
    expect(deviceDB.tryDelLease).toHaveBeenCalledWith(vault.scope)
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { VaultScope } from '../../src/shapes/scopes'
import type { VaultRecord, VaultSparse } from '../../src/models/models-shapes'
import { type VaultWorld, VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'

const T0 = Date.UTC(2026, 9, 31)
const Dna = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
const ok = <ValT>(val: ValT) => Promise.resolve({ ok: true as const, val, err: null })
const nothing = (): void => undefined

/** A vault listing over a vaultDB of one row, a cache that keeps nothing, and a world whose deviceDB logs each lease verb. */
const makeVaultWorld = () => {
  let stored: VaultRecord | null = null
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
  const listing = new VaultListing({
    world,
    store: {
      get:   (scope) => Promise.resolve(answerOf(scope, stored)),
      put:   (record) => { stored = record; return Promise.resolve(answerOf(record, record)) },
      del:   () => Promise.reject(new Error('not in these tests')),
      watch: () => nothing,
    },
    cache: { load: () => Promise.resolve([]), save: () => Promise.resolve() },
    maxMillisSinceRefresh: 10 * 60_000,
  })
  return { listing, deviceDB, storedNow: () => stored }
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
    await expect(listing.build(Dna, () => { throw new Error('the user closed the dialog') })).rejects.toThrow()
    const [vault] = listing.things
    expect(vault?.gate).to.be.null
    await TH.expectRefusal(vault!.send({}), 'bad_option')
    expect(storedNow()).to.be.null
    await vault!.buildGate(() => ({ passphrase: 'correct horse battery staple' }))
    await vault!.send({})
    expect(storedNow()?.gate).to.not.be.null
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

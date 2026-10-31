import { describe, expect, it, vi } from 'vitest'
import type { VaultScope } from '../../src/shapes/scopes'
import type { VaultRecord, VaultSparse } from '../../src/models/models-shapes'
import { NOVEL, Proving } from '../../src/models/proving'
import { type VaultListingOpts, type VaultWorld, VaultListing } from '../../src/models/vault-listing'
import * as TH from '../test-helpers'

const T0 = Date.UTC(2026, 9, 31)
const Dna = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
const Passphrase = 'correct horse battery staple'
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
  /** Another device's put of `record`, landing in the vaultDB behind this one's back, at the next revision. */
  const storeBehindOurBack = (record: VaultRecord): VaultRecord => {
    stored = { ...record, revision_tok: `rev-${String(record.revision_seq + 1)}`, revision_seq: record.revision_seq + 1, written_at: T0 }
    return stored
  }
  return { listing, opts, deviceDB, storedNow: () => stored, storeBehindOurBack }
}

/** The record of a vault built of `Dna`, gated under `passphrase` and sent, as a vaultDB holds it. */
const storedVaultRecord = async (passphrase: string = Passphrase) => {
  const { listing, storedNow } = makeVaultWorld()
  const vault = await listing.build(Dna, () => ({ passphrase }))
  await vault.send({})
  const record = storedNow()
  if (record === null) { throw new Error('nothing stored') }
  return record
}

/** The gate of a vault of `Dna` proved under another passphrase entirely: one this test's vault never proved. */
const unprovedGateOf = async () => {
  const { gate } = await storedVaultRecord('another passphrase entirely')
  return gate
}

/** A passphrase proving of the vault `stamp` names, its wayin made, so it holds a vaultKey to lease. */
const provingOf = async ({ vault_tok, registered_at }: { vault_tok: string, registered_at: number }) => {
  const { passphraseProving } = await Proving.makeProvingPair({ ...Dna, vault_tok, registered_at }, () => ({ passphrase: Passphrase }), makeVaultWorld().opts.world)
  await passphraseProving.makeWayin(NOVEL)
  return passphraseProving
}

describe("VaultListing.build of a dna: the gate is built before the vault is born, and stored in the vault record alone", () => {
  it("builds the vault's gate from what the closure answers, births the record with it, and `send` stores it in the vault record", async () => {
    const { listing, storedNow } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    expect(vault.gate.passphrase_wayin.wayinkind).to.eq('passphrase')
    expect(vault.gate.passkey_wayin).to.be.null
    expect(vault.gate.stamp).to.deep.equal({ ...Dna, vault_tok: vault.vault_tok, registered_at: T0 })
    expect(storedNow()).to.be.null
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
  })

  it("refuses a dna without a closure as 'bad_option', holding no vault", async () => {
    const { listing } = makeVaultWorld()
    await TH.expectRefusal(listing.build(Dna), 'bad_option')
    expect(listing.things).to.have.lengthOf(0)
  })

  it("holds no vault where the closure throws: the refusal is the sanitized 'unexpected_error', and a second build is not refused as already held", async () => {
    const { listing, storedNow } = makeVaultWorld()
    await TH.expectRefusal(listing.build(Dna, () => { throw new Error('the user closed the dialog') }), 'unexpected_error')
    expect(listing.things).to.have.lengthOf(0)
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    await vault.send({})
    expect(storedNow()?.gate).to.deep.equal(vault.gate.pickle())
  })

  it("refuses 'bad_option' a dna for a scope already held, before the closure is asked anything", async () => {
    const { listing } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    const closure = vi.fn(() => ({ passphrase: Passphrase }))
    await TH.expectRefusal(listing.build(Dna, closure), 'bad_option')
    expect(closure).not.toHaveBeenCalled()
    expect(listing.at(Dna)).to.equal(vault)
  })
})

describe("VaultListing.build of a record, and its constructor", () => {
  it("holds the vault with the gate its record carries, and takes no closure with a record: one handed refuses 'bad_option', holding nothing", async () => {
    const record = await storedVaultRecord()
    const { listing } = makeVaultWorld(record)
    await TH.expectRefusal(listing.build(record, () => ({ passphrase: Passphrase })), 'bad_option')
    expect(listing.things).to.have.lengthOf(0)
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
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
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
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    const proving = await provingOf(vault)
    const lease = await proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: 60_000 })
    expect(lease.isInForce).to.be.true
    expect(lease.vault).to.equal(vault)
    expect(deviceDB.tryPutLease).toHaveBeenCalledOnce()
    await lease.forget()
  })

  it("refuses 'bad_option' a vault of another stamp, before any key is touched", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    const proving = await provingOf({ vault_tok: 'vault-tok-other', registered_at: T0 })
    await TH.expectRefusal(proving.makeLease(vault, vault.leaseDBFriend(), { leaseMillis: 60_000 }), 'bad_option')
    expect(deviceDB.tryPutLease).not.toHaveBeenCalled()
  })
})

describe("Vault.leaseDBFriend", () => {
  it("binds the world's lease verbs to the vault's scope, so no verb takes one", async () => {
    const { listing, deviceDB } = makeVaultWorld()
    const vault = await listing.build(Dna, () => ({ passphrase: Passphrase }))
    const dbfriend = vault.leaseDBFriend()
    await dbfriend.tryGetLease()
    await dbfriend.tryDelLease()
    expect(deviceDB.tryGetLease).toHaveBeenCalledWith(vault.scope)
    expect(deviceDB.tryDelLease).toHaveBeenCalledWith(vault.scope)
  })
})

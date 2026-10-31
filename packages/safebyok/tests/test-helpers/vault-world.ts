/** The test world of a vault listing in `src/models/`: a vaultDB of one row, a device cache that keeps nothing, a deviceDB that keeps one lease, and a clock the test moves. */

import { afterEach, vi } from 'vitest'
import type { VaultScope } from '../../src/shapes/scopes'
import type { BoxWorld } from '../../src/models/box-listing'
import type { VaultRecord, VaultSparse } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import { NOVEL, Proving } from '../../src/models/proving'
import { type VaultListingOpts, type VaultWorld, VaultListing } from '../../src/models/vault-listing'
import { quietLogger } from './logging'
import { testDeriver } from './builders'

/** The clock's first reading: 31 October 2026. */
export const T0 = Date.UTC(2026, 9, 31)

/** The scope of the one vault these worlds hold. */
export const Dna = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })

export const Passphrase = 'correct horse battery staple'

/** How long a lease these worlds grant lasts: an hour. */
export const LeaseMillis = 60 * 60_000

const ok = <ValT>(val: ValT) => Promise.resolve({ ok: true as const, val, err: null })
const nothing = (): void => undefined

/** Every listing made since the last test. */
const madeListings: VaultListing[] = []

/** Say goodbye to every listing a test made, after it, so no autolock timer outlives its test: call it once at the top of a test file. */
export const useVaultWorlds = (): void => {
  afterEach(() => {
    for (const listing of madeListings.splice(0)) { listing.goodbye() }
  })
}

/** A deviceDB that keeps the one lease last put, and logs each lease verb. */
const makeDeviceDB = () => {
  let kept: unknown = null
  return {
    keptNow:     () => kept,
    keep:        (record: unknown) => { kept = record },
    tryGetLease: vi.fn((_scope: VaultScope) => ok(kept)),
    tryPutLease: vi.fn((record: unknown) => { kept = record; return ok(record) }),
    tryDelLease: vi.fn((_scope: VaultScope) => { kept = null; return ok(undefined) }),
  }
}
export type FakeDeviceDB = ReturnType<typeof makeDeviceDB>

/** A vault listing over a vaultDB of one row, `stored0` to begin with, and the deviceDB and clock it shares with every other session `anotherSession` opens on this device. `worldOverrides` says otherwise of the world. */
export const makeVaultWorld = (stored0: VaultRecord | null = null, worldOverrides: Partial<VaultWorld> = {}) => {
  let stored = stored0
  let now = T0
  const deviceDB = makeDeviceDB()
  const world: VaultWorld = {
    clock:        { now: () => now },
    lockState:    () => 'unlocked',
    ensureTimely: () => Promise.resolve(),
    takeWorld:    nothing,
    scope:        { applabel: Dna.applabel, user_id: Dna.user_id },
    logger:       quietLogger,
    keyDeriver:   testDeriver,
    device_id:    'device-1',
    leaseMillis:  LeaseMillis,
    deviceDB:     deviceDB as unknown as VaultWorld['deviceDB'],
    ...worldOverrides,
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
  const makeListing = (): VaultListing => {
    const made = new VaultListing(opts)
    madeListings.push(made)
    return made
  }
  const listing = makeListing()
  /** Another device's put of `record`, landing in the vaultDB behind this one's back, at the next revision. */
  const storeBehindOurBack = (record: VaultRecord): VaultRecord => {
    stored = { ...record, revision_tok: `rev-${String(record.revision_seq + 1)}`, revision_seq: record.revision_seq + 1, written_at: now }
    return stored
  }
  return {
    listing, opts, deviceDB, storeBehindOurBack,
    storedNow:      () => stored,
    /** A new listing over the same vaultDB, deviceDB and clock: the next session on this device. */
    anotherSession: makeListing,
    /** Move the clock on by `millis`; no timer fires. */
    advance:        (millis: number) => { now += millis },
  }
}
export type VaultTestWorld = ReturnType<typeof makeVaultWorld>

/** The record of a vault built of `Dna`, gated under `passphrase` and sent, as a vaultDB holds it. */
export const storedVaultRecord = async (passphrase: string = Passphrase): Promise<VaultRecord> => {
  const { listing, storedNow } = makeVaultWorld()
  const vault = await listing.build(Dna, () => ({ passphrase }))
  await vault.send({})
  const record = storedNow()
  if (record === null) { throw new Error('nothing stored') }
  return record
}

/** A passphrase proving of the vault `stamp` names, its wayin made, so it holds a vaultKey to lease. */
export const makeProving = async ({ vault_tok, registered_at }: { vault_tok: string, registered_at: number }) => {
  const { passphraseProving } = await Proving.makeProvingPair({ ...Dna, vault_tok, registered_at }, () => ({ passphrase: Passphrase }), makeVaultWorld().opts.world)
  await passphraseProving.makeWayin(NOVEL)
  return passphraseProving
}

/** `vault` as its boxes see it, but that it takes no world: the models world's fake store answers with none. */
export const boxWorldOf = (vault: Vault): BoxWorld => ({
  clock:        vault.clock,
  scope:        vault.scope,
  vault_tok:    vault.vault_tok,
  lockState:    () => vault.lockState(),
  ensureTimely: (opts) => vault.ensureTimely(opts),
  takeWorld:    () => undefined,
  demandLease:  () => vault.demandLease(),
})

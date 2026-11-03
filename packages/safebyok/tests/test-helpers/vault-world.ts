/** The test world of a vault listing in `src/models/`: a {@link MemoryVaultDB} of one vault row, a {@link MemoryDeviceDB} with its lease verbs spied on, and a clock the test moves. */

import { afterEach, vi } from 'vitest'
import type { BoxWorld } from '../../src/models/box-listing'
import type { Lease } from '../../src/models/lease'
import type { ProofClosure, VaultRecord } from '../../src/models/models-shapes'
import type { VaultTombstone } from '../../src/storage/vault-db-shapes'
import type { Vault } from '../../src/models/vault'
import { NOVEL, PassphraseProving } from '../../src/models/proving'
import { passphraseCleartext } from '../../src/shapes/vault'
import { type VaultListingOpts, type VaultWorld, VaultListing } from '../../src/models/vault-listing'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { quietLogger } from './logging'
import { anyStrengthChecker, passkeyOf, testDeriver } from './builders'

/** The clock's first reading: 31 October 2026. */
export const T0 = Date.UTC(2026, 9, 31)

/** The scope of the one vault these worlds hold. */
export const Dna = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })

export const Passphrase = 'correct horse battery staple'

/** The passphrase a gate change sets in place of {@link Passphrase}. */
export const NewPassphrase = 'a new passphrase for the vault'

/** The proof closure of a user who types `passphrase`. */
export const byPassphrase = (passphrase: string) => () => ({ passphrase })

/** The proof closure of a user who touches the passkey `tag` names, its answer as `passkeyOf` makes it. */
export const byPasskey = (tag: string) => async () => ({ passkeyAnswer: await passkeyOf(tag) })

/** How long a lease these worlds grant lasts: an hour. */
export const LeaseMillis = 60 * 60_000

const nothing = (): void => undefined

/** Every listing made since the last test. */
const madeListings: VaultListing[] = []

/** Say goodbye to every listing a test made, after it, so nothing outlives its test: call it once at the top of a test file. */
export const useVaultWorlds = (): void => {
  afterEach(() => {
    for (const listing of madeListings.splice(0)) { listing.goodbye() }
  })
}

/** The real deviceDB, each verb a friend binds spied on, and the one row these worlds hold, to read or lay over. */
const makeDeviceDB = () => {
  const memoryDB = new MemoryDeviceDB()
  const rows = memoryDB._cheat_leaseRows()
  return {
    memoryDB,
    peek:      vi.spyOn(memoryDB, 'peek'),
    tryCache:  vi.spyOn(memoryDB, 'tryCache'),
    tryVacate: vi.spyOn(memoryDB, 'tryVacate'),
    cachedNow: (): unknown => [...rows.values()][0] ?? null,
    layCached: (record: unknown) => { rows.set([...rows.keys()][0] ?? 'no-row', record) },
  }
}
export type FakeDeviceDB = ReturnType<typeof makeDeviceDB>

/** A vault listing over a vaultDB of one row, `stored0` to begin with, and the deviceDB and clock it shares with every other session `anotherSession` opens on this device. `worldOverrides` says otherwise of the world. */
export const makeVaultWorld = (stored0: VaultRecord | null = null, worldOverrides: Partial<VaultWorld> = {}) => {
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
    strengthChecker: anyStrengthChecker,
    device_id:    'device-1',
    leaseMillis:  LeaseMillis,
    deviceDB:     deviceDB.memoryDB,
    ...worldOverrides,
  }
  const vaultDB = new MemoryVaultDB({ clock: world.clock })
  const vaultrows = vaultDB._cheat_vaultRowsOf(Dna)
  if (stored0 !== null) { vaultrows.set(Dna.vaultlabel, stored0) }
  const storedNow = (): VaultRecord | null => (vaultrows.get(Dna.vaultlabel) ?? null) as VaultRecord | null
  const opts: VaultListingOpts = { world, vaultDB, maxMillisSinceRefresh: 10 * 60_000 }
  const makeListing = (): VaultListing => {
    const made = new VaultListing(opts)
    madeListings.push(made)
    return made
  }
  const listing = makeListing()
  /** Another device's put of `record`, landing in the vaultDB behind this one's back, at the next revision. */
  const storeBehindOurBack = (record: VaultRecord): VaultRecord => {
    const stored = { ...record, revision_tok: `rev-${String(record.revision_seq + 1)}`, revision_seq: record.revision_seq + 1, written_at: now }
    vaultrows.set(Dna.vaultlabel, stored)
    return stored
  }
  /** Lay `record` in the vaultDB as it is, as a restore from an older copy does. */
  const restoreRow = (record: VaultRecord | VaultTombstone): void => { vaultrows.set(Dna.vaultlabel, record) }
  const demandStored = (): VaultRecord => {
    const stored = storedNow()
    if (stored === null) { throw new Error('nothing stored') }
    return stored
  }
  return {
    listing, opts, vaultDB, deviceDB, storeBehindOurBack, restoreRow, demandStored, storedNow,
    /** A new listing over the same vaultDB, deviceDB and clock: the next session on this device. */
    anotherSession: makeListing,
    /** Move the clock on by `millis`; no timer fires. */
    advance:        (millis: number) => { now += millis },
  }
}
export type VaultTestWorld = ReturnType<typeof makeVaultWorld>

/** The record of a vault created of `Dna`, gated under `passphrase`, as a vaultDB holds it. */
export const storedVaultRecord = async (passphrase: string = Passphrase): Promise<VaultRecord> => {
  const { listing, demandStored } = makeVaultWorld()
  await listing.create(Dna, byPassphrase(passphrase))
  return demandStored()
}

/** A vault created of `Dna` by `proofClosure` (under {@link Passphrase} unless told otherwise), in a fresh world: unlocked, its lease cached on the device. `worldOverrides` says otherwise of the world. */
export const makeBornVault = async (proofClosure: ProofClosure = byPassphrase(Passphrase), worldOverrides: Partial<VaultWorld> = {}) => {
  const world = makeVaultWorld(null, worldOverrides)
  const vault = await world.listing.create(Dna, proofClosure)
  return { ...world, vault }
}

/** A vault born as {@link makeBornVault} makes it, with the passkey of the `laptop` beside the passphrase. */
export const makeBornVaultWithPasskey = async () => {
  const passkeyAnswer = await passkeyOf('laptop')
  return makeBornVault(() => ({ passphrase: Passphrase, passkeyAnswer }))
}

const RoundTripStamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** What the lease `opener` unseals of a whisper the vault `sealer` seals: the two hold one vaultKey only if it comes back. */
export const roundTrip = async (sealer: Vault, opener: Lease): Promise<string> => opener.unsealWith(await sealer.sealStampedString('sk-test', RoundTripStamp), RoundTripStamp)

/** {@link roundTrip} through the vaults' own seal verbs. */
export const vaultRoundTrip = async (sealer: Vault, opener: Vault): Promise<string> => opener.unsealStampedString(await sealer.sealStampedString('sk-test', RoundTripStamp), RoundTripStamp)

/** A passphrase proving of the vault `stamp` names, its wayin made, so it holds a vaultKey to lease. */
export const makeProving = async ({ vault_tok, registered_at }: { vault_tok: string, registered_at: number }) => {
  const proving = await PassphraseProving.buildNovel({ ...Dna, vault_tok, registered_at }, passphraseCleartext.parse(Passphrase), makeVaultWorld().opts.world)
  await proving.buildWayin(NOVEL)
  return proving
}

/** `vault` as its boxes see it, but that it takes no world. */
export const boxWorldOf = (vault: Vault): BoxWorld => ({
  clock:        vault.clock,
  scope:        vault.scope,
  vault_tok:    vault.vault_tok,
  lockState:    () => vault.lockState(),
  ensureTimely: (opts) => vault.ensureTimely(opts),
  takeWorld:    () => undefined,
  sealStampedString:   (whisperText, stamp) => vault.sealStampedString(whisperText, stamp),
  unsealStampedString: (sealed, stamp) => vault.unsealStampedString(sealed, stamp),
})

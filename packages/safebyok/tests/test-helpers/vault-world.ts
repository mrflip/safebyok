/** The test world of a vault listing in `src/models/`: a {@link MemoryVaultDB} of one vault row, a {@link MemoryDeviceDB} with its lease verbs spied on, and a clock the test moves. */

import { afterEach, vi } from 'vitest'
import type { Lease } from '../../src/models/lease'
import type { VaultScope } from '../../src/shapes/shapes-core'
import type { VaultTombstone } from '../../src/shapes/shapes-storage'
import type * as GX from '../../src/shapes/shapes-gateish'
import { type RequestCleartext, passphraseCleartext } from '../../src/shapes/shapes-gateish'
import type { BoxWorld, VaultListingOpts, VaultRecord, VaultWorld } from '../../src/shapes/shapes-vaultish'
import type { Vault } from '../../src/models/vault'
import { NOVEL, PassphraseProving, Proving } from '../../src/models/proving'
import type { Outcome } from '../../src/refusals/outcome'
import { VaultListing } from '../../src/models/vault-listing'
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

/** What a user who types `passphrase` hands the gating. */
export const byPassphrase = (passphrase: string): Typed => ({ passphraseClear: passphrase })

/** What a user who touches the passkey `tag` names hands the gating, its answer as `passkeyOf` makes it. */
export const byPasskey = async (tag: string): Promise<Typed> => ({ passkeyClear: await passkeyOf(tag) })

/** What the user hands a gating's attempt at the dialog, whatever its kind, or what is about to make it. */
export type Typing = Typed | Promise<Typed>

type Typed = Partial<Record<'passphraseClear' | 'antePassphraseClear' | 'nextPassphraseClear', string>> & { passkeyClear?: GX.PasskeyAnswer | null }

/** What `ask` answers under a dialog shown once: it attempts `typing` and closes. A correctable refusal, which leaves the gating to decline as the dialog closes, is thrown as itself. */
const askTyping = async <ValT>(world: VaultWorld, typing: Typing, ask: () => Promise<ValT>): Promise<ValT> => {
  const { requestCleartext: asBefore } = world
  let heard: Outcome<unknown> | null = null
  const dialog: RequestCleartext = async (gating) => {
    heard = await gating.attempt(await typing as never)
  }
  world.requestCleartext = dialog
  try {
    return await ask()
  } catch (err) {
    const attempted = heard as Outcome<unknown> | null
    throw attempted?.ok === false ? attempted.err : err
  } finally {
    world.requestCleartext = asBefore
  }
}

/** `listing.buildVault(scope)`, the user doing `typing` at the dialog. */
export const buildTyping = (listing: VaultListing, scope: VaultScope, typing: Typing): Promise<Vault> => askTyping(listing.world, typing, () => listing.buildVault(scope))

/** `vault.ensureUnlocked()`, the user doing `typing` at the dialog, should it be shown. */
export const unlockTyping = (vault: Vault, typing: Typing): Promise<Vault> => askTyping(vault.world, typing, () => vault.ensureUnlocked())

/** `vault.unlock()` itself, the user doing `typing` at the dialog. */
export const unlockVerbTyping = (vault: Vault, typing: Typing): Promise<Vault> => askTyping(vault.world, typing, () => vault.unlock())

/** `vault.replacePassphrasePrompt()`, the user typing the passphrase and the next at the dialog. */
export const replaceTyping = (vault: Vault, ante: string, next: string): Promise<Vault> => askTyping(vault.world, { antePassphraseClear: ante, nextPassphraseClear: next }, () => vault.replacePassphrasePrompt())

/** `vault.addPasskeyPrompt()`, the user typing the passphrase and touching the passkey `tag` names at the dialog. */
export const addPasskeyTyping = async (vault: Vault, passphrase: string, tag: string): Promise<Vault> => askTyping(vault.world, { passphraseClear: passphrase, passkeyClear: await passkeyOf(tag) }, () => vault.addPasskeyPrompt())

/** `vault.revokePasskeyPrompt()`, the user typing `passphrase` at the dialog, should it be shown. */
export const revokeTyping = (vault: Vault, passphrase: string): Promise<Vault> => askTyping(vault.world, byPassphrase(passphrase), () => vault.revokePasskeyPrompt())

/** `vault.delVaultPrompt()`, the user typing `passphrase` at the dialog. */
export const delTyping = (vault: Vault, passphrase: string = Passphrase): Promise<Vault> => askTyping(vault.world, byPassphrase(passphrase), () => vault.delVaultPrompt())

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
    tellBadNews:  nothing,
    scope:        { applabel: Dna.applabel, user_id: Dna.user_id },
    logger:       quietLogger,
    keyDeriver:   testDeriver,
    strengthChecker: anyStrengthChecker,
    device_id:    'device-1',
    leaseMillis:  LeaseMillis,
    deviceDB:     deviceDB.memoryDB,
    requestCleartext: nothing,
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

/** `opts` of a listing whose bad news `onBadNews` hears, each news by itself, as a bank's host does. */
export const hearingBadNews = (opts: VaultListingOpts, onBadNews: (news: unknown) => unknown): VaultListingOpts => ({
  ...opts,
  world: { ...opts.world, tellBadNews: (badnews) => { for (const news of badnews) { onBadNews(news) } } },
})

/** The record of a vault created of `Dna`, gated under `passphrase`, as a vaultDB holds it. */
export const storedVaultRecord = async (passphrase: string = Passphrase): Promise<VaultRecord> => {
  const { listing, demandStored } = makeVaultWorld()
  await buildTyping(listing, Dna, byPassphrase(passphrase))
  return demandStored()
}

/** A vault created of `Dna` by `typing` (under {@link Passphrase} unless told otherwise), in a fresh world: unlocked, its lease cached on the device. `worldOverrides` says otherwise of the world. */
export const makeBornVault = async (typing: Typing = byPassphrase(Passphrase), worldOverrides: Partial<VaultWorld> = {}) => {
  const world = makeVaultWorld(null, worldOverrides)
  const vault = await buildTyping(world.listing, Dna, typing)
  return { ...world, vault }
}

/** A vault as {@link makeBornVault} makes it, and the friend its birth built its lease on and the lease it holds, caught by a spy, as nothing of a vault hands them out. */
export const makeBornVaultAndFriend = async () => {
  const buildLease = vi.spyOn(Proving.prototype, 'buildLease')
  const born = await makeBornVault()
  const [friend] = buildLease.mock.calls[0]!
  const lease = await buildLease.mock.results[0]!.value as Lease
  buildLease.mockRestore()
  return { ...born, friend, lease }
}

/** A vault born as {@link makeBornVault} makes it, with the passkey of the `laptop` beside the passphrase. */
export const makeBornVaultWithPasskey = async () => {
  return makeBornVault({ passphraseClear: Passphrase, passkeyClear: await passkeyOf('laptop') })
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
  tellBadNews:  (badnews) => { vault.tellBadNews(badnews) },
  demandUnlocked:   () => vault.demandUnlocked(),
  subscribe:        (listener) => vault.subscribe(listener),
  sealStampedString:   (whisperText, stamp) => vault.sealStampedString(whisperText, stamp),
  unsealStampedString: (sealed, stamp) => vault.unsealStampedString(sealed, stamp),
})

/** The boxlabel of the one box the box-verb worlds hold. */
export const boxlabel = 'anthropic_api_key'
/** The whisper those worlds put in it. */
export const Whisper  = { apiKey: 'sk-test-0000' }
/** The sidecar those worlds put beside it. */
export const Sidecar  = Object.freeze({ note: 'work' })

/** A born vault, and the rows of its boxes as the vaultDB stores them. */
export const makeWorld = async () => {
  const world = await makeBornVault()
  const boxrows = world.vaultDB._cheat_boxRowsOf(world.vault.scope, world.vault.vault_tok)
  const tryGetVault = vi.spyOn(world.vaultDB, 'tryGetVault')
  const tryPutBox   = vi.spyOn(world.vaultDB, 'tryPutBox')
  const tryGetBox   = vi.spyOn(world.vaultDB, 'tryGetBox')
  /** The next session on this device: a vault of the record stored, its boxes not yet listed, unlocked by the passphrase, sealing under the vaultKey the first holds. */
  const openNextSession = async () => {
    const vault = await world.anotherSession().build(world.demandStored())
    await unlockTyping(vault, byPassphrase(Passphrase))
    return vault
  }
  return { ...world, boxrows, tryGetVault, tryPutBox, tryGetBox, openNextSession }
}

/** A world whose vault has a box stored, and a next session that has not yet listed it. */
export const makeWorldWithBox = async () => {
  const world = await makeWorld()
  const box = await world.vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
  return { ...world, box }
}

/** A next session that has listed nothing and fetched nothing, and spies cleared of the one before. */
export const nextUnlisted = async () => {
  const world = await makeWorldWithBox()
  const next = await world.openNextSession()
  world.tryGetBox.mockClear()
  world.tryPutBox.mockClear()
  return { ...world, next }
}

/** A vault whose box row a next session finds failing its checks. */
export const makeWorldWithRubble = async () => {
  const world = await makeWorldWithBox()
  world.boxrows.set('rubble', { garbage: true })
  return world
}

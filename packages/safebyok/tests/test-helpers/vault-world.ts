/** The test world of a vault listing in `src/models/`: a {@link MemoryVaultDB} of one vault row, a {@link MemoryDeviceDB} with its lease verbs spied on, and a clock the test moves. */

import { afterEach, vi } from 'vitest'
import { brandGuarded } from '../../src/helpers/consts'
import { _cheat_clock } from '../../src/helpers/clock'
import type { Lease } from '../../src/models/lease'
import type { VaultScope } from '../../src/shapes/shapes-core'
import type * as GX from '../../src/shapes/shapes-gateish'
import { type RequestCleartext, passphraseCleartext } from '../../src/shapes/shapes-gateish'
import type { DeviceAnnouncement, BankFriend, BoxWorld, LifecycleHandler, ListingOpts, VaultWorld } from '../../src/shapes/shapes-vaultish'
import { type VaultError, isVaultError } from '../../src/refusals/errors'
import * as Refuse from '../../src/refusals/throwers'
import type { VaultTombstone, VaultRecord } from '../../src/shapes/shapes-storage'
import { DefaultOnLifecycle, Device, guardOnLifecycle, guardRequestCleartext } from '../../src/models/device'
import type { Vault } from '../../src/models/vault'
import { NOVEL, PassphraseProving, Proving } from '../../src/models/proving'
import type { Outcome } from '../../src/refusals/outcome'
import { VaultListing } from '../../src/models/vault-listing'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import { parseLogger } from '../../src/helpers/logger'
import { quietLogger } from './logging'
import { passkeyOf, testDeriver } from './builders'
import { type ProvingWorldGiven, provingWorldOf } from './proving-world'

/** The clock's first reading: 31 October 2026. */
export const T0 = Date.UTC(2026, 9, 31)

/** The scope of the one vault these worlds have. */
export const Dna = Object.freeze({ user_id: 'u1', banklabel: 'acme', vaultlabel: 'main' })

/** The passphrase these worlds' vaults are made with. */
export const Passphrase = 'correct horse battery staple'

/** The passphrase a gate change sets in place of {@link Passphrase}. */
export const NewPassphrase = 'a new passphrase for the vault'

/** What a user who types `passphrase` hands the gating. */
export function byPassphrase(passphrase: string): Typed { return { passphraseClear: passphrase } }

/** What a user who touches the passkey `tag` names hands the gating, its answer as `passkeyOf` makes it. */
export async function byPasskey(tag: string): Promise<Typed> { return { passkeyClear: await passkeyOf(tag) } }

/** What the user hands a gating's attempt at the dialog, whatever its kind, or what is about to make it. */
export type Typing = Typed | Promise<Typed>

type Typed = Partial<Record<'passphraseClear' | 'antePassphraseClear' | 'nextPassphraseClear', string>> & { passkeyClear?: GX.PasskeyAnswer | null }

/** What `ask` answers under a dialog shown once: it attempts `typing` and closes. A correctable refusal, which leaves the gating to dismiss as the dialog closes, is thrown as itself. */
async function askTyping<ValT>(world: VaultWorld, typing: Typing, ask: () => Promise<ValT>): Promise<ValT> {
  // The world is the fake bank, whose friend's askUser shows its requestCleartext as it stands.
  const fake = world as FakeBank
  const { requestCleartext: asBefore } = fake
  let heard: Outcome<unknown> | null = null
  fake.requestCleartext = async (gating) => {
    heard = await gating.attempt(await typing)
  }
  try {
    return await ask()
  } catch (err) {
    const attempted = heard as Outcome<unknown> | null
    throw attempted?.ok === false ? attempted.err : err
  } finally {
    fake.requestCleartext = asBefore
  }
}

/** `listing.buildVault(scope)`, the user doing `typing` at the dialog. */
export function buildTyping(listing: VaultListing, scope: VaultScope, typing: Typing): Promise<Vault> { return askTyping(listing.world, typing, () => listing.buildVault(scope)) }

/** `vault.ensureUnlocked()`, the user doing `typing` at the dialog, should it be shown. */
export function unlockTyping(vault: Vault, typing: Typing): Promise<Vault> { return askTyping(vault.world, typing, () => vault.ensureUnlocked()) }

/** `vault.unlock()` itself, the user doing `typing` at the dialog. */
export function unlockVerbTyping(vault: Vault, typing: Typing): Promise<Vault> { return askTyping(vault.world, typing, () => vault.unlock()) }

/** `vault.replacePassphrasePrompt()`, the user typing the passphrase and the next at the dialog. */
export function replaceTyping(vault: Vault, ante: string, next: string): Promise<Vault> { return askTyping(vault.world, { antePassphraseClear: ante, nextPassphraseClear: next }, () => vault.replacePassphrasePrompt()) }

/** `vault.addPasskeyPrompt()`, the user typing the passphrase and touching the passkey `tag` names at the dialog. */
export async function addPasskeyTyping(vault: Vault, passphrase: string, tag: string): Promise<Vault> { return askTyping(vault.world, { passphraseClear: passphrase, passkeyClear: await passkeyOf(tag) }, () => vault.addPasskeyPrompt()) }

/** `vault.revokePasskeyPrompt()`, the user typing `passphrase` at the dialog, should it be shown. */
export function revokeTyping(vault: Vault, passphrase: string): Promise<Vault> { return askTyping(vault.world, byPassphrase(passphrase), () => vault.revokePasskeyPrompt()) }

/** `vault.del(vault)` once `ensureUnlocked` has unlocked it, which these tests expect to do by the lease cached on this device. */
export async function delUnlocked(vault: Vault): Promise<Vault> {
  await vault.ensureUnlocked()
  return vault.del(vault)
}

/** How long a lease these worlds grant lasts: an hour. */
export const LeaseMillis = 60 * 60_000

const nothing = (): void => undefined

/** Every listing, and every device behind a fake bank, made since the last test. */
const madeListings: VaultListing[] = []
const madeDevices: Device[] = []

/** The bank scope of the fake bank, and of the device behind it. */
const BankScope = Object.freeze({ user_id: Dna.user_id, banklabel: Dna.banklabel })

/** Say goodbye to every listing a test made, and sweep every device, after it, so nothing outlives its test: call it once at the top of a test file. */
export function useVaultWorlds(): void {
  afterEach(() => {
    for (const listing of madeListings.splice(0)) { listing.goodbye() }
    for (const device of madeDevices.splice(0)) { device.sweep() }
  })
}

/** The real deviceDB, each verb a friend binds spied on, and the one row these worlds have, to read or lay over. */
function makeDeviceDB() {
  const memoryDB = new MemoryDeviceDB()
  const rows = memoryDB._cheat_leaseRows()
  return {
    memoryDB,
    peek:      vi.spyOn(memoryDB, 'peek'),
    tryStow:   vi.spyOn(memoryDB, 'tryStow'),
    forget:    vi.spyOn(memoryDB, 'forget'),
    cachedNow: (): unknown => [...rows.values()][0]?.row ?? null,
    layCached: (record: unknown) => {
      const [ckey, filed] = [...rows][0] ?? ['no-row', { scopepath: ['no', 'row', 'here'] }]
      rows.set(ckey, { scopepath: filed.scopepath, row: record })
    },
  }
}
export type FakeDeviceDB = ReturnType<typeof makeDeviceDB>

/** The bank a vault listing's test world fakes: a {@link VaultWorld} whose members a test may replace, and the host's dialog its friend's `askUser` asks, which a test may swap. */
export type FakeBank = { -readonly [K in keyof VaultWorld]: VaultWorld[K] } & { requestCleartext: RequestCleartext }

/** What a test may say of a {@link makeVaultWorld} world: its members, and the host's own functions, which it wraps as a bank does. */
export type VaultWorldGiven = Partial<Omit<FakeBank, keyof ProvingWorldGiven>> & ProvingWorldGiven & { onLifecycle?: LifecycleHandler | undefined }

/** A vault listing over a vaultDB of one row, `stored0` to begin with, and the deviceDB and clock it shares with every other session `anotherSession` opens on this device. `worldOverrides` says otherwise of the world. */
export function makeVaultWorld(stored0: VaultRecord | null = null, worldOverrides: VaultWorldGiven = {}) {
  const { onLifecycle = DefaultOnLifecycle, keyDeriver, strengthChecker, device_tok = '00000000-0000-4000-8000-000000000001', ...overrides } = worldOverrides
  let now = T0
  _cheat_clock(() => now)
  const deviceDB = makeDeviceDB()
  const hostLifecycle = guardOnLifecycle(onLifecycle)
  const vaultDB = new MemoryVaultDB()
  // The device logs what its default handlers hear: to the logger the test reads.
  const logger = overrides.logger ?? parseLogger(quietLogger)
  const device = Device.make({ ...BankScope, gates: ['main'], vaultDB, deviceDB: deviceDB.memoryDB, keyDeriver: testDeriver, logger })
  madeDevices.push(device)
  const fakeBank: FakeBank = {
    isLocked:     false,
    ensureTimely: () => Promise.resolve(),
    receiveParent:    nothing,
    scope:        BankScope,
    device,
    logger,
    ...provingWorldOf({ keyDeriver, strengthChecker, device_tok }),
    leaseMillis:  LeaseMillis,
    deviceDB:     deviceDB.memoryDB,
    requestCleartext: nothing,
    boxRefreshMillis: 10 * 60_000,
    ...overrides,
  }
  const vaultrows = vaultDB._cheat_vaultRowsOf(Dna)
  if (stored0 !== null) { vaultrows.set(Dna.vaultlabel, stored0) }
  const storedNow = (): VaultRecord | null => (vaultrows.get(Dna.vaultlabel) ?? null) as VaultRecord | null
  const announce = brandGuarded((announcement: DeviceAnnouncement): void => { void hostLifecycle({ ...announcement, device: fakeBank.device }) })
  /** The bad news the listings and vaults told, oldest first. A live array. */
  const badnews: VaultError[] = []
  const bankFriend: BankFriend = {
    panic:       brandGuarded(nothing),
    announce,
    tellBadNews: brandGuarded((told: readonly unknown[]) => { badnews.push(...told.map((news) => (isVaultError(news) ? news : Refuse.unexpectedError(news)))) }),
    askUser:     guardRequestCleartext((gating) => fakeBank.requestCleartext(gating)),
  }
  const opts: ListingOpts = { vaultDB, maxMillisSinceRefresh: 10 * 60_000, bankFriend }
  const makeListing = (): VaultListing => {
    const made = new VaultListing(fakeBank, opts)
    madeListings.push(made)
    return made
  }
  const listing = makeListing()
  /** Another device's put of `record`, written in the vaultDB behind this one's back, at the next revision. */
  const putBehindOurBack = (record: VaultRecord): VaultRecord => {
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
    listing, fakeBank, opts, badnews, vaultDB, deviceDB, putBehindOurBack, restoreRow, demandStored, storedNow,
    /** A new listing over the same vaultDB, deviceDB and clock: the next session on this device. */
    anotherSession: makeListing,
    /** Move the clock on by `millis`; no timer fires. */
    advance:        (millis: number) => { now += millis },
  }
}
export type VaultTestWorld = ReturnType<typeof makeVaultWorld>

/** `opts`, but that `onBadNews` hears the bad news its listing tells, each news by itself, as a bank's host does. */
export function hearingBadNews(opts: ListingOpts, onBadNews: (news: unknown) => unknown): ListingOpts {
  return {
    ...opts,
    bankFriend: { ...opts.bankFriend, tellBadNews: brandGuarded((badnews: readonly unknown[]) => { for (const news of badnews) { onBadNews(isVaultError(news) ? news : Refuse.unexpectedError(news)) } }) },
  }
}

/** The record of a vault created of `Dna`, gated under `passphrase`, as a vaultDB has stored it. */
export async function storedVaultRecord(passphrase: string = Passphrase): Promise<VaultRecord> {
  const { listing, demandStored } = makeVaultWorld()
  await buildTyping(listing, Dna, byPassphrase(passphrase))
  return demandStored()
}

/** A vault created of `Dna` by `typing` (under {@link Passphrase} unless told otherwise), in a fresh world: unlocked, its lease cached on the device. `worldOverrides` says otherwise of the world. */
export async function makeBornVault(typing: Typing = byPassphrase(Passphrase), worldOverrides: VaultWorldGiven = {}) {
  const world = makeVaultWorld(null, worldOverrides)
  const vault = await buildTyping(world.listing, Dna, typing)
  return { ...world, vault }
}

/** A vault as {@link makeBornVault} makes it, and the friend its birth built its lease on and the lease it has, caught by a spy, as nothing of a vault hands them out. */
export async function makeBornVaultAndFriend(...args: Parameters<typeof makeBornVault>) {
  const buildLease = vi.spyOn(Proving.prototype, 'buildLease')
  const born = await makeBornVault(...args)
  const [friend] = buildLease.mock.calls[0]!
  const lease = await buildLease.mock.results[0]!.value as Lease
  buildLease.mockRestore()
  return { ...born, friend, lease }
}

/** A vault born as {@link makeBornVault} makes it, with the passkey of the `laptop` beside the passphrase. */
export async function makeBornVaultWithPasskey() {
  return makeBornVault({ passphraseClear: Passphrase, passkeyClear: await passkeyOf('laptop') })
}

const RoundTripStamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** What the lease `opener` unseals of a whisper the vault `sealer` seals: the two have one vaultKey only if it comes back. */
export async function roundTrip(sealer: Vault, opener: Lease): Promise<string> { return opener.unsealWith(await sealer.sealStampedString('sk-test', RoundTripStamp), RoundTripStamp) }

/** {@link roundTrip} through the vaults' own seal verbs. */
export async function vaultRoundTrip(sealer: Vault, opener: Vault): Promise<string> { return opener.unsealStampedString(await sealer.sealStampedString('sk-test', RoundTripStamp), RoundTripStamp) }

/** A passphrase proving of the vault `stamp` names, its wayin made, so it has a vaultKey to lease. */
export async function makeProving({ vault_tok, registered_at }: { vault_tok: string, registered_at: number }) {
  const proving = await PassphraseProving.buildNovel({ ...Dna, vault_tok, registered_at }, passphraseCleartext.parse(Passphrase), provingWorldOf({ device_tok: '00000000-0000-4000-8000-000000000001' }))
  await proving.buildWayin(NOVEL)
  return proving
}

/** `vault` as its boxes see it, but that it takes no world. */
export function boxWorldOf(vault: Vault): BoxWorld {
  return {
    vault_tok:    vault.vault_tok,
    get isLocked() { return vault.isLocked },
    ensureTimely: (opts) => vault.ensureTimely(opts),
    receiveParent:    () => undefined,
    subscribe:        (listener) => vault.subscribe(listener),
    sealStampedString:   (whisperText, stamp) => vault.sealStampedString(whisperText, stamp),
    unsealStampedString: (sealed, stamp) => vault.unsealStampedString(sealed, stamp),
  }
}

/** The boxlabel of the one box the box-verb worlds have. */
export const boxlabel = 'anthropic_api_key'
/** The whisper those worlds put in it. */
export const Whisper  = { apiKey: 'sk-test-0000' }
/** The sidecar those worlds put beside it. */
export const Sidecar  = Object.freeze({ note: 'work' })

/** A born vault, and the rows of its boxes as the vaultDB puts them. `worldOverrides` says otherwise of the world. */
export async function makeWorld(worldOverrides: VaultWorldGiven = {}) {
  const world = await makeBornVault(byPassphrase(Passphrase), worldOverrides)
  const boxrows = world.vaultDB._cheat_boxRowsOf(world.vault.scope, world.vault.vault_tok)
  const tryListBoxes = vi.spyOn(world.vaultDB, 'tryListBoxes')
  const tryPutBox    = vi.spyOn(world.vaultDB, 'tryPutBox')
  const tryGetBox    = vi.spyOn(world.vaultDB, 'tryGetBox')
  /** The next session on this device: a vault of the record stored, its boxes not yet listed, unlocked by the passphrase, sealing under the vaultKey the first has. */
  const openNextSession = async () => {
    const vault = world.anotherSession().deliverRecord(world.demandStored())
    await unlockTyping(vault, byPassphrase(Passphrase))
    return vault
  }
  return { ...world, boxrows, tryListBoxes, tryPutBox, tryGetBox, openNextSession }
}

/** A world whose vault has a box stored, and a next session that has not yet listed it. `worldOverrides` says otherwise of the world. */
export async function makeWorldWithBox(worldOverrides: VaultWorldGiven = {}) {
  const world = await makeWorld(worldOverrides)
  const box = await world.vault.putBox({ boxlabel, whisper: Whisper, sidecar: Sidecar })
  return { ...world, box }
}

/** A next session that has listed nothing and fetched nothing, and spies cleared of the one before. */
export async function nextUnlisted() {
  const world = await makeWorldWithBox()
  const next = await world.openNextSession()
  world.tryGetBox.mockClear()
  world.tryPutBox.mockClear()
  return { ...world, next }
}

/** A vault whose box row a next session finds failing its checks. */
export async function makeWorldWithRubble() {
  const world = await makeWorldWithBox()
  world.boxrows.set('rubble', { garbage: true })
  return world
}

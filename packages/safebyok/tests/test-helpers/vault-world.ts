/** The test world of a vault in `src/models/`: a device over a {@link MemoryBankDB} and a {@link MemoryDeviceDB} with its lease verbs spied on, a dialog the test types at, and a clock the test moves. */

import { afterEach, vi } from 'vitest'
import { _cheat_clock } from '../../src/helpers/clock'
import type { Bank } from '../../src/models/bank'
import type { Lease } from '../../src/models/lease'
import type * as GX from '../../src/shapes/shapes-gateish'
import { type RequestCleartext, vaultStamp } from '../../src/shapes/shapes-gateish'
import type { BankFriend, BoxWorld, LifecycleHandler, ListingOpts } from '../../src/shapes/shapes-vaultish'
import { type VaultError, isVaultError } from '../../src/refusals/errors'
import * as Refuse from '../../src/refusals/throwers'
import { brandGuarded } from '../../src/helpers/consts'
import type { VaultRecord, VaultRow } from '../../src/shapes/shapes-bankdb'
import { DefaultOnLifecycle, Device } from '../../src/models/device'
import type { Vault } from '../../src/models/vault'
import { Proving } from '../../src/models/proving'
import type { Outcome } from '../../src/refusals/outcome'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryBankDB } from '../../src/storage/memory-bank-db'
import type { KeyDeriver } from '../../src/deriver/basederiver'
import type { StrengthChecker } from '../../src/helpers/passphrase-strength'
import { type VaultLogger, parseLogger } from '../../src/helpers/logger'
import { quietLogger } from './logging'
import { anyStrengthChecker, passkeyOf, testDeriver } from './builders'

/** The clock's first reading: 31 October 2026. */
export const T0 = Date.UTC(2026, 9, 31)

/** The scope of the one vault these worlds have. */
export const Dna = Object.freeze({ user_id: 'u1', banklabel: 'acme', vaultlabel: 'main' })

/** The passphrase these worlds' banks are built with. */
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

/** The host's dialog of one device: what its `requestCleartext` shows, which a test may swap. */
type Dialog = { requestCleartext: RequestCleartext }

/** The dialog of each device these worlds made. */
const dialogs = new WeakMap<Device, Dialog>()

/** What `ask` answers under a dialog shown once on `device`: it attempts `typing` and closes. A correctable refusal, which leaves the gating to dismiss as the dialog closes, is thrown as itself. */
async function askTyping<ValT>(device: Device, typing: Typing, ask: () => Promise<ValT>): Promise<ValT> {
  const dialog = dialogs.get(device)
  if (dialog === undefined) { throw new Error('a device these worlds did not make has no dialog to type at') }
  const { requestCleartext: asBefore } = dialog
  let heard: Outcome<unknown> | null = null
  dialog.requestCleartext = async (gating) => {
    heard = await gating.attempt(await typing)
  }
  try {
    return await ask()
  } catch (err) {
    const attempted = heard as Outcome<unknown> | null
    throw attempted?.ok === false ? attempted.err : err
  } finally {
    dialog.requestCleartext = asBefore
  }
}

/** `device.ensureBank()`, the user doing `typing` at the dialog, should the bank be built. */
export function bankTyping(device: Device, typing: Typing): Promise<Bank> { return askTyping(device, typing, () => device.ensureBank()) }

/** `vault.ensureUnlocked()`, the user doing `typing` at the dialog, should it be shown. */
export function unlockTyping(vault: Vault, typing: Typing): Promise<Vault> { return askTyping(deviceOf(vault), typing, () => vault.ensureUnlocked()) }

/** `vault.unlock()` itself, the user doing `typing` at the dialog. */
export function unlockVerbTyping(vault: Vault, typing: Typing): Promise<Vault> { return askTyping(deviceOf(vault), typing, () => vault.unlock()) }

/** The device whose bank `vault` is of: a vault's world is its Bank. */
function deviceOf(vault: Vault): Device { return (vault.world as Bank).device }

/** `vault.del(vault)` once `ensureUnlocked` has unlocked it, which these tests expect to do by the lease cached on this device. */
export async function delUnlocked(vault: Vault): Promise<Vault> {
  await vault.ensureUnlocked()
  return vault.del(vault)
}

/** How long a lease these worlds grant lasts: an hour. */
export const LeaseMillis = 60 * 60_000

/** How long these worlds' vaults and boxes stay timely: ten minutes. */
const RefreshMinutes = 10

const nothing = (): void => undefined

/** Every device these worlds made since the last test. */
const madeDevices: Device[] = []

/** The bank scope of every device these worlds make. */
const BankScope = Object.freeze({ user_id: Dna.user_id, banklabel: Dna.banklabel })

/** Sweep every device a test made, after it, so nothing outlives its test: call it once at the top of a test file. */
export function useVaultWorlds(): void {
  afterEach(() => {
    for (const device of madeDevices.splice(0)) { device.sweep() }
  })
}

/** The real deviceDB, each verb a friend binds spied on, and the one row these worlds have, to read or lay over. */
export function makeDeviceDB() {
  const memoryDB = new MemoryDeviceDB()
  const rows = memoryDB._cheat_leaseRows()
  return {
    memoryDB,
    peek:      vi.spyOn(memoryDB, 'peek'),
    tryStow:   vi.spyOn(memoryDB, 'tryStow'),
    forget:    vi.spyOn(memoryDB, 'forget'),
    cachedNow: (): unknown => [...rows.values()][0]?.row ?? null,
    layCached: (record: unknown) => {
      const [ckey, filed] = [...rows][0] ?? ['no-row', { scopepath: ['no', 'row'] }]
      rows.set(ckey, { scopepath: filed.scopepath, row: record })
    },
  }
}
export type FakeDeviceDB = ReturnType<typeof makeDeviceDB>

/** What a test may say of a {@link makeVaultWorld} world: the host's own functions and logger, as `Device.make` takes them. */
export type VaultWorldGiven = {
  keyDeriver?:       KeyDeriver | undefined
  strengthChecker?:  StrengthChecker | undefined
  logger?:           VaultLogger | undefined
  requestCleartext?: RequestCleartext | undefined
  onLifecycle?:      LifecycleHandler | undefined
}

/** A device over a bankDB, with nothing stored yet, and the deviceDB and clock it shares with every other session `anotherSession` opens on this device. `worldOverrides` says otherwise of the host's functions. */
export function makeVaultWorld(worldOverrides: VaultWorldGiven = {}) {
  const { onLifecycle = DefaultOnLifecycle, keyDeriver = testDeriver, strengthChecker = anyStrengthChecker, requestCleartext = nothing, logger = parseLogger(quietLogger) } = worldOverrides
  let now = T0
  _cheat_clock(() => now)
  const deviceDB = makeDeviceDB()
  const bankDB = new MemoryBankDB()
  /** The bad news the device told, oldest first. A live array. */
  const badnews: VaultError[] = []
  /** A device of this world over `onDeviceDB`, its bank not yet ensured, with a dialog of its own. */
  function deviceOn(onDeviceDB: MemoryDeviceDB): Device {
    const dialog: Dialog = { requestCleartext }
    const device = Device.make({
      ...BankScope, gates: ['main'], bankDB, deviceDB: onDeviceDB, keyDeriver, strengthChecker, logger, onLifecycle,
      onBadNews:           ({ news }) => { badnews.push(news) },
      requestCleartext:    (gating) => dialog.requestCleartext(gating),
      autolockMinutes:     LeaseMillis / 60_000,
      vaultRefreshMinutes: RefreshMinutes,
      boxRefreshMinutes:   RefreshMinutes,
    })
    dialogs.set(device, dialog)
    madeDevices.push(device)
    return device
  }
  const device = deviceOn(deviceDB.memoryDB)
  /** The dialog of the world's own device, whose `requestCleartext` a test may swap. */
  const dialog = dialogs.get(device)!
  const { vaultrows } = bankDB._cheat_shelfOf(BankScope)
  const storedNow = (): VaultRecord | null => (vaultrows.get(Dna.vaultlabel) ?? null) as VaultRecord | null
  /** Another device's put of `record`, written in the bankDB behind this one's back, at the next revision. */
  const putBehindOurBack = (record: VaultRecord): VaultRecord => {
    const stored = { ...record, revision_tok: `rev-${String(record.revision_seq + 1)}`, revision_seq: record.revision_seq + 1, written_at: now }
    vaultrows.set(Dna.vaultlabel, stored)
    return stored
  }
  /** Lay `record` in the bankDB as it is, as a restore from an older copy does. */
  const restoreRow = (record: VaultRow): void => { vaultrows.set(Dna.vaultlabel, record) }
  const demandStored = (): VaultRecord => {
    const stored = storedNow()
    if (stored === null) { throw new Error('nothing stored') }
    return stored
  }
  return {
    device, dialog, bankDB, deviceDB, badnews, putBehindOurBack, restoreRow, demandStored, storedNow,
    /** The bank of the next session on this device: a new device over the same bankDB, deviceDB and clock, its bank ensured. */
    anotherSession: (): Promise<Bank> => deviceOn(deviceDB.memoryDB).ensureBank(),
    /** A device on another device: this world's bankDB, a deviceDB of its own (`onDeviceDB`, else a fresh one), its bank not yet ensured. */
    anotherDevice:  (onDeviceDB: MemoryDeviceDB = new MemoryDeviceDB()): Device => deviceOn(onDeviceDB),
    /** Move the clock on by `millis`; no timer fires. */
    advance:        (millis: number) => { now += millis },
  }
}
export type VaultTestWorld = ReturnType<typeof makeVaultWorld>

/** The options a listing is made with in a world of these, as a bank hands them down: its bankDB, its horizon, and a friend whose bad news goes to the world's `badnews`. */
export function listingOptsOf({ bankDB, badnews }: VaultTestWorld): ListingOpts {
  const bankFriend: BankFriend = {
    panic:       brandGuarded(nothing),
    announce:    brandGuarded(nothing),
    tellBadNews: brandGuarded((told: readonly unknown[]) => { badnews.push(...told.map((news) => (isVaultError(news) ? news : Refuse.unexpectedError(news)))) }),
    askUser:     null,
  }
  return { bankDB, maxMillisSinceRefresh: RefreshMinutes * 60_000, bankFriend }
}

/** The vault record of `Dna`, in a bank built under `passphrase`, as a bankDB has stored it. */
export async function storedVaultRecord(passphrase: string = Passphrase): Promise<VaultRecord> {
  const { demandStored } = await makeBornVault(byPassphrase(passphrase))
  return demandStored()
}

/** The vault of `Dna`, ensured in a bank built by `typing` (under {@link Passphrase} unless told otherwise), in a fresh world: unlocked, its lease cached on the device. `worldOverrides` says otherwise of the world. */
export async function makeBornVault(typing: Typing = byPassphrase(Passphrase), worldOverrides: VaultWorldGiven = {}) {
  const world = makeVaultWorld(worldOverrides)
  const bank = await bankTyping(world.device, typing)
  const vault = await bank.ensureVault({ vaultlabel: Dna.vaultlabel })
  return { ...world, bank, listing: bank.vaultListing, vault }
}

/** A vault as {@link makeBornVault} makes it, and what its bank's birth built its lease with, caught by a spy, as nothing of a bank hands them out: the proving, the friend, the gate cited and the lease. */
export async function makeBornVaultAndFriend(...args: Parameters<typeof makeBornVault>) {
  const buildLease = vi.spyOn(Proving.prototype, 'buildLease')
  const born = await makeBornVault(...args)
  const [friend, gate] = buildLease.mock.calls[0]!
  const proving = buildLease.mock.contexts[0] as Proving
  const lease = await buildLease.mock.results[0]!.value as Lease
  buildLease.mockRestore()
  return { ...born, proving, friend, gate, lease }
}

/** A vault born as {@link makeBornVault} makes it, its bank's gate with the passkey of the `laptop` beside the passphrase. */
export async function makeBornVaultWithPasskey() {
  return makeBornVault({ passphraseClear: Passphrase, passkeyClear: await passkeyOf('laptop') })
}

const RoundTripStamp = Object.freeze({ boxlabel: 'anthropic_api_key', revision_seq: 1 })

/** What the lease `opener` unseals of a whisper the vault `sealer` seals: the two have one vaultKey only if it comes back. */
export async function roundTrip(sealer: Vault, opener: Lease): Promise<string> { return opener.unsealWith(await sealer.sealStampedString('sk-test', RoundTripStamp), [vaultStamp.parse(sealer), RoundTripStamp]) }

/** {@link roundTrip} through the vaults' own seal verbs. */
export async function vaultRoundTrip(sealer: Vault, opener: Vault): Promise<string> { return opener.unsealStampedString(await sealer.sealStampedString('sk-test', RoundTripStamp), RoundTripStamp) }

/** `vault` as its boxes see it, but that it takes no world. */
export function boxWorldOf(vault: Vault): BoxWorld {
  return {
    bank_tok:     vault.bank_tok,
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

/** A born vault, and the rows of its boxes as the bankDB puts them. `worldOverrides` says otherwise of the world. */
export async function makeWorld(worldOverrides: VaultWorldGiven = {}) {
  const world = await makeBornVault(byPassphrase(Passphrase), worldOverrides)
  const boxrows = world.bankDB._cheat_boxRowsOf(world.vault.scope, world.vault.bank_tok, world.vault.vault_tok)
  const tryListBoxes = vi.spyOn(world.bankDB, 'tryListBoxes')
  const tryPutBox    = vi.spyOn(world.bankDB, 'tryPutBox')
  const tryGetBox    = vi.spyOn(world.bankDB, 'tryGetBox')
  /** The next session on this device: the vault its bank lists, its boxes not yet listed, unlocked by the passphrase, sealing under the vaultKey the first has. */
  const openNextSession = async () => {
    const bank = await world.anotherSession()
    const vault = bank.vaultAt(Dna)
    if (vault === null) { throw new Error('the next session lists no vault') }
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

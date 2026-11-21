/** The giver's slot: the device of whoever is signed in, made when a userid first arrives, and the snapshot the hooks read of it. */

import type { QueryClient } from '@tanstack/react-query'
import {
  type Bank, type BankSnapshot, type Banklabel, Checkers, Device, type DeviceOpts, type KeyDeriver, PendingBank, type Userid, type Vault, type VaultDB, VaultError, isVaultDB,
} from 'safebyok'
import * as Phrases from './phrases-giver'
import { bridgeMinder } from './react-bridge'

// == [Types]: GiverBanks, GiverConfig, SlotMount, GiverSlotSnapshot, SignedOutBank

/** The one bank a giver serves, keyed by its banklabel: `{ knock: { vaultDB } }`. */
export type GiverBanks<BanklabelT extends string = string> = Readonly<Record<BanklabelT, Readonly<{ vaultDB: VaultDB }>>>

/** A giver's config: its one bank and where that is stored, and the options of each device it makes. */
export type GiverConfig<BanklabelT extends string = string> = Readonly<{ banks: GiverBanks<BanklabelT> }> & Readonly<Omit<DeviceOpts, 'vaultDB' | 'deviceDB'>>

/** What a provider hands its slot: the host's QueryClient, and a vaultDB and key deriver that replace the config's for its mount. */
export type SlotMount = Readonly<{
  client:      QueryClient
  vaultDB?:    VaultDB | undefined
  keyDeriver?: KeyDeriver | undefined
}>

/** The slot's state, for the hooks to compose the stage a host renders from. */
export interface GiverSlotSnapshot {
  /** The userid of the slot's device, or null before one is made. */
  readonly userid: Userid | null
  /** The device's bank snapshot, or {@link SignedOutBank} before one is made. */
  readonly bank:   BankSnapshot
}

/** The bank snapshot a slot shows before any user's device is made. */
export const SignedOutBank: BankSnapshot = Object.freeze({ ...PendingBank, stage: 'signed_out' })

/** The snapshot of a slot with no device. */
const SignedOutSlot: GiverSlotSnapshot = Object.freeze({ userid: null, bank: SignedOutBank })
// --

/** The device of whoever is signed in, for one giver: none until {@link start}, and then the same one for the page's life. */
export class GiverSlot {
  // == [Props]: banklabel, #deviceOpts, #device, #snapshot, #subscribers, #getSnapshot, #subscribe

  /** The banklabel of the giver's one bank. */
  readonly banklabel:   Banklabel
  /** The options of each device the slot makes: the config's, with its bank's vaultDB. */
  readonly #deviceOpts: DeviceOpts
  /** The signed-in user's device, from the first {@link start}. */
  #device: Device | null = null

  /** The current snapshot, which {@link getSnapshot} returns. */
  #snapshot: GiverSlotSnapshot = SignedOutSlot
  /** The listeners to tell when the snapshot changes. */
  readonly #subscribers = new Set<() => void>()
  /** {@link getSnapshot}'s function, bound once. */
  readonly #getSnapshot = (): GiverSlotSnapshot => this.#snapshot
  /** {@link subscribe}'s function, bound once. */
  readonly #subscribe = (listener: () => void): (() => void) => {
    this.#subscribers.add(listener)
    return () => { this.#subscribers.delete(listener) }
  }
  // --

  // == [Construction]: make, constructor

  /** Make an empty slot for the one bank in `config`. Nothing is made or fetched until {@link start}. */
  static make(config: GiverConfig): GiverSlot { return new GiverSlot(config) }

  private constructor(config: GiverConfig) {
    const [[banklabel, { vaultDB }]] = Checks.giverConfig.parse(config).banks
    const { banks: _banks, ...deviceOpts } = config
    this.banklabel   = banklabel
    this.#deviceOpts = { ...deviceOpts, vaultDB }
    Object.freeze(this)
  }
  // --

  // == [Getters]: device, getSnapshot, subscribe

  /** The signed-in user's device, or null before one is made. Read it when called, never keep it. */
  get device(): Device | null { return this.#device }

  /** The slot's snapshot getter, already bound, as `useSyncExternalStore` wants it. It returns the same frozen object until the device or its bank's snapshot changes. */
  get getSnapshot(): () => GiverSlotSnapshot { return this.#getSnapshot }

  /** Subscribe a listener to the slot's snapshot, returning its unsubscribe. Already bound, as `useSyncExternalStore` wants it. */
  get subscribe(): (listener: () => void) => (() => void) { return this.#subscribe }
  // --

  // == [Starting]: start, demandDevice, demandBank, demandVault

  /** Start `userid`'s device and its bank. Does nothing once the slot has a device.
   * `mount`'s vaultDB and key deriver, where given, replace the config's; its client is the one the minder's records are bridged into.
   */
  start(userid: string, { client, vaultDB, keyDeriver }: SlotMount): void {
    if (this.#device !== null) { return }
    const opts = { ...this.#deviceOpts, ...(vaultDB && { vaultDB }), ...(keyDeriver && { keyDeriver }) }
    // Cheat (react_life): a fresh device_tok for each device. Nothing keeps one across a reload yet.
    const device = Device.make({ userid, banklabel: this.banklabel, device_tok: globalThis.crypto.randomUUID() }, opts)
    this.#device = device
    // Nothing ends a device yet, so the bridge is never stopped.
    bridgeMinder(client, device.minder)
    device.subscribe(this.#align)
    this.#align()
    void device.hello()
  }

  /** The signed-in user's device. Refuses `absent_vault` while nobody is signed in. */
  demandDevice(): Device {
    if (this.#device === null) { throw new VaultError('absent_vault', Phrases.NobodySignedIn) }
    return this.#device
  }

  /** The signed-in user's bank. Refuses `absent_vault` while nobody is signed in, while the bank is unborn, or until it is brought up. */
  demandBank(): Bank {
    const device = this.demandDevice()
    if (device.bank === null) { throw bankAbsentOf(device) }
    return device.bank
  }

  /** The vault of the signed-in user's bank. Refuses as {@link demandBank} does. */
  demandVault(): Vault {
    const device = this.demandDevice()
    if (device.vault === null) { throw bankAbsentOf(device) }
    return device.vault
  }
  // --

  // == [Snapshot]: align

  // An arrow, so it stays bound: the device calls it as a subscriber.
  /** Remake the snapshot from the device's, and tell each subscriber if it changed. */
  readonly #align = (): void => {
    const device = this.#device
    if (device === null) { return }
    const { bank } = device.getSnapshot()
    if ((this.#snapshot.userid === device.userid) && (this.#snapshot.bank === bank)) { return }
    this.#snapshot = Object.freeze({ userid: device.userid, bank })
    for (const listener of this.#subscribers) { listener() }
  }
  // --
}

// == [Helpers]: bankAbsentOf

/** The refusal of a call that needs `device`'s bank, while it has none: unborn, still coming up, or failed. */
function bankAbsentOf(device: Device): VaultError {
  return new VaultError('absent_vault', (device.getSnapshot().bank.stage === 'unborn') ? Phrases.BankAbsent : Phrases.BankNotStarted)
}
// --

// == [Checks]: Checks, isOneBank

/** The checks of what a host hands a slot. */
const Checks = Checkers('bad_record', ({ obj, custom }) => ({
  giverConfig: obj({
    banks: custom<GiverBanks>(isOneBank, Phrases.OneBankExpected).transform((banks) => Object.entries(banks) as [[Banklabel, Readonly<{ vaultDB: VaultDB }>]]),
  }),
}))

/** True when `val` names exactly one bank by a valid banklabel, and its vaultDB. */
function isOneBank(val: unknown): boolean {
  if ((typeof val !== 'object') || (val === null)) { return false }
  const entries = Object.entries(val)
  if (entries.length !== 1) { return false }
  const [[banklabel, bank]] = entries as [[string, unknown]]
  return BanklabelChecks.banklabel.safeParse(banklabel).success && (typeof bank === 'object') && (bank !== null) && isVaultDB((bank as { vaultDB?: unknown }).vaultDB)
}

/** The check of a banklabel. */
const BanklabelChecks = Checkers('bad_scope', ({ banklabel }) => ({ banklabel }))
// --

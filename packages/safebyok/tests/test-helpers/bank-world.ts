/** The test world of a models device and its bank: a real {@link MemoryVaultDB} and {@link MemoryDeviceDB} any number of devices share, a dialog that types what the test says, and a clock the test moves. */

import { afterEach } from 'vitest'
import { _cheat_clock } from '../../src/helpers/clock'
import { VaultError, type Refusalkind } from '../../src/refusals/errors'
import type { Bank } from '../../src/models/bank'
import { Device } from '../../src/models/device'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { VaultGetAsk, VaultListAsk } from '../../src/shapes/shapes-storage'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import type { BankSnapshot, DeviceOpts } from '../../src/shapes/shapes-vaultish'
import { anyStrengthChecker, testDeriver } from './builders'
import { quietLogger } from './logging'
import { T0, Dna, Passphrase, byPassphrase } from './vault-world'

/** The autolock duration these worlds hand a device. */
export const AutolockMinutes = 60

/** The bank scope these worlds hand `Device.make`. */
export const BankScopeGiven = Object.freeze({ user_id: Dna.user_id, banklabel: Dna.banklabel })

/** The vault scope a test hands `bank.ensureVault`. */
export const VaultScopeGiven = Object.freeze({ vaultlabel: Dna.vaultlabel })

/** A second vaultlabel, for a bank that has two vaults. */
export const OtherScopeGiven = Object.freeze({ vaultlabel: 'other' })

/** The vaultlabels of a snapshot's vaults, in its order. */
export function labelsOf({ vaults }: BankSnapshot): string[] { return vaults.map(({ vaultlabel }) => vaultlabel) }

/** A {@link MemoryVaultDB} that refuses every vault get, once told to, as a VaultDB out of reach or a user signed out does. */
export class RefusingVaultDB extends MemoryVaultDB {
  #refusalkind: Refusalkind | null = null

  /** From here on, `listVaults` and `getVault` refuse this; null lets them through again. */
  _cheat_refuseGets(refusalkind: Refusalkind | null): void { this.#refusalkind = refusalkind } // eslint-disable-line unicorn/prefer-private-class-fields

  protected override doListVaults(ask: VaultListAsk) {
    this.#demandAnswering()
    return super.doListVaults(ask)
  }

  protected override doGetVault(ask: VaultGetAsk) {
    this.#demandAnswering()
    return super.doGetVault(ask)
  }

  #demandAnswering(): void {
    if (this.#refusalkind !== null) { throw new VaultError(this.#refusalkind, 'refused by the test') }
  }
}

const madeDevices: Device[] = []

/** Sweep every device a test made, after it, so no watch outlives its test: call it once at the top of a test file. */
export const useBankWorlds = (): void => {
  afterEach(() => {
    for (const device of madeDevices.splice(0)) { device.sweep() }
  })
}

/** A vaultDB, a deviceDB, a scripted dialog and a movable clock for tests of a device and its bank. */
export function makeBankWorld() {
  let now = T0
  _cheat_clock(() => now)
  const vaultDB = new RefusingVaultDB()
  const deviceDB = new MemoryDeviceDB()
  const dialog = { typing: byPassphrase(Passphrase) as object }
  const requestCleartext: RequestCleartext = async (gating) => { await gating.attempt(dialog.typing) }
  const baseOpts: DeviceOpts = { ...BankScopeGiven, gates: ['main'], vaultDB, deviceDB, keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, requestCleartext, autolockMinutes: AutolockMinutes }
  /** A device over this world's VaultDB and DeviceDB, its bank not yet ensured: called twice, two pages on one device. */
  function deviceOn(overrides: Partial<DeviceOpts> = {}): Device {
    const device = Device.make({ ...baseOpts, ...overrides })
    madeDevices.push(device)
    return device
  }
  /** A device on another device: this world's vaultDB, and a deviceDB of its own. */
  function deviceOnAnotherDevice(overrides: Partial<DeviceOpts> = {}): Device { return deviceOn({ deviceDB: new MemoryDeviceDB(), ...overrides }) }
  return {
    vaultDB, deviceDB, dialog, deviceOn, deviceOnAnotherDevice,
    /** The bank of a new {@link deviceOn}, ensured. */
    bankOn:    (overrides: Partial<DeviceOpts> = {}): Promise<Bank> => deviceOn(overrides).ensureBank(),
    /** The bank of a new {@link deviceOnAnotherDevice}, ensured. */
    bankOnAnotherDevice: (overrides: Partial<DeviceOpts> = {}): Promise<Bank> => deviceOnAnotherDevice(overrides).ensureBank(),
    /** Move the clock on by `millis`; no timer fires. */
    advance:   (millis: number) => { now += millis },
    leaseRows: (): unknown[] => [...deviceDB._cheat_leaseRows().values()].map(({ row }) => row),
  }
}
export type BankWorld = ReturnType<typeof makeBankWorld>

/** A bank ensured, with the vault of `Dna` built in it and unlocked. */
export async function makeBankWithVault(world: BankWorld = makeBankWorld(), overrides: Partial<DeviceOpts> = {}) {
  const bank = await world.bankOn(overrides)
  const vault = await bank.ensureVault(VaultScopeGiven)
  return { world, bank, vault }
}

/** The test world of a models bank: a real {@link MemoryVaultDB} and {@link MemoryDeviceDB} any number of banks share, a dialog that types what the test says, and a clock the test moves. */

import { afterEach } from 'vitest'
import { _cheat_clock } from '../../src/helpers/clock'
import { VaultError, type Refusalkind } from '../../src/refusals/errors'
import { Bank } from '../../src/models/bank'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { BankScope, VaultScope } from '../../src/shapes/shapes-core'
import type { RequestCleartext } from '../../src/shapes/shapes-gateish'
import type { BankOpts, BankSnapshot } from '../../src/shapes/shapes-vaultish'
import { anyStrengthChecker, testDeriver } from './builders'
import { quietLogger } from './logging'
import { T0, Dna, Passphrase, byPassphrase } from './vault-world'

export const AutolockMinutes = 60

export const BankScopeGiven = Object.freeze({ applabel: Dna.applabel, user_id: Dna.user_id })

export const VaultScopeGiven = Object.freeze({ vaultlabel: Dna.vaultlabel })

/** A second vaultlabel, for a bank that holds two vaults. */
export const OtherScopeGiven = Object.freeze({ vaultlabel: 'other' })

/** The vaultlabels of a snapshot's vaults, in its order. */
export const labelsOf = ({ vaults }: BankSnapshot): string[] => vaults.map(({ vaultlabel }) => vaultlabel)

/** A {@link MemoryVaultDB} that refuses every vault get, once told to, as a store out of reach or a user signed out does. */
export class RefusingVaultDB extends MemoryVaultDB {
  #refusalkind: Refusalkind | null = null

  /** From here on, `listVaults` and `getVault` refuse this; null lets them through again. */
  _cheat_refuseGets(refusalkind: Refusalkind | null): void { this.#refusalkind = refusalkind } // eslint-disable-line unicorn/prefer-private-class-fields

  protected override doListVaults(scope: BankScope) {
    this.#demandAnswering()
    return super.doListVaults(scope)
  }

  protected override doGetVault(scope: VaultScope) {
    this.#demandAnswering()
    return super.doGetVault(scope)
  }

  #demandAnswering(): void {
    if (this.#refusalkind !== null) { throw new VaultError(this.#refusalkind, 'refused by the test') }
  }
}

const madeBanks: Bank[] = []

/** Sweep every bank a test made, after it, so no watch outlives its test: call it once at the top of a test file. */
export const useBankWorlds = (): void => {
  afterEach(() => {
    for (const bank of madeBanks.splice(0)) { bank.sweep() }
  })
}

export const makeBankWorld = () => {
  let now = T0
  _cheat_clock(() => now)
  const vaultDB = new RefusingVaultDB()
  const deviceDB = new MemoryDeviceDB()
  const dialog = { typing: byPassphrase(Passphrase) as object }
  const requestCleartext: RequestCleartext = async (gating) => { await gating.attempt(dialog.typing) }
  const baseOpts: BankOpts = { ...BankScopeGiven, device_id: '00000000-0000-4000-8000-0000000000b1', vaultDB, deviceDB, keyDeriver: testDeriver, strengthChecker: anyStrengthChecker, logger: quietLogger, requestCleartext, autolockMinutes: AutolockMinutes }
  /** A bank over this world's stores: called twice, two pages on one device. */
  const bankOn = (overrides: Partial<BankOpts> = {}): Bank => {
    const bank = Bank.make({ ...baseOpts, ...overrides })
    madeBanks.push(bank)
    return bank
  }
  return {
    vaultDB, deviceDB, dialog, bankOn,
    /** Move the clock on by `millis`; no timer fires. */
    advance:   (millis: number) => { now += millis },
    /** A bank on another device: this world's vaultDB, and a deviceDB of its own. */
    bankOnAnotherDevice: (overrides: Partial<BankOpts> = {}): Bank => bankOn({ device_id: '00000000-0000-4000-8000-0000000000b2', deviceDB: new MemoryDeviceDB(), ...overrides }),
    leaseRows: (): unknown[] => [...deviceDB._cheat_leaseRows().values()].map(({ row }) => row),
  }
}
export type BankWorld = ReturnType<typeof makeBankWorld>

/** A bank past its `hello`, with the vault of `Dna` built in it and unlocked. */
export const makeBankWithVault = async (world: BankWorld = makeBankWorld(), overrides: Partial<BankOpts> = {}) => {
  const bank = world.bankOn(overrides)
  await bank.hello()
  const vault = await bank.ensureVault(VaultScopeGiven)
  return { world, bank, vault }
}

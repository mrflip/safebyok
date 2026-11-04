/** The test world of a models bank: a real {@link MemoryVaultDB} and {@link MemoryDeviceDB} any number of banks share, a dialog that types what the test says, and a clock the test moves. */

import { afterEach } from 'vitest'
import { VaultError, type RefusalKind } from '../../src/errors'
import { Bank } from '../../src/models/bank'
import { MemoryDeviceDB } from '../../src/storage/memory-device-db'
import { MemoryVaultDB } from '../../src/storage/memory-vault-db'
import type { BankScope, VaultScope } from '../../src/storage/vault-db-shapes'
import { anyStrengthChecker, testDeriver } from './builders'
import { quietLogger } from './logging'
import { T0, Dna, Passphrase, byPassphrase } from './vault-world'
import type { BankOpts, RequestCleartext } from '../../src/models/models-shapes'

export const AutolockMinutes = 60

export const BankBag = Object.freeze({ applabel: Dna.applabel, user_id: Dna.user_id })

export const VaultBag = Object.freeze({ vaultlabel: Dna.vaultlabel })

/** A {@link MemoryVaultDB} that refuses every vault get, once told to, as a store out of reach or a user signed out does. */
export class RefusingVaultDB extends MemoryVaultDB {
  #refusalkind: RefusalKind | null = null

  /** From here on, `getBank` and `getVault` refuse this; null lets them through again. */
  _cheat_refuseGets(refusalkind: RefusalKind | null): void { this.#refusalkind = refusalkind } // eslint-disable-line unicorn/prefer-private-class-fields

  protected override doGetBank(scope: BankScope) {
    this.#demandAnswering()
    return super.doGetBank(scope)
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
  const clock = { now: () => now }
  const vaultDB = new RefusingVaultDB({ clock })
  const deviceDB = new MemoryDeviceDB()
  const dialog = { typing: byPassphrase(Passphrase) as object }
  const requestCleartext: RequestCleartext = async (gating) => { await gating.attempt(dialog.typing as never) }
  const baseOpts: BankOpts = { ...BankBag, vaultDB, deviceDB, keyDeriver: testDeriver as BankOpts['keyDeriver'], strengthChecker: anyStrengthChecker, clock, logger: quietLogger, requestCleartext, autolockMinutes: AutolockMinutes }
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
    bankOnAnotherDevice: (overrides: Partial<BankOpts> = {}): Bank => bankOn({ deviceDB: new MemoryDeviceDB(), ...overrides }),
    leaseRows: (): unknown[] => [...deviceDB._cheat_leaseRows().values()],
  }
}
export type BankWorld = ReturnType<typeof makeBankWorld>

/** A bank past its `hello`, with the vault of `Dna` built in it and unlocked. */
export const makeBankWithVault = async (world: BankWorld = makeBankWorld(), overrides: Partial<BankOpts> = {}) => {
  const bank = world.bankOn(overrides)
  await bank.hello()
  const vault = await bank.ensureVault(VaultBag)
  return { world, bank, vault }
}

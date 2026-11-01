import { afterEach, vi } from 'vitest'
import { memoryDeviceDB } from '../../src/devicedb/memory'
import { type BankOpts, Bank } from '../../src/models/bank'
import type { BankDeviceDB, DeviceRecord, VaultRecord } from '../../src/models/models-shapes'
import type { VaultScope } from '../../src/shapes/scopes'
import { testDeriver } from './builders'
import { quietLogger } from './logging'
import { Dna, makeVaultWorld } from './vault-world'

/** Every bank made since the last test. */
const madeBanks: Bank[] = []

/** Say goodbye to every bank a test made, after it, so no watch or timer outlives its test: call it once at the top of a test file. */
export const useBankWorlds = (): void => {
  afterEach(() => {
    for (const bank of madeBanks.splice(0)) { bank.goodbye() }
  })
}

/** A bank over the vaultDB, deviceDB, clock and spies of a {@link makeVaultWorld} of `stored0`, its clock handed as `_cheat_clock`; `overrides` says otherwise of its options.
 * Its deviceDB keeps device records in a `memoryDeviceDB`, `devices`, and its `advanceDeviceRecord`
 * and `clearCachedVault` are spies, the second erasing the world's one lease. `makeBank` makes
 * another bank over the same world: another tab, or the next session.
 */
export const makeBankWorld = (stored0: VaultRecord | null = null, overrides: Partial<BankOpts> = {}) => {
  const world = makeVaultWorld(stored0)
  const { store, cache } = world.opts
  const devices = memoryDeviceDB()
  const advanceDeviceRecord = vi.fn((record: DeviceRecord) => devices.advanceDeviceRecord(record))
  const clearCachedVault = vi.fn(async (scope: VaultScope) => { await world.deviceDB.tryDelLease(scope) })
  const opts: BankOpts = {
    applabel:         Dna.applabel,
    user_id:          Dna.user_id,
    device_id:        'device-1',
    vaultDB:          store,
    deviceDB:         { ...world.deviceDB, vaultCache: () => cache, advanceDeviceRecord, clearCachedVault } as unknown as BankDeviceDB,
    keyDeriver:       testDeriver,
    requestCleartext: world.requestCleartext,
    strengthChecker:  world.strengthChecker,
    logger:           quietLogger,
    ...overrides,
  }
  const makeBank = (): Bank => {
    const made = new Bank(opts, world.opts.world.clock)
    madeBanks.push(made)
    return made
  }
  return { ...world, bankOpts: opts, devices, advanceDeviceRecord, clearCachedVault, bank: makeBank(), makeBank }
}

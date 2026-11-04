/** The shapes of the code a host hands in: the stores and libraries Bank.make takes, a logger, what `localVaultDB` is handed, and a callback. Each `parse` refuses 'bad_option', and only checks: what was handed in goes on as it came, prototype, `this` and all. */

import type * as Z from 'zod'
import { MaxSaltBytes } from '../consts'
import type { KeyDeriver } from '../key-deriver'
import type { LocalVaultDBOpts } from '../local-vault-db'
import type { VaultLogger } from '../logger'
import type { Clock } from './bank-opts'
import * as Phrases from '../phrases'
import { Checker, Checkers, objCheck } from '../checks/validator'
import * as FX from './fields'

// == [Stores and libraries]: vaultDBShape, deviceDBShape, clockShape, keyDeriverShape

/** The checks of the stores and libraries Bank.make takes, each by the verbs the vault calls on it and, for a keyDeriver, the fields it reads, each refusing 'bad_option'.
 * Bank.make keeps what it was handed, prototype and all.
 */
export const { vaultDBShape, deviceDBShape, clockShape, keyDeriverShape } = Checkers('bad_option', ({ obj, fn, str, int, key_deriver_label }) => {
  const verb = fn()
  return {
    // The public verbs the bank and its vaults call on a VaultDB, beside its being an instance of the `VaultDB` base class.
    vaultDBShape:    obj({ tryGetVault: verb, tryEnsureVault: verb, tryPutVaultRecord: verb, tryGetBox: verb, tryPutBox: verb, tryDelBox: verb, tryDelVault: verb, tryDelDamagedVault: verb, subscribe: verb }, Phrases.VaultDBShape),
    deviceDBShape:   obj({ tryGetLease: verb, tryPutLease: verb, tryDelLease: verb, tryGetDeviceRecord: verb, tryRaiseDeviceRecord: verb, tryDelDeviceRecord: verb, tryDelAll: verb }, Phrases.DeviceDBShape),
    clockShape:      obj({ now: fn<Clock['now']>() }),
    keyDeriverShape: obj({
      algorithm:         str.optional(),
      key_deriver_label,
      salt_bytes:        int.gte(1).lte(MaxSaltBytes),
      deriveKeyBytes:    fn<KeyDeriver['deriveKeyBytes']>(),
      load:              fn<NonNullable<KeyDeriver['load']>>().optional(),
    }, Phrases.KeyDeriverShape),
  }
}, [FX])
// --

// == [Host code and adapters' options]: loggerShape, localVaultDBOpts, callback

/** The shape a VaultLogger must have, refusing 'bad_option'. It only checks: Bank.make keeps and calls the host's own logger, `this` and all. */
export const loggerShape = Checker(({ obj, fn }) => {
  const loggerCall = fn<VaultLogger['log']>()
  return obj({ log: loggerCall, warn: loggerCall, error: loggerCall }, Phrases.LoggerShape)
}, 'bad_option')

/** The check of what `localVaultDB` is handed: a `store` carrying a StringStore's five calls, and a `logger`, which the VaultDB checks, and nothing else. Its `parse` refuses 'bad_option'. Only checked: `opts` goes on as it came. */
export const localVaultDBOpts = objCheck(({ obj, fn, unk }) => {
  const call = fn()
  return {
    store:  obj({ get: call, put: call, del: call, scopepaths: call, subscribe: call }, Phrases.StringStoreShape),
    logger: unk.optional(),
  } satisfies Record<keyof LocalVaultDBOpts, Z.ZodType>
}, 'bad_option')

/** The check of a listener or a callback a host hands in, a function: its `parse` refuses 'bad_option', quoting none of it, and hands it back as it came.
 *
 * @example this.#listeners.add(callback.parse(listener))
 */
export const callback = Checker(({ fn }) => fn(), 'bad_option')
// --

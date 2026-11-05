/** The shapes of the code a host hands in: the clock, the key deriver and the logger. Each `parse` refuses 'bad_option', and only checks: what was handed in goes on as it came, prototype, `this` and all. */

import { MaxSaltBytes } from '../helpers/consts'
import type { KeyDeriver } from '../deriver/basederiver'
import type { VaultLogger } from '../helpers/logger'
import * as Phrases from '../helpers/phrases'
import { Checker, Checkers } from '../helpers/validator'
import * as FX from './fields'

// == [Clock]: Clock, wallClock

/** A source of the time, `Bank.make`'s `clock`: `now()` is epoch milliseconds, as `Date.now()` gives, a fraction rounded down.
 * `Bank.make` reads it once, and refuses 'bad_option' for a reading outside `FarPast` to
 * `FarFuture`, or a throw. The vault takes every later reading as it comes.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
// --

// == [Libraries]: clockShape, keyDeriverShape

/** The checks of the stores and libraries Bank.make takes, each by the verbs the vault calls on it and, for a keyDeriver, the fields it reads, each refusing 'bad_option'.
 * Bank.make keeps what it was handed, prototype and all.
 */
export const { clockShape, keyDeriverShape } = Checkers('bad_option', ({ obj, fn, str, int, key_deriver_label }) => {
  return {
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

// --

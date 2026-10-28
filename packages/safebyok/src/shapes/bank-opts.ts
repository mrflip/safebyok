/** What `Bank.make` and `bank.ensureVault` take: their options, the defaults, the stores and libraries a host hands in, and the limits. Each `parse` refuses 'bad_option'. */

import type * as Z from 'zod'
import { MinuteMillis, ForeverMillis, FarPast, FarFuture, MaxSaltBytes } from '../consts'
import type { VaultError } from '../errors'
import type { DeviceDB } from '../device-db'
import type { RequestCleartext } from '../gating'
import type { KeyDeriver } from '../key-deriver'
import type { VaultLogger } from '../logger'
import { type StrengthChecker, DefaultStrengthChecker, strengthChecker } from '../passphrase-strength'
import type { VaultDB } from '../vault-db'
import * as Phrases from '../phrases'
import { Validator } from '../checks/validator'
import { key_deriver_label } from './fields'

// == [Defaults]: LeaseHours, StaleMinutes, MaxLeaseHours, MaxWhisperBytes, MaxBoxes, Clock, wallClock

/** The default `leaseHours`: how long a lease lasts on this device after a gating unlocks, before the vault asks again. */
export const LeaseHours = 168 // seven days

/** The default `staleMinutes`: how long a `hello()` trusts the last read of storage, so a burst of hellos costs one read.
 *
 * @example Bank.make({ ...opts, staleMinutes: 1 })   // hello() reads at most once a minute
 */
export const StaleMinutes = 5

/** The longest finite `leaseHours` a vault takes, 24.5 days: the most one timer reaches. Above it, only `Infinity`, until `lock()`, is taken.
 *
 * @example Bank.make({ ...opts, leaseHours: MaxLeaseHours })   // the longest that ends by itself
 */
export const MaxLeaseHours = 588

/** The default `maxWhisperBytes`: bytes of a whisper's JSON and its sidecar's together, several times an RSA-8192 private key's PEM.
 * A larger whisper is usually a sign that the wrong value is being stored.
 */
export const MaxWhisperBytes = 40_444 // searchable: 40444

/** The default `maxBoxes`: within what every supplied storage adapter can hold and still delete in one go, at the default largest whisper. */
export const MaxBoxes = 100

/** A source of the time, `Bank.make`'s `clock`: `now()` is epoch milliseconds, as `Date.now()` gives, a fraction rounded down.
 * `Bank.make` reads it once, and refuses 'bad_option' for a reading outside `FarPast` to
 * `FarFuture`, or a throw. The vault takes every later reading as it comes.
 */
export type Clock = { now(): number }

/** The wall clock: the default `Clock`. */
export const wallClock: Clock = { now: () => Date.now() }
// --

// == [Bags]: BadNewsHandler, MakeBankOpts, BankVaultOpts, makeBankOpts, bankVaultOpts

/** The type of {@link MakeBankOpts.onBadNews}: told each piece of bad news, and never awaited. */
export type BadNewsHandler = (news: VaultError) => void | Promise<void>

/** The options `Bank.make` takes: the app and the signed-in user, the stores their vaults live in by default, the libraries they share, and how they behave.
 * `Bank.make` refuses ('bad_option') an option it does not take, and one out of its range or of
 * the wrong type; `applabel` and `user_id` refuse 'bad_scope' instead. Each refusal names the
 * option it judged, never its value, and counts the options it does not take, never naming them.
 * Each vault is then named by its `vaultlabel`, its own stores, if any, in a {@link BankVaultOpts}.
 */
export type MakeBankOpts = {
  /** The host application's namespace: one backend can serve several apps without collision. */
  applabel:   string
  /** The signed-in user's stable, opaque id from the host's auth, as the exported `user_id` checks it: never an email or a handle, which can change and would orphan the vault.
   * A bank serves this one user: make a bank as the user signs in, and drop it, with every Vault
   * object it handed out, as they sign out.
   */
  user_id:    string
  /** Where each vault is stored, unless its {@link BankVaultOpts} names another. */
  vaultDB:    VaultDB
  /** What this device keeps of each vault, unless its {@link BankVaultOpts} names another: in a browser, from `browserOpts()`; elsewhere, `memoryDeviceDB()`. */
  deviceDB:   DeviceDB
  /** What turns a passphrase into passphraseKey bytes: in a browser, the pinned Argon2id deriver `browserOpts()` supplies.
   * See {@link KeyDeriver} for the narrow reasons to substitute. Make it once, before any bank,
   * and hand the same one to each: its `load`, if it carries one, runs at each bank's `hello()`.
   */
  keyDeriver: KeyDeriver
  /** How many hours a lease keeps the vault unlocked on this device after a gating unlocks it, across reloads. Default: {@link LeaseHours}, 168 (seven days).
   * Any number above zero up to {@link MaxLeaseHours}, 588 (24.5 days), fractions too: 0.25 is
   * fifteen minutes. No timer reaches further. `Infinity` means never ask again on this device:
   * the vault stays unlocked until `lock()`, or the vault changes under it, and `ask_passphrase_at`
   * reads as {@link FarFuture}.
   *
   * Lowering it takes hold on each device at the vault's next birth: a lease ending further off
   * than this is not taken up, and the vault is born locked. Raising it lengthens no lease already
   * granted. Two tabs opening one vault with different settings are not supported
   * (`notes/wontfix.md`): the lower one wins.
   */
  leaseHours?: number | undefined
  /** How many minutes `hello()` trusts the vault's last read of storage, when its own call does not say. Default: {@link StaleMinutes}, 5.
   * A hello within that many minutes settles the picture it has without reading. Zero or more,
   * fractions too (0.5 is thirty seconds). `0` has every hello read; `Infinity` has a hello read
   * only when no read has succeeded yet, or what it read may no longer be what is stored.
   */
  staleMinutes?: number | undefined
  /** Told each piece of bad news the vault learns, once, before the call that learned it settles; it changes nothing that call gets.
   * News is each refusal of the `bad_news` family, whichever calls share it. A box a listing first
   * shows damaged is news too, as `damaged_box` with the box in `meta.box_listed`, though the
   * listing succeeds. So is a way in stored damaged, as `damaged_wayin` with its summary in
   * `meta.wayin_listed`. The vault never awaits it. What it throws or rejects with becomes the
   * vault's `trouble` ('bad_option', what it threw the cause), and goes to the logger and to the
   * platform's `reportError` where there is one. A throw at news a birth met, with no Vault object
   * yet, goes to the logger and `reportError` alone.
   *
   * @example Bank.make({ ...opts, onBadNews: (news) => { telemetry.report(news.refusalkind) } })
   */
  onBadNews?: BadNewsHandler | null | undefined
  /** Your method that asks the user for a passphrase or passkey: the one place UI meets the vault (see {@link RequestCleartext}).
   * Every call that needs the user -- `ensureUnlocked()` on a vault not unlocked, `putWayin()`,
   * `delWayin()`, `del()` -- raises a {@link Gating}, and hands it here, one at a time per vault.
   * Left out or null, every gating is declined at once: the call refuses 'vault_locked'.
   *
   * @example Bank.make({ ...opts, requestCleartext: (gating) => showDialogFor(gating) })
   */
  requestCleartext?: RequestCleartext | null | undefined
  /** Time source for expiry and for the times stored with each record, as a {@link Clock}; tests inject one. Default: the wall clock.
   * Its `now()` answers epoch milliseconds, as `Date.now()` does. `Bank.make` reads it once, and
   * refuses 'bad_option' for a reading out of bounds or a throw.
   */
  clock?: Clock | undefined
  /** The largest whisper `putBox()` accepts, in bytes of its JSON and its box's sidecar's together. Default: {@link MaxWhisperBytes}, 40444.
   * Checked on write only, so lowering it never strands a whisper already stored. At most half the
   * vaultDB's `maxRecordBytes`.
   */
  maxWhisperBytes?: number | undefined
  /** The most boxes the vault holds. Default: the smaller of {@link MaxBoxes}, 100, and the vaultDB's own `maxBoxes`.
   * `putBox()` refuses a new box past it as 'vault_full'. Replacing a box already there is always
   * allowed, and lowering it strands nothing stored. It may not exceed the vaultDB's `maxBoxes`, and
   * with `maxWhisperBytes` it must fit the vaultDB's `maxVaultBytes`.
   */
  maxBoxes?: number | undefined
  /** Where the vault says what it has nobody to throw to, such as a background refresh that failed, as a {@link VaultLogger}.
   * It hears no secret material and no option's value, and what it throws is ignored.
   *
   * Left out or null, the `vaultDB`'s own logger. It does not go the other way: to have one logger
   * hear both, give it to the adapter's factory and leave this out. To have the vault use the
   * default whatever the adapter was given, pass `DefaultLogger`.
   */
  logger?: VaultLogger | null | undefined
  /** The check every new passphrase must pass, as a {@link StrengthChecker}, whose doc says when it runs and what it hears.
   * A passphrase it finds weak refuses 'weak_passphrase', its reason the message. Left out, every
   * new passphrase refuses so, the message saying a checker must be chosen (CUSTOMIZATION.md). In a
   * browser, `browserOpts()` supplies `zxcvbnStrengthChecker`.
   *
   * It hears each new passphrase in plain text: it should keep nothing, and send nothing anywhere.
   * Make it once, before any bank. Its `load`, if any, runs at each `bank.hello()`, and one that
   * fails refuses that hello.
   */
  strengthChecker?: StrengthChecker | undefined
}

/** A vault's own options, where they are not the bank's: the second bag `bank.ensureVault` and its siblings take, beside the one naming the vault.
 * Left out, the bank's own. It refuses 'bad_option' for anything amiss, naming the field, never its
 * value, and counting the fields it does not take, never naming them.
 *
 * @example await bank.ensureVault({ vaultlabel: 'work' }, { vaultDB: workVaultDB })
 */
export type BankVaultOpts = {
  /** Where this vault is stored, in place of the bank's `vaultDB`: the same object at every ask for the vault, as the bank compares stores by identity. */
  vaultDB?:  VaultDB | undefined
  /** What this device keeps of this vault, in place of the bank's `deviceDB`: the same object at every ask, likewise. */
  deviceDB?: DeviceDB | undefined
}

/** The checks that Bank.make's options and a {@link BankVaultOpts} hold no field they do not take, each refusing 'bad_option'.
 * Each option's value is checked by a parse of its own. `makeBankOpts` also checks
 * `strengthChecker`, handing the default back in its place when left out.
 */
export const { makeBankOpts, bankVaultOpts } = Validator('bad_option', ({ obj, unk }) => {
  const anyOpt = unk.optional()
  const makeBankOpts = obj({
    applabel:               anyOpt,
    user_id:                anyOpt,
    vaultDB:                anyOpt,
    deviceDB:               anyOpt,
    keyDeriver:             anyOpt,
    leaseHours:             anyOpt,
    staleMinutes:           anyOpt,
    onBadNews:              anyOpt,
    requestCleartext:       anyOpt,
    clock:                  anyOpt,
    maxWhisperBytes:        anyOpt,
    maxBoxes:               anyOpt,
    logger:                 anyOpt,
    // A function default is read as the factory for one, so the default checker is handed back by one.
    strengthChecker:        strengthChecker.default(() => DefaultStrengthChecker),
  } satisfies Record<keyof MakeBankOpts, Z.ZodType>).strict()
  const bankVaultOpts = obj({
    vaultDB:  anyOpt,
    deviceDB: anyOpt,
  } satisfies Record<keyof BankVaultOpts, Z.ZodType>).strict()
  return { makeBankOpts, bankVaultOpts }
})
// --

// == [Stores, libraries and limits]: vaultDBShape, deviceDBShape, maxWhisperBytes, maxBoxes, declaredBytes, declaredBoxes, leaseHoursAsMillis, staleMinutesAsMillis, renewMinutesAsMillis, clockShape, clockReading, keyDeriverShape

/** The largest limit in bytes the vault keeps: an adapter's `Infinity` becomes this as Bank.make reads it. */
const UnlimitedBytes = Number.MAX_SAFE_INTEGER

/** The most boxes the vault keeps as a limit: an adapter's `Infinity` becomes this as Bank.make reads it. */
const UnlimitedBoxes = Number.MAX_SAFE_INTEGER

const HourMillis = 60 * MinuteMillis

/** The checks of Bank.make's options and the adapters' declared limits, each refusing 'bad_option'.
 * Where an option is an object, it is only checked: Bank.make keeps what it was handed, prototype
 * and all.
 */
export const { vaultDBShape, deviceDBShape, maxWhisperBytes, maxBoxes, declaredBytes, declaredBoxes, leaseHoursAsMillis, staleMinutesAsMillis, renewMinutesAsMillis, clockShape, clockReading, keyDeriverShape } = Validator('bad_option', ({ obj, union, fn, lit, str, num, int }) => {
  const verb = fn()
  // A limit as an adapter declares one, some bytes or `Infinity` for none, to the finite form the vault keeps.
  const declaredBytes = union([num.positive(), lit(Infinity)]).transform((bytes) => Math.min(bytes, UnlimitedBytes)).pipe(num.positive().lte(UnlimitedBytes))
  // A count of boxes as an adapter declares one, a whole number or `Infinity` for none, to the finite form the vault keeps.
  const declaredBoxes = union([int.positive(), lit(Infinity)]).transform((count) => Math.min(count, UnlimitedBoxes))
  // A lease in hours, above zero and at most MaxLeaseHours, or `Infinity`, which becomes ForeverMillis.
  const hoursSaid = Phrases.leaseHoursShape(MaxLeaseHours)
  const someHours = union([num.positive(hoursSaid).lte(MaxLeaseHours, hoursSaid), lit(Infinity)], hoursSaid)
  const leaseHoursAsMillis = someHours.default(LeaseHours).transform((hours) => (hours === Infinity ? ForeverMillis : Math.round(hours * HourMillis))).pipe(num.gte(1))
  // Minutes, zero or more, or `Infinity`, which becomes ForeverMillis.
  const someMinutes = union([num.gte(0, Phrases.MinutesShape), lit(Infinity)], Phrases.MinutesShape)
  const minutesToMillis = (minutes: number) => (minutes === Infinity ? ForeverMillis : Math.round(minutes * MinuteMillis))
  return {
    // The public verbs the bank and its vaults call on a VaultDB, beside its being an instance of the `VaultDB` base class.
    vaultDBShape:         obj({ tryGetVault: verb, tryEnsureVault: verb, tryPutVaultRecord: verb, tryGetBox: verb, tryPutBox: verb, tryDelBox: verb, tryDelVault: verb, tryDelDamagedVault: verb, subscribe: verb }, Phrases.VaultDBShape),
    deviceDBShape:        obj({ tryGetLease: verb, tryPutLease: verb, tryDelLease: verb, tryGetDeviceRecord: verb, tryRaiseDeviceRecord: verb, tryDelDeviceRecord: verb, tryDelAll: verb }, Phrases.DeviceDBShape),
    maxWhisperBytes:      int.positive().default(MaxWhisperBytes),
    maxBoxes:             int.positive().optional(),
    declaredBytes,
    declaredBoxes,
    leaseHoursAsMillis,
    staleMinutesAsMillis: someMinutes.default(StaleMinutes).transform(minutesToMillis),
    renewMinutesAsMillis: someMinutes.default(0).transform(minutesToMillis),
    clockShape:           obj({ now: fn<Clock['now']>() }),
    // A clock reading Bank.make accepts: epoch milliseconds from FarPast to FarFuture, a fraction allowed.
    clockReading:         num.gte(FarPast).lte(FarFuture),
    keyDeriverShape:      obj({
      algorithm:         str.optional(),
      key_deriver_label,
      salt_bytes:        int.gte(1).lte(MaxSaltBytes),
      deriveKeyBytes:    fn<KeyDeriver['deriveKeyBytes']>(),
      load:              fn<NonNullable<KeyDeriver['load']>>().optional(),
    }, Phrases.KeyDeriverShape),
  }
})
// --

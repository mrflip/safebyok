import type * as Z from 'zod'
import { type Clock, type VaultScope, MaxWhisperBytes, MaxLeaseHours, LeaseHours, StaleMinutes, wallClock, MaxBoxes } from './types/types'
import { MinuteMillis, ForeverMillis, FarPast, FarFuture } from './consts'
import { VaultError, isVaultError, listedKindOf } from './errors'
import type { KeyDeriver } from './key-deriver'
import { MaxSaltBytes, parseKeyDeriverSpec, type KeyDeriverSpec, checkSuppliedSpecKept, TestLabelPrefix, TestDeriverNotice } from './key-deriver-spec'
import type { DeviceDB } from './device-db'
import { VaultDB } from './vault-db'
import { type VaultLogger, parseLogger } from './logger'
import { type GuardedStrengthChecker, type StrengthChecker, DefaultStrengthChecker, guardStrengthChecker, strengthChecker } from './passphrase-strength'
import * as CX from './checks/core-checks'
import { Validator, sayable } from './checks/validator'
import type { Gating, RequestCleartext } from './gating'

/** The type of {@link MakeBankOpts.onBadNews}: told each piece of bad news, and never awaited. */
export type BadNewsHandler = (news: VaultError) => void | Promise<void>

/** The options `Bank.make` takes: the app, the stores its vaults live in by default, the libraries they share, and how they behave.
 * `Bank.make` refuses ('bad_option') an option it does not take, and one out of its range or of
 * the wrong type; `applabel` refuses 'bad_scope' instead. Each refusal names the option, never
 * its value. Each vault is then named by a {@link VaultDraft}.
 */
export type MakeBankOpts = {
  /** The host application's namespace: one backend can serve several apps without collision. */
  applabel:   string
  /** Where each vault is stored, unless its {@link VaultDraft} names another. */
  vaultDB:    VaultDB
  /** What this device keeps of each vault, unless its {@link VaultDraft} names another: in a browser, from `browserOpts()`; elsewhere, `memoryDeviceDB()`. */
  deviceDB:   DeviceDB
  /** What turns a passphrase into passphraseKey bytes: in a browser, the pinned Argon2id deriver `browserOpts()` supplies.
   * See {@link KeyDeriver} for the narrow reasons to substitute.
   */
  keyDeriver: KeyDeriver
  /** How many hours a proof's lease keeps the vault unlocked on this device, across reloads. Default: {@link LeaseHours}, 168 (seven days).
   * Any number above zero up to {@link MaxLeaseHours}, 588 (24.5 days), fractions too: 0.25 is
   * fifteen minutes. No timer reaches further. `Infinity` means never ask again on this device:
   * the vault stays unlocked until `lock()`, or the vault changes under it, and `ask_passphrase_at`
   * reads as {@link FarFuture}.
   *
   * Lowering it takes hold on each device at the vault's next birth: a lease ending further off
   * than this is not taken up, and the vault is born locked. Raising it lengthens no lease already granted. Two
   * tabs opening one vault with different settings are not supported (`notes/wontfix.md`): the
   * lower one wins.
   */
  leaseHours?: number | undefined
  /** How many minutes `hello()` trusts the vault's last read of storage, when its own call does not say. Default: {@link StaleMinutes}, 5.
   * A hello within that many minutes settles the picture it has without reading. Zero or more,
   * fractions too (0.5 is thirty seconds). `0` has every hello read; `Infinity` has a hello read
   * only when no read has succeeded yet, or what it read may no longer stand.
   */
  staleMinutes?: number | undefined
  /** Told each piece of bad news the vault learns, once, before the call that learned it settles; it changes nothing that call gets.
   * News is each refusal of the `bad_news` family, whichever calls share it. A box a listing first
   * shows damaged is news too, as `damaged_box` with the box in `meta.box_listed`, though the
   * listing succeeds. So is a way in stored damaged, as `damaged_wayin` with its summary in
   * `meta.wayin_listed`. The vault never awaits it. What it throws or rejects with becomes the
   * vault's `trouble` ('bad_option', what it threw the cause), and goes to the logger and to the
   * platform's `reportError` where there is one.
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
  /** Time source for expiry and for the times stored with each record; tests inject one. Default: the wall clock.
   * Its `now()` returns epoch milliseconds, as `Date.now()` does, from 1981 to 2255 ({@link FarPast}
   * to {@link FarFuture}); fractions are rounded down. `Bank.make` reads it once, and refuses
   * 'bad_option' for one out of bounds or one that throws. Every later reading is taken as it comes.
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
   * The vault hands it no secret material and no option's value; a host's own error goes as the
   * host made it. Whatever it throws is ignored. Pass functions that do nothing for quiet.
   *
   * Left out or null, the `vaultDB`'s own logger. It does not go the other way: to have one logger
   * hear both, give it to the adapter's factory and leave this out. To have the vault use the
   * default whatever the adapter was given, pass `DefaultLogger`.
   */
  logger?: VaultLogger | null | undefined
  /** The check every new passphrase must pass, as a {@link StrengthChecker}: in the `initialize_gate` gating that sets the first, and in each `change_passphrase`.
   * It runs before any key derivation, handed the passphrase and the vault's scope; never on a
   * passphrase that unlocks a vault that stands. A passphrase it finds weak refuses 'weak_passphrase', its
   * reason the message. Left out, every new passphrase refuses so, the message saying a checker
   * must be chosen (CUSTOMIZATION.md). In a browser, `browserOpts()` supplies
   * `zxcvbnStrengthChecker`.
   *
   * Its `load`, if any, runs at `bank.hello()`, and one that fails fails that hello: no vault is
   * born until it succeeds. Each vault asks it as `vault.checkStrength(typed)`.
   * A checker that answers anything but a verdict refuses the call that asked it 'bad_option'; one
   * that throws, 'unexpected_error', carrying nothing of what it threw.
   */
  strengthChecker?: StrengthChecker | undefined
}

/** Which vault `bank.ensureVault` births: the user's, under its label, in the app the bank was made for; and the stores it lives in, where not the bank's.
 * It refuses 'bad_scope' for a name that fails its check, and 'bad_option' for anything else
 * amiss, naming the field, never its value.
 *
 * @example await bank.ensureVault({ user_id: session.user_id, vaultlabel: 'main' })
 */
export type VaultDraft = {
  /** The signed-in user's stable, opaque id from the host's auth: never an email or a handle, which can change and would orphan the vault.
   * It is 1 to 100 ASCII letters, digits and `-_.~:@+|%`, never dots alone, as the exported
   * `user_id` checks: percent-encode (RFC 3986) one that holds anything else.
   */
  user_id:    string
  /** The vault's own label; an app that keeps one vault per user calls it `main`. */
  vaultlabel: string
  /** Where this vault is stored, in place of the bank's `vaultDB`: the same object at every ask for the vault, as the bank compares stores by identity. */
  vaultDB?:   VaultDB | undefined
  /** What this device keeps of this vault, in place of the bank's `deviceDB`: the same object at every ask, likewise. */
  deviceDB?:  DeviceDB | undefined
}

const isFunction = (candidate: unknown) => typeof candidate === 'function'

/** True for any object but null, an array included. */
export const isBag = (candidate: unknown) => typeof candidate === 'object' && candidate !== null

/** Every option Bank.make takes, each checked here or by a parse of its own, and every field a {@link VaultDraft} holds, each likewise: each refuses any other, 'bad_option'.
 * `makeBankOpts` checks `strengthChecker`, handing the default back in its place when left out.
 */
const { makeBankOpts, vaultDraft } = Validator('bad_option', ({ obj, unk }) => {
  const anyOpt = unk.optional()
  const makeBankOpts = obj({
    applabel:               anyOpt,
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
  const vaultDraft = obj({
    user_id:    anyOpt,
    vaultlabel: anyOpt,
    vaultDB:    anyOpt,
    deviceDB:   anyOpt,
  } satisfies Record<keyof VaultDraft, Z.ZodType>).strict()
  return { makeBankOpts, vaultDraft }
})

/** Each option Bank.make (or Vault.make, before it) once took under another name, and the name it takes now (notes/old_vocabulary.md). */
const RenamedMakeBankOpts: ReadonlyMap<string, keyof MakeBankOpts> = new Map([
  ['forcePassphraseReentryHours', 'leaseHours'],
  ['passphraseStrengthTest', 'strengthChecker'],
])

/** Bank.make's options with `strengthChecker` checked, or the default in its place; every other option as handed in, for its own parse.
 * Refuses 'bad_option' for an option Bank.make does not take, naming each shaped as one of ours,
 * with the name a renamed one goes by now, or the place a moved one goes; and for a
 * `strengthChecker` that is not one.
 */
export const checkMakeBankOpts = (opts: object) => {
  const unknownCkeys = Object.keys(opts).filter((ckey) => ! Object.hasOwn(makeBankOpts.shape, ckey))
  if (unknownCkeys.length > 0) {
    const named = unknownCkeys.map((ckey) => {
      const renamed = RenamedMakeBankOpts.get(ckey)
      if (renamed !== undefined) { return `${ckey} (called ${renamed} now)` }
      return DraftCkeys.has(ckey) ? `${ckey} (each vault's own: hand it to bank.ensureVault)` : sayable(ckey)
    })
    const takes = Object.keys(makeBankOpts.shape).join(', ')
    throw new VaultError('bad_option', `Bank.make does not take ${named.length === 1 ? 'the option' : 'the options'} ${named.join(', ')}: check the spelling. It takes ${takes}, and refuses any other rather than quietly ignore it.`)
  }
  try {
    return makeBankOpts.parse(opts)
  } catch (err) {
    if (! isVaultError(err, 'bad_option')) { throw err }
    throw new VaultError('bad_option', `Bank.make's ${err.message}`, err.meta === undefined ? {} : { meta: err.meta })
  }
}

/** The fields of a {@link VaultDraft}, which Bank.make names as each vault's own when handed one. */
const DraftCkeys: ReadonlySet<string> = new Set(['user_id', 'vaultlabel'])

/** `draft` as handed to `bank.ensureVault`, once a bag of no field it does not take: 'bad_option' otherwise, naming the field where it is shaped as one of ours. */
const checkVaultDraft = (draft: unknown): VaultDraft => {
  if (! isBag(draft)) { throw new VaultError('bad_option', "bank.ensureVault takes the vault it births as one bag: { user_id, vaultlabel }, and its own vaultDB or deviceDB where not the bank's.") }
  try {
    vaultDraft.parse(draft)
    return draft as VaultDraft
  } catch (err) {
    if (! isVaultError(err, 'bad_option')) { throw err }
    throw new VaultError('bad_option', `In bank.ensureVault's draft: ${err.message}. It takes user_id, vaultlabel, vaultDB and deviceDB, and refuses any other rather than quietly ignore it.`, err.meta === undefined ? {} : { meta: err.meta })
  }
}

/** The largest limit in bytes the vault keeps: an adapter's `Infinity` becomes this as Bank.make reads it. */
const UnlimitedBytes = Number.MAX_SAFE_INTEGER

/** The most boxes the vault keeps as a limit: an adapter's `Infinity` becomes this as Bank.make reads it. */
const UnlimitedBoxes = Number.MAX_SAFE_INTEGER

const HourMillis = 60 * MinuteMillis

/** Bank.make's options and the adapters' declared limits, one validator each, every one refusing 'bad_option'; each parse below says what it is in its own words. Checked only, where an option is an object: Bank.make keeps what it was handed, prototype and all. */
const { vaultDBShape, deviceDBShape, maxWhisperBytes, maxBoxes, declaredBytes, declaredBoxes, leaseHoursAsMillis, staleMinutesAsMillis, renewMinutesAsMillis, clockShape, clockReading, keyDeriverShape } = Validator('bad_option', ({ obj, union, custom, lit, str, num, int }) => {
  const verb = custom(isFunction)
  // A limit as an adapter declares one, some bytes or `Infinity` for none, to the finite form the vault keeps.
  const declaredBytes = union([num.positive(), lit(Infinity)]).transform((bytes) => Math.min(bytes, UnlimitedBytes)).pipe(num.positive().lte(UnlimitedBytes))
  // A count of boxes as an adapter declares one, a whole number or `Infinity` for none, to the finite form the vault keeps.
  const declaredBoxes = union([int.positive(), lit(Infinity)]).transform((count) => Math.min(count, UnlimitedBoxes))
  // A lease in hours, above zero and at most MaxLeaseHours, or `Infinity`, which becomes ForeverMillis.
  const someHours = union([num.positive().lte(MaxLeaseHours), lit(Infinity)])
  const leaseHoursAsMillis = someHours.default(LeaseHours).transform((hours) => (hours === Infinity ? ForeverMillis : Math.round(hours * HourMillis))).pipe(num.gte(1))
  // Minutes, zero or more, or `Infinity`, which becomes ForeverMillis.
  const someMinutes = union([num.gte(0), lit(Infinity)])
  const minutesToMillis = (minutes: number) => (minutes === Infinity ? ForeverMillis : Math.round(minutes * MinuteMillis))
  return {
    // The public verbs a VaultDB must carry, beside being an instance of the `VaultDB` base class.
    vaultDBShape:         obj({ getVault: verb, ensureVault: verb, putVaultProps: verb, getBox: verb, putBox: verb, delBox: verb, delVault: verb, subscribe: verb }),
    deviceDBShape:        obj({ getLease: verb, putLease: verb, delLease: verb, getDeviceRecord: verb, raiseDeviceRecord: verb, delDeviceRecord: verb, delAll: verb }),
    maxWhisperBytes:      int.positive().default(MaxWhisperBytes),
    maxBoxes:             int.positive().optional(),
    declaredBytes,
    declaredBoxes,
    leaseHoursAsMillis,
    staleMinutesAsMillis: someMinutes.default(StaleMinutes).transform(minutesToMillis),
    renewMinutesAsMillis: someMinutes.default(0).transform(minutesToMillis),
    clockShape:           obj({ now: custom<Clock['now']>(isFunction) }),
    // A clock reading Bank.make accepts: epoch milliseconds from FarPast to FarFuture, a fraction allowed.
    clockReading:         num.gte(FarPast).lte(FarFuture),
    keyDeriverShape:      obj({
      algorithm:         str.optional(),
      key_deriver_label: str.min(1),
      salt_bytes:        int.gte(1).lte(MaxSaltBytes),
      deriveKeyBytes:    custom<KeyDeriver['deriveKeyBytes']>(isFunction),
    }),
  }
})

/** `candidate`, once it is a {@link VaultDB} carrying its verbs: 'bad_option' otherwise. */
export const parseVaultDB = (candidate: VaultDB): VaultDB => {
  if (! (candidate instanceof VaultDB) || ! vaultDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "vaultDB is not a VaultDB: pass a storage adapter, such as localVaultDB({ store }), idbVaultDB() from 'safebyok-indexeddb', or your backend's own, which extends the VaultDB class.")
  }
  return candidate
}

/** `candidate`, once it carries a {@link DeviceDB}'s verbs: 'bad_option' otherwise. */
export const parseDeviceDB = (candidate: DeviceDB): DeviceDB => {
  if (! deviceDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "deviceDB is not a DeviceDB: in a browser, spread browserOpts() from 'safebyok/browser' into Bank.make's options; elsewhere, pass memoryDeviceDB().")
  }
  return candidate
}

/** How many bytes of storage a vault reserves for each byte of whisper and sidecar: two.
 * A whisper's base64 ciphertext is a third larger, and a sidecar is stored as its own JSON; the
 * rest is room for each backend's way of counting bytes. So a whisper and its sidecar may claim at
 * most half of an adapter's `maxRecordBytes`.
 */
export const StoredBytesPerWhisperByte = 2

/** The room Bank.make plans for a box's stored fields besides its whisper and sidecar, in bytes of their JSON.
 * It is what Bank.make counts when it checks that `maxBoxes` boxes fit the storage's
 * `maxVaultBytes`. The fields at their largest, the scope and boxlabel included, take under
 * 1000. Each store also weighs its box as it is ({@link BoxFixedBytes}): this is only the plan.
 */
export const BoxFieldsBytes = 1024

/** Room for the stored fields every box has at the same size, in bytes of their JSON, field names included.
 * A store weighs a box as this, its whisper and sidecar's room, and its scope and boxlabel as
 * measured.
 */
export const BoxFixedBytes = 512

/** How Bank.make reads each limit an adapter declares. */
const DeclaredLimitFor = {
  maxRecordBytes: declaredBytes,
  maxVaultBytes:  declaredBytes,
  maxBoxes:       declaredBoxes,
} as const

/** `leaseHours`, or its default, in the whole milliseconds the vault keeps: 'bad_option' out of range. */
export const parseLeaseHours = (candidate: number | undefined): number => {
  const checked = leaseHoursAsMillis.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `leaseHours is a number of hours greater than zero and at most ${String(MaxLeaseHours)} (24.5 days), fractions too (0.25 is fifteen minutes), or Infinity for never: until lock(). A longer finite lease is refused, as no timer reaches past it.`)
  }
  return checked.data
}

/** `staleMinutes`, as Bank.make or `hello()` is handed it, in the milliseconds the vault keeps: 'bad_option', naming `where`, out of range.
 *
 * @example parseStaleMinutes(0.5, 'Bank.make')   // 30000
 */
export const parseStaleMinutes = (candidate: unknown, where: 'Bank.make' | 'hello'): number => {
  const checked = staleMinutesAsMillis.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `${where}'s staleMinutes is a number of minutes, zero or more, fractions too (0.5 is thirty seconds), or Infinity: how long a hello trusts the last read of storage before it reads again.`)
  }
  return checked.data
}

/** `ensureUnlocked()`'s `renewMinutes`, in the milliseconds the vault keeps, 0 when left out: 'bad_option' out of range. */
export const parseRenewMinutes = (candidate: unknown): number => {
  const checked = renewMinutesAsMillis.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', "ensureUnlocked's renewMinutes is a number of minutes, zero or more, fractions too, or Infinity: ask the user when the lease ends within that many minutes.")
  }
  return checked.data
}

/** The `onBadNews` handler, or null for none: 'bad_option' for anything but a function. */
export const parseOnBadNews = (candidate: unknown): BadNewsHandler | null => {
  if (candidate === undefined || candidate === null) { return null }
  if (typeof candidate !== 'function') {
    throw new VaultError('bad_option', 'onBadNews is a function the vault calls with each piece of bad news, a VaultError: pass one, or leave it out.')
  }
  return candidate as BadNewsHandler
}

/** The host's {@link RequestCleartext}, guarded: it resolves once the host's resolves, and refuses 'unexpected_error' for whatever the host's throws, carrying none of it, so no refusal of the host's is mistaken for the vault's. */
export type GuardedRequestCleartext = (gating: Gating) => Promise<void>

/** The host's `requestCleartext`, guarded, or null for none: 'bad_option' for anything but a function.
 * What the host's throws is never kept: its dialog hears the passphrase, so a throw may quote it.
 * `logger` hears only that it threw, and the refusalkind of a VaultError it threw, as {@link listedKindOf} tells it.
 */
export const parseRequestCleartext = (candidate: unknown, logger: VaultLogger): GuardedRequestCleartext | null => {
  if (candidate === undefined || candidate === null) { return null }
  if (typeof candidate !== 'function') {
    throw new VaultError('bad_option', 'requestCleartext is a function the vault hands a gating whenever it needs the user, resolving once its dialog closes: pass one, or leave it out.')
  }
  const host = candidate as RequestCleartext
  return async (gating) => {
    try {
      await host(gating)
    } catch (err) {
      // A bug in the host's dialog, a VaultError it let escape too: never a refusal of the call
      // that asked, and never its cause, which may quote what the user typed.
      logger.error("The requestCleartext handed to Bank.make threw: the call that asked refuses 'unexpected_error'. What it threw is left out, as the dialog hears the passphrase.", { call: 'requestCleartext', refusalkind: listedKindOf(err) })
      throw requestThrewError()
    }
  }
}

/** The refusal of a call whose `requestCleartext` threw: nothing of the throw, which may quote the passphrase. */
const requestThrewError = () => new VaultError('unexpected_error', "The requestCleartext handed to Bank.make threw rather than resolving once its dialog closed, so this call was not answered. What it threw is left out of this report, as its dialog hears the passphrase: have it catch its own failures, and resolve.")

/** The host's clock, or the wall clock when left out, checked by one reading: 'bad_option' for one with no `now()`, that throws, or that reads outside 1981 to 2255. */
export const parseClock = (candidate: Clock | undefined): Clock => {
  if (candidate === undefined) { return wallClock }
  if (! clockShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'clock is not a Clock: it needs a now() function returning epoch milliseconds, as Date.now() does.')
  }
  let reading: unknown
  try {
    reading = candidate.now()
  } catch (err) {
    // The host's own error rides along as the cause, unquoted.
    throw new VaultError('bad_option', "The clock passed to Bank.make threw when read: its now() must return epoch milliseconds, as Date.now() does. The clock's own error is this error's cause.", { cause: err })
  }
  if (! clockReading.safeParse(reading).success) {
    throw new VaultError('bad_option', "The clock passed to Bank.make read a time outside 1981 to 2255: its now() must return epoch milliseconds, as Date.now() does, not seconds or microseconds.")
  }
  return candidate
}

/** `maxWhisperBytes`, or its default: 'bad_option' for anything but a whole number above zero. */
export const parseMaxWhisperBytes = (candidate: number | undefined): number => {
  const checked = maxWhisperBytes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxWhisperBytes is a whole number of bytes, greater than zero.')
  }
  return checked.data
}

/** The vault's `maxBoxes`, or by default the smaller of {@link MaxBoxes} and `storeBoxes`: 'bad_option' past `storeBoxes`.
 *
 * @param storeBoxes - The most the vaultDB holds in one vault.
 */
export const parseMaxBoxes = (candidate: number | undefined, storeBoxes: number): number => {
  const checked = maxBoxes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxBoxes is a whole number of boxes, greater than zero.')
  }
  if (checked.data === undefined) { return Math.min(MaxBoxes, storeBoxes) }
  if (checked.data > storeBoxes) {
    throw new VaultError('bad_option', `maxBoxes is over the ${String(storeBoxes)} boxes this storage adapter holds in one vault (its own maxBoxes): pass ${String(storeBoxes)} or fewer.`)
  }
  return checked.data
}

/** `candidate` as the KeyDeriver a vault keeps, once it passes: 'bad_option' otherwise.
 * It needs the shape of a deriver, a label that is not safebyok's to reserve, and, for one
 * declaring `algorithm: 'argon2id'`, a whole spec Argon2id can run. A test deriver's label warns
 * through `logger`, and goes on.
 */
export const parseKeyDeriver = (candidate: KeyDeriver | undefined, logger: VaultLogger): KeyDeriver => {
  if (candidate === undefined) {
    throw new VaultError('bad_option', "Bank.make needs a keyDeriver: in a browser, spread browserOpts() from 'safebyok/browser' into its options.")
  }
  if (! keyDeriverShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'keyDeriver is not a KeyDeriver: it needs a key_deriver_label, a salt_bytes from 1 to 65536 and a deriveKeyBytes function.')
  }
  // A deriver declaring Argon2id must be one Argon2id can run: its refusal here, with a kind, is
  // the one it would otherwise make at the first unlock, as a plain Error from the library.
  if (candidate.algorithm === 'argon2id') { parseKeyDeriverSpec(candidate as KeyDeriverSpec) }
  checkSuppliedSpecKept(candidate)
  if (candidate.key_deriver_label.startsWith(TestLabelPrefix)) {
    logger.warn(TestDeriverNotice, { call: 'make' })
  }
  return candidate
}

/** One of the adapter's declared limits, `Infinity` made finite: 'bad_option' for an adapter that declares none. */
export const parseDeclared = (vaultDB: VaultDB, limitname: keyof typeof DeclaredLimitFor): number => {
  const checked = DeclaredLimitFor[limitname].safeParse(vaultDB[limitname])
  // An adapter that declares no limit, or one written before a limit existed, is refused: never guessed.
  if (! checked.success) {
    throw new VaultError('bad_option', `This storage adapter does not declare ${limitname}, a limit every adapter states: update the adapter, or ask its author to.`)
  }
  return checked.data
}

/** Refuse ('bad_option') limits the storage adapter might not honour: a whisper too large for one of its records, or a vault too large for it.
 *
 * @returns The most the adapter holds of one vault, in the finite form the vault keeps.
 */
export const checkLimitsFit = (vaultDB: VaultDB, limits: { maxWhisperBytes: number, maxBoxes: number }): number => {
  const recordBytes = parseDeclared(vaultDB, 'maxRecordBytes')
  if (limits.maxWhisperBytes * StoredBytesPerWhisperByte > recordBytes) {
    throw new VaultError('bad_option', `maxWhisperBytes is over half of the ${String(recordBytes)} bytes this storage adapter holds in one record, so a whisper that large might not store: pass a smaller maxWhisperBytes.`)
  }
  const vaultBytes = parseDeclared(vaultDB, 'maxVaultBytes')
  const boxBytes = (limits.maxWhisperBytes * StoredBytesPerWhisperByte) + BoxFieldsBytes
  if (limits.maxBoxes * boxBytes <= vaultBytes) { return vaultBytes }
  const fitting = Math.floor(vaultBytes / boxBytes)
  const outcome = fitting === 0
    ? 'At that maxWhisperBytes, not even one box fits: pass a smaller maxWhisperBytes.'
    : `At that maxWhisperBytes, at most ${String(fitting)} boxes fit: pass a smaller maxBoxes or maxWhisperBytes.`
  throw new VaultError('bad_option', `${String(limits.maxBoxes)} boxes (maxBoxes) of up to ${String(limits.maxWhisperBytes)} bytes of whisper each (maxWhisperBytes) might not fit in the ${String(vaultBytes)} bytes this storage adapter holds of one vault (its maxVaultBytes), with room for each box's other fields. ${outcome}`)
}

/** Bank.make's options as {@link parseMakeBankOpts} hands them back: each checked, and read into the form the bank keeps for its vaults. */
export type ParsedBankOpts = {
  applabel:         string
  vaultDB:          VaultDB
  deviceDB:         DeviceDB
  leaseMillis:      number
  staleMillis:      number
  onBadNews:        BadNewsHandler | null
  requestCleartext: GuardedRequestCleartext | null
  logger:           VaultLogger
  clock:            Clock
  keyDeriver:       KeyDeriver
  /** The host's checker, checked: each vault guards it under its own scope. */
  strengthChecker:  StrengthChecker
  maxWhisperBytes:  number
  /** `maxBoxes` as given, held to each vault's vaultDB at its birth. */
  maxBoxes:         number | undefined
}

/** The one name Bank.make's options hold, checked as a scope's names are: 'bad_scope' for an applabel that is not a label. */
const { bankApplabel } = Validator('bad_scope', ({ obj, applabel }) => ({ bankApplabel: obj({ applabel }) }))

/** Bank.make's options, checked and read, before storage is touched.
 * Refuses 'insecure_context' first, in a page the browser says is not a secure context. Then
 * 'bad_option' for anything but a bag, or for an option it does not take or out of range, and
 * 'bad_scope' for an `applabel` that is not a label. The limits are held to the default
 * `vaultDB`'s here, and to a draft's own at its birth.
 *
 * @example const { applabel, leaseMillis } = parseMakeBankOpts(opts)
 */
export const parseMakeBankOpts = (opts: MakeBankOpts): ParsedBankOpts => {
  checkSecureContext()
  if (! isBag(opts)) { throw new VaultError('bad_option', "Bank.make takes one bag of options: applabel, vaultDB, deviceDB and keyDeriver at least.") }
  const shaped = checkMakeBankOpts(opts)
  const { applabel } = bankApplabel.parse({ applabel: opts.applabel })
  const vaultDB = parseVaultDB(opts.vaultDB)
  const deviceDB = parseDeviceDB(opts.deviceDB)
  const leaseMillis = parseLeaseHours(opts.leaseHours)
  const staleMillis = parseStaleMinutes(opts.staleMinutes, 'Bank.make')
  const onBadNews = parseOnBadNews(opts.onBadNews)
  // The host's logger for the vaults, else the one its storage was made with; guarded either way.
  const logger = parseLogger(opts.logger ?? vaultDB.logger)
  const requestCleartext = parseRequestCleartext(opts.requestCleartext, logger)
  const clock = parseClock(opts.clock)
  const keyDeriver = parseKeyDeriver(opts.keyDeriver, logger)
  const limits = { maxWhisperBytes: parseMaxWhisperBytes(opts.maxWhisperBytes), maxBoxes: opts.maxBoxes }
  // Held to the default vaultDB now, so misuse is refused at Bank.make, not at the first birth.
  limitsOf(vaultDB, limits)
  return { applabel, vaultDB, deviceDB, leaseMillis, staleMillis, onBadNews, requestCleartext, logger, clock, keyDeriver, strengthChecker: shaped.strengthChecker, maxWhisperBytes: limits.maxWhisperBytes, maxBoxes: limits.maxBoxes }
}

/** What each vault is made of: the bank's parts, its own scope and stores, and its limits as held to its own vaultDB. */
export type VaultParts = Omit<ParsedBankOpts, 'applabel' | 'strengthChecker' | 'maxBoxes'> & {
  scope:            VaultScope
  strengthChecker:  GuardedStrengthChecker
  /** The most boxes the vault holds: `maxBoxes` as given, or its default, held to the vaultDB's own. */
  maxBoxes:         number
  /** The most bytes the vaultDB holds of the vault, in the finite form the vault keeps. */
  maxVaultBytes:    number
}

/** The parts of the vault `draft` names, under `bank`, checked before storage is touched: 'bad_scope' for a name that fails its check, 'bad_option' for anything else.
 *
 * @example const { scope } = parseVaultDraft({ user_id: 'u1', vaultlabel: 'main' }, bank)   // scope: { applabel, user_id: 'u1', vaultlabel: 'main' }
 */
export const parseVaultDraft = (draft: VaultDraft, bank: ParsedBankOpts): VaultParts => {
  const checked = checkVaultDraft(draft)
  const scope = CX.vaultScope.parse({ applabel: bank.applabel, user_id: checked.user_id, vaultlabel: checked.vaultlabel })
  const vaultDB = checked.vaultDB === undefined ? bank.vaultDB : parseVaultDB(checked.vaultDB)
  const deviceDB = checked.deviceDB === undefined ? bank.deviceDB : parseDeviceDB(checked.deviceDB)
  const limits = limitsOf(vaultDB, bank)
  const { applabel: _applabel, maxBoxes: _maxBoxes, ...shared } = bank
  return { ...shared, scope, vaultDB, deviceDB, strengthChecker: guardStrengthChecker(bank.strengthChecker, scope), maxBoxes: limits.maxBoxes, maxVaultBytes: limits.maxVaultBytes }
}

/** The box and byte limits a vault keeps over `vaultDB`: `given.maxBoxes`, or the default, held with `given.maxWhisperBytes` to what the adapter declares. */
const limitsOf = (vaultDB: VaultDB, given: Pick<ParsedBankOpts, 'maxWhisperBytes' | 'maxBoxes'>): Pick<VaultParts, 'maxBoxes' | 'maxVaultBytes'> => {
  const boxes = parseMaxBoxes(given.maxBoxes, parseDeclared(vaultDB, 'maxBoxes'))
  return { maxBoxes: boxes, maxVaultBytes: checkLimitsFit(vaultDB, { maxWhisperBytes: given.maxWhisperBytes, maxBoxes: boxes }) }
}

/** Refuse ('insecure_context') a page the platform says is not a secure context, where a browser withholds WebCrypto.
 * That is plain http, anywhere but localhost. A runtime with no such notion (Node, Bun, React
 * Native) passes.
 */
const checkSecureContext = () => {
  if ((globalThis as { isSecureContext?: unknown }).isSecureContext === false) {
    throw new VaultError('insecure_context', 'This page is not a secure context -- it was served over plain http -- so the browser withholds the cryptography the vault needs: serve the app over https (http://localhost counts as secure, for development).')
  }
}

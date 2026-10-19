import * as Z from 'zod/mini'
import { type Clock, MaxWhisperBytes, MinuteMillis, MaxLeaseHours, LeaseHours, ForeverMillis, wallClock, FarPast, FarFuture, MaxBoxes } from './types'
import type { VaultValidators } from './validators'
import { VaultError } from './errors'
import type { KeyDeriver } from './key-deriver'
import { MaxSaltBytes, parseKeyDeriverSpec, type KeyDeriverSpec, checkSuppliedSpecKept, TestLabelPrefix, TestDeriverNotice } from './key-deriver-spec'
import type { DeviceDB } from './device-db'
import { VaultDB } from './vault-db'
import { type VaultLogger } from './logger'
import { type PassphraseStrengthTest } from './passphrase-strength'

export type MakeVaultOpts = {
  /** The host application's namespace: one backend can serve several apps without collision. */
  applabel:   string
  /**
   * Stable identifier of the signed-in user, from the host's auth: by default 1 to 100 ASCII
   * letters, digits and `-_.:@+|`, as the exported `UserId` checks, or what `validators.userId`
   * admits. The provider's stable, opaque id: never an email or a handle, which can change and
   * would orphan the vault.
   */
  userId:     string
  /** The vault's own label; an app that keeps one vault per user calls it `main`. */
  vaultlabel: string
  vaultDB:    VaultDB
  deviceDB:   DeviceDB
  /**
   * What turns a passphrase into passphraseKey bytes: in a browser, the pinned Argon2id deriver
   * that `browserOpts()` from `safebyok/browser` supplies. See {@link KeyDeriver} for the narrow
   * reasons to substitute. Asked for outright, so an app that passes another never ships this one.
   */
  keyDeriver: KeyDeriver
  /**
   * How many hours a lease lasts on this device, across reloads, after a proof unlocks the vault,
   * before the vault asks for a proof again. Default: {@link LeaseHours}, 168 (seven days).
   * Any number above zero up to {@link MaxLeaseHours}, 588 (24.5 days), fractions too: 0.25 is
   * fifteen minutes. `Infinity` means never on this device: the vault stays unlocked until
   * `lock()` (or the vault changes under it), and `askPassphraseAt` reads as {@link FarFuture}.
   * A finite number past 588 is refused with kind 'bad_option': the vault drops its key with a
   * timer a minute after the lease ends, and no timer reaches further.
   *
   * Lowering it takes hold on each device at its next hello: a lease granted under the longer
   * setting, whose deadline lies past this many hours from then, is discarded, and the vault
   * opens locked. Raising it lengthens no lease already granted. A device keeps one lease per
   * vault, so two tabs opening a vault with different settings are one device with two settings,
   * which is not supported (`notes/wontfix.md`): the lower one wins.
   */
  leaseHours?: number | undefined
  /**
   * Time source for expiry and for the times stored with each record; tests inject one. Default:
   * the wall clock. Its `now()` returns epoch milliseconds, as `Date.now()` does, from 1981 to 2255
   * ({@link FarPast} to {@link FarFuture}), fractions allowed (each reading is rounded down to
   * whole milliseconds). Vault.make reads it once and refuses a clock outside those bounds, or one
   * that throws, with kind 'bad_option'; so does any later call that reads it so, dropping the
   * vaultKey first, so the vault is locked.
   */
  clock?: Clock | undefined
  /**
   * The largest whisper `putBox()` accepts, in bytes of its JSON and its box's sidecar's
   * together. Default: {@link MaxWhisperBytes}, 40444. Checked on write only, so lowering it never
   * strands a whisper already stored. At most half the vaultDB's `maxRecordBytes`: Vault.make
   * refuses more with kind 'bad_option'.
   */
  maxWhisperBytes?: number | undefined
  /**
   * The most boxes the vault holds. Default: {@link MaxBoxes}, 100, or the vaultDB's own
   * `maxBoxes` when that is smaller. `putBox()` refuses a new box past it with kind
   * 'vault_full'; replacing one already there is always allowed, and lowering it strands nothing
   * already stored. Raise this or `maxWhisperBytes` freely while this stays within the vaultDB's
   * `maxBoxes` and the two fit its `maxVaultBytes`: Vault.make refuses otherwise, with kind
   * 'bad_option'.
   */
  maxBoxes?: number | undefined
  /**
   * Where the vault says what it has nobody to throw to -- a background refresh that failed, a
   * lease it could not read -- as a
   * {@link VaultLogger}: `log`, `warn` and `error` functions. The vault hands
   * it no secret material or option's value (a host's own error goes as the host made it); whatever
   * it throws is ignored. Pass functions that do nothing for quiet. Default (none, or null): the
   * logger the `vaultDB` was made with, which is the default logger when it was given none. It does
   * not go the other way: a storage adapter keeps the logger it was made with, so to have one logger
   * hear both, give it to the adapter's factory and leave this out; to have the vault use the
   * default whatever the adapter was given, pass `DefaultLogger`. Kind 'bad_option' for anything else.
   */
  logger?: VaultLogger | null | undefined
  /**
   * The checks for the vault's names where they enter it, as a {@link VaultValidators} bag: each
   * field given replaces ours (`Label` for each label, a wayin's `wayinlabel` among them,
   * `UserId` for the user, from `safebyok/validators`), and each left out keeps ours. Each is a Zod
   * schema that checks synchronously, and only checks: what passes is kept exactly as given.
   * Beneath every one, the floor (`NameFloor`) holds whatever the bag says. Kind 'bad_option' for
   * a bag holding anything else, or a field it does not know (a `note` among them: a box's
   * sidecar is the host's to check).
   */
  validators?: VaultValidators | undefined
  /**
   * The check every new passphrase must pass, as a {@link PassphraseStrengthTest}: the one the
   * first `unlock()` creates the vault with, and each `addPassphrase()` or `changePassphrase()`
   * sets, before any key derivation. It is handed the passphrase and the vault's scope, and a
   * passphrase it finds weak is refused with kind 'weak_passphrase', the test's reason the
   * message. It never runs on `unlock()` of a vault that stands. Required, as the vault has no
   * test of its own: in a browser, `browserOpts()` from `safebyok/browser` supplies
   * `zxcvbnPassphraseTest`, which turns away short passphrases, common passwords and patterns.
   * The vault keeps the test it was opened with for its life. Kind 'bad_option' for anything but a
   * function, and for a test that answers anything but a verdict; whatever it throws, the call
   * throws.
   */
  passphraseStrengthTest: PassphraseStrengthTest
}

const isFunction = (candidate: unknown) => typeof candidate === 'function'

export const isBag = (candidate: unknown) => typeof candidate === 'object' && candidate !== null

const anyOpt = Z.optional(Z.unknown())

/**
 * Every option Vault.make takes, each checked by a parse of its own: this check refuses any other.
 * An option quietly ignored could leave the vault less safe than the host asked -- a lease setting
 * under its retired name would leave the default seven days -- so a misspelt option, or one this
 * version no longer takes, is refused instead.
 */
const makeVaultOptsShape = Z.strictObject({
  applabel:               anyOpt,
  userId:                 anyOpt,
  vaultlabel:             anyOpt,
  vaultDB:                anyOpt,
  deviceDB:               anyOpt,
  keyDeriver:             anyOpt,
  leaseHours:             anyOpt,
  clock:                  anyOpt,
  maxWhisperBytes:        anyOpt,
  maxBoxes:           anyOpt,
  logger:                 anyOpt,
  validators:             anyOpt,
  passphraseStrengthTest: anyOpt,
} satisfies Record<keyof MakeVaultOpts, typeof anyOpt>)

/** Each option Vault.make once took under another name, and the name it takes now (notes/old_vocabulary.md). */
const RenamedMakeVaultOpts: ReadonlyMap<string, keyof MakeVaultOpts> = new Map([
  ['forcePassphraseReentryHours', 'leaseHours'],
])

/**
 * Refuse a bag of options holding one Vault.make does not take, with kind 'bad_option', naming
 * each such option, and the name a renamed one goes by now. It quotes the bag's field names, the
 * host's own code, and never a value.
 */
export const checkKnownOpts = (opts: object) => {
  const checked = makeVaultOptsShape.safeParse(opts)
  if (checked.success) { return }
  const unknownCkeys = checked.error.issues.flatMap((issue) => (issue.code === 'unrecognized_keys' ? issue.keys : []))
  const named = unknownCkeys.map((ckey) => {
    const renamed = RenamedMakeVaultOpts.get(ckey)
    return renamed === undefined ? ckey : `${ckey} (called ${renamed} now)`
  })
  const takes = Object.keys(makeVaultOptsShape.def.shape).join(', ')
  throw new VaultError('bad_option', `Vault.make does not take ${named.length === 1 ? 'the option' : 'the options'} ${named.join(', ')}: check the spelling. It takes ${takes}, and refuses any other rather than quietly ignore it.`)
}

/**
 * What a VaultDB must carry: its public verbs, on an instance of the `VaultDB` base class, whose
 * verbs check every record and expectation an adapter's own code sees. Checked only: Vault.make
 * keeps the adapter.
 */
const vaultDBShape = Z.object({
  getVaultProps:          Z.custom(isFunction),
  ensureVaultProps: Z.custom(isFunction),
  putVaultProps:        Z.custom(isFunction),
  getBox:                 Z.custom(isFunction),
  listBoxes:               Z.custom(isFunction),
  putBox:               Z.custom(isFunction),
  delBox:               Z.custom(isFunction),
  delVault:             Z.custom(isFunction),
  subscribe:               Z.custom(isFunction),
})

export const parseVaultDB = (candidate: VaultDB): VaultDB => {
  if (! (candidate instanceof VaultDB) || ! vaultDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "vaultDB is not a VaultDB: pass a storage adapter, such as localVaultDB({ store }), idbVaultDB() from 'safebyok-indexeddb', or your backend's own, which extends the VaultDB class.")
  }
  return candidate
}

/** What a DeviceDB must carry. Checked only: Vault.make keeps the device store it was handed. */
const deviceDBShape = Z.object({
  getLease:  Z.custom(isFunction),
  putLease: Z.custom(isFunction),
  delLease: Z.custom(isFunction),
  getMark:   Z.custom(isFunction),
  putMark:  Z.custom(isFunction),
  delMark:  Z.custom(isFunction),
  delAll:   Z.custom(isFunction),
})

export const parseDeviceDB = (candidate: DeviceDB): DeviceDB => {
  if (! deviceDBShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', "deviceDB is not a DeviceDB: in a browser, spread browserOpts() from 'safebyok/browser' into Vault.make's options; elsewhere, pass memoryDeviceDB().")
  }
  return candidate
}

/**
 * How many bytes of storage a vault reserves for each byte of whisper and sidecar: two.
 * Stored, a whisper's ciphertext is base64, a third larger than the whisper, and a sidecar's JSON,
 * written as text inside its record, at most twice its own (each quote and backslash escaped);
 * the rest is room for each backend's own way of counting bytes. So one whisper and its sidecar may
 * claim at most half of an adapter's `maxRecordBytes`.
 */
export const StoredBytesPerWhisperByte = 2

/**
 * The room Vault.make plans for a box's stored fields besides its whisper and sidecar, in
 * bytes of their JSON, when it checks that `maxBoxes` boxes fit the storage's
 * `maxVaultBytes`: its format, boxlabel, revision, codec, times, wrapped boxKey, the cipherIv
 * and tag of its whisperCiphered, and the scope a backend files it under. Under the default
 * validators, at their largest -- a forty-character boxlabel, applabel and vaultlabel and a
 * user_id of 100, each unit at three UTF-8 bytes -- they take under 1000. A host's validators may
 * admit longer names, so each store also weighs its box as it is ({@link BoxFixedBytes});
 * this is only the plan.
 */
export const BoxFieldsBytes = 1024

/**
 * Room for the stored fields every box has at the same size, in bytes of their JSON: its
 * format, revision, codec, times, wrapped boxKey, and the cipherIv and tag of its
 * whisperCiphered, with every field's name. A store weighs a box as this, its whisper and
 * sidecar's room, and its scope and boxlabel as measured.
 */
export const BoxFixedBytes = 512

const maxWhisperBytes = Z._default(Z.int().check(Z.positive()), MaxWhisperBytes)

const maxBoxes = Z.optional(Z.int().check(Z.positive()))

/**
 * The largest limit in bytes the vault keeps. An adapter's `Infinity`, its way of saying it sets
 * no limit, becomes this as Vault.make reads it: past that read, no limit is infinite.
 */
const UnlimitedBytes = Number.MAX_SAFE_INTEGER

/** A limit as an adapter declares one, some bytes or `Infinity` for none, to the finite form the vault keeps. */
const someBytes = Z.union([Z.number().check(Z.positive()), Z.literal(Infinity)])

const bytesKept = Z.transform((bytes: number) => Math.min(bytes, UnlimitedBytes))

const byteLimit = Z.number().check(Z.positive(), Z.lte(UnlimitedBytes))

const declaredBytes = Z.pipe(Z.pipe(someBytes, bytesKept), byteLimit)

/**
 * The most boxes the vault keeps as a limit. An adapter's `Infinity`, its way of saying it
 * counts none, becomes this as Vault.make reads it: past that read, no limit is infinite.
 */
const UnlimitedBoxes = Number.MAX_SAFE_INTEGER

/** A count of boxes as an adapter declares one, a whole number or `Infinity` for none, to the finite form the vault keeps. */
const someBoxes = Z.union([Z.int().check(Z.positive()), Z.literal(Infinity)])

const declaredBoxes = Z.pipe(someBoxes, Z.transform((count: number) => Math.min(count, UnlimitedBoxes)))

/** How Vault.make reads each limit an adapter declares. */
const DeclaredLimitFor = {
  maxRecordBytes: declaredBytes,
  maxVaultBytes:  declaredBytes,
  maxBoxes:   declaredBoxes,
} as const

const HourMillis = 60 * MinuteMillis

/**
 * Hours, as the host thinks of them, to whole milliseconds, as every time inside is kept: a lease
 * one timer can reach ({@link MaxLeaseHours} at most), or `Infinity`, which becomes
 * {@link ForeverMillis}.
 */
const someHours = Z.union([Z.number().check(Z.positive(), Z.lte(MaxLeaseHours)), Z.literal(Infinity)])

const leaseHoursOrDefault = Z._default(someHours, LeaseHours)

const hoursToMillis = Z.transform((hours: number) => (hours === Infinity ? ForeverMillis : Math.round(hours * HourMillis)))

const someMillis = Z.number().check(Z.gte(1))

const leaseHoursAsMillis = Z.pipe(Z.pipe(leaseHoursOrDefault, hoursToMillis), someMillis)

export const parseLeaseHours = (candidate: number | undefined): number => {
  const checked = leaseHoursAsMillis.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', `leaseHours is a number of hours greater than zero and at most ${String(MaxLeaseHours)} (24.5 days), fractions too (0.25 is fifteen minutes), or Infinity for never: until lock(). A longer finite lease is refused, as no timer reaches past it.`)
  }
  return checked.data
}

/** What a Clock must carry. Checked only: Vault.make keeps the clock it was handed, and checks each reading. */
const clockShape = Z.object({
  now: Z.custom<Clock['now']>((candidate) => typeof candidate === 'function'),
})

export const parseClock = (candidate: Clock | undefined): Clock => {
  if (candidate === undefined) { return wallClock }
  if (! clockShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'clock is not a Clock: it needs a now() function returning epoch milliseconds, as Date.now() does.')
  }
  return candidate
}

/**
 * A clock reading the package accepts: epoch milliseconds from {@link FarPast} to {@link FarFuture},
 * a fraction allowed, as a clock may return one. Floored as it is read, so every time kept is a
 * whole-millisecond {@link EpochMillis}.
 */
const clockReading = Z.number().check(Z.gte(FarPast), Z.lte(FarFuture))

/** A reading of the host's clock, checked and rounded down to whole milliseconds. */
export const readClock = (clock: Clock): number => {
  let reading: unknown
  try {
    reading = clock.now()
  } catch (err) {
    // The host's own error rides along as the cause, unquoted.
    throw new VaultError('bad_option', "The clock passed to Vault.make threw when read: its now() must return epoch milliseconds, as Date.now() does. The clock's own error is this error's cause.", { cause: err })
  }
  const checked = clockReading.safeParse(reading)
  if (! checked.success) {
    throw new VaultError('bad_option', "The clock passed to Vault.make read a time outside 1981 to 2255: its now() must return epoch milliseconds, as Date.now() does, not seconds or microseconds.")
  }
  return Math.floor(checked.data)
}

export const parseMaxWhisperBytes = (candidate: number | undefined): number => {
  const checked = maxWhisperBytes.safeParse(candidate)
  if (! checked.success) {
    throw new VaultError('bad_option', 'maxWhisperBytes is a whole number of bytes, greater than zero.')
  }
  return checked.data
}

/**
 * The vault's `maxBoxes`: as given, or by default the smaller of {@link MaxBoxes} and
 * `storeBoxes`, the most the vaultDB holds in one vault -- which a given one may not exceed.
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

/** What a KeyDeriver must carry. Checked only: Vault.make keeps the deriver it was handed, prototype and all. */
const keyDeriverShape = Z.object({
  algorithm:         Z.optional(Z.string()),
  key_deriver_label: Z.string().check(Z.minLength(1)),
  salt_bytes:        Z.int().check(Z.gte(1), Z.lte(MaxSaltBytes)),
  deriveKeyBytes:    Z.custom<KeyDeriver['deriveKeyBytes']>((candidate) => typeof candidate === 'function'),
})

/**
 * `candidate` as the KeyDeriver a vault keeps, once it passes: the shape of a deriver, a label
 * that is not safebyok's to reserve, and -- for one declaring `algorithm: 'argon2id'` -- a whole
 * spec Argon2id can run. Warns through `logger`, and goes on, for the label of a test deriver.
 */
export const parseKeyDeriver = (candidate: KeyDeriver | undefined, logger: VaultLogger): KeyDeriver => {
  if (candidate === undefined) {
    throw new VaultError('bad_option', "Vault.make needs a keyDeriver: in a browser, spread browserOpts() from 'safebyok/browser' into its options.")
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

/**
 * One of the adapter's declared limits, in the finite form the vault keeps: `Infinity` becomes
 * {@link UnlimitedBytes} or {@link UnlimitedBoxes}.
 */
export const parseDeclared = (vaultDB: VaultDB, limitname: keyof typeof DeclaredLimitFor): number => {
  const checked = DeclaredLimitFor[limitname].safeParse(vaultDB[limitname])
  // An adapter that declares no limit, or one written before a limit existed, is refused: never guessed.
  if (! checked.success) {
    throw new VaultError('bad_option', `This storage adapter does not declare ${limitname}, a limit every adapter states: update the adapter, or ask its author to.`)
  }
  return checked.data
}

/**
 * Refuse limits the storage adapter might not honour: a whisper too large for one of its records,
 * or a vault too large for it to hold, list and retire whole.
 *
 * @returns The most the adapter holds of one vault, in the finite form the vault keeps.
 */
export const checkLimitsFit = (vaultDB: VaultDB, whisperByteLimit: number, boxLimit: number): number => {
  const recordBytes = parseDeclared(vaultDB, 'maxRecordBytes')
  if (whisperByteLimit * StoredBytesPerWhisperByte > recordBytes) {
    throw new VaultError('bad_option', `maxWhisperBytes is over half of the ${String(recordBytes)} bytes this storage adapter holds in one record, so a whisper that large might not store: pass a smaller maxWhisperBytes.`)
  }
  const vaultBytes = parseDeclared(vaultDB, 'maxVaultBytes')
  const boxBytes = (whisperByteLimit * StoredBytesPerWhisperByte) + BoxFieldsBytes
  if (boxLimit * boxBytes <= vaultBytes) { return vaultBytes }
  const fitting = Math.floor(vaultBytes / boxBytes)
  const outcome = fitting === 0
    ? 'At that maxWhisperBytes, not even one box fits: pass a smaller maxWhisperBytes.'
    : `At that maxWhisperBytes, at most ${String(fitting)} boxes fit: pass a smaller maxBoxes or maxWhisperBytes.`
  throw new VaultError('bad_option', `${String(boxLimit)} boxes (maxBoxes) of up to ${String(whisperByteLimit)} bytes of whisper each (maxWhisperBytes) might not fit in the ${String(vaultBytes)} bytes this storage adapter holds of one vault (its maxVaultBytes), with room for each box's other fields. ${outcome}`)
}

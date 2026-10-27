import { type BadNewsHandler, type BankVaultOpts, type Clock, type MakeBankOpts, MaxBoxes, MaxLeaseHours, bankVaultOpts, clockReading, clockShape, declaredBoxes, declaredBytes, deviceDBShape, keyDeriverShape, leaseHoursAsMillis, makeBankOpts, maxBoxes, maxWhisperBytes, renewMinutesAsMillis, staleMinutesAsMillis, vaultDBShape, wallClock } from './shapes/bank-opts'
import type { VaultScope } from './shapes/scopes'
import { VaultError, isVaultError, listedKindOf } from './errors'
import type { KeyDeriver } from './key-deriver'
import { parseKeyDeriverSpec, type KeyDeriverSpec, checkSuppliedSpecKept, TestLabelPrefix, TestDeriverNotice } from './key-deriver-spec'
import type { DeviceDB } from './device-db'
import { VaultDB } from './vault-db'
import { type VaultLogger, parseLogger } from './logger'
import { type GuardedStrengthChecker, type StrengthChecker, guardStrengthChecker } from './passphrase-strength'
import * as CX from './shapes/scopes'
import type { Gating, RequestCleartext } from './gating'

/** True for any object but null, an array included. */
export const isBag = (candidate: unknown) => typeof candidate === 'object' && candidate !== null

/** Bank.make's options with `strengthChecker` checked, or the default in its place; every other option as handed in, for its own parse.
 * Refuses 'bad_option' for an option Bank.make does not take, counting them and naming the options
 * it takes, and for a `strengthChecker` that is not one.
 */
export const checkMakeBankOpts = (opts: object) => {
  try {
    return makeBankOpts.parse(opts)
  } catch (err) {
    if (! isVaultError(err, 'bad_option')) { throw err }
    throw new VaultError('bad_option', `In Bank.make's options: ${err.message}.`, err.meta === undefined ? {} : { meta: err.meta })
  }
}

/** `opts` as handed to `bank.ensureVault` and its siblings, once a bag of no field it does not take, or left out: 'bad_option' otherwise. Its stores are checked by {@link vaultPartsOf}. */
const checkBankVaultOpts = (opts: unknown): BankVaultOpts => {
  if (opts === undefined) { return {} }
  if (! isBag(opts)) { throw new VaultError('bad_option', "bank.ensureVault takes a vault's own options as a second bag, { vaultDB, deviceDB }, where they are not the bank's: leave it out for the bank's own.") }
  try {
    bankVaultOpts.parse(opts)
    return opts
  } catch (err) {
    if (! isVaultError(err, 'bad_option')) { throw err }
    throw new VaultError('bad_option', `In bank.ensureVault's options: ${err.message}.`, err.meta === undefined ? {} : { meta: err.meta })
  }
}

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
    throw new VaultError('bad_option', 'keyDeriver is not a KeyDeriver: it needs a key_deriver_label, a salt_bytes from 1 to 65536 and a deriveKeyBytes function, and its load, if it carries one, is a function too.')
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
  user_id:          string
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

/** Bank.make's options, checked and read, before storage is touched.
 * Refuses 'insecure_context' first, in a page the browser says is not a secure context. Then
 * 'bad_option' for anything but a bag, or for an option it does not take or out of range, and
 * 'bad_scope' for an `applabel` that is not a label or a `user_id` that fails its check. The
 * limits are held to the default `vaultDB`'s here, and to a vault's own at its birth.
 *
 * @example const { applabel, user_id, leaseMillis } = parseMakeBankOpts(opts)
 */
export const parseMakeBankOpts = (opts: MakeBankOpts): ParsedBankOpts => {
  checkSecureContext()
  if (! isBag(opts)) { throw new VaultError('bad_option', "Bank.make takes one bag of options: applabel, user_id, vaultDB, deviceDB and keyDeriver at least.") }
  const shaped = checkMakeBankOpts(opts)
  const { applabel, user_id } = CX.bankScope.parse(opts)
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
  return { applabel, user_id, vaultDB, deviceDB, leaseMillis, staleMillis, onBadNews, requestCleartext, logger, clock, keyDeriver, strengthChecker: shaped.strengthChecker, maxWhisperBytes: limits.maxWhisperBytes, maxBoxes: limits.maxBoxes }
}

/** What each vault is made of, frozen: the bank's parts, its own scope's names as fields of its own, its own stores, and its limits as held to its own vaultDB.
 * It carries the scope flat, so it duck-types as one; a store is handed the scope picked out of it,
 * never the parts.
 */
export type VaultParts = Readonly<Omit<ParsedBankOpts, 'strengthChecker' | 'maxBoxes'> & VaultScope & {
  strengthChecker:  GuardedStrengthChecker
  /** The most boxes the vault holds: `maxBoxes` as given, or its default, held to the vaultDB's own. */
  maxBoxes:         number
  /** The most bytes the vaultDB holds of the vault, in the finite form the vault keeps. */
  maxVaultBytes:    number
}>

/** The parts of the vault in `scope`, a scope of `bank`'s checked by the bank, under `bank`, frozen, with its own options `opts` checked before storage is touched: 'bad_option' for anything amiss in them.
 *
 * @example const { vaultDB } = vaultPartsOf(bank, scope, { vaultDB: workVaultDB })   // the work vault's own store, its limits held to it
 */
export const vaultPartsOf = (bank: ParsedBankOpts, scope: VaultScope, opts: BankVaultOpts | undefined): VaultParts => {
  const checked = checkBankVaultOpts(opts)
  const vaultDB = checked.vaultDB === undefined ? bank.vaultDB : parseVaultDB(checked.vaultDB)
  const deviceDB = checked.deviceDB === undefined ? bank.deviceDB : parseDeviceDB(checked.deviceDB)
  const limits = limitsOf(vaultDB, bank)
  const { applabel, user_id, vaultlabel } = scope
  return Object.freeze({ ...bank, applabel, user_id, vaultlabel, vaultDB, deviceDB, strengthChecker: guardStrengthChecker(bank.strengthChecker, scope), maxBoxes: limits.maxBoxes, maxVaultBytes: limits.maxVaultBytes })
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

import { type BadNewsHandler, type BankVaultOpts, type Clock, type MakeBankOpts, MaxBoxes, bankVaultOpts, clockReading, clockShape, declaredBoxes, declaredBytes, deviceDBShape, keyDeriverShape, leaseHoursAsMillis, makeBankOpts, maxBoxes, maxWhisperBytes, renewMinutesAsMillis, staleMinutesAsMillis, vaultDBShape, wallClock } from './shapes/bank-opts'
import type { VaultScope } from './shapes/scopes'
import { VaultError, listedKindOf } from './errors'
import type { KeyDeriver } from './key-deriver'
import { parseKeyDeriverSpec, type KeyDeriverSpec, checkSuppliedSpecKept, TestLabelPrefix, TestDeriverNotice } from './key-deriver-spec'
import { DeviceDB } from './device-db'
import { VaultDB } from './vault-db'
import { type VaultLogger, loggerShape, parseLogger } from './logger'
import * as Sanitizer from './sanitizer'
import { type GuardedStrengthChecker, type StrengthChecker, guardStrengthChecker } from './passphrase-strength'
import * as CX from './shapes/scopes'
import type { Gating, RequestCleartext } from './gating'
import * as Phrases from './phrases'
import { Validator } from './checks/validator'

/** True for any object but null, an array included. */
export const isBag = (candidate: unknown) => typeof candidate === 'object' && candidate !== null

/** A store as Bank.make and `bank.ensureVault` take one, and Bank.make's options as the bank reads them: each refusing 'bad_option'.
 * A store is judged whole, as an instance of its class carrying its verbs, and comes
 * back as handed in, prototype and all. `bankOptsRead` is {@link makeBankOpts} with each option
 * checked, and each number read into the form the vault keeps; an object it checks only, as the
 * bank keeps what it was handed: the clock, the key deriver and the logger are read from the bag
 * itself.
 */
const { vaultDBGiven, deviceDBGiven, bankOptsRead } = Validator('bad_option', ({ custom, fn }) => {
  const vaultDBGiven = custom<VaultDB>((candidate) => candidate instanceof VaultDB && vaultDBShape.safeParse(candidate).success, Phrases.VaultDBShape)
  const deviceDBGiven = custom<DeviceDB>((candidate) => candidate instanceof DeviceDB && deviceDBShape.safeParse(candidate).success, Phrases.DeviceDBShape)
  return {
    vaultDBGiven,
    deviceDBGiven,
    bankOptsRead: makeBankOpts.extend({
      vaultDB:          vaultDBGiven,
      deviceDB:         deviceDBGiven,
      keyDeriver:       keyDeriverShape,
      leaseHours:       leaseHoursAsMillis,
      staleMinutes:     staleMinutesAsMillis,
      onBadNews:        fn<BadNewsHandler>().nullable().default(null),
      requestCleartext: fn<RequestCleartext>().nullable().default(null),
      clock:            clockShape.optional(),
      maxWhisperBytes,
      maxBoxes,
      logger:           loggerShape.nullish(),
    }),
  }
})

/** `candidate`, once it is a {@link VaultDB} carrying its verbs: 'bad_option' otherwise. */
export const parseVaultDB = (candidate: VaultDB): VaultDB => vaultDBGiven.parse(candidate)

/** `candidate`, once it is a {@link DeviceDB} carrying its verbs: 'bad_option' otherwise. */
export const parseDeviceDB = (candidate: DeviceDB): DeviceDB => deviceDBGiven.parse(candidate)

/** `opts` as handed to `bank.ensureVault` and its siblings, once a bag of no field it does not take, or left out: 'bad_option' otherwise, naming the call. Its stores are checked by {@link vaultPartsOf}. */
const checkBankVaultOpts = (opts: BankVaultOpts | undefined): BankVaultOpts => {
  if (opts === undefined) { return {} }
  bankVaultOpts.parse(opts, { where: "In bank.ensureVault's options" })
  return opts
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

/** `staleMinutes`, as `hello()` is handed it, in the milliseconds the vault keeps: 'bad_option', naming `where`, out of range.
 *
 * @example parseStaleMinutes(0.5, 'hello')   // 30000
 */
export const parseStaleMinutes = (candidate: unknown, where: string): number => staleMinutesAsMillis.parse(candidate, { where: `In ${where}'s options: staleMinutes` })

/** `ensureUnlocked()`'s `renewMinutes`, in the milliseconds the vault keeps, 0 when left out: 'bad_option' out of range. */
export const parseRenewMinutes = (candidate: unknown): number => renewMinutesAsMillis.parse(candidate, { where: "In ensureUnlocked's options: renewMinutes" })

/** The host's {@link RequestCleartext}, guarded: it resolves once the host's resolves, and refuses 'unexpected_error' for whatever the host's throws, carrying none of it, so no refusal of the host's is mistaken for the vault's. */
export type GuardedRequestCleartext = (gating: Gating) => Promise<void>

/** The host's `requestCleartext` guarded, or null for none.
 * What the host's throws is never kept: its dialog hears the passphrase, so a throw may quote it.
 * `logger` hears only that it threw, and the refusalkind of a VaultError it threw, as
 * {@link listedKindOf} tells it.
 */
const guardRequestCleartext = (host: RequestCleartext | null, logger: VaultLogger): GuardedRequestCleartext | null => {
  if (host === null) { return null }
  return async (gating) => {
    try {
      await host(gating)
    } catch (err) {
      // A bug in the host's dialog, a VaultError it let escape too: never a refusal of the call
      // that asked, and never its cause, which may quote what the user typed.
      logger.error("The requestCleartext handed to Bank.make threw: the call that asked refuses 'unexpected_error'. What it threw is left out, as the dialog hears the passphrase.", { call: 'requestCleartext', refusalkind: listedKindOf(err) })
      throw requestThrewRefusal(err)
    }
  }
}

/** The refusal in place of what `requestCleartext` threw, carrying nothing of it, as its dialog hears the passphrase. */
const requestThrewRefusal = (thrown: unknown): VaultError => Sanitizer.refusalFor(thrown, 'unexpected_error', "The requestCleartext handed to Bank.make threw rather than resolving once its dialog closed, so this call was not answered. What it threw is left out of this report, as its dialog hears the passphrase: have it catch its own failures, and resolve.")

/** Refuse 'bad_option' for a clock, its shape checked, that throws when read once, or reads outside 1981 to 2255. */
const checkClockReads = (clock: Clock): void => {
  let reading: unknown
  try {
    reading = clock.now()
  } catch (err) {
    // The host's own error rides along as the cause, unquoted.
    throw new VaultError('bad_option', "The clock passed to Bank.make threw when read: its now() must return epoch milliseconds, as Date.now() does. The clock's own error is this error's cause.", { cause: err })
  }
  if (! clockReading.safeParse(reading).success) {
    throw new VaultError('bad_option', "The clock passed to Bank.make read a time outside 1981 to 2255: its now() must return epoch milliseconds, as Date.now() does, not seconds or microseconds.")
  }
}

/** The vault's `maxBoxes`, as Bank.make read it, or by default the smaller of {@link MaxBoxes} and `storeBoxes`: 'bad_option' past `storeBoxes`.
 *
 * @param storeBoxes - The most the vaultDB holds in one vault.
 */
const checkedMaxBoxes = (given: number | undefined, storeBoxes: number): number => {
  if (given === undefined) { return Math.min(MaxBoxes, storeBoxes) }
  if (given > storeBoxes) {
    throw new VaultError('bad_option', `maxBoxes is over the ${String(storeBoxes)} boxes this storage adapter holds in one vault (its own maxBoxes): pass ${String(storeBoxes)} or fewer.`)
  }
  return given
}

/** Refuse 'bad_option' for a key deriver, its shape checked, that is not one a vault keeps: one declaring `algorithm: 'argon2id'` that Argon2id cannot run, or one wearing a label safebyok reserves. A test deriver's label warns through `logger`, and goes on. */
const checkKeyDeriver = (keyDeriver: KeyDeriver, logger: VaultLogger): void => {
  // A deriver declaring Argon2id must be one Argon2id can run: its refusal here, with a kind, is
  // the one it would otherwise make at the first unlock, as a plain Error from the library.
  if (keyDeriver.algorithm === 'argon2id') { parseKeyDeriverSpec(keyDeriver as KeyDeriverSpec) }
  checkSuppliedSpecKept(keyDeriver)
  if (keyDeriver.key_deriver_label.startsWith(TestLabelPrefix)) {
    logger.warn(TestDeriverNotice, { call: 'make' })
  }
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
 * 'bad_option' for anything but a bag, or for an option it does not take, of the wrong type or out
 * of range, every one it finds named in one refusal led by "In Bank.make's options"; then
 * 'bad_scope' for an `applabel` that is not a label or a `user_id` that fails its check; then
 * 'bad_option' for a key deriver a vault does not keep, or a clock that throws or reads out of
 * bounds. The limits are held to the default `vaultDB`'s here, and to a vault's own at its birth.
 *
 * @example const { applabel, user_id, leaseMillis } = parseMakeBankOpts(opts)
 */
export const parseMakeBankOpts = (opts: MakeBankOpts): ParsedBankOpts => {
  checkSecureContext()
  const { leaseHours: leaseMillis, staleMinutes: staleMillis, vaultDB, deviceDB, onBadNews, requestCleartext: hostRequest, maxWhisperBytes: whisperBytes, maxBoxes: boxes, strengthChecker } = readBankOpts(opts)
  const { applabel, user_id } = CX.bankScope.parse(opts)
  // An object option is checked above, and kept as handed in, prototype and all.
  const { keyDeriver, clock = wallClock } = opts
  // The host's logger for the vaults, else the one its storage was made with; guarded either way.
  const logger = parseLogger(opts.logger ?? vaultDB.logger)
  checkKeyDeriver(keyDeriver, logger)
  checkClockReads(clock)
  // Held to the default vaultDB now, so misuse is refused at Bank.make, not at the first birth.
  limitsOf(vaultDB, { maxWhisperBytes: whisperBytes, maxBoxes: boxes })
  return { applabel, user_id, vaultDB, deviceDB, leaseMillis, staleMillis, onBadNews, requestCleartext: guardRequestCleartext(hostRequest, logger), logger, clock, keyDeriver, strengthChecker, maxWhisperBytes: whisperBytes, maxBoxes: boxes }
}

/** `opts` read by {@link bankOptsRead}, its refusal led by the call the host made. */
const readBankOpts = (opts: MakeBankOpts) => bankOptsRead.parse(opts, { where: "In Bank.make's options" })

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

/** The parts of the vault in `scope`, frozen: `bank`'s, with the vault's own `opts` checked before storage is touched ('bad_option').
 * `scope` is one the bank has checked as its own.
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
  const boxes = checkedMaxBoxes(given.maxBoxes, parseDeclared(vaultDB, 'maxBoxes'))
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

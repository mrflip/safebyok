import * as Phrases from './phrases'
import { Validator } from './checks/validator'
import { consoleLogger } from './console-logger'

/** Where a vault says what it has nobody to throw to, such as a background refresh that failed.
 * Pass one to the storage adapter's factory as `logger`, and the vault opened over it uses it too.
 * Pass Bank.make one of its own to keep them apart. With none anywhere, it is the {@link
 * DefaultLogger}.
 *
 * Each call has a plain-language `message`, a `story` of facts to filter on (`call` names the
 * vault call), and the error behind it, if any. The vault puts no whisper, passphrase, key,
 * ciphertext or option's value in any of the three. An error from the host's own code (its clock,
 * its storage adapter) goes as that code made it, so what it quotes is the host's to keep clean.
 *
 * What a logger throws or rejects with is ignored. A logger typed `story?: Record<string, any>`
 * fits, and so does the console.
 *
 * @example
 *   const logger: VaultLogger = {
 *     log:   (message, story) => { telemetry.info(message, story) },
 *     warn:  (message, story, err) => { telemetry.warn(message, story, err) },
 *     error: (message, story, err) => { telemetry.error(message, story, err) },
 *   }
 *   const bank = Bank.make({ ...opts, logger })
 * @example Bank.make({ ...opts, logger: { log: () => {}, warn: () => {}, error: () => {} } })  // silent
 * @example Bank.make({ ...opts, logger: console })  // untagged, a missing story or error printed as undefined or null
 */
export type VaultLogger = {
  /** Something worth knowing, with nothing to act on. */
  log:   (message?: string, story?: Record<string, unknown>, err?: Error | null) => void
  /** Something went wrong, and the vault carried on safely: worth a look. */
  warn:  (message?: string, story?: Record<string, unknown>, err?: Error | null) => void
  /** Something went wrong that the host's code or its storage should mend. */
  error: (message?: string, story?: Record<string, unknown>, err?: Error | null) => void
}

/** The three calls a {@link VaultLogger} answers. */
export const VaultLoggerLevelVals = ['log', 'warn', 'error'] as const
export type VaultLoggerLevel = typeof VaultLoggerLevelVals[number]

/** What a VaultLogger must carry, refusing 'bad_option'. Checked only: what Bank.make keeps calls the host's own, `this` and all. */
export const { loggerShape } = Validator('bad_option', ({ obj, fn }) => {
  const loggerCall = fn<VaultLogger['log']>()
  return { loggerShape: obj({ log: loggerCall, warn: loggerCall, error: loggerCall }, Phrases.LoggerShape) }
})

// Every logger safebyok has guarded, so that one handed back comes back as itself: kept here, out
// of reach, so that no logger can claim to be guarded, by a property it carries or inherits.
const guardedOnes = new WeakSet<object>()
// Each host logger's guarded form, made once, so that the same logger handed to the storage and to
// the vault is guarded as one object.
const guardedFor = new WeakMap<object, VaultLogger>()

/** The host's logger made safe to call, dropping whatever it throws or rejects with; {@link DefaultLogger} for null or undefined.
 * A binding with something of its own to say, beside the vault it opens, says it through this.
 * Refuses 'bad_option' for anything without `log`, `warn` and `error` functions.
 *
 * It keeps identity. A logger it made safe comes back as itself, and the same host logger always
 * comes back as the same safe one.
 *
 * @example parseLogger(props.logger).warn('BankProvider made its bank anew for a logger rebuilt in render', { call: 'BankProvider' })
 * @example parseLogger(undefined).log('opened')  // to the default: the console says 'safebyok: opened'
 * @example parseLogger(undefined) === DefaultLogger  // true: the one default logger
 * @example parseLogger(telemetry) === parseLogger(parseLogger(telemetry))  // true: guarded once
 */
export const parseLogger = (candidate: VaultLogger | null | undefined): VaultLogger => {
  if (candidate === undefined || candidate === null) { return DefaultLogger }
  if (guardedOnes.has(candidate)) { return candidate }
  loggerShape.parse(candidate)
  const known = guardedFor.get(candidate)
  if (known !== undefined) { return known }
  const made = guarded(candidate)
  guardedFor.set(candidate, made)
  return made
}

/** A host's logger as the guard sees it: whatever its calls return, such as an async logger's promise, is the guard's to settle. */
type AnyReturningLogger = Record<VaultLoggerLevel, (message?: string, story?: Record<string, unknown>, err?: Error | null) => unknown>

/** `hostLogger`, each call made so that nothing it throws or rejects with reaches the vault; kept as guarded. */
const guarded = (hostLogger: AnyReturningLogger): VaultLogger => {
  const safe: VaultLogger = {
    log:   (message, story, err) => { tell(hostLogger, 'log', message, story, err) },
    warn:  (message, story, err) => { tell(hostLogger, 'warn', message, story, err) },
    error: (message, story, err) => { tell(hostLogger, 'error', message, story, err) },
  }
  guardedOnes.add(safe)
  return safe
}

/** The console, each line tagged 'safebyok:', guarded: where the default logger says things until a host sets its own. */
const GuardedConsole = guarded(consoleLogger)

/** Where the default logger says things now: the console, or what the host last handed setDefaultLogger. */
const defaults: { target: VaultLogger } = { target: GuardedConsole }

/** A logger that hands each call on to `defaults.target` as it stands when called; kept as guarded, its target being so. */
const forwarding = (): VaultLogger => {
  const forwarder: VaultLogger = {
    log:   (message, story, err) => { defaults.target.log(message, story, err) },
    warn:  (message, story, err) => { defaults.target.warn(message, story, err) },
    error: (message, story, err) => { defaults.target.error(message, story, err) },
  }
  guardedOnes.add(forwarder)
  return forwarder
}

/** The logger every storage adapter, vault, provider and store uses when it was given none of its own.
 * It hands each call on, as it is made, to the logger last handed {@link setDefaultLogger}, or
 * else to the console, each line tagged 'safebyok:'. Pass it to Bank.make or BankProvider to
 * have the vault use the default whatever its storage adapter was given.
 *
 * @example Bank.make({ ...opts, vaultDB: idbVaultDB({ logger: storageLogger }), logger: DefaultLogger })  // the storage to its own, the vault to the default
 */
export const DefaultLogger: VaultLogger = forwarding()

/** Send what safebyok would say to the console to `logger` instead, from everything made before this call or after.
 * Call it once, as the app starts. A logger handed to an adapter's factory, to Bank.make or to
 * BankProvider still wins there. It is guarded as {@link parseLogger} guards one, and refused
 * alike.
 *
 * @param logger - The app's own logger. Null or undefined puts the console back.
 *
 * @example setDefaultLogger(telemetry)  // every line safebyok says, to telemetry
 * @example setDefaultLogger(undefined)  // back to the console
 */
export const setDefaultLogger = (logger: VaultLogger | null | undefined): void => {
  const parsed = parseLogger(logger)
  // The default handed back as its own target would hand each call to itself, forever.
  defaults.target = parsed === DefaultLogger ? GuardedConsole : parsed
}

const tell = (hostLogger: AnyReturningLogger, level: VaultLoggerLevel, message?: string, story?: Record<string, unknown>, err?: Error | null) => {
  try {
    // Called as a method, so a logger built as a class keeps its `this`.
    void dropRejection(hostLogger[level](message, story, err))
  } catch {
    // A logger that throws must not break the lock, open or store that called it.
  }
}

/** Settle what a logger returned, dropping a rejection rather than leaving it unhandled, whatever kind of thenable it is. */
const dropRejection = async (pending: unknown) => {
  try {
    await pending
  } catch {
    // see tell()
  }
}

/** A thrown value, for a logger's `err`: an Error as it is, anything else as null. */
export const asError = (thrown: unknown): Error | null => (thrown instanceof Error ? thrown : null)

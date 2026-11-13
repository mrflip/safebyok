import * as CX from '../shapes/shapes-core'
import { consoleLogger } from './console-logger'

/** Where safebyok reports what it has nobody to throw to, such as a background refresh that failed.
 * Pass one to `Device.make` as `logger`. With none, a device uses the {@link DefaultLogger}.
 *
 * Each call has a plain-language `message`, a `story` of facts to filter on (`oplabel` names the
 * operation), and the error behind it, if any. None of the three holds a whisper, passphrase, key,
 * ciphertext or option value. An error the host's own bankDB threw is passed on as it was made, so
 * what it quotes is the host's to keep clean.
 *
 * Anything a logger throws or rejects with is ignored. The console fits, and so does a logger typed
 * `story?: Record<string, any>`.
 *
 * @example Device.make({ ...opts, logger: { log: () => {}, warn: () => {}, error: () => {} } })  // silent
 * @example Device.make({ ...opts, logger: console })  // untagged, a missing story or error printed as undefined or null
 */
export interface VaultLogger {
  /** Something worth knowing, with nothing to act on. */
  log:   (message?: string, story?: Record<string, unknown>, err?: Error | null) => void
  /** Something went wrong, and safebyok carried on safely: worth a look. */
  warn:  (message?: string, story?: Record<string, unknown>, err?: Error | null) => void
  /** Something went wrong that the host's code or its storage should mend. */
  error: (message?: string, story?: Record<string, unknown>, err?: Error | null) => void
}

/** The three levels of a {@link VaultLogger}, a call each. */
export const vaultLoggerLevelVals = ['log', 'warn', 'error'] as const
/** A logger level: `log`, `warn` or `error`. */
export type VaultLoggerLevel = typeof vaultLoggerLevelVals[number]

// Every logger safebyok has guarded, so that one handed back comes back as itself: kept here, out
// of reach, so that no logger can claim to be guarded, by a property it carries or inherits.
const guardedOnes = new WeakSet<object>()
// Each host logger's guarded form, made once, so that the same logger handed to the storage and to
// the vault is guarded as one object.
const guardedFor = new WeakMap<object, VaultLogger>()

/** The host's logger, checked and wrapped so that nothing it throws or rejects with reaches safebyok.
 * Null or undefined gives the {@link DefaultLogger}. It refuses anything without `log`, `warn` and `error` functions.
 * A logger this returned comes back as itself, and the same host logger always gets the same wrapper.
 *
 * @example parseLogger(undefined).log('opened')  // to the default: the console says 'safebyok: opened'
 */
export function parseLogger(candidate: VaultLogger | null | undefined): VaultLogger {
  if (candidate === undefined || candidate === null) { return DefaultLogger }
  if (guardedOnes.has(candidate)) { return candidate }
  CX.loggerShape.parse(candidate, { where: 'logger' })
  const known = guardedFor.get(candidate)
  if (known !== undefined) { return known }
  const made = guarded(candidate)
  guardedFor.set(candidate, made)
  return made
}

/** True for a logger {@link parseLogger} returned, the {@link DefaultLogger} included. */
export const isGuardedLogger = (val: unknown): val is VaultLogger => (typeof val === 'object') && (val !== null) && guardedOnes.has(val)

/** A host's logger, whose calls may return anything, such as an async logger's promise. */
type AnyReturningLogger = Record<VaultLoggerLevel, (message?: string, story?: Record<string, unknown>, err?: Error | null) => unknown>

/** `hostLogger`, wrapped to drop whatever it throws or rejects with. */
function guarded(hostLogger: AnyReturningLogger): VaultLogger {
  const safe: VaultLogger = {
    log:   (message, story, err) => { tell(hostLogger, 'log', message, story, err) },
    warn:  (message, story, err) => { tell(hostLogger, 'warn', message, story, err) },
    error: (message, story, err) => { tell(hostLogger, 'error', message, story, err) },
  }
  guardedOnes.add(safe)
  return safe
}

/** The console, wrapped, each line tagged 'safebyok:'. */
const GuardedConsole = guarded(consoleLogger)

/** The logger {@link DefaultLogger} hands each call to: the console, or the one last passed to `setDefaultLogger`. */
const defaults: { target: VaultLogger } = { target: GuardedConsole }

/** A logger that hands each call to `defaults.target`, read at the time of the call. */
function forwarding(): VaultLogger {
  const forwarder: VaultLogger = {
    log:   (message, story, err) => { defaults.target.log(message, story, err) },
    warn:  (message, story, err) => { defaults.target.warn(message, story, err) },
    error: (message, story, err) => { defaults.target.error(message, story, err) },
  }
  guardedOnes.add(forwarder)
  return forwarder
}

/** The logger a device uses when given none of its own.
 * It hands each call, as it is made, to the logger last passed to {@link setDefaultLogger}, or else to
 * the console, each line tagged 'safebyok:'. Passing it to `Device.make` is the same as passing no logger.
 *
 * @example Device.make({ ...opts, bankDB: idbBankDB({ logger: storageLogger }), logger: DefaultLogger })  // the storage to its own, the vault to the default
 */
export const DefaultLogger: VaultLogger = forwarding()

/** Send what safebyok would log to the console to `logger` instead, devices already made included.
 * Call it once, as the app starts. A logger passed to `Device.make` still wins for that device.
 * `logger` is checked and wrapped as {@link parseLogger} does it.
 *
 * @param logger - The app's own logger. Null or undefined puts the console back.
 */
export function setDefaultLogger(logger: VaultLogger | null | undefined): void {
  const parsed = parseLogger(logger)
  // The default handed back as its own target would hand each call to itself, forever.
  defaults.target = parsed === DefaultLogger ? GuardedConsole : parsed
}

/** Call `hostLogger` at `level`, dropping whatever it throws or rejects with. */
function tell(hostLogger: AnyReturningLogger, level: VaultLoggerLevel, message?: string, story?: Record<string, unknown>, err?: Error | null) {
  try {
    // Called as a method, so a logger built as a class keeps its `this`.
    void dropRejection(hostLogger[level](message, story, err))
  } catch {
    // A logger that throws must not break the lock, open or put that called it.
  }
}

/** Await what a logger returned, dropping any rejection. */
async function dropRejection(pending: unknown) {
  try {
    await pending
  } catch {
    // see tell()
  }
}

/** `thrown` as a logger's `err`: an Error as it is, anything else null. */
export function asError(thrown: unknown): Error | null { return (thrown instanceof Error ? thrown : null) }

import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { consoleLogger } from './console-logger'

/**
 * Where a vault says what it has nobody to throw to: a lock that had to skip its grace, a
 * background refresh that failed, a remembered unlock it could not read. Pass one to the storage
 * adapter's factory as `logger`, and the vault opened over it hears it too; pass openVault one of
 * its own to keep them apart. With none anywhere, the {@link DefaultLogger}: the console, unless the
 * app handed {@link setDefaultLogger} its own. Each call has a plain-language
 * `message`, a `story` of a few facts to filter on (`call`, the vault call it happened in), and
 * the error behind it, when there is one: a VaultError, or the host's own (its clock's, its
 * storage adapter's). The vault puts no whisper, passphrase, key, ciphertext or option's value in
 * any of the three; an error of the host's own goes as the host's code made it, as itself or as a
 * VaultError's `cause`, so what it quotes is the host's to keep clean.
 *
 * A logger that throws, or returns a promise that rejects, is ignored: logging never breaks a
 * lock, an open or a store. A host's logger typed `story?: Record<string, any>` fits, and so does
 * the console itself. To log nowhere, pass functions that do nothing.
 *
 * @example
 *   const logger: VaultLogger = {
 *     log:   (message, story) => { telemetry.info(message, story) },
 *     warn:  (message, story, err) => { telemetry.warn(message, story, err) },
 *     error: (message, story, err) => { telemetry.error(message, story, err) },
 *   }
 *   const vault = await openVault({ ...opts, logger })
 * @example openVault({ ...opts, logger: { log: () => {}, warn: () => {}, error: () => {} } })  // silent
 * @example openVault({ ...opts, logger: console })  // untagged, a missing story or error printed as undefined or null
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

const loggerCall = Z.custom<VaultLogger['log']>((candidate) => typeof candidate === 'function')
/** What a VaultLogger must carry. Checked only: what openVault keeps calls the host's own, `this` and all. */
const loggerShape = Z.object({ log: loggerCall, warn: loggerCall, error: loggerCall })

// Every logger safebyok has guarded, so that one handed back comes back as itself: kept here, out
// of reach, so that no logger can claim to be guarded, by a property it carries or inherits.
const guardedOnes = new WeakSet<object>()
// Each host logger's guarded form, made once, so that the same logger handed to the storage and to
// the vault is guarded as one object.
const guardedFor = new WeakMap<object, VaultLogger>()

/**
 * The logger a vault keeps: the host's, made safe to call -- whatever it throws or rejects with is
 * dropped -- or {@link DefaultLogger} when there is none (null, like undefined, is none). Kind
 * 'bad_option' for anything that is not an object carrying `log`, `warn` and `error` functions.
 * A binding that has something of its own to say, beside the vault it opens, says it here,
 * through the same logger.
 *
 * It is idempotent, and keeps identity: a logger it has made safe comes back as itself, and the
 * same host logger, however often it is handed in, comes back as the same safe one.
 *
 * @param candidate - The host's logger, as handed to openVault.
 *
 * @example parseLogger(props.logger).warn('VaultProvider reopened the vault for a logger rebuilt in render', { call: 'VaultProvider' })
 * @example parseLogger(undefined).log('opened')  // to the default: the console says 'safebyok: opened'
 * @example parseLogger(undefined) === DefaultLogger  // true: the one default logger
 * @example parseLogger(telemetry) === parseLogger(parseLogger(telemetry))  // true: guarded once
 */
export const parseLogger = (candidate: VaultLogger | null | undefined): VaultLogger => {
  if (candidate === undefined || candidate === null) { return DefaultLogger }
  if (guardedOnes.has(candidate)) { return candidate }
  if (! loggerShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'logger is not a VaultLogger: it needs log, warn and error functions. Leave it out to use the default logger (the console, unless setDefaultLogger was given another), or pass functions that do nothing to log nowhere.')
  }
  const known = guardedFor.get(candidate)
  if (known !== undefined) { return known }
  const made = guarded(candidate)
  guardedFor.set(candidate, made)
  return made
}

/**
 * A host's logger as the guard sees it: whatever its calls return is the guard's to look at, as an
 * async logger's promise must be. Every VaultLogger is one.
 */
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

/**
 * The default logger: what every storage adapter, vault, provider and store says things through
 * when it was given no logger of its own. One object, which hands each call on to the console --
 * each line tagged 'safebyok:' -- or to the logger the host handed {@link setDefaultLogger}, as it
 * stands when the call is made. Pass it to openVault, or to VaultProvider, to have the vault use
 * the default whatever its storage adapter was given.
 *
 * @example openVault({ ...opts, vaultDB: idbVaultDB({ logger: storageLogger }), logger: DefaultLogger })  // the storage to its own, the vault to the default
 */
export const DefaultLogger: VaultLogger = forwarding()

/**
 * Sends everything safebyok would say to the console to `logger` instead: what every storage
 * adapter, vault, provider and store says when it was given no logger of its own, made before
 * this call or after. Call it once, as the app starts. A logger handed to an adapter's factory,
 * to openVault or to VaultProvider still wins there, as a child logger would. Guarded as
 * parseLogger guards any logger. Kind 'bad_option' for anything that is not a VaultLogger.
 *
 * @param logger - The app's own logger; none (or null) puts the console back.
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

/**
 * Settle what a logger returned, dropping a rejection rather than leaving it unhandled: a native
 * promise, one of another make or from another realm (which `instanceof Promise` misses), or
 * anything else, which settles at once.
 */
const dropRejection = async (pending: unknown) => {
  try {
    await pending
  } catch {
    // see tell()
  }
}

/** A thrown value, for a logger's `err`: an Error as it is, anything else -- which may be anything at all -- as null. */
export const asError = (thrown: unknown): Error | null => (thrown instanceof Error ? thrown : null)

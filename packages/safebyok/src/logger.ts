import * as Z from 'zod/mini'
import { VaultError } from './errors'
import { consoleLogger } from './console-logger'

/**
 * Where a vault says what it has nobody to throw to: a lock that had to skip its grace, a
 * background refresh that failed, a remembered unlock it could not read. Pass one to openVault
 * as `logger`; with none, the vault writes to the console. Each call has a plain-language
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

/**
 * The logger a vault keeps: the host's, or the console when there is none, made safe to call --
 * whatever the host's throws or rejects with is dropped. Kind 'bad_option' for anything that is
 * not an object carrying `log`, `warn` and `error` functions. A binding that has something of
 * its own to say, beside the vault it opens, says it here, through the same logger.
 *
 * @param candidate - The host's logger, as handed to openVault.
 *
 * @example parseLogger(props.logger).warn('VaultProvider reopened the vault for a logger rebuilt in render', { call: 'VaultProvider' })
 * @example parseLogger(undefined).log('opened')  // to the console: 'safebyok: opened'
 */
export const parseLogger = (candidate: VaultLogger | undefined): VaultLogger => {
  if (candidate === undefined) { return guarded(consoleLogger) }
  if (! loggerShape.safeParse(candidate).success) {
    throw new VaultError('bad_option', 'logger is not a VaultLogger: it needs log, warn and error functions. Leave it out to log to the console, or pass functions that do nothing to log nowhere.')
  }
  return guarded(candidate)
}

/**
 * A host's logger as the guard sees it: whatever its calls return is the guard's to look at, as an
 * async logger's promise must be. Every VaultLogger is one.
 */
type AnyReturningLogger = Record<VaultLoggerLevel, (message?: string, story?: Record<string, unknown>, err?: Error | null) => unknown>

/** `hostLogger`, each call made so that nothing it throws or rejects with reaches the vault. */
const guarded = (hostLogger: AnyReturningLogger): VaultLogger => ({
  log:   (message, story, err) => { tell(hostLogger, 'log', message, story, err) },
  warn:  (message, story, err) => { tell(hostLogger, 'warn', message, story, err) },
  error: (message, story, err) => { tell(hostLogger, 'error', message, story, err) },
})

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

import type { VaultLogger } from './logger'
import { reportToPlatform } from './report-error'

/**
 * A {@link VaultLogger} that takes what was thrown as it came: its `error` hears `thrown` typed
 * `unknown`, since a listener may throw anything at all. Any VaultLogger may replace it.
 */
export type GlobalLogger = {
  log:   VaultLogger['log']
  warn:  VaultLogger['warn']
  error(message?: string, story?: Record<string, unknown>, thrown?: unknown): void
}

/**
 * Where safebyok code with no vault, no options and no one to hand a logger says what went wrong:
 * the change bell and the string stores, which are module-level and shared. Internal, and not for
 * your use: a logger belongs to a vault, so anything that can be handed one -- a VaultDB, a
 * binding, a function that takes options -- takes it as `logger` and says it there, where the host
 * chose who hears it. Come here only where nothing can be handed a logger and a failure must not
 * be thrown; if you reach for it elsewhere, thread a logger to that code instead.
 *
 * `Global.logger` is a {@link GlobalLogger}, a VaultLogger's contract, and replaceable by assigning another. Today's is
 * quiet but for `error`, which hands what was thrown to the platform's `reportError`, where there
 * is one, and does nothing on Node and Bun. A replacement should not throw. The host cannot reach
 * it yet.
 *
 * @example Global.logger.error('A listener of the change bell threw.', { call: 'ChangeBell' }, err)
 * @example Global.logger = telemetryLogger  // replacing it, in a test or when it is exposed
 */
export const Global: { logger: GlobalLogger } = {
  logger: {
    log:   () => undefined,
    warn:  () => undefined,
    error: (_message, _story, thrown) => { reportToPlatform(thrown) },
  },
}

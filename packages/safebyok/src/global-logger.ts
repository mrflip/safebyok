import { reportToPlatform } from './report-error'

/**
 * Where safebyok code with no vault, no options and no one to hand a logger says what went wrong:
 * the change bell and the string stores, which are module-level and shared. Internal, and not for
 * your use: a logger belongs to a vault, so anything that can be handed one -- a VaultDB, a
 * binding, a function that takes options -- takes it as `logger` and says it there, where the host
 * chose who hears it. Come here only where nothing can be handed a logger and a failure must not
 * be thrown; if you reach for it elsewhere, thread a logger to that code instead.
 *
 * Today it reports to the platform's `reportError`, where there is one, and says nothing on Node
 * and Bun; the host cannot reach or replace it.
 */

/**
 * Says that something the host's own code did went wrong, where nothing can be thrown to. Hands
 * `thrown` to the platform's `reportError` as it came; `message` and `story`, in the shape a
 * `VaultLogger` takes, are for whoever hears it once the host can choose.
 *
 * @param _message - Plain language for what happened, calm and saying what to do.
 * @param _story - A few facts to filter on, such as `call`; never a secret or an option's value.
 * @param thrown - What the host's code threw, as it came.
 *
 * @example GlobalLogger.fail('A change-bell listener threw.', { call: 'ChangeBell' }, thrown)
 */
export const fail = (_message: string, _story: Record<string, unknown>, thrown: unknown): void => {
  reportToPlatform(thrown)
}

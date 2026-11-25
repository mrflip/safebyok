/** What PostgresVaultDB asks of the host's driver, and how it reads what the driver throws and hears. */

import * as DB from 'safebyok/storage'
import type { Awaitable, VaultError } from 'safebyok/storage'
import * as Phrases from './phrases'

// == [The driver]: PostgresQueryable, PostgresListen

/** A pool or connection that runs one parameterized statement and returns its rows. */
export type PostgresQueryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }

/** A host's LISTEN: calls `onNotify` with the text of each notification on `channel`, and returns a function that stops listening. */
export type PostgresListen = (channel: string, onNotify: (text: string) => void) => Awaitable<() => unknown>
// --

// == [Notices]: jsonOrNull

/** The JSON value in `text`, or null where it is not JSON. */
export function jsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch { return null }
}
// --

// == [Refusals]: refusalOf, isTransient, causeOf, codeOf, TransientSqlstate, TransientSystemCodes, PgConnectionLost

/** The VaultError for what a driver threw: `storage_unavailable` where a retry may mend it, else `unexpected_error`. A VaultError is kept as it is.
 * A lost connection, a conflict between transactions, a busy or read-only server: anything else fails the same way again.
 */
export function refusalOf(thrown: unknown): VaultError {
  if (DB.isVaultError(thrown)) { return thrown }
  return isTransient(thrown) ? DB.storageUnavailable(causeOf(thrown)) : DB.unexpectedError(causeOf(thrown))
}

/** True for a failure a retry may mend: a transient SQLSTATE, a socket's system error, or one of pg's own connection failures. */
function isTransient(thrown: unknown): boolean {
  const code = codeOf(thrown)
  if (code !== undefined) { return TransientSqlstate.test(code) || TransientSystemCodes.has(code) }
  return (thrown instanceof Error) && PgConnectionLost.has(thrown.message)
}

// A driver's error can include the statement's parameters, which may include a row. Keep only its message and code.
function causeOf(thrown: unknown): Error {
  const code = codeOf(thrown)
  return Object.assign(new Error(DB.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

/** The error code on `thrown`, a SQLSTATE such as 40001 or a system error such as ECONNRESET. Only capitals, digits and underbars are kept, so it cannot quote a row. */
function codeOf(thrown: unknown): string | undefined {
  const code: unknown = ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown)) ? thrown.code : undefined
  return ((typeof code === 'string') && /^[0-9A-Z][0-9A-Z_]{0,39}$/.test(code)) ? code : undefined
}

// SQLSTATE classes 08 (connection exception), 40 (transaction rollback: a serialization failure or deadlock), 53 (insufficient
// resources) and 57 (operator intervention: a cancelled statement, a server shutting down), 55P03 (lock not available), and
// 25006 (read-only SQL transaction: a write sent to a standby, as during a failover).
const TransientSqlstate = /^(?:(?:08|40|53|57)[0-9A-Z]{3}|55P03|25006)$/

// Node's system errors for a socket that could not connect, or that dropped, and a host name that could not be looked up for now.
const TransientSystemCodes = new Set(['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EAI_AGAIN'])

// pg 8 throws these as plain Errors, with no code, so only the message tells them apart. A test checks each against the installed pg.
// A connection dropped or timed out is in `pg/lib/client.js`, a pool that found no connection in time in `pg-pool/index.js`.
/** The messages of pg's connection failures a retry may mend; a client the host ended itself is left out. */
export const PgConnectionLost: ReadonlySet<string> = new Set([
  'Connection terminated unexpectedly',
  'Client has encountered a connection error and is not queryable',
  'Query read timeout',
  'timeout expired',
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
])
// --

// == [What the database returns]: storedNothing

/** The `unexpected_error` for a write function that stored nothing where the classifier finds a write. */
export function storedNothing(): VaultError { return DB.unexpectedError(new Error(Phrases.StoredNothing)) }
// --

// == [Listening]: listenOrNull, unlistenOnceListening

/** Start listening and return the function that stops it. If listening fails, tell `onFailed` and return null. */
export async function listenOrNull(listen: PostgresListen, channel: string, onNotify: (text: string) => void, onFailed: (news: VaultError) => void): Promise<(() => unknown) | null> {
  try {
    return await listen(channel, onNotify)
  } catch (err) {
    onFailed(refusalOf(err))
    return null
  }
}

/** Stop listening once `listening` has started, ignoring a failure to stop. */
export async function unlistenOnceListening(listening: Promise<(() => unknown) | null>): Promise<void> {
  const unlisten = await listening
  try {
    await unlisten?.()
  } catch {
    // the watch already ignores notices, so a failed unlisten changes nothing
  }
}
// --

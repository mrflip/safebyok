/** The refusals PostgresVaultDB makes: of what Postgres and its driver throw, and of a write function out of step with this package. */

import * as DB from 'safebyok/storage'
import type { VaultError } from 'safebyok/storage'
import * as Phrases from './phrases'

// == [What the driver throws]: refusalOf, isTransient, causeOf, codeOf, TransientSqlstate, TransientSystemCodes, PgConnectionLost

/** The refusal for what the driver threw at the call `oplabel`: `storage_unavailable` where a retry may mend it, else `storage_issue`. A VaultError is kept as it is.
 * A retry may mend a lost connection, a conflict between transactions, or a server busy, shutting down or read-only for now.
 */
export function refusalOf(oplabel: string, thrown: unknown): VaultError {
  if (DB.isVaultError(thrown)) { return thrown }
  return isTransient(thrown) ? DB.storageUnavailable(causeOf(thrown)) : DB.storageCallRefused(oplabel, causeOf(thrown))
}

/** True for a failure a retry may mend: a transient SQLSTATE, a socket's system error, or one of pg's own connection failures. */
function isTransient(thrown: unknown): boolean {
  const code = codeOf(thrown)
  if (code !== undefined) { return TransientSqlstate.test(code) || TransientSystemCodes.has(code) }
  return (thrown instanceof Error) && PgConnectionLost.has(thrown.message)
}

// A driver's error can carry the statement's parameters, and so a row.
/** The cause to keep of `thrown`: an Error with its message and code, and nothing else. */
function causeOf(thrown: unknown): Error {
  const code = codeOf(thrown)
  return Object.assign(new Error(DB.sanitizeForeignError(thrown).message), (code === undefined) ? {} : { code })
}

/** The `code` of `thrown`, a SQLSTATE such as 40001 or a system error such as ECONNRESET, or undefined for none. Only a code of capitals, digits and underbars is read, so it cannot quote a row. */
function codeOf(thrown: unknown): string | undefined {
  const code: unknown = ((typeof thrown === 'object') && (thrown !== null) && ('code' in thrown)) ? thrown.code : undefined
  return ((typeof code === 'string') && /^[0-9A-Z][0-9A-Z_]{0,39}$/.test(code)) ? code : undefined
}

// SQLSTATE classes 08 (connection exception), 40 (transaction rollback: a serialization failure or deadlock), 53 (insufficient
// resources) and 57 (operator intervention: a cancelled statement, a server shutting down), 55P03 (lock not available), and
// 25006 (read-only SQL transaction: a write sent to a standby, as during a failover).
const TransientSqlstate = /^(?:(?:08|40|53|57)[0-9A-Z]{3}|55P03|25006)$/

// Node's system errors for a socket that could not connect or that dropped, and for a host name that could not be looked up for now.
const TransientSystemCodes: ReadonlySet<string> = new Set(['ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EAI_AGAIN'])

// pg 8 throws these as plain Errors with no code, so only the message tells them apart; a test finds each in the installed pg.
// A connection dropped or timed out is in `pg/lib/client.js`, a pool that found no connection in time in `pg-pool/index.js`.
// A client the host ended itself is left out: a retry would fail the same way.
/** The messages of pg's connection failures that a retry may mend. */
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

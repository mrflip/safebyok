/** The refusals this package makes itself, one thrower each: a GraphQL server's trouble, as the client meets it. */

import type { CombinedError } from '@urql/core'
import * as DB from 'safebyok/storage'
import * as Phrases from '../phrases'

// == [Server trouble]: serverErred, schemaNotServed, thingOutOfReach, kidsOfOtherParent, watchEnded, networkTroubleOf

// A GraphQL error means the client and server disagree about the schema, or the server's resolver failed. A retry will not
// fix either, so it is never reported as a storage condition. The refusal carries no cause, so the server's error text never
// reaches the caller: a variable-coercion error can quote the variable sent, which is the record.
/** The `unexpected_error` for a server that answered with a GraphQL error. */
export function serverErred(): DB.VaultError { return new DB.VaultError('unexpected_error', Phrases.ServerErred) }

/** The `unexpected_error` for a server answer that lacks the field asked for. */
export function schemaNotServed(): DB.VaultError { return new DB.VaultError('unexpected_error', Phrases.SchemaNotServed) }

/** The `storage_issue` for an answer carrying a Thing at `labelpath`, where its ask reaches no Thing. */
export function thingOutOfReach(labelpath: string): DB.VaultError { return new DB.VaultError('storage_issue', Phrases.ThingOutOfReach, { meta: { labelpaths: [labelpath] } }) }

/** The `storage_issue` for a good listing whose kids name a parent other than the ask's, or other than the parent the listing carries. */
export function kidsOfOtherParent(parentpath: string): DB.VaultError { return new DB.VaultError('storage_issue', Phrases.KidsOfOtherParent, { meta: { labelpaths: [parentpath] } }) }

/** The `storage_unavailable` for a watch whose stream the server ended. */
export function watchEnded(): DB.VaultError { return new DB.VaultError('storage_unavailable', Phrases.WatchEnded, { meta: { oplabel: 'watch' } }) }

// A network error's message can be the response body, which may quote the record sent. Build a new cause from
// fields that cannot quote it: the error's name, the HTTP status, and a code such as ECONNREFUSED.
/** The `storage_unavailable` for a request that failed in the network. Its cause carries only the error's name, the HTTP status and an error code. */
export function networkTroubleOf({ networkError, response }: CombinedError): DB.VaultError {
  const thrownName = networkError?.name ?? 'Error'
  const status = statusOf(response)
  const code = codeOf(networkError) ?? codeOf(networkError?.cause)
  const cause = Object.assign(new Error(DB.fetchFailed(thrownName, status, code)), { thrownName }, (status !== null) && { status }, (code !== null) && { code })
  return DB.storageUnavailable(cause)
}

/** The HTTP status of the failed response, or null. */
function statusOf(response: unknown): number | null {
  const status: unknown = (typeof response === 'object') && (response !== null) && ('status' in response) ? response.status : null
  return Number.isSafeInteger(status) ? status as number : null
}

/** The error code on `thrown`, such as ECONNREFUSED, or null. Only an all-caps identifier is accepted, so it cannot quote anything else. */
function codeOf(thrown: unknown): string | null {
  const code: unknown = (typeof thrown === 'object') && (thrown !== null) && ('code' in thrown) ? thrown.code : null
  return (typeof code === 'string') && /^[A-Z][A-Z0-9_]{0,39}$/.test(code) ? code : null
}
// --

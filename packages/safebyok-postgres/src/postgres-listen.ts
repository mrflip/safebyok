/** A ready-made listen for PostgresVaultDB, on a node-postgres `Client` that every watch shares. */

import { Checker } from 'safebyok/storage'
import * as Phrases from './phrases'
import type { PostgresListen } from './postgres-vault-db'

// == [The connection]: PostgresListenClient, isPostgresListenClient, postgresListenClient

/** A connection that can LISTEN, as a node-postgres `Client` is: it runs a statement, quotes an identifier, and emits each notification it receives. */
export type PostgresListenClient = {
  query: (text: string) => Promise<unknown>
  escapeIdentifier: (str: string) => string
  on: (event: 'notification', onNotification: (notification: { channel: string, payload?: string | undefined }) => void) => unknown
}

/** True for a client with `query`, `escapeIdentifier` and `on` functions. */
function isPostgresListenClient(candidate: unknown): candidate is PostgresListenClient {
  if ((typeof candidate !== 'object') || (candidate === null)) { return false }
  const methods = candidate as Partial<Record<keyof PostgresListenClient, unknown>>
  return (typeof methods.query === 'function') && (typeof methods.escapeIdentifier === 'function') && (typeof methods.on === 'function')
}

// `custom` returns the client it is given, so its methods keep their `this`.
const postgresListenClient = Checker(({ custom }) => custom<PostgresListenClient>(isPostgresListenClient, Phrases.ListenClientExpected), 'bad_record')
// --

// == [Listening]: makePostgresListen

/** A {@link PostgresListen} on `client`, a connection of its own: it LISTENs on a channel while any watch hears it, and UNLISTENs once the last one stops.
 * Connect the client, and handle its `error` event, before the first watch. A failed LISTEN or UNLISTEN rejects with the driver's error, which PostgresVaultDB refuses as it does any failed statement.
 */
export function makePostgresListen(client: PostgresListenClient): PostgresListen {
  const listener = postgresListenClient.parse(client)
  const onNotifiesOf = new Map<string, Set<(text: string) => void>>()
  listener.on('notification', ({ channel, payload = '' }) => {
    const onNotifies = onNotifiesOf.get(channel) ?? []
    for (const onNotify of onNotifies) { onNotify(payload) }
  })
  return async (channel, onNotify) => {
    // A userid may contain capitals and punctuation, which LISTEN accepts only in a quoted identifier.
    const identifier = listener.escapeIdentifier(channel)
    if (! onNotifiesOf.has(channel)) { await listener.query(`LISTEN ${identifier}`) }
    const onNotifies = onNotifiesOf.get(channel) ?? new Set()
    onNotifiesOf.set(channel, onNotifies.add(onNotify))
    return async () => {
      onNotifies.delete(onNotify)
      if (onNotifies.size > 0) { return }
      onNotifiesOf.delete(channel)
      await listener.query(`UNLISTEN ${identifier}`)
    }
  }
}
// --

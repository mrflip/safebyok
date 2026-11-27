// The messages of the refusals this package makes itself. The rest are `safebyok`'s, through its throwers.

// == [Options]: ClientExpected, ListenClientExpected

/** A client for PostgresVaultDB without a query function. */
export const ClientExpected = 'Expected a client with a query function'

/** A client for makePostgresListen that cannot LISTEN. */
export const ListenClientExpected = 'Expected a connection that can LISTEN, as a pg Client is: with query, escapeIdentifier and on functions. A pg Pool cannot hold a LISTEN, so connect a Client of its own.'
// --

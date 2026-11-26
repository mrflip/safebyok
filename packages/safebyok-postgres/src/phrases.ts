// The messages of the refusals this package makes itself. The rest are `safebyok`'s, through its throwers.

// == [Refusals]: StoredNothing

/** A write function that stored nothing where the classifier finds a write. */
export const StoredNothing = "The database's write function stored nothing where safebyok's classifier finds a write, so the SQL functions installed and this copy of safebyok-postgres disagree. If the functions came from another version of safebyok-postgres, run this version's functions SQL again."
// --

// == [Options]: ListenClientExpected

/** A client for makePostgresListen that cannot LISTEN. */
export const ListenClientExpected = 'Expected a connection that can LISTEN, as a pg Client is: with query, escapeIdentifier and on functions. A pg Pool cannot hold a LISTEN, so connect a Client of its own.'
// --

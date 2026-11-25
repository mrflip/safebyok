// The messages of the refusals this package makes itself. The rest are `safebyok`'s, through its throwers.

// == [Answers]: ServerErred, SchemaNotServed, WatchEnded

/** A GraphQL server that answered with an error. */
export const ServerErred = "The GraphQL server answered with an error: it may not be serving safebyok-graphql's VaultSchemaSdl, or a resolver behind it may have failed. The error's text is left out, as it can quote the record sent; look for it in the server's log."

/** A GraphQL server whose answer lacks the field asked for. */
export const SchemaNotServed = "The GraphQL server answered without what was asked of it: is it serving safebyok-graphql's VaultSchemaSdl?"

/** A GraphQL server that ended a watch's stream. */
export const WatchEnded = "The GraphQL server ended a watch's stream, so changes to the bank's Things go unheard until the watch is started again."
// --

// == [Options]: NotGraphQLVaultClient, NotVaultDB

/** A client option that is not an urql Client. */
export const NotGraphQLVaultClient = 'Expected an urql Client, with query, mutation and subscription functions'

/** A vaultDB option that is not a vaultDB. */
export const NotVaultDB = "Expected a vaultDB from safebyok/storage, such as safebyok-postgres's PostgresVaultDB"
// --

// The messages of the refusals this package makes itself. The rest are `safebyok`'s, through its throwers.

// == [Answers]: ServerErred, SchemaNotServed, ThingOutOfReach, KidsOfOtherParent, WatchEnded

/** A GraphQL server that answered with an error. */
export const ServerErred = "The GraphQL server answered with an error: it may not be serving safebyok-graphql's VaultSchemaSdl, or a resolver behind it may have failed. The error's text is left out, as it can quote the record sent; look for it in the server's log."

/** A GraphQL server whose answer lacks the field asked for. */
export const SchemaNotServed = "The GraphQL server answered without what was asked of it: is it serving safebyok-graphql's VaultSchemaSdl?"

/** A GraphQL server whose answer carries a Thing its ask does not reach: a listing's child outside its parent, or a refusal's root that is no root. */
export const ThingOutOfReach = "The GraphQL server answered with a Thing where the ask reaches none: the server's vaultDB may be out of step with this one."

/** A GraphQL server whose listing names kids of a parent other than the one asked, or other than the parent it carries. */
export const KidsOfOtherParent = "The GraphQL server answered with kids of another parent than the one the ask names or the listing carries: the server's vaultDB may be out of step with this one."

/** A GraphQL server that ended a watch's stream. */
export const WatchEnded = "The GraphQL server ended a watch's stream, so changes to the bank's Things go unheard until the watch is started again."
// --

// == [Options]: NotGraphQLVaultClient, NotVaultDB

/** A client option that is not an urql Client. */
export const NotGraphQLVaultClient = 'Expected an urql Client, with query, mutation and subscription functions'

/** A vaultDB option that is not a vaultDB. */
export const NotVaultDB = "Expected a vaultDB from safebyok/storage, such as safebyok-postgres's PostgresVaultDB"
// --

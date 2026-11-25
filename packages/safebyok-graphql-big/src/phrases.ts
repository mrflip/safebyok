// The messages of the refusals this package makes itself. The rest are `safebyok-big`'s, through its Throwers.

// == [Answers]: ServerErred

/** A GraphQL server that answered with an error. */
export const ServerErred = "The GraphQL server answered with an error: it may not be serving safebyok-graphql's BankSchemaSdl, or a resolver behind it may have failed. The error's text is left out, as it can quote the record sent; look for it in the server's log."
// --

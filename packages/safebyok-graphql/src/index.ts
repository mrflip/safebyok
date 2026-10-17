/**
 * safebyok-graphql: safebyok's storage over GraphQL. This entry point is the browser's half,
 * {@link graphqlVaultDB}, a VaultDB over your app's urql Client. The server's half --
 * the schema and its resolvers, over a VaultDB made per request -- is `safebyok-graphql/server`.
 */
export { VaultOperations, graphqlVaultDB } from './graphql-vault-db'
export type { GraphqlVaultClient, GraphqlVaultDBOpts } from './graphql-vault-db'

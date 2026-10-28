/** safebyok-graphql/server: the server's half of safebyok's storage over GraphQL, for any GraphQL server beside your own schema.
 * {@link VaultSchemaSdl} is the schema, as SDL, and {@link vaultResolvers} its resolvers, each root
 * field one verb of a VaultDB made per request for the signed-in user, such as safebyok-postgres's.
 * The browser's half is `graphqlVaultDB`, from `safebyok-graphql`.
 */
export { VaultSchemaSdl } from './vault-schema'
export { vaultResolvers } from './vault-resolvers'
export type { ServedVaultDB, VaultFieldArgs, VaultFieldResolver, VaultResolvers, VaultResolversOpts } from './vault-resolvers'

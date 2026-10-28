/** safebyok-postgres: safebyok's storage in Postgres, run on your server through the driver you already use.
 * {@link VaultTablesSql} makes the tables, and {@link VaultNotifySql} is the optional trigger that
 * lets a vault hear other devices' writes. {@link postgresVaultDB}, made per request for the
 * signed-in user, is the VaultDB over them.
 */
export { postgresVaultDB } from './postgres-vault-db'
export type { PostgresClient, PostgresListen, PostgresUnlisten, PostgresVaultDBOpts } from './postgres-vault-db'
export { VaultChangeChannel, VaultNotifySql, VaultTablesSql } from './vault-tables'

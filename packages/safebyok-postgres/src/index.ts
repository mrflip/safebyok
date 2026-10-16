/**
 * safebyok-postgres: safebyok's storage in Postgres, run on your server. {@link VaultTablesSql}
 * makes the tables, and {@link VaultNotifySql} is the optional trigger that lets a vault hear other
 * devices' writes; {@link postgresVaultDB}, made per request for the signed-in user, is the
 * VaultDB over them, through whatever driver you already use. It brings no driver of its own.
 */
export { postgresVaultDB } from './postgres-vault-db'
export type { PostgresClient, PostgresListen, PostgresUnlisten, PostgresVaultDBOpts } from './postgres-vault-db'
export { VaultChangeChannel, VaultNotifySql, VaultTablesSql } from './vault-tables'

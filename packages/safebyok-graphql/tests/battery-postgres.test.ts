/** The battery every vaultDB runs, against a GraphQLVaultDB whose server answers from a PostgresVaultDB on PGlite. */

import * as TH from './test-helpers'

TH.bootDatabaseFirst()

TH.describeVaultDBBattery('GraphQLVaultDB over a PostgresVaultDB', {
  makeVaultDB:   async () => TH.browserOver(TH.schemaOver(await TH.postgresVaultDB())),
  _cheat_rowsOf: () => TH.postgresRows,
})

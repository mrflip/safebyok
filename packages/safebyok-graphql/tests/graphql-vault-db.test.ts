/** GraphQLVaultDB over the resolvers in-process, a PostgresVaultDB on PGlite behind them: the battery every VaultDB runs. */

import { describe, it } from 'vitest'
import { Client } from '@urql/core'
import { GraphQLVaultDB } from '../src/index'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

TH.describeVaultDBBattery("GraphQLVaultDB", {
  makeVaultDB:         async (opts) => await TH.makeVaultDB(opts),
  makeCappedVaultDB:   async (maxBoxes) => await TH.makeVaultDB({}, maxBoxes),
  makeTwin:            TH.makeTwin,
  _cheat_rowsOf:       () => TH.rowsOf(),
  _cheat_failNextCall: (vaultDB) => { vaultDB.failNext() },
})

describe("GraphQLVaultDB's constructor", () => {
  it("refuses a client or maxRecordBytes it cannot use", () => {
    const client = new Client({ url: 'https://app.example.test/api/graphql', exchanges: [] })
    const unusable = [{}, { client: { query: () => client } }, { client: 'urql' }, { client, maxRecordBytes: 0 }]
    for (const opts of unusable) { TH.expectSyncRefusal(() => new GraphQLVaultDB(opts as never), 'bad_option') }
  })
})

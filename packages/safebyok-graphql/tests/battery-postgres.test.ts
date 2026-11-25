/** The battery every vaultDB runs, against a GraphQLVaultDB whose server answers from a PostgresVaultDB on PGlite. */

import { describe, expect, it } from 'vitest'
import * as TH from './test-helpers'

TH.bootDatabaseFirst()

TH.describeVaultDBBattery('GraphQLVaultDB over a PostgresVaultDB', {
  makeVaultDB:   async () => TH.browserOver(TH.schemaOver(await TH.postgresVaultDB())),
  _cheat_rowsOf: () => TH.postgresRows,
})

describe('GraphQLVaultDB over a PostgresVaultDB', () => {
  it("stores a bank born over the wire in the server's PostgresVaultDB", async () => {
    const postgres = await TH.postgresVaultDB()
    await TH.expectGood(TH.browserOver(TH.schemaOver(postgres)).tryBirthBank(TH.birthBankAskOf()))
    const gate = await TH.expectGood(postgres.tryGetThing(TH.getGateAskOf()))
    expect(gate).to.deep.eq(TH.gateThingOf())
  })
})

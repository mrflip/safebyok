/** The package's entry point. */

import { describe, expect, it } from 'vitest'
import * as safebyokPostgres from '../src/index'

describe("the package's entry point", () => {
  it("exports the bankDB and the vaultDB, the pool's client, and the SQL and channel each runs on", () => {
    expect(Object.keys(safebyokPostgres)).to.have.members([
      'PostgresBankDB', 'bankChannelOf', 'BankFunctionsSql', 'BankTablesSql', 'pgClientOf', 'PostgresVaultDB', 'vaultChannelOf', 'VaultFunctionsSql', 'VaultTablesSql',
    ])
  })
})

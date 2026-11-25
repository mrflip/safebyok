/** The package's entry point. */

import { describe, expect, it } from 'vitest'
import * as safebyokPostgres from '../src/index'

describe("the package's entry point", () => {
  it("exports the vaultDB, and the SQL and channel it runs on", () => {
    expect(Object.keys(safebyokPostgres)).to.have.members([
      'PostgresVaultDB', 'thingsChannelOf', 'VaultFunctionsSql', 'VaultTablesSql',
    ])
  })
})

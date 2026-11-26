/** The package's entry point. */

import { describe, expect, it } from 'vitest'
import * as safebyokPostgres from '../src/index'

describe("the package's entry point", () => {
  it("exports the vaultDB, the SQL and channel it runs on, and a listen for it", () => {
    expect(Object.keys(safebyokPostgres)).to.have.members([
      'PostgresVaultDB', 'thingsChannelOf', 'makePostgresListen', 'VaultFunctionsSql', 'VaultTablesSql',
    ])
  })
})

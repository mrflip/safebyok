/** The package's entry point. */

import { describe, expect, it } from 'vitest'
import * as safebyokPostgres from '../src/index'

describe("the package's entry point", () => {
  it("exports the bankDB, the pool's client, and the SQL and channel it runs on", () => {
    expect(Object.keys(safebyokPostgres)).to.have.members([
      'PostgresBankDB', 'bankChannelOf', 'BankFunctionsSql', 'BankTablesSql', 'pgClientOf',
    ])
  })
})

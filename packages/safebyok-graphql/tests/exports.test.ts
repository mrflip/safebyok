/** The two entry points: `.` exports only the browser side, and `./server` only the server side. */

import { describe, expect, it } from 'vitest'
import * as Browser from '../src/index'
import * as Server from '../src/server'

describe("safebyok-graphql's entry points", () => {
  it("export the browser's VaultDB from the package, and the schema and resolvers from /server", () => {
    expect(Object.keys(Browser)).to.have.members(['GraphQLVaultDB', 'VaultOperations'])
    expect(Object.keys(Server)).to.have.members(['VaultSchemaSdl', 'vaultResolvers'])
  })
})

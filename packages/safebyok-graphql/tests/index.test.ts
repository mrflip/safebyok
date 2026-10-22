import { parse } from 'graphql'
import { describe, expect, it } from 'vitest'
import * as safebyokGraphql from '../src/index'

describe("the package's entry point, the browser's half", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyokGraphql)).to.have.members(['graphqlVaultDB', 'VaultOperations'])
  })

  it("exports the documents a host registers with a persisted-operation allowlist, each one operation", () => {
    const documents = Object.values(safebyokGraphql.VaultOperations)
    expect(documents).to.have.lengthOf(12)
    for (const document of documents) {
      const operations = parse(document).definitions.filter((definition) => definition.kind === 'OperationDefinition')
      expect(operations).to.have.lengthOf(1)
    }
  })
})

import { describe, expect, it } from 'vitest'
import * as safebyokIndexeddb from '../src/index'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyokIndexeddb)).to.have.members(['idbVaultDB', 'inspectIdbVaultDB'])
  })
})

import { describe, expect, it } from 'vitest'
import * as argon2Wasm from '../src/index'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(argon2Wasm)).to.have.members(['makeArgon2idWasmDeriver', 'argon2idWasmWebV1Deriver'])
  })
})

import { describe, expect, it, vi } from 'vitest'

const argon2idLoads = vi.hoisted((): string[] => [])

// Every load of noble's Argon2id is counted, and goes through to the real module. Nothing else here
// imports it, nor `tests/test-helpers.ts`, which does: so the count is the bank's reach alone.
vi.mock('@noble/hashes/argon2.js', async (importOriginal) => {
  argon2idLoads.push('loaded')
  return await importOriginal()
})

// `argon2id-webv1.ts` alone imports Argon2id: a bank that reached it would carry Argon2id into every host, even one that derives some other way.
describe("the bank's reach", () => {
  it("holds no import of @noble/hashes' Argon2id, so a host that brings its own deriver bundles none", async () => {
    const { Bank } = await import('../../src/models/bank')
    expect(Bank).to.be.a('function')
    expect(argon2idLoads).to.have.lengthOf(0)
  })

  it("is measured by a method that does see Argon2id where it is imported", async () => {
    await import('../../src/deriver/argon2id-webv1')
    expect(argon2idLoads).to.have.lengthOf(1)
  })
})

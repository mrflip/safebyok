import { argon2idAsync } from '@noble/hashes/argon2.js'
import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, argon2idDeriver, argon2idWebV1Deriver, parseKeyDeriverSpec } from '../src/browser'
import * as Front from '../src/index'

const CheapSpec = {
  algorithm:         'argon2id',
  key_deriver_label: 'cheap_argon2id_v0',
  memory_kib:        8,
  iterations:        1,
  parallelism:       1,
  salt_bytes:        16,
  output_bytes:      32,
} as const

const salt = new Uint8Array(16).fill(7)

// One derivation at full strength (64 MiB, three passes) in pure JS takes 3-4 s on a CI runner under coverage, past vitest's 5 s default when the runner is busy.
const FullStrengthDeriveMillis = 30_000

// Argon2id's own test vector, from its reference implementation (phc-winner-argon2's test.c: version 0x13, 2 passes,
// 64 MiB, one lane, "password" and "somesalt"). Its salt is 8 bytes, under the 16 a keyDeriverSpec asks, so noble is asked directly.
describe("Argon2id's reference test vector", () => {
  it("is what noble derives, the library argon2idDeriver runs on", { timeout: FullStrengthDeriveMillis }, async () => {
    const derived = await argon2idAsync('password', new TextEncoder().encode('somesalt'), { m: 65_536, t: 2, p: 1, dkLen: 32 }) // eslint-disable-line id-length -- noble's option names
    expect(Buffer.from(derived).toString('hex')).to.eq('09316115d5cf24ed5a15a31a3ba326e5cf32edc24702987c02b6566f61913cf7')
  })

  it("is out of reach of a keyDeriverSpec, which asks for a salt of 16 bytes", () => {
    expect(() => parseKeyDeriverSpec({ ...CheapSpec, salt_bytes: 8 })).to.throw(/salt_bytes/u)
  })
})

// The value was taken from @noble/hashes' argon2idAsync called directly (and agrees with hash-wasm's argon2id), over the spec's
// 65_536 KiB, 3 passes, 1 lane and 32 bytes, for this passphrase and salt; safebyok-fastkey's tests hold its wasm deriver to it too.
describe("a saved Argon2id value", () => {
  it("is what argon2idWebV1Deriver derives for one fixed passphrase and salt, at the spec's cost", { timeout: FullStrengthDeriveMillis }, async () => {
    const saltBytes = Uint8Array.from({ length: 16 }, (_unused, ii) => ((ii * 37) + 11) % 256)
    const derived = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    expect(Buffer.from(derived).toString('hex')).to.eq('efb4ef4c091ec9dacc4f1284c439742b414394599ffe4bbefc4dc300e4a4301b')
  })
})

describe("safebyok/browser", () => {
  it("derives a 32-byte key under the argon2id_web_v1 label with argon2idWebV1Deriver", { timeout: FullStrengthDeriveMillis }, async () => {
    expect(argon2idWebV1Deriver.key_deriver_label).to.eq('argon2id_web_v1')
    const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('a short passphrase', salt)
    expect(keyBytes).to.have.lengthOf(32)
  })

  it("is deterministic in passphrase and salt with argon2idDeriver", async () => {
    const deriver = argon2idDeriver(CheapSpec)
    const first = await deriver.deriveKeyBytes('a short passphrase', salt)
    expect(first).to.have.lengthOf(32)
    expect(await deriver.deriveKeyBytes('a short passphrase', salt)).to.deep.eq(first)
  })

  it("derives other bytes for another passphrase with argon2idDeriver", async () => {
    const deriver = argon2idDeriver(CheapSpec)
    const first = await deriver.deriveKeyBytes('a short passphrase', salt)
    expect(await deriver.deriveKeyBytes('another passphrase', salt)).to.not.deep.eq(first)
  })

  it("hands another deriver what it needs to wear the same specs: the supplied spec and its parse", () => {
    expect(argon2idWebV1Deriver).to.include({ ...Argon2idWebV1 })
    expect(parseKeyDeriverSpec(CheapSpec)).to.deep.equal(CheapSpec)
    expect(() => parseKeyDeriverSpec({ ...Argon2idWebV1, iterations: 4 })).to.throw(/argon2id_web_v1/u)
  })

  it("is not on the front door", () => {
    expect(Front).to.not.have.property('argon2idWebV1Deriver')
    expect(Front).to.not.have.property('argon2idDeriver')
  })
})

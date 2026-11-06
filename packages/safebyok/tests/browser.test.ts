import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, argon2idDeriver, argon2idWebV1Deriver, checkSaltFits, parseKeyDeriverSpec } from '../src/browser'
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

  it("hands another deriver what it needs to wear the same specs: the supplied spec, its parse and its salt check", () => {
    expect(argon2idWebV1Deriver).to.include({ ...Argon2idWebV1 })
    expect(parseKeyDeriverSpec(CheapSpec)).to.deep.equal(CheapSpec)
    expect(() => parseKeyDeriverSpec({ ...Argon2idWebV1, iterations: 4 })).to.throw(/argon2id_web_v1/u)
    expect(() => { checkSaltFits(CheapSpec, salt) }).to.not.throw()
    expect(() => { checkSaltFits(CheapSpec, new Uint8Array(15)) }).to.throw(/16/u)
  })

  it("is not on the front door", () => {
    expect(Front).to.not.have.property('argon2idWebV1Deriver')
    expect(Front).to.not.have.property('argon2idDeriver')
  })
})

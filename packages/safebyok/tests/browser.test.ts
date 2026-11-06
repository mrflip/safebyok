import { describe, expect, it } from 'vitest'
import { argon2idDeriver, argon2idWebV1Deriver } from '../src/browser'
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

describe("safebyok/browser", () => {
  it("derives a 32-byte key under the argon2id_web_v1 label with argon2idWebV1Deriver", async () => {
    expect(argon2idWebV1Deriver.key_deriver_label).to.eq('argon2id_web_v1')
    const keyBytes = await argon2idWebV1Deriver.deriveKeyBytes('a short passphrase', salt)
    expect(keyBytes).to.have.length(32)
  })

  it("derives alike for equal passphrase and salt, and apart for another passphrase, with argon2idDeriver", async () => {
    const deriver = argon2idDeriver(CheapSpec)
    const first = await deriver.deriveKeyBytes('a short passphrase', salt)
    expect(first).to.have.length(32)
    expect(await deriver.deriveKeyBytes('a short passphrase', salt)).to.deep.eq(first)
    expect(await deriver.deriveKeyBytes('another passphrase', salt)).to.not.deep.eq(first)
  })

  it("is not on the front door", () => {
    expect(Front).to.not.have.property('argon2idWebV1Deriver')
    expect(Front).to.not.have.property('argon2idDeriver')
  })
})

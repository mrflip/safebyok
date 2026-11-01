import { argon2idAsync } from '@noble/hashes/argon2.js'
import { describe, expect, it } from 'vitest'
import { MaxSaltBytes, PassphraseKeyBytes } from '../../src/consts'
import { argon2idDeriver, argon2idWebV1Deriver } from '../../src/deriver/argon2id-webv1'
import { Argon2idWebV1, type KeyDeriverSpec } from '../../src/deriver/shapes'
import { isVaultError } from '../../src/errors'
import * as TH from '../test-helpers'

/** A spec of the host's own, cheap to derive under; no two of its counts alike, so a swap shows. */
const CheapSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

/** The deriver's fields without its function: the spec it carries. */
const specOf = ({ deriveKeyBytes: _dropped, ...spec }: { deriveKeyBytes: unknown }) => spec

describe("argon2idDeriver", () => {
  it("carries the whole spec beside its function, frozen", () => {
    const deriver = argon2idDeriver(CheapSpec)
    expect(specOf(deriver)).to.deep.equal(CheapSpec)
    expect(deriver).to.be.frozen
  })

  it("derives exactly what Argon2id derives at the spec's parameters", async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const derived = await argon2idDeriver(CheapSpec).deriveKeyBytes('correct horse battery staple', saltBytes)
    const direct = await argon2idAsync('correct horse battery staple', saltBytes, { m: 64, t: 2, p: 4, dkLen: 32 }) // eslint-disable-line id-length -- noble's option names
    expect(derived).to.have.lengthOf(32)
    expect(derived).to.deep.equal(direct)
  })

  it("derives differently under each parameter, so none is ignored", async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const variants = [CheapSpec, { ...CheapSpec, memory_kib: 128 }, { ...CheapSpec, iterations: 3 }, { ...CheapSpec, parallelism: 2 }]
    const derived = await Promise.all(variants.map((spec) => argon2idDeriver(spec).deriveKeyBytes('pw', saltBytes)))
    expect(new Set(derived.map((bytes) => bytes.join(','))).size).to.eq(variants.length)
  })

  it("keeps none of the extra fields it was handed: a spec cannot smuggle in a function", async () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) } as KeyDeriverSpec
    const derived = await argon2idDeriver(smuggled).deriveKeyBytes('pw', new Uint8Array(16))
    expect(derived).to.not.deep.equal(new Uint8Array(32))
  })

  it("makes the deriver of the supplied spec that argon2idWebV1Deriver is", () => {
    expect(specOf(argon2idDeriver(Argon2idWebV1))).to.deep.equal(specOf(argon2idWebV1Deriver))
  })

  it("takes a spec of the host's own, under its own label, as its example shows", () => {
    const deriver = argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
    expect(deriver.key_deriver_label).to.eq('acme_argon2id_v1')
    expect(deriver.memory_kib).to.eq(131_072)
  })

  it("refuses a spec Argon2id cannot run, before deriving anything", () => {
    expect(() => argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 }))
      .to.throw(/salt_bytes/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("refuses what is no spec at all, however sloppy", () => {
    for (const notSpec of [undefined, null, 'argon2id_web_v1', 65_536]) {
      expect(TH.expectSyncRefusal(() => argon2idDeriver(notSpec as unknown as KeyDeriverSpec), 'bad_option').message).to.include('memory_kib')
    }
  })

  it("refuses the supplied spec's label on other parameters, and a reserved label of no spec", () => {
    expect(TH.expectSyncRefusal(() => argon2idDeriver({ ...Argon2idWebV1, iterations: 4 }), 'bad_option').message).to.include('argon2id_web_v1')
    expect(TH.expectSyncRefusal(() => argon2idDeriver({ ...CheapSpec, key_deriver_label: 'argon2id_web_v2' }), 'bad_option').message).to.match(/reserved/u)
  })

  it("allows the foolish but workable, and derives under it: Argon2id's least memory, one pass and the shortest salt", async () => {
    const deriver = argon2idDeriver({ ...CheapSpec, memory_kib: 8, iterations: 1, parallelism: 1, salt_bytes: 8 })
    expect(await deriver.deriveKeyBytes('pw', new Uint8Array(8))).to.have.lengthOf(32)
  })

  it("allows the largest of each bound", () => {
    const lavish = { ...CheapSpec, memory_kib: 1_048_576, iterations: (2 ** 32) - 1, parallelism: 131_072, salt_bytes: MaxSaltBytes }
    expect(specOf(argon2idDeriver(lavish))).to.deep.equal(lavish)
  })
})

describe("a deriver's salt", () => {
  const Misfits = [
    [new Uint8Array(0),   'an empty salt'],
    [new Uint8Array(15),  'a salt one byte short'],
    [new Uint8Array(17),  'a salt one byte long'],
  ] as const

  for (const [salt, blurb] of Misfits) {
    it(`is refused by argon2idWebV1Deriver as bad_option, before it derives: ${blurb}`, async () => {
      await expect(argon2idWebV1Deriver.deriveKeyBytes('pw', salt)).rejects.toSatisfy((err: unknown) => isVaultError(err, 'bad_option'))
    })

    it(`is refused by a deriver of a host's spec as bad_option: ${blurb}`, async () => {
      await expect(argon2idDeriver(CheapSpec).deriveKeyBytes('pw', salt)).rejects.toSatisfy((err: unknown) => isVaultError(err, 'bad_option'))
    })
  }

  it("is taken at the spec's own length, whatever that is: 8 for a spec asking 8", async () => {
    const deriver = argon2idDeriver({ ...CheapSpec, salt_bytes: 8 })
    expect(await deriver.deriveKeyBytes('pw', new Uint8Array(8))).to.have.lengthOf(32)
    await expect(deriver.deriveKeyBytes('pw', new Uint8Array(16))).rejects.toSatisfy((err: unknown) => isVaultError(err, 'bad_option'))
  })
})

// The bounds in shapes.ts are Argon2id's and the library's own, not ours: these hold them to it.
describe("the limits argon2idDeriver's bounds stand on", () => {
  it("@noble/hashes refuses a salt under 8 bytes, and takes 8", async () => {
    const opts = { m: 8, t: 1, p: 1, dkLen: PassphraseKeyBytes } // eslint-disable-line id-length -- noble's option names
    await expect(argon2idAsync('pw', new Uint8Array(7), opts)).rejects.toThrow(/salt/u)
    expect(await argon2idAsync('pw', new Uint8Array(8), opts)).to.have.lengthOf(PassphraseKeyBytes)
  })

  it("@noble/hashes refuses memory past 1 GiB, before allocating any", async () => {
    await expect(argon2idAsync('pw', new Uint8Array(16), { m: 1_048_580, t: 1, p: 1 })).rejects.toThrow(/maxmem/u) // eslint-disable-line id-length -- noble's option names
  })
})

// These run the real Argon2id at the supplied spec: 64 MiB and three passes each, roughly half a second apiece.
describe("argon2idWebV1Deriver", () => {
  it("carries the supplied spec whole", () => {
    expect(specOf(argon2idWebV1Deriver)).to.deep.equal(Argon2idWebV1)
  })

  // Three full derivations; a slow CI runner takes several times the local half-second apiece.
  it("derives 32 deterministic bytes, and a different salt lands somewhere else entirely, as its example shows", { timeout: 60_000 }, async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const otherSalt = new Uint8Array(16).fill(8)
    const once = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    const again = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', saltBytes)
    const elsewhere = await argon2idWebV1Deriver.deriveKeyBytes('correct horse battery staple', otherSalt)
    expect(once).to.have.lengthOf(32)
    expect(once).to.deep.equal(again)
    expect(once).to.not.deep.equal(elsewhere)
  })
})

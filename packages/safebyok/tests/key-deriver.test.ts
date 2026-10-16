import { argon2idAsync } from '@noble/hashes/argon2.js'
import { describe, expect, it, vi } from 'vitest'
import { makeVaultKey, unwrapKeyUnder, wrapKeyUnder } from '../src/crypto'
import { Argon2idKeyDeriver, KeyDeriver, argon2idDeriver, argon2idWebV1Deriver } from '../src/key-deriver'
import { Argon2idWebV1, MaxSaltBytes, PassphraseKeyBytes, type Argon2idSpec, type KeyDeriverSpec } from '../src/key-deriver-spec'
import { isVaultError } from '../src/errors'
import * as TH from './test-helpers'

/** An Argon2id spec of the host's own, cheap to derive under; no two of its counts alike, so a swap shows. */
const CheapSpec: Argon2idSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

/** The message of the 'bad_option' refusal `attempt` throws. */
const refusalOf = (attempt: () => unknown): string => TH.expectSyncRefusal(attempt, 'bad_option').message

/** `count` bytes of `filler`, as an array to compare a view's bytes with. */
const bytesOf = (filler: number, count: number): number[] => Array.from({ length: count }, () => filler)

/** The @example's deriver of another algorithm: scrypt by its label, the test digest by its runner. */
class ScryptDeriver extends KeyDeriver {
  constructor() { super({ algorithm: 'scrypt', key_deriver_label: 'acme_scrypt_v1', salt_bytes: 16 }) }
  protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array) {
    return TH.digestDerivation(passphrase, saltBytes)
  }
}

/** The @example's other Argon2id implementation: `@noble/hashes` again, called the way a native one would be. */
class NativeArgon2idDeriver extends Argon2idKeyDeriver {
  protected doDeriveKeyBytes(passphrase: string, saltBytes: Uint8Array) {
    const { memory_kib, iterations, parallelism, output_bytes } = this.spec
    return argon2idAsync(passphrase, saltBytes, { m: memory_kib, t: iterations, p: parallelism, dkLen: output_bytes }) // eslint-disable-line id-length -- noble's option names
  }
}

describe("KeyDeriver", () => {
  it("is a whole deriver once a subclass supplies its spec and its runner: the @example's scrypt", async () => {
    const deriver = new ScryptDeriver()
    expect(deriver.key_deriver_label).to.eq('acme_scrypt_v1')
    expect(deriver.algorithm).to.eq('scrypt')
    expect(deriver.salt_bytes).to.eq(16)
    const saltBytes = new Uint8Array(16).fill(3)
    expect(await deriver.deriveKeyBytes('pw', saltBytes)).to.deep.equal(await TH.digestDerivation('pw', saltBytes))
  })

  it("keeps its spec as a frozen copy, so changing the one handed in changes nothing", () => {
    const spec = { algorithm: 'sha256', key_deriver_label: 'acme_digest_v1', salt_bytes: 8 }
    const deriver = new TH.TestDeriver(spec)
    spec.salt_bytes = 99
    expect(deriver.spec).to.deep.equal({ algorithm: 'sha256', key_deriver_label: 'acme_digest_v1', salt_bytes: 8 })
    expect(deriver.salt_bytes).to.eq(8)
    expect(deriver.spec).to.be.frozen
  })

  const UnfitSpecs = [
    // what every deriver says of itself:
    [{ algorithm: '' },                        'algorithm',          'an algorithm of no name'],
    [{ algorithm: 7 },                         'algorithm',          'an algorithm that is not text'],
    [{ key_deriver_label: '' },                'key_deriver_label',  'no label for a vault to record'],
    [{ key_deriver_label: null },              'key_deriver_label',  'a label that is not text'],
    // salts the platform cannot hand out:
    [{ salt_bytes: 0 },                        'salt_bytes',         'a salt of no bytes'],
    [{ salt_bytes: 1.5 },                      'salt_bytes',         'a salt of a fraction of a byte'],
    [{ salt_bytes: MaxSaltBytes + 1 },         'salt_bytes',         'a salt longer than getRandomValues hands out at once'],
    [{ salt_bytes: '16' },                     'salt_bytes',         'a salt length that is only text'],
  ] as const

  for (const [change, field, blurb] of UnfitSpecs) {
    it(`refuses, as it is made, ${blurb}, naming the field`, () => {
      expect(refusalOf(() => new TH.TestDeriver(change as unknown as Partial<KeyDeriverSpec>))).to.include(field)
    })
  }

  it("allows a foolish salt of one byte, and the longest the platform's random source hands out", () => {
    for (const saltBytes of [1, MaxSaltBytes]) {
      expect(new TH.TestDeriver({ salt_bytes: saltBytes }).salt_bytes).to.eq(saltBytes)
    }
  })

  const Reserved = [
    ["argon2id_web_v2",     'a spec safebyok may supply later'],
    ["Argon2id_Web_acme",   'the prefix in another case'],
    ["argon2id_web_v1",     'the supplied label, on a deriver carrying none of its parameters'],
  ] as const

  for (const [label, blurb] of Reserved) {
    it(`refuses a label safebyok reserves, as it is made: ${blurb}`, () => {
      expect(refusalOf(() => new TH.TestDeriver({ key_deriver_label: label }))).to.match(/argon2id_web_/u)
    })
  }

  for (const algorithm of ['argon2id', 'Argon2id']) {
    it(`refuses algorithm '${algorithm}' outside the Argon2id family, whose floors it would skip`, () => {
      expect(refusalOf(() => new TH.TestDeriver({ algorithm }))).to.include('Argon2idKeyDeriver')
    })
  }
})

describe("KeyDeriver.deriveKeyBytes", () => {
  const Misfits = [
    [new Uint8Array(0),   'an empty salt'],
    [new Uint8Array(15),  'a salt one byte short'],
    [new Uint8Array(17),  'a salt one byte long'],
  ] as const

  for (const [salt, blurb] of Misfits) {
    it(`refuses a salt of another length than the spec's as bad_option, before the runner sees it: ${blurb}`, async () => {
      const runner = vi.fn(TH.digestDerivation)
      await TH.expectRefusal(new TH.TestDeriver({}, runner).deriveKeyBytes('pw', salt), 'bad_option')
      expect(runner).not.toHaveBeenCalled()
    })
  }

  it("hands back the runner's own bytes, untouched", async () => {
    const handed = new Uint8Array(32).fill(4)
    const keyBytes = await new TH.TestDeriver({}, () => Promise.resolve(handed)).deriveKeyBytes('pw', new Uint8Array(16))
    expect(keyBytes.buffer).to.eq(handed.buffer)
    expect([...keyBytes]).to.deep.equal(bytesOf(4, 32))
  })

  it("refuses as bad_option what is not 32 bytes of a view at all", async () => {
    for (const handed of [new Uint8Array(31), new Uint8Array(33), 'thirty-two bytes, honest', null, new ArrayBuffer(32)]) {
      const deriver = new TH.TestDeriver({}, () => Promise.resolve(handed as unknown as Uint8Array))
      await TH.expectRefusal(deriver.deriveKeyBytes('pw', new Uint8Array(16)), 'bad_option')
    }
  })

  it("zeroes bytes it refuses for their length", async () => {
    const long = new Uint8Array(64).fill(5)
    await TH.expectRefusal(new TH.TestDeriver({}, () => Promise.resolve(long)).deriveKeyBytes('pw', new Uint8Array(16)), 'bad_option')
    expect([...long]).to.deep.equal(bytesOf(0, 64))
  })

  it("refuses bytes in shared memory as bad_option, saying so, quoting nothing and touching nothing", async () => {
    const shared = new Uint8Array(new SharedArrayBuffer(32)).fill(5)
    const err = await TH.expectRefusal(new TH.TestDeriver({}, () => Promise.resolve(shared)).deriveKeyBytes('pw', new Uint8Array(16)), 'bad_option')
    expect(err.message).to.include('SharedArrayBuffer')
    expect(err.message).to.not.include('5,5')
    expect([...shared]).to.deep.equal(bytesOf(5, 32))
  })

  it("refuses 32 zero bytes as bad_option, a key anyone could rebuild", async () => {
    const zeroed = new Uint8Array(32)
    const err = await TH.expectRefusal(new TH.TestDeriver({}, () => Promise.resolve(zeroed)).deriveKeyBytes('pw', new Uint8Array(16)), 'bad_option')
    expect(err.message).to.match(/zero bytes/u)
  })
})

describe("KeyDeriver.passphraseKeyOf", () => {
  it("makes a passphraseKey that cannot be exported, as the @example", async () => {
    const passphraseKey = await TH.testDeriver.passphraseKeyOf('correct horse battery staple', new Uint8Array(16))
    expect(passphraseKey.extractable).to.be.false
    expect(passphraseKey.usages).to.have.members(['wrapKey', 'unwrapKey'])
  })

  it("makes the same key of the same passphrase and salt, and another of another passphrase", async () => {
    const saltBytes = new Uint8Array(16).fill(2)
    const ctx = new Uint8Array(1)
    const usages = { extractable: false, usage: ['wrapKey'] } as const
    const wrapped = await wrapKeyUnder(await TH.testDeriver.passphraseKeyOf('pw', saltBytes), await makeVaultKey(), ctx)
    const unwrapped = await unwrapKeyUnder(await TH.testDeriver.passphraseKeyOf('pw', saltBytes), wrapped, ctx, usages)
    expect(unwrapped.type).to.eq('secret')
    await expect(unwrapKeyUnder(await TH.testDeriver.passphraseKeyOf('pW', saltBytes), wrapped, ctx, usages)).rejects.toThrow(DOMException)
  })

  it("zeroes the runner's bytes once they have made the key", async () => {
    const handed: Uint8Array[] = []
    const deriver = new TH.TestDeriver({}, async (passphrase, saltBytes) => {
      const bytes = await TH.digestDerivation(passphrase, saltBytes)
      handed.push(bytes)
      return bytes
    })
    await deriver.passphraseKeyOf('pw', new Uint8Array(16))
    expect([...handed[0] ?? []]).to.deep.equal(bytesOf(0, 32))
  })

  it("zeroes through a view with an offset, touching nothing around it", async () => {
    const backing = new Uint8Array(48).fill(9)
    const deriver = new TH.TestDeriver({}, async (passphrase, saltBytes) => {
      backing.set(await TH.digestDerivation(passphrase, saltBytes), 8)
      return backing.subarray(8, 40)
    })
    await deriver.passphraseKeyOf('pw', new Uint8Array(16))
    expect([...backing.subarray(8, 40)]).to.deep.equal(bytesOf(0, 32))
    expect([...backing.subarray(0, 8)]).to.deep.equal(bytesOf(9, 8))
    expect([...backing.subarray(40)]).to.deep.equal(bytesOf(9, 8))
  })

  it("refuses as deriveKeyBytes does: a salt of another length, and bytes of another", async () => {
    await TH.expectRefusal(TH.testDeriver.passphraseKeyOf('pw', new Uint8Array(15)), 'bad_option')
    await TH.expectRefusal(new TH.TestDeriver({}, () => Promise.resolve(new Uint8Array(16))).passphraseKeyOf('pw', new Uint8Array(16)), 'bad_option')
  })
})

describe("Argon2idKeyDeriver", () => {
  it("stands in for argon2idWebV1Deriver when it carries the supplied spec whole: the @example's native deriver", () => {
    const keyDeriver = new NativeArgon2idDeriver(Argon2idWebV1)
    expect(keyDeriver.spec).to.deep.equal(Argon2idWebV1)
    expect(keyDeriver.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("derives exactly what argon2idDeriver does at the same spec", async () => {
    const saltBytes = new Uint8Array(16).fill(7)
    const native = await new NativeArgon2idDeriver(CheapSpec).deriveKeyBytes('pw', saltBytes)
    expect(native).to.deep.equal(await argon2idDeriver(CheapSpec).deriveKeyBytes('pw', saltBytes))
  })

  it("refuses the supplied label on other parameters, as the @example says", () => {
    expect(refusalOf(() => new NativeArgon2idDeriver({ ...Argon2idWebV1, iterations: 4 }))).to.include('argon2id_web_v1')
  })

  it("checks Argon2id's floors for any implementation, not only ours", () => {
    expect(refusalOf(() => new NativeArgon2idDeriver({ ...CheapSpec, salt_bytes: 4 }))).to.include('salt_bytes')
  })

  it("may say algorithm 'argon2id', as nothing outside the family may", () => {
    expect(new NativeArgon2idDeriver(CheapSpec).algorithm).to.eq('argon2id')
  })
})

describe("argon2idDeriver", () => {
  it("carries the whole spec, and is frozen, spec and all", () => {
    const deriver = argon2idDeriver(CheapSpec)
    expect(deriver.spec).to.deep.equal(CheapSpec)
    expect(deriver).to.be.frozen
    expect(deriver.spec).to.be.frozen
    expect(deriver).to.be.instanceOf(Argon2idKeyDeriver)
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
    const distinct = new Set(derived.map((bytes) => bytes.join(',')))
    expect(distinct.size).to.eq(variants.length)
  })

  it("keeps none of the extra fields it was handed: a spec cannot smuggle in a function", async () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) } as Argon2idSpec
    const deriver = argon2idDeriver(smuggled)
    expect(deriver.spec).to.not.have.property('deriveKeyBytes')
    expect(await deriver.deriveKeyBytes('pw', new Uint8Array(16))).to.not.deep.equal(new Uint8Array(32))
  })

  it("makes a deriver of the supplied spec too, carrying what argon2idWebV1Deriver does", () => {
    expect(argon2idDeriver(Argon2idWebV1).spec).to.deep.equal(argon2idWebV1Deriver.spec)
  })

  it("takes a spec of the host's own, under its own label", () => {
    const deriver = argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
    expect(deriver.key_deriver_label).to.eq('acme_argon2id_v1')
    expect(deriver.spec.memory_kib).to.eq(131_072)
  })

  it("refuses a spec Argon2id cannot run, before deriving anything", () => {
    expect(() => argon2idDeriver({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 }))
      .to.throw(/salt_bytes/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("refuses the supplied spec's label on other parameters", () => {
    expect(() => argon2idDeriver({ ...Argon2idWebV1, iterations: 4 }))
      .to.throw(/argon2id_web_v1/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })
})

const UnworkableSpecs = [
  // salts Argon2id or the platform cannot use:
  [{ salt_bytes: 7 },                        'salt_bytes',   'a salt under 8 bytes, which Argon2id refuses'],
  [{ salt_bytes: 1 },                        'salt_bytes',   'a one-byte salt, which Argon2id refuses'],
  [{ salt_bytes: MaxSaltBytes + 1 },         'salt_bytes',   'a salt longer than getRandomValues hands out at once'],
  [{ salt_bytes: 16.5 },                     'salt_bytes',   'a salt of a fraction of a byte'],
  // memory Argon2id or @noble/hashes cannot use:
  [{ memory_kib: 7 },                        'memory_kib',   'under 8 KiB for its one lane'],
  [{ memory_kib: 64, parallelism: 9 },       'memory_kib',   'under 8 KiB for each of nine lanes'],
  [{ memory_kib: 1_048_577 },                'memory_kib',   'more than the 1 GiB @noble/hashes allocates'],
  [{ memory_kib: Infinity },                 'memory_kib',   'infinite memory'],
  // passes and lanes:
  [{ iterations: 0 },                        'iterations',   'no passes over memory'],
  [{ iterations: 2 ** 32 },                  'iterations',   'more passes than Argon2 can count'],
  [{ parallelism: 0 },                       'parallelism',  'no lanes'],
  [{ parallelism: NaN },                     'parallelism',  'lanes that are not a number'],
  // what the vault cannot use, or is not Argon2id:
  [{ output_bytes: 16 },                     'output_bytes', 'a 128-bit key, where the vault needs 256 bits'],
  [{ output_bytes: 64 },                     'output_bytes', 'a key longer than the vault uses'],
  [{ algorithm: 'scrypt' },                  'algorithm',    'another key derivation function'],
  [{ key_deriver_label: '' },                'key_deriver_label', 'no label for a vault to record'],
] as const

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

describe("argon2idDeriver and the reserved labels", () => {
  it("refuses a label of the reserved namespace that safebyok does not supply, however well-formed the spec", () => {
    expect(() => argon2idDeriver({ ...CheapSpec, key_deriver_label: 'argon2id_web_v2' }))
      .to.throw(/reserved/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })
})

describe("argon2idDeriver's bounds", () => {
  for (const [change, field, blurb] of UnworkableSpecs) {
    it(`refuses ${blurb}, naming the field`, () => {
      const message = refusalOf(() => argon2idDeriver({ ...CheapSpec, ...change } as unknown as Argon2idSpec))
      expect(message).to.include(field)
    })
  }

  it("refuses what is not a spec at all, listing what a spec carries", () => {
    for (const notSpec of [undefined, null, 'argon2id_web_v1', 65_536]) {
      expect(refusalOf(() => argon2idDeriver(notSpec as unknown as Argon2idSpec))).to.include('memory_kib')
    }
  })

  it("names the ceiling a count of passes past Argon2's crosses, not only the floor", () => {
    expect(refusalOf(() => argon2idDeriver({ ...CheapSpec, iterations: 2 ** 32 }))).to.include('below 2^32')
  })

  it("refuses a spec with fields missing, naming one", () => {
    const { iterations: _dropped, ...partial } = CheapSpec
    expect(refusalOf(() => argon2idDeriver(partial as Argon2idSpec))).to.include('iterations')
  })

  it("allows the foolish but workable, and derives under it: Argon2id's least memory, one pass and the shortest salt", async () => {
    const flimsy = { ...CheapSpec, memory_kib: 8, iterations: 1, parallelism: 1, salt_bytes: 8 }
    const deriver = argon2idDeriver(flimsy)
    expect(deriver.spec).to.deep.equal(flimsy)
    expect(await deriver.deriveKeyBytes('pw', new Uint8Array(8))).to.have.lengthOf(32)
  })

  it("allows the largest of each bound", () => {
    const lavish = { ...CheapSpec, memory_kib: 1_048_576, iterations: (2 ** 32) - 1, parallelism: 131_072, salt_bytes: MaxSaltBytes }
    expect(argon2idDeriver(lavish).spec).to.deep.equal(lavish)
  })

  it("refuses a spec wearing a supplied label with other parameters", () => {
    expect(refusalOf(() => argon2idDeriver({ ...Argon2idWebV1, memory_kib: 19_456 }))).to.include('argon2id_web_v1')
  })
})

// The bounds above are Argon2id's and the library's own, not ours: these hold them to it.
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

// These run the real Argon2id at the supplied spec: 64 MiB and three passes each, roughly half a
// second apiece. Slow on purpose -- that slowness is the security property under test's cousin.
describe("argon2idWebV1Deriver", () => {
  it("carries the supplied spec whole, frozen", () => {
    expect(argon2idWebV1Deriver.spec).to.deep.equal(Argon2idWebV1)
    expect(argon2idWebV1Deriver.key_deriver_label).to.eq('argon2id_web_v1')
    expect(argon2idWebV1Deriver).to.be.frozen
  })

  // Three full derivations; a slow CI runner takes several times the local half-second apiece.
  it("derives 32 deterministic bytes, and a different salt lands somewhere else entirely", { timeout: 60_000 }, async () => {
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

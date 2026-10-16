import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, MaxSaltBytes, PassphraseKeyBytes, ReservedLabelPrefix, TestDeriverNotice, TestLabelPrefix, ensureKeyDeriverSpec, ensureSaltFits, ensureSuppliedSpecKept, parseArgon2idSpec, type Argon2idSpec, type KeyDeriverSpec } from '../src/key-deriver-spec'
import { VaultError, isVaultError } from '../src/errors'

describe("Argon2idWebV1", () => {
  it("carries its keyDeriverLabel, as the stored format records it", () => {
    expect(Argon2idWebV1.key_deriver_label).to.eq('argon2id_web_v1')
  })

  it("asks for 64 MiB of memory, counted in KiB", () => {
    expect(Argon2idWebV1.memory_kib).to.eq(65_536)
    expect(Argon2idWebV1.memory_kib * 1024).to.eq(64 * 1024 * 1024)
  })

  it("pins every parameter, so its label always means the same derivation", () => {
    expect(Argon2idWebV1).to.deep.equal({
      algorithm:         'argon2id',
      key_deriver_label: 'argon2id_web_v1',
      memory_kib:        65_536,
      iterations:        3,
      parallelism:       1,
      salt_bytes:        16,
      output_bytes:      32,
    })
  })

  it("cannot be altered at runtime", () => {
    expect(Argon2idWebV1).to.be.frozen
    expect(() => { Object.assign(Argon2idWebV1, { iterations: 1 }) }).to.throw(TypeError)
  })
})

/** A deriver's function, for the shape: it is never called. */
const derive = () => Promise.resolve(new Uint8Array(32))

describe("ensureSuppliedSpecKept", () => {
  it("passes a deriver carrying a supplied spec whole", () => {
    const standIn = { ...Argon2idWebV1, deriveKeyBytes: derive }
    expect(() => { ensureSuppliedSpecKept(standIn) }).to.not.throw()
  })

  it("passes a deriver whose label is its own, whatever it carries", () => {
    expect(() => { ensureSuppliedSpecKept({ key_deriver_label: 'test_digest_v0', salt_bytes: 1 }) }).to.not.throw()
    expect(() => { ensureSuppliedSpecKept({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', iterations: 9 }) }).to.not.throw()
  })

  const Impostors = [
    [{ key_deriver_label: 'argon2id_web_v1', salt_bytes: 16 },     'the label alone, without the parameters'],
    [{ ...Argon2idWebV1, iterations: 1 },                          'one parameter changed'],
    [{ ...Argon2idWebV1, salt_bytes: '16' },                       'a parameter of the right look but the wrong type'],
    [{ ...Argon2idWebV1, algorithm: undefined },                   'a parameter missing'],
  ] as const

  for (const [impostor, blurb] of Impostors) {
    it(`refuses the supplied label with ${blurb}`, () => {
      expect(() => { ensureSuppliedSpecKept(impostor) })
        .to.throw(/argon2id_web_v1/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
    })
  }
})

describe("the reserved label namespace", () => {
  const Reserved = [
    ["argon2id_web_v2",         'a spec safebyok may supply one day'],
    ["argon2id_web_acme",       'any suffix at all'],
    ["argon2id_web_",           'the bare prefix'],
    ["ARGON2ID_WEB_V1X",        'whatever the letters\' case'],
    ["Argon2id_Web_v9",         'a mixed case'],
  ] as const

  for (const [label, blurb] of Reserved) {
    it(`refuses ${blurb}, saying the prefix is reserved`, () => {
      expect(() => { ensureSuppliedSpecKept({ key_deriver_label: label }) })
        .to.throw(/reserved/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
    })
  }

  const Free = [
    ["acme_argon2id_v1",     'a label of a host\'s own'],
    ["argon2id_web",         'the prefix without its last underscore'],
    ["my_argon2id_web_v1",   'the prefix in the middle'],
    ["argon2id_wasm_v1",     'a neighbouring name'],
  ] as const

  for (const [label, blurb] of Free) {
    it(`leaves ${blurb} alone`, () => {
      expect(() => { ensureSuppliedSpecKept({ key_deriver_label: label }) }).to.not.throw()
    })
  }

  it("still lets the supplied label itself through with its parameters", () => {
    expect(() => { ensureSuppliedSpecKept(Argon2idWebV1) }).to.not.throw()
  })

  it("is refused by parseArgon2idSpec too, a well-formed spec notwithstanding", () => {
    expect(() => parseArgon2idSpec({ ...Argon2idWebV1, key_deriver_label: 'argon2id_web_v2' }))
      .to.throw(/reserved/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("is spelled, as a constant, the way the label begins", () => {
    expect(Argon2idWebV1.key_deriver_label.startsWith(ReservedLabelPrefix)).to.be.true
  })
})

/** Expect `attempt` to throw a VaultError of kind 'bad_option'; hands back its message. */
const refusalOf = (attempt: () => unknown): string => {
  try {
    attempt()
  } catch (err) {
    expect(err).to.be.instanceOf(VaultError)
    expect((err as VaultError).kind).to.eq('bad_option')
    return (err as VaultError).message
  }
  throw new Error("expected a VaultError of kind 'bad_option', but nothing was thrown")
}

/** A spec of another algorithm, as a host's scrypt deriver would be made with. */
const ScryptSpec: KeyDeriverSpec = { algorithm: 'scrypt', key_deriver_label: 'acme_scrypt_v1', salt_bytes: 16 }

describe("ensureKeyDeriverSpec", () => {
  it("passes a spec of any algorithm with a label and a salt length, as the @example", () => {
    expect(() => { ensureKeyDeriverSpec(ScryptSpec) }).to.not.throw()
    expect(() => { ensureKeyDeriverSpec(Argon2idWebV1) }).to.not.throw()
  })

  it("refuses a salt of no bytes, naming the field, as the @example", () => {
    expect(refusalOf(() => { ensureKeyDeriverSpec({ ...ScryptSpec, salt_bytes: 0 }) })).to.include('salt_bytes')
  })

  it("refuses what is not a spec at all, listing what a spec carries", () => {
    for (const notSpec of [undefined, null, 'acme_scrypt_v1', 16]) {
      expect(refusalOf(() => { ensureKeyDeriverSpec(notSpec as unknown as KeyDeriverSpec) })).to.include('key_deriver_label')
    }
  })

  it("refuses a label safebyok reserves", () => {
    expect(refusalOf(() => { ensureKeyDeriverSpec({ ...ScryptSpec, key_deriver_label: 'argon2id_web_v7' }) })).to.include('reserved')
  })

  it("never quotes what it was handed", () => {
    const message = refusalOf(() => { ensureKeyDeriverSpec({ ...ScryptSpec, algorithm: '', key_deriver_label: 'sk-ant-fake-label' }) })
    expect(message).to.not.include('sk-ant-fake')
  })
})

/** An Argon2id spec of the host's own, cheap to derive under. */
const CheapSpec: Argon2idSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

// Every Argon2idKeyDeriver checks its spec with this, so its bounds and refusals are the same for
// every implementation; key-deriver.test.ts runs the whole table of bounds through argon2idDeriver.
describe("parseArgon2idSpec", () => {
  it("hands back a host's own spec, checked, as the @example", () => {
    const spec = parseArgon2idSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
    expect(spec).to.deep.equal({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
  })

  it("keeps nothing but a spec's fields", () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) } as Argon2idSpec
    expect(parseArgon2idSpec(smuggled)).to.deep.equal(CheapSpec)
  })

  it("refuses a salt Argon2id cannot take, naming the field, as the @example", () => {
    const message = refusalOf(() => parseArgon2idSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 }))
    expect(message).to.include('salt_bytes')
  })

  it("refuses another algorithm, pointing a deriver of it at KeyDeriver", () => {
    expect(refusalOf(() => parseArgon2idSpec({ ...CheapSpec, algorithm: 'scrypt' } as unknown as Argon2idSpec))).to.include('extends KeyDeriver')
  })

  it("refuses the supplied spec's label on other parameters", () => {
    expect(refusalOf(() => parseArgon2idSpec({ ...Argon2idWebV1, parallelism: 4 }))).to.include('argon2id_web_v1')
  })
})

describe("ensureSaltFits", () => {
  it("takes a salt of the spec's length", () => {
    expect(() => { ensureSaltFits(Argon2idWebV1, new Uint8Array(16)) }).to.not.throw()
  })

  const Misfits = [
    [0,   'an empty salt'],
    [15,  'a salt one byte short'],
    [17,  'a salt one byte long'],
    [32,  'a salt of another deriver\'s length'],
  ] as const

  for (const [length, blurb] of Misfits) {
    it(`refuses ${blurb}, naming both lengths and never the salt`, () => {
      const salt = new Uint8Array(length).fill(0xAB)
      let refused: unknown
      try { ensureSaltFits(Argon2idWebV1, salt) } catch (err) { refused = err }
      expect(isVaultError(refused, 'bad_option')).to.be.true
      const { message } = refused as Error
      expect(message).to.include('16 bytes').and.to.include(String(length))
      expect(message).to.not.include('171')
    })
  }
})

describe("the test deriver's notice", () => {
  it("names the test_ label it is about and says what to do", () => {
    expect(TestLabelPrefix).to.eq('test_')
    expect(TestDeriverNotice).to.include('test_').and.to.include('argon2idWebV1Deriver')
  })
})

// These bounds are the platform's own, not ours: these hold them to it.
describe("the limits a key deriver stands on", () => {
  it("getRandomValues hands out MaxSaltBytes at once, and no more", () => {
    expect(crypto.getRandomValues(new Uint8Array(MaxSaltBytes))).to.have.lengthOf(MaxSaltBytes)
    expect(() => crypto.getRandomValues(new Uint8Array(MaxSaltBytes + 1))).to.throw(DOMException)
  })

  it("a passphraseKey is 32 bytes, the 256 bits of an AES-256 key", () => {
    expect(PassphraseKeyBytes * 8).to.eq(256)
  })
})

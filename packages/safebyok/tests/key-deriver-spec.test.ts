import { describe, expect, it } from 'vitest'
import { Argon2idWebV1, MaxSaltBytes, PassphraseKeyBytes, ReservedLabelPrefix, TestDeriverNotice, TestLabelPrefix, ensureSaltFits, ensureSuppliedSpecKept, parseKeyDeriverSpec } from '../src/key-deriver-spec'
import { isVaultError } from '../src/errors'

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

  it("is refused by parseKeyDeriverSpec too, a well-formed spec notwithstanding", () => {
    expect(() => parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'argon2id_web_v2' }))
      .to.throw(/reserved/u).that.satisfies((err: unknown) => isVaultError(err, 'bad_option'))
  })

  it("is spelled, as a constant, the way the label begins", () => {
    expect(Argon2idWebV1.key_deriver_label.startsWith(ReservedLabelPrefix)).to.be.true
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

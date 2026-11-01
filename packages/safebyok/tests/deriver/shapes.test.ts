import { describe, expect, it } from 'vitest'
import { MaxSaltBytes, PassphraseKeyBytes } from '../../src/consts'
import { Argon2idWebV1, ReservedLabelPrefix, SuppliedSpecs, TestLabelPrefix, keyDeriverSpec, type KeyDeriverSpec } from '../../src/deriver/shapes'
import * as TH from '../test-helpers'

/** A spec of the host's own, cheap to derive under; no two of its counts alike, so a swap shows. */
const CheapSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

describe("Argon2idWebV1", () => {
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

  it("asks for 64 MiB of memory, counted in KiB", () => {
    expect(Argon2idWebV1.memory_kib * 1024).to.eq(64 * 1024 * 1024)
  })

  it("cannot be altered at runtime", () => {
    expect(Argon2idWebV1).to.be.frozen
    expect(() => { Object.assign(Argon2idWebV1, { iterations: 1 }) }).to.throw(TypeError)
  })

  it("is the one spec safebyok supplies, in a list as frozen", () => {
    expect(SuppliedSpecs).to.deep.equal([Argon2idWebV1])
    expect(SuppliedSpecs).to.be.frozen
  })

  it("wears a label in the reserved namespace, and no test label", () => {
    expect(Argon2idWebV1.key_deriver_label.startsWith(ReservedLabelPrefix)).to.be.true
    expect(Argon2idWebV1.key_deriver_label.startsWith(TestLabelPrefix)).to.be.false
    expect(TestLabelPrefix).to.eq('test_')
  })
})

const UnworkableSpecs = [
  // salts Argon2id or the platform cannot use:
  [{ salt_bytes: 7 },                  'salt_bytes',        'a salt under 8 bytes, which Argon2id refuses'],
  [{ salt_bytes: 1 },                  'salt_bytes',        'a one-byte salt, which Argon2id refuses'],
  [{ salt_bytes: MaxSaltBytes + 1 },   'salt_bytes',        'a salt longer than getRandomValues hands out at once'],
  [{ salt_bytes: 16.5 },               'salt_bytes',        'a salt of a fraction of a byte'],
  // memory Argon2id or @noble/hashes cannot use:
  [{ memory_kib: 7 },                  'memory_kib',        'under 8 KiB for its one lane'],
  [{ memory_kib: 64, parallelism: 9 }, 'memory_kib',        'under 8 KiB for each of nine lanes'],
  [{ memory_kib: 1_048_577 },          'memory_kib',        'more than the 1 GiB @noble/hashes allocates'],
  [{ memory_kib: Infinity },           'memory_kib',        'infinite memory'],
  // passes and lanes:
  [{ iterations: 0 },                  'iterations',        'no passes over memory'],
  [{ iterations: 2 ** 32 },            'iterations',        'more passes than Argon2 can count'],
  [{ parallelism: 0 },                 'parallelism',       'no lanes'],
  [{ parallelism: NaN },               'parallelism',       'lanes that are not a number'],
  // what the vault cannot use, or is not Argon2id:
  [{ output_bytes: 16 },               'output_bytes',      'a 128-bit key, where the vault needs 256 bits'],
  [{ output_bytes: 64 },               'output_bytes',      'a key longer than the vault uses'],
  [{ algorithm: 'scrypt' },            'algorithm',         'another key derivation function'],
  [{ key_deriver_label: '' },          'key_deriver_label', 'no label for a vault to record'],
] as const

describe("keyDeriverSpec", () => {
  it("parses the supplied spec and a host's own, handing back a spec's fields alone", () => {
    expect(keyDeriverSpec.parse(Argon2idWebV1)).to.deep.equal(Argon2idWebV1)
    const smuggled = { ...CheapSpec, deriveKeyBytes: () => Promise.resolve(new Uint8Array(32)) }
    expect(keyDeriverSpec.parse(smuggled)).to.deep.equal(CheapSpec)
  })

  for (const [change, field, blurb] of UnworkableSpecs) {
    it(`refuses ${blurb} as 'bad_option', naming the field`, () => {
      const { message } = TH.expectSyncRefusal(() => keyDeriverSpec.parse({ ...CheapSpec, ...change }), 'bad_option')
      expect(message).to.include(field)
    })
  }

  it("refuses what is no spec at all, listing what a spec carries", () => {
    for (const notSpec of [undefined, null, 'argon2id_web_v1', 65_536]) {
      expect(TH.expectSyncRefusal(() => keyDeriverSpec.parse(notSpec), 'bad_option').message).to.include('memory_kib')
    }
  })

  it("refuses a spec with a field missing, naming it", () => {
    const { iterations: _dropped, ...partial } = CheapSpec
    expect(TH.expectSyncRefusal(() => keyDeriverSpec.parse(partial), 'bad_option').message).to.include('iterations')
  })

  it("names the ceiling a count of passes past Argon2's crosses, not only the floor", () => {
    const { message } = TH.expectSyncRefusal(() => keyDeriverSpec.parse({ ...CheapSpec, iterations: 2 ** 32 }), 'bad_option')
    expect(message).to.match(/^iterations: .*4294967296/u)
  })

  it("allows the foolish but workable: Argon2id's least memory, one pass and the shortest salt", () => {
    const flimsy = { ...CheapSpec, memory_kib: 8, iterations: 1, parallelism: 1, salt_bytes: 8 }
    expect(keyDeriverSpec.parse(flimsy)).to.deep.equal(flimsy)
  })

  it("allows the largest of each bound", () => {
    const lavish = { ...CheapSpec, memory_kib: 1_048_576, iterations: (2 ** 32) - 1, parallelism: 131_072, salt_bytes: MaxSaltBytes }
    expect(keyDeriverSpec.parse(lavish)).to.deep.equal(lavish)
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

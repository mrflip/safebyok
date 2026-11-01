import { describe, expect, it } from 'vitest'
import { type KeyDeriver, checkKeyDeriver, checkSaltFits, checkSuppliedSpecUnchanged, isTestDeriver, parseKeyDeriverSpec } from '../../src/deriver/basederiver'
import { Argon2idWebV1, type KeyDeriverSpec } from '../../src/deriver/shapes'
import { isVaultError } from '../../src/errors'
import * as TH from '../test-helpers'

/** A deriver's function, for the shape: it is never called. */
const derive = () => Promise.resolve(new Uint8Array(32))

const CheapSpec: KeyDeriverSpec = { ...Argon2idWebV1, key_deriver_label: 'acme_cheap_v1', memory_kib: 64, iterations: 2, parallelism: 4 }

describe("checkSuppliedSpecUnchanged", () => {
  it("passes a deriver carrying a supplied spec whole", () => {
    const standIn = { ...Argon2idWebV1, deriveKeyBytes: derive }
    expect(() => { checkSuppliedSpecUnchanged(standIn) }).to.not.throw()
  })

  it("passes a deriver whose label is its own, whatever it carries", () => {
    expect(() => { checkSuppliedSpecUnchanged({ key_deriver_label: 'test_digest_v0' }) }).to.not.throw()
    const relabelled = { ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', iterations: 9 }
    expect(() => { checkSuppliedSpecUnchanged(relabelled) }).to.not.throw()
  })

  const Impostors = [
    [{ key_deriver_label: 'argon2id_web_v1', salt_bytes: 16 },     'the label alone, without the parameters'],
    [{ ...Argon2idWebV1, iterations: 1 },                          'one parameter changed'],
    [{ ...Argon2idWebV1, salt_bytes: '16' },                       'a parameter of the right look but the wrong type'],
    [{ ...Argon2idWebV1, algorithm: undefined },                   'a parameter missing'],
  ] as const

  for (const [impostor, blurb] of Impostors) {
    it(`refuses the supplied label with ${blurb}`, () => {
      const { message } = TH.expectSyncRefusal(() => { checkSuppliedSpecUnchanged(impostor) }, 'bad_option')
      expect(message).to.include('argon2id_web_v1')
    })
  }

  const Reserved = [
    ["argon2id_web_v2",    'a spec safebyok may supply one day'],
    ["argon2id_web_acme",  'any suffix at all'],
    ["argon2id_web_",      'the bare prefix'],
    ["ARGON2ID_WEB_V1X",   'whatever the letters\' case'],
    ["Argon2id_Web_v9",    'a mixed case'],
  ] as const

  for (const [label, blurb] of Reserved) {
    it(`refuses ${blurb}, saying the prefix is reserved`, () => {
      expect(TH.expectSyncRefusal(() => { checkSuppliedSpecUnchanged({ key_deriver_label: label }) }, 'bad_option').message).to.match(/reserved/u)
    })
  }

  const Free = [
    ["acme_argon2id_v1",    'a label of a host\'s own'],
    ["argon2id_web",        'the prefix without its last underscore'],
    ["my_argon2id_web_v1",  'the prefix in the middle'],
    ["argon2id_wasm_v1",    'a neighbouring name'],
  ] as const

  for (const [label, blurb] of Free) {
    it(`leaves ${blurb} alone`, () => {
      expect(() => { checkSuppliedSpecUnchanged({ key_deriver_label: label }) }).to.not.throw()
    })
  }
})

describe("parseKeyDeriverSpec", () => {
  it("hands back a host's own spec, as its example shows", () => {
    const spec = parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
    expect(spec).to.deep.equal({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', memory_kib: 131_072 })
  })

  it("keeps nothing but a spec's fields", () => {
    const smuggled = { ...CheapSpec, deriveKeyBytes: derive }
    expect(parseKeyDeriverSpec(smuggled)).to.deep.equal(CheapSpec)
  })

  it("refuses a salt Argon2id cannot take, naming the field", () => {
    const { message } = TH.expectSyncRefusal(() => parseKeyDeriverSpec({ ...Argon2idWebV1, key_deriver_label: 'acme_argon2id_v1', salt_bytes: 4 }), 'bad_option')
    expect(message).to.include('salt_bytes')
  })

  it("refuses a reserved label that safebyok does not supply, a well-formed spec notwithstanding", () => {
    expect(TH.expectSyncRefusal(() => parseKeyDeriverSpec({ ...CheapSpec, key_deriver_label: 'argon2id_web_v2' }), 'bad_option').message).to.match(/reserved/u)
  })

  it("refuses the supplied spec's label on other parameters", () => {
    expect(TH.expectSyncRefusal(() => parseKeyDeriverSpec({ ...Argon2idWebV1, parallelism: 4 }), 'bad_option').message).to.include('argon2id_web_v1')
  })
})

describe("checkKeyDeriver", () => {
  const Acceptable: readonly [KeyDeriver, string][] = [
    [{ ...Argon2idWebV1, deriveKeyBytes: derive },                                  'the supplied spec whole'],
    [{ ...CheapSpec, deriveKeyBytes: derive },                                      'a host\'s own Argon2id spec'],
    [{ key_deriver_label: 'acme_scrypt_v1', salt_bytes: 16, deriveKeyBytes: derive }, 'a deriver of another algorithm, under its own label'],
    [TH.testDeriver,                                                                'a test deriver'],
  ]

  for (const [keyDeriver, blurb] of Acceptable) {
    it(`passes ${blurb}`, () => {
      expect(() => { checkKeyDeriver(keyDeriver) }).to.not.throw()
    })
  }

  const Unacceptable: readonly [KeyDeriver, string][] = [
    [{ ...CheapSpec, salt_bytes: 4, deriveKeyBytes: derive },                             'a declared Argon2id that Argon2id cannot run'],
    [{ key_deriver_label: 'argon2id_web_v1', salt_bytes: 16, deriveKeyBytes: derive },    'the supplied label on a deriver declaring no algorithm'],
    [{ ...Argon2idWebV1, iterations: 1, deriveKeyBytes: derive },                         'the supplied label on other parameters'],
    [{ key_deriver_label: 'argon2id_web_v2', salt_bytes: 16, deriveKeyBytes: derive },    'a reserved label of another algorithm'],
  ]

  for (const [keyDeriver, blurb] of Unacceptable) {
    it(`refuses ${blurb} as 'bad_option'`, () => {
      TH.expectSyncRefusal(() => { checkKeyDeriver(keyDeriver) }, 'bad_option')
    })
  }
})

describe("checkSaltFits", () => {
  it("takes a salt of the spec's length", () => {
    expect(() => { checkSaltFits(Argon2idWebV1, new Uint8Array(16)) }).to.not.throw()
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
      try { checkSaltFits(Argon2idWebV1, salt) } catch (err) { refused = err }
      expect(isVaultError(refused, 'bad_option')).to.be.true
      const { message } = refused as Error
      expect(message).to.include('16 bytes').and.to.include(String(length))
      expect(message).to.not.include('171')
    })
  }
})

describe("isTestDeriver", () => {
  it("is true of a label beginning test_, false of any other", () => {
    expect(isTestDeriver(TH.testDeriver)).to.be.true
    expect(isTestDeriver(Argon2idWebV1)).to.be.false
    expect(isTestDeriver({ key_deriver_label: 'acme_test_v1' })).to.be.false
  })
})

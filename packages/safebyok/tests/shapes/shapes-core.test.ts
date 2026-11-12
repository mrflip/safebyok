import { describe, expect, it } from 'vitest'
import { LOCKED, PassphraseSaltSize } from '../../src/helpers/consts'
import * as Phrases from '../../src/helpers/phrases'
import * as CX from '../../src/shapes/shapes-core'
import * as TH from '../test-helpers'

const WhisperCases = [
  // a whisper is an object, of any JSON inside:
  [{ apiKey: "fake", tier: 2 },       true,   'a plain object, the common case'],
  [{},                                true,   'an empty object'],
  [{ list: ["a", "b"] },              true,   'an array inside it'],
  [{ orgId: null },                   true,   'null inside a structure: real JSON carries it'],
  [{ deep: { list: [1, null] } },     true,   'nesting, arbitrarily'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
  ["sk-ant-api03-fake-fake",          false,  'a bare string'],
  ["",                                false,  'an empty string'],
  [42,                                false,  'a bare number'],
  [true,                              false,  'a bare boolean'],
  [["a", "b"],                        false,  'an array'],
  [null,                              false,  'a bare null: emptying a box is delBox\'s job'],
  [() => 'nope',                      false,  'a function is not data'],
  [new Date(),                        false,  'a Date would silently flatten to {}'],
  [new Map([["a", 1]]),               false,  'a Map would silently flatten to {}'],
  [{ when: new Date() },              false,  'a class instance hiding inside an object'],
] as const

/** What JSON would drop without a word, leaving `{}`: every one refused, or a put of it would replace the secret. */
const SymbolKeyCases = [
  [LOCKED,                                  'LOCKED'],
  [{ ...LOCKED },                           'a copy of LOCKED'],
  [{ deep: { ...LOCKED } },                 'a copy of LOCKED nested in an object'],
  [[{ ...LOCKED }],                         'a copy of LOCKED nested in an array'],
  [{ [Symbol('other')]: 'x' },              'an object with any other symbol key'],
  [{ deep: [{ [Symbol('other')]: 'x' }] },  'another symbol key at depth'],
] as const

describe("whisper and sidecar refusing by kind", () => {
  for (const [candidate, blurb] of SymbolKeyCases) {
    it(`whisper refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => CX.whisper.parse(candidate))
    })
    it(`sidecar refuses ${blurb}`, () => {
      TH.expectSyncRefusal(() => CX.sidecar.parse(candidate))
    })
  }

  it("hands back a copy, never the object it was given, nor anything inside it", () => {
    const given = { apiKey: 'sk-ant-fake', deep: { orgId: null } }
    const parsed = CX.whisper.parse(given) as typeof given
    expect(parsed).to.deep.equal(given)
    expect(parsed).to.not.eq(given)
    expect(parsed.deep).to.not.eq(given.deep)
    given.apiKey = 'sk-ant-changed'
    expect(parsed.apiKey).to.eq('sk-ant-fake')
  })

  it("quotes nothing of what it was handed, a secret or a field's name, in its message, meta, cause or stack", () => {
    const Marked = [
      { apiKey: 'SECRET-VAL', when: new Date(0) },
      ['SECRET-VAL', undefined],
      { SECRET_KEY: undefined },
      { SECRET_KEY: new Map() },
    ]
    for (const marked of Marked) {
      const err = TH.expectSyncRefusal(() => CX.whisper.parse(marked))
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
    }
  })

  it("refuses a sentinel bag, a copy of one, and one nested inside a whisper", () => {
    expect(TH.expectSyncRefusal(() => CX.whisper.parse(LOCKED)).message).to.include(Phrases.WhisperedIsNoWhisper)
    expect(TH.expectSyncRefusal(() => CX.whisper.parse({ ...LOCKED })).message).to.include(Phrases.WhisperedIsNoWhisper)
    expect(TH.expectSyncRefusal(() => CX.whisper.parse({ deep: { ...LOCKED } })).message).to.include(Phrases.WhisperBagShape)
  })

  for (const [candidate, expected, blurb] of WhisperCases) {
    if (! expected) {
      it(`whisper refuses ${blurb}`, () => {
        TH.expectSyncRefusal(() => CX.whisper.parse(candidate))
      })
    }
  }
})

describe("whisper", () => {
  for (const [candidate, expected, blurb] of WhisperCases) {
    it(blurb, () => { expect(CX.whisper.safeParse(candidate).success).to.eq(expected) })
  }

  // whisper @example
  // Whisper @example 1
  // Whisper @example 2
  it("passes an object and null inside one, and refuses a bare string, a Date and a bare null", () => {
    expect(CX.whisper.parse({ apiKey: 'sk-ant-fake' })).to.deep.equal({ apiKey: 'sk-ant-fake' })
    expect(CX.whisper.safeParse('sk-ant-fake').success).to.be.false
    expect(CX.whisper.safeParse(new Date()).success).to.be.false
    expect(CX.whisper.safeParse(null).success).to.be.false
    expect(CX.whisper.safeParse({ orgId: null }).success).to.be.true
  })

  it("hands back the value unchanged when it passes", () => {
    const bag = { apiKey: 'fake', scopes: ['read', 'write'] }
    expect(CX.whisper.parse(bag)).to.deep.equal(bag)
  })

  it("hands back a copy of an object or array, sharing none of the caller's own", () => {
    const bag = { apiKey: 'fake', scopes: ['read', { tier: 2 }] }
    const checked = CX.whisper.parse(bag) as typeof bag
    expect(checked).to.not.eq(bag)
    expect(checked.scopes[1]).to.not.eq(bag.scopes[1])
  })
})

const SidecarCases = [
  // a JSON object of any JSON values:
  [{ note: "work account" },          true,   'a plain object, the common case'],
  [{},                                true,   'an empty sidecar'],
  [{ list: [1, "two", { three: 3 }], gone: null }, true, 'an object of any JSON values, nested as deep as it likes'],
  // JSON that is no object is refused:
  ["work account",                    false,  'a string'],
  [null,                              false,  'null'],
  [[1, "two", { three: 3 }],          false,  'an array'],
  [42,                                false,  'a number'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
  ["sk-ant-api03-fake-fake",          false,  'a bare string'],
  ["",                                false,  'an empty string'],
  [42,                                false,  'a bare number'],
  [true,                              false,  'a bare boolean'],
  [["a", "b"],                        false,  'an array'],
  [{ when: new Date() },              false,  'a Date would silently flatten to {}'],
  [{ count: NaN },             false,  'NaN would silently become null'],
  [() => 'nope',                      false,  'a function is not data'],
] as const

describe("sidecar", () => {
  for (const [candidate, expected, blurb] of SidecarCases) {
    it(blurb, () => { expect(CX.sidecar.safeParse(candidate).success).to.eq(expected) })
  }

  // sidecar @example
  it("passes an object, and refuses a Date inside one and a bare string", () => {
    expect(CX.sidecar.parse({ note: 'work account', project: 'atlas' })).to.deep.equal({ note: 'work account', project: 'atlas' })
    expect(CX.sidecar.safeParse({ when: new Date() }).success).to.be.false
    expect(CX.sidecar.safeParse('work account').success).to.be.false
  })

  it("hands back a copy, sharing none of the caller's own objects", () => {
    const sidecar = { note: 'work account', tags: [{ team: 'atlas' }] }
    const checked = CX.sidecar.parse(sidecar)
    expect(checked).to.deep.equal(sidecar)
    expect(checked).to.not.eq(sidecar)
    expect(checked['tags']).to.not.eq(sidecar.tags)
  })
})

const scope = { user_id: 'u1', banklabel: 'acme', vaultlabel: 'main' }

describe("CX.bankScope, CX.vaultScope and CX.boxscope", () => {
  // CX.vaultScope @example
  it("hand back a frozen copy of the scope a record carries, its other fields left out", () => {
    const vault = { ...scope, vault_tok: 'tok', format: 'safebyok-vault-v1', lock: () => null }
    const parsed = CX.vaultScope.parse(vault)
    expect(parsed).to.deep.equal(scope)
    expect(Object.isFrozen(parsed)).to.be.true
    expect(CX.bankScope.parse(vault)).to.deep.equal({ user_id: 'u1', banklabel: 'acme' })
    expect(CX.boxscope.parse({ ...vault, boxlabel: 'openai' })).to.deep.equal({ ...scope, boxlabel: 'openai' })
  })

  it("leave the scope handed in as it was, unfrozen, handing back a copy", () => {
    const handed = { ...scope }
    const parsed = CX.vaultScope.parse(handed)
    expect(parsed).to.not.eq(handed)
    expect(Object.isFrozen(handed)).to.be.false
  })

  it("read a scope's names through a getter", () => {
    class Wrapper {
      readonly user_id = 'u1'
      readonly #banklabel = 'acme'
      readonly vaultlabel = 'main'
      get banklabel(): string { return this.#banklabel }
    }
    expect(CX.vaultScope.parse(new Wrapper())).to.deep.equal(scope)
  })

  it("refuse a bad boxlabel, naming the field", () => {
    const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'OpenAI' }))
    expect(err.message).to.match(/^boxlabel: A label is lowercase letters, digits and single underscores/)
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("refuse a name missing, or not text, naming each", () => {
    const err = TH.expectSyncRefusal(() => CX.vaultScope.parse({ user_id: 42, banklabel: 'acme' }))
    expect(err.meta?.fieldnames).to.deep.equal(['user_id', 'vaultlabel'])
    TH.expectSyncRefusal(() => CX.vaultScope.parse(null))
    TH.expectSyncRefusal(() => CX.bankScope.parse('acme'))
  })

  it("refuse a name containing the scopepath delimiter, in every place a name goes", () => {
    for (const fieldname of ['user_id', 'banklabel', 'vaultlabel', 'boxlabel']) {
      const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'openai', [fieldname]: 'a^b' }))
      expect(err.meta?.fieldnames).to.deep.equal([fieldname])
      expect(err.message).to.not.include('a^b')
    }
  })
})

const ScopeCases = [
  // regular usage:
  [TH.scopeOf('u1'),                                  true,   'a user_id, a banklabel and a vaultlabel'],
  [TH.scopeOf('user|2fJ8:google'),                    true,   'a user_id in whatever form the host app issues'],
  [TH.scopeOf('u'.repeat(100)),                       true,   'a user_id of a hundred characters, the most it has'],
  // refused, a name failing its check:
  [TH.scopeOf('u'.repeat(101)),                       false,  'a user_id over a hundred characters'],
  [{ ...TH.scopeOf('u1'), banklabel: 'Acme: Ünïcode' },  false,  'an banklabel that is no label'],
  [{ ...TH.scopeOf('u1'), user_id: '' },              false,  'an empty user_id'],
  [{ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' },  false,  'a vaultlabel containing a control character'],
  [{ ...TH.scopeOf('u1'), banklabel: 'cafe\u{301}' },  false,  'an banklabel outside ASCII'],
  // refused:
  [{ ...TH.scopeOf('u1'), banklabel: 42 },             false,  'an banklabel that is not text'],
  [{ user_id: 'u1', banklabel: 'acme' },              false,  'a scope missing its vaultlabel'],
] as const

describe("bankedVaultScope", () => {
  it("takes a vaultlabel alone, or the names a Vault object carries, leaving the rest", () => {
    expect(CX.bankedVaultScope.parse({ vaultlabel: 'main' })).to.deep.equal({ vaultlabel: 'main' })
    expect(CX.bankedVaultScope.parse({ ...scope, vault_tok: 'tok', lock: () => null })).to.deep.equal(scope)
  })

  // bankedVaultScope @example
  it("refuses a vaultDB in the scope, which belongs in the options", () => {
    const err = TH.expectSyncRefusal(() => CX.bankedVaultScope.parse({ vaultlabel: 'main', vaultDB: {} }))
    expect(err.message).to.contain(Phrases.DatabaseInVaultScope)
    expect(err.meta?.fieldnames).to.deep.equal(['vaultDB'])
  })
})

describe("vaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(CX.vaultScope.safeParse(candidate).success).to.eq(expected) })
  }
})

// 16 bytes are 22 unpadded base64url characters, and 32 are 43.
const SaltCases = [
  ["A".repeat(22),              true,   'the 22 characters of 16 bytes'],
  ["-_Az09".repeat(3) + "AAAA", true,   'base64url characters, 22 of them'],
  ["A".repeat(21),              false,  'one character short of 16 bytes'],
  ["A".repeat(23),              false,  'one character past 16 bytes'],
  ["-_Az09".repeat(7) + "A",    false,  'the 43 characters of 32 bytes'],
  ["A".repeat(21) + "+",        false,  'a standard-base64 character'],
  ["A".repeat(21) + "=",        false,  'padding'],
  ["A".repeat(21) + "B",        false,  'stray padding bits in its last character'],
  ["",                          false,  'no text'],
] as const

describe("CX.salt_b64", () => {
  for (const [candidate, expected, blurb] of SaltCases) {
    it(`${expected ? 'takes' : 'refuses'} ${blurb}`, () => { expect(CX.salt_b64.safeParse(candidate).success).to.eq(expected) })
  }

  it("refuses with the sentence that says what a passphrase salt is", () => {
    const refusal = TH.expectSyncRefusal(() => CX.salt_b64.parse('short'), 'bad_record')
    expect(refusal.message).to.include(Phrases.passphraseSaltShape(PassphraseSaltSize, 22))
  })
})

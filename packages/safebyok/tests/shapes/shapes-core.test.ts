import { describe, expect, it } from 'vitest'
import { LOCKED } from '../../src/helpers/consts'
import * as Phrases from '../../src/helpers/phrases'
import * as CX from '../../src/shapes/shapes-core'
import * as TH from '../test-helpers'

const WhisperCases = [
  // every JSON shape a whisper may take:
  ["sk-ant-api03-fake-fake",          true,   'a string, the common case'],
  ["",                                true,   'even an empty string'],
  [42,                                true,   'a number'],
  [true,                              true,   'a boolean'],
  [["a", "b"],                        true,   'an array'],
  [{ apiKey: "fake", tier: 2 },      true,   'a plain object'],
  [{ orgId: null },                   true,   'null inside a structure: real JSON carries it'],
  [{ deep: { list: [1, null] } },     true,   'nesting, arbitrarily'],
  // what JSON cannot carry is refused, not mangled:
  [undefined,                         false,  'undefined is not a JSON value'],
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
    it(`whisper refuses ${blurb} as 'bad_option'`, () => {
      TH.expectSyncRefusal(() => CX.whisper.parse(candidate), 'bad_option')
    })
    it(`sidecar refuses ${blurb} as 'bad_option'`, () => {
      TH.expectSyncRefusal(() => CX.sidecar.parse(candidate), 'bad_option')
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
      const err = TH.expectSyncRefusal(() => CX.whisper.parse(marked), 'bad_option')
      expect(TH.thrownText(err)).to.not.include('SECRET')
      expect(JSON.stringify(err.meta)).to.not.include('SECRET')
    }
  })

  it("says LOCKED itself is no whisper, and of a copy that a whisper has no symbol key", () => {
    expect(TH.expectSyncRefusal(() => CX.whisper.parse(LOCKED), 'bad_option').message).to.include(Phrases.LockedIsNoWhisper)
    expect(TH.expectSyncRefusal(() => CX.whisper.parse({ ...LOCKED }), 'bad_option').message).to.include(Phrases.WhisperShape)
  })

  for (const [candidate, expected, blurb] of WhisperCases) {
    if (! expected) {
      it(`whisper refuses ${blurb} as 'bad_option'`, () => {
        TH.expectSyncRefusal(() => CX.whisper.parse(candidate), 'bad_option')
      })
    }
  }
})

describe("whisper", () => {
  for (const [candidate, expected, blurb] of WhisperCases) {
    it(blurb, () => { expect(CX.whisper.safeParse(candidate).success).to.eq(expected) })
  }

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
  [{ when: new Date() },              false,  'a Date would silently flatten to {}'],
  [{ count: NaN },             false,  'NaN would silently become null'],
  [() => 'nope',                      false,  'a function is not data'],
] as const

describe("sidecar", () => {
  for (const [candidate, expected, blurb] of SidecarCases) {
    it(blurb, () => { expect(CX.sidecar.safeParse(candidate).success).to.eq(expected) })
  }

  it("passes the examples its doc block shows", () => {
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

const scope = { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' }

describe("CX.bankScope, CX.vaultScope and CX.boxscope", () => {
  // CX.vaultScope @example 1
  it("hand back a frozen copy of the scope a record carries, its other fields left out", () => {
    const vault = { ...scope, vault_tok: 'tok', format: 'safebyok-vault-v1', lock: () => null }
    const parsed = CX.vaultScope.parse(vault)
    expect(parsed).to.deep.equal(scope)
    expect(Object.isFrozen(parsed)).to.be.true
    expect(CX.bankScope.parse(vault)).to.deep.equal({ applabel: 'acme', user_id: 'u1' })
    expect(CX.boxscope.parse({ ...vault, boxlabel: 'openai' })).to.deep.equal({ ...scope, boxlabel: 'openai' })
  })

  it("leave the scope handed in as it was, unfrozen, handing back a copy", () => {
    const handed = { ...scope }
    const parsed = CX.vaultScope.parse(handed)
    expect(parsed).to.not.eq(handed)
    expect(Object.isFrozen(handed)).to.be.false
  })

  it("read a scope's names through a getter", () => {
    class Holder {
      readonly #applabel = 'acme'
      readonly user_id = 'u1'
      readonly vaultlabel = 'main'
      get applabel(): string { return this.#applabel }
    }
    expect(CX.vaultScope.parse(new Holder())).to.deep.equal(scope)
  })

  // CX.boxscope @example 2
  it("refuse a bad boxlabel, naming the field", () => {
    const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'OpenAI' }), 'bad_scope')
    expect(err.message).to.match(/^boxlabel: A label is lowercase words/)
    expect(err.meta?.fieldnames).to.deep.equal(['boxlabel'])
  })

  it("refuse a name missing, or not text, naming each", () => {
    const err = TH.expectSyncRefusal(() => CX.vaultScope.parse({ applabel: 'acme', user_id: 42 }), 'bad_scope')
    expect(err.meta?.fieldnames).to.deep.equal(['user_id', 'vaultlabel'])
    TH.expectSyncRefusal(() => CX.vaultScope.parse(null), 'bad_scope')
    TH.expectSyncRefusal(() => CX.bankScope.parse('acme'), 'bad_scope')
  })

  it("refuse a name holding the scopepath delimiter, in every place a name goes", () => {
    for (const fieldname of ['applabel', 'user_id', 'vaultlabel', 'boxlabel']) {
      const err = TH.expectSyncRefusal(() => CX.boxscope.parse({ ...scope, boxlabel: 'openai', [fieldname]: 'a^b' }), 'bad_scope')
      expect(err.meta?.fieldnames).to.deep.equal([fieldname])
      expect(err.message).to.not.include('a^b')
    }
  })
})

const ScopeCases = [
  // regular usage:
  [TH.scopeOf('u1'),                                  true,   'an applabel, a user_id and a vaultlabel'],
  [TH.scopeOf('user|2fJ8:google'),                    true,   'a user_id in whatever form the host app issues'],
  [TH.scopeOf('u'.repeat(100)),                       true,   'a user_id of a hundred characters, the most it holds'],
  // refused, a name failing its check:
  [TH.scopeOf('u'.repeat(101)),                       false,  'a user_id over a hundred characters'],
  [{ ...TH.scopeOf('u1'), applabel: 'Acme: Ünïcode' },  false,  'an applabel that is no label'],
  [{ ...TH.scopeOf('u1'), user_id: '' },              false,  'an empty user_id'],
  [{ ...TH.scopeOf('u1'), vaultlabel: 'tab\there' },  false,  'a vaultlabel holding a control character'],
  [{ ...TH.scopeOf('u1'), applabel: 'cafe\u{301}' },  false,  'an applabel outside ASCII'],
  // refused:
  [{ ...TH.scopeOf('u1'), applabel: 42 },             false,  'an applabel that is not text'],
  [{ applabel: 'acme', user_id: 'u1' },              false,  'a scope missing its vaultlabel'],
] as const

describe("vaultScope", () => {
  for (const [candidate, expected, blurb] of ScopeCases) {
    it(blurb, () => { expect(CX.vaultScope.safeParse(candidate).success).to.eq(expected) })
  }
})

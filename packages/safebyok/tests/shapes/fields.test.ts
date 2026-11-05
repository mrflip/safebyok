import { describe, expect, it } from 'vitest'
import * as BX from '../../src/shapes/fields'
import * as CX from '../../src/shapes/scopes'
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

describe("whisper", () => {
  for (const [candidate, expected, blurb] of WhisperCases) {
    it(blurb, () => { expect(BX.whisper.safeParse(candidate).success).to.eq(expected) })
  }

  it("hands back the value unchanged when it passes", () => {
    const bag = { apiKey: 'fake', scopes: ['read', 'write'] }
    expect(BX.whisper.parse(bag)).to.deep.equal(bag)
  })

  it("hands back a copy of an object or array, sharing none of the caller's own", () => {
    const bag = { apiKey: 'fake', scopes: ['read', { tier: 2 }] }
    const checked = BX.whisper.parse(bag) as typeof bag
    expect(checked).to.not.eq(bag)
    expect(checked.scopes[1]).to.not.eq(bag.scopes[1])
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
    it(blurb, () => { expect(BX.sidecar.safeParse(candidate).success).to.eq(expected) })
  }

  it("passes the examples its doc block shows", () => {
    expect(BX.sidecar.parse({ note: 'work account', project: 'atlas' })).to.deep.equal({ note: 'work account', project: 'atlas' })
    expect(BX.sidecar.safeParse({ when: new Date() }).success).to.be.false
    expect(BX.sidecar.safeParse('work account').success).to.be.false
  })

  it("hands back a copy, sharing none of the caller's own objects", () => {
    const sidecar = { note: 'work account', tags: [{ team: 'atlas' }] }
    const checked = BX.sidecar.parse(sidecar)
    expect(checked).to.deep.equal(sidecar)
    expect(checked).to.not.eq(sidecar)
    expect(checked['tags']).to.not.eq(sidecar.tags)
  })
})

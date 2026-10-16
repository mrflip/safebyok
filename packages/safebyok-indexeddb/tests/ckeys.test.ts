import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Ckeys } from 'safebyok'
import { boxRange } from '../src/ckeys'
import * as TH from './test-helpers'

const caret = Ckeys.joiner()

describe("the ckeys", () => {
  it("keys a bundle and its lockboxes under their kind and scope joined on ^, spelled out because they are stored", () => {
    expect(caret.bundle(TH.scopeOf('u1'))).to.eq('vault^acme^u1^main')
    expect(caret.box(TH.scopeOf('u1'), 'anthropic')).to.eq('box^acme^u1^main^anthropic')
  })
})

describe("boxRange", () => {
  const InsideLabels = ['anthropic', 'a', '\u{FFFE}\u{FFFE}', 'zz"}\\', 'Work: מפתח', 'key \u{1F511}']

  for (const boxlabel of InsideLabels) {
    it(`holds the ckey of a lockbox labelled ${JSON.stringify(boxlabel)}`, () => {
      const ckey = caret.box(TH.scopeOf('u1'), boxlabel)
      expect(boxRange(caret, TH.scopeOf('u1')).includes(ckey)).to.be.true
    })
  }

  const OutsideCases = [
    ['vault^acme^u1^main',                  "the vault's own bundle"],
    ['box^acme^u1^spare^anthropic',         "a lockbox of the user's other vault"],
    ['box^acme^u12^main^anthropic',         'a lockbox of a user whose id starts the same'],
    ['box^acme^u1^mainx^anthropic',         'a lockbox of a vault whose label starts the same'],
    ['unlock^acme^u1^main',                 "a remembered unlock"],
    ['["box","acme","u1","main","x"]',      "a lockbox under an earlier version's ckey"],
  ] as const

  for (const [ckey, blurb] of OutsideCases) {
    it(`holds not ${blurb}`, () => { expect(boxRange(caret, TH.scopeOf('u1')).includes(ckey)).to.be.false })
  }

  it("finds the lockboxes of a user whose id holds a colon, a quote or a comma", () => {
    const odd = TH.scopeOf('u1:"x,')
    expect(boxRange(caret, odd).includes(caret.box(odd, 'anthropic'))).to.be.true
  })

  it("follows the delimiter its joiner joins on, as its example shows for the default", () => {
    const slash = Ckeys.joiner('/')
    const u1 = TH.scopeOf('u1')
    const range = boxRange(slash, u1)
    expect(range.includes(slash.box(u1, 'anthropic'))).to.be.true
    expect(range.includes(caret.box(u1, 'anthropic'))).to.be.false
  })
})

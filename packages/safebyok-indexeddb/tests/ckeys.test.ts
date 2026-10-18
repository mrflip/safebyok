import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Ckeys } from 'safebyok'
import { boxRange } from '../src/ckeys'
import * as TH from './test-helpers'

describe("the ckeys", () => {
  it("keys a bundle and its lockboxes under their kind and scope joined on ^, spelled out because they are stored", () => {
    expect(Ckeys.bundle(TH.scopeOf('u1'))).to.eq('vault^acme^u1^main')
    expect(Ckeys.box(TH.scopeOf('u1'), 'anthropic')).to.eq('box^acme^u1^main^anthropic')
  })
})

describe("boxRange", () => {
  it("lists just this vault's lockboxes, as its example shows", () => {
    const u1 = TH.scopeOf('u1')
    expect(boxRange(u1).includes(Ckeys.box(u1, 'anthropic'))).to.be.true
  })

  const InsideLabels = ['anthropic', 'a', '\u{FFFE}\u{FFFE}', '\u{FFFF}', '\u{FFFF}\u{FFFF}x', 'zz"}\\', 'Work: מפתח', 'key \u{1F511}']

  for (const boxlabel of InsideLabels) {
    it(`holds the ckey of a lockbox labelled ${JSON.stringify(boxlabel)}`, () => {
      const ckey = Ckeys.box(TH.scopeOf('u1'), boxlabel)
      expect(boxRange(TH.scopeOf('u1')).includes(ckey)).to.be.true
    })
  }

  const OutsideCases = [
    ['vault^acme^u1^main',                  "the vault's own bundle"],
    ['box^acme^u1^spare^anthropic',         "a lockbox of the user's other vault"],
    ['box^acme^u12^main^anthropic',         'a lockbox of a user whose id starts the same'],
    ['box^acme^u1^mainx^anthropic',         'a lockbox of a vault whose label starts the same'],
    ['box^acme^u1^main_',                   'the prefix with its ^ raised by one, where the range stops'],
    ['lease^acme^u1^main',                  "a lease"],
    ['["box","acme","u1","main","x"]',      "a lockbox under an earlier version's ckey"],
  ] as const

  for (const [ckey, blurb] of OutsideCases) {
    it(`holds not ${blurb}`, () => { expect(boxRange(TH.scopeOf('u1')).includes(ckey)).to.be.false })
  }

  it("finds the lockboxes of a user whose id holds a colon, a quote or a comma", () => {
    const odd = TH.scopeOf('u1:"x,')
    expect(boxRange(odd).includes(Ckeys.box(odd, 'anthropic'))).to.be.true
  })

})

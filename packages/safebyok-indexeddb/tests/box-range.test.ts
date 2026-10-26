import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { Scopepath } from 'safebyok'
import { boxRange } from '../src/box-range'
import * as TH from './test-helpers'

describe("the scopepaths", () => {
  it("keys a vault's props and its boxes under their kind and scope joined on ^, spelled out because they are stored", () => {
    expect(Scopepath.vault(TH.scopeOf('u1'))).to.eq('vault^acme^u1^main')
    expect(Scopepath.box({ ...TH.scopeOf('u1'), boxlabel: 'anthropic' })).to.eq('box^acme^u1^main^anthropic')
  })
})

describe("boxRange", () => {
  it("lists just this vault's boxes, as its example shows", () => {
    const u1 = TH.scopeOf('u1')
    expect(boxRange(u1).includes(Scopepath.box({ ...u1, boxlabel: 'anthropic' }))).to.be.true
  })

  it("holds the scopepath of a box under the longest boxlabel and the last label in order", () => {
    const u1 = TH.scopeOf('u1')
    for (const boxlabel of ['ab', 'z'.repeat(40), 'z9']) {
      const boxScopepath = Scopepath.box({ ...u1, boxlabel })
      expect(boxRange(u1).includes(boxScopepath)).to.be.true
    }
  })

  // Rows no maker files, which a backend that never checked a name may hold: the range reaches
  // them all the same, so a vault's deletion clears them.
  const InsideTails = ['a', '\u{FFFE}\u{FFFE}', '\u{FFFF}', '\u{FFFF}\u{FFFF}x', 'zz"}\\', 'Work: מפתח', 'key \u{1F511}']

  for (const tail of InsideTails) {
    it(`holds a row under the vault's prefix followed by ${JSON.stringify(tail)}`, () => {
      const scopepath = Scopepath.withinVaultScopepathPrefix(TH.scopeOf('u1')) + tail
      expect(boxRange(TH.scopeOf('u1')).includes(scopepath)).to.be.true
    })
  }

  const OutsideCases = [
    ['vault^acme^u1^main',                  "the vault's own props"],
    ['box^acme^u1^spare^anthropic',         "a box of the user's other vault"],
    ['box^acme^u12^main^anthropic',         'a box of a user whose id starts the same'],
    ['box^acme^u1^mainx^anthropic',         'a box of a vault whose label starts the same'],
    ['box^acme^u1^main_',                   'the prefix with its ^ raised by one, where the range stops'],
    ['lease^acme^u1^main',                  "a lease"],
    ['["box","acme","u1","main","x"]',      "a box under an earlier version's key"],
  ] as const

  for (const [scopepath, blurb] of OutsideCases) {
    it(`holds not ${blurb}`, () => { expect(boxRange(TH.scopeOf('u1')).includes(scopepath)).to.be.false })
  }

  it("finds the boxes of a user whose id holds a colon, a pipe or a percent sign", () => {
    const odd = TH.scopeOf('auth0|u1:x%2C')
    expect(boxRange(odd).includes(Scopepath.box({ ...odd, boxlabel: 'anthropic' }))).to.be.true
  })

})

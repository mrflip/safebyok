import { describe, expect, it } from 'vitest'
import { byCodeUnit, codePointsOf } from '../src/text'

describe("codePointsOf", () => {
  it("keeps a surrogate pair whole, as its first example shows", () => {
    expect(codePointsOf('a😀')).to.deep.equal(['a', '😀'])
  })

  it("counts a lone surrogate as one code point, as its second example shows", () => {
    expect(codePointsOf('\u{D83D}')).to.deep.equal(['\u{D83D}'])
    expect(codePointsOf('x\u{DE00}y')).to.have.lengthOf(3)
  })

  it("keeps a combining mark apart from the letter it follows, and a newline as any other", () => {
    expect(codePointsOf('e\u{301}\n')).to.deep.equal(['e', '\u{301}', '\n'])
  })

  it("makes nothing of the empty string", () => {
    expect(codePointsOf('')).to.deep.equal([])
  })
})

describe("byCodeUnit", () => {
  it("sorts capitals before lowercase, by code unit and not by locale, as its example shows", () => {
    expect(['b', 'B', 'a'].toSorted(byCodeUnit)).to.deep.equal(['B', 'a', 'b'])
  })

  it("sorts a character past the BMP before a high BMP one, as its surrogates' code units are lower", () => {
    expect(['～', '😀'].toSorted(byCodeUnit)).to.deep.equal(['😀', '～'])
  })

  it("answers 0 for equal names, and a prefix sorts first", () => {
    expect(byCodeUnit('main', 'main')).to.eq(0)
    expect(byCodeUnit('main', 'main2')).to.eq(-1)
    expect(byCodeUnit('main2', 'main')).to.eq(1)
  })
})

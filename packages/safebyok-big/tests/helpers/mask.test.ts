import { describe, expect, it } from 'vitest'
import { MaskSchedule, mask } from '../../src/helpers/mask'
import type { MaskOpts } from '../../src/shapes/shapes-utils'
import * as TH from '../test-helpers'

const Alphabet = 'abcdefghijklmnopqrstuvwxyz'
const LongKey = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'

function stars(count: number): string { return '*'.repeat(count) }

const LongMasked = `sk-${stars(17)}wxyz`

// A small seeded generator, so a failure repeats.
function randomCodePoints(count: number, seed: number): string {
  let state = seed
  function next(): number {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state
  }
  return Array.from({ length: count }, () => String.fromCodePoint(next() % 0x11_00_00)).join('')
}

describe("mask", () => {
  type MaskCase = readonly [text: string, opts: MaskOpts | undefined, expected: string, blurb: string]

  const Cases: readonly MaskCase[] = [
    // mask @example 1
    [LongKey,                                         undefined,                                LongMasked,                     'a long key shows its ends, cut to 24 characters'],
    // mask @example 2
    ["hunter2",                                       undefined,                                stars(12),                      'a short text shows only stars, twelve of them'],
    // mask @example 3
    ["abcdefghijklmnop",                              undefined,                                `${stars(18)}op`,               'a middling text shows its last two characters, padded to 20'],
    // mask @example 4
    ["hunter2",                                       { tail: 4 },                              "********ter2",                 'an option overrides its row'],

    // each row, at its bounds:
    ["a",                                             undefined,                                stars(12),                      'one character is twelve stars'],
    ["abcdefghijkl",                                  undefined,                                stars(12),                      'twelve characters, the first bound, show nothing'],
    ["abcdefghijklm",                                 undefined,                                `${stars(18)}lm`,               'thirteen characters show their last two'],
    ["abcdefghijklmnopqrst",                          undefined,                                `${stars(18)}st`,               'twenty characters, the second bound, still come out 20 long'],
    ["abcdefghijklmnopqrstu",                         undefined,                                `ab${stars(19)}stu`,            'twenty-one characters show two at the start and three at the end'],
    [`${Alphabet}012345`,                             undefined,                                `ab${stars(19)}345`,            'thirty-two characters, the third bound, come out 24 long'],
    [`${Alphabet}0123456`,                            undefined,                                `abc${stars(17)}3456`,          'thirty-three characters show three at the start and four at the end'],
    [Alphabet.repeat(15),                             undefined,                                `abc${stars(17)}wxyz`,          'a very long text still comes out 24 long'],

    // what counts:
    ["",                                              undefined,                                "",                             'an empty text has nothing to show'],
    [`${LongKey}\nsecond line`,                       undefined,                                LongMasked,                     'only the first line counts'],
    ["sk-ant-api03-abcdefghij\r\nklmnopqrstuvwxyz",   undefined,                                `sk${stars(19)}hij`,            'a carriage return ends the first line too'],
    [`\n${LongKey}`,                                  undefined,                                "",                             'a text whose first line is empty shows nothing'],
    ["sk-ant- api03-abc\tdefghijklmnopqrstuvwxyz",    undefined,                                LongMasked,                     'spaces and tabs are dropped, and do not count'],
    [`${LongKey}\u{0}\u{1B}\u{7F}`,                   undefined,                                LongMasked,                     'control characters are dropped'],
    [`${LongKey}\u{202E}\u{1F511}`,                   undefined,                                LongMasked,                     'characters beyond ASCII are dropped'],
    ["sk-ant-api03-abcdefghijklmnopqrstuvw\u{202E}xyz", undefined,                              LongMasked,                     'a right-to-left override in the tail is dropped'],
    ["sk-ant-api03-abcdefghijklmnopqrstuvw\u{200B}x\u{200B}yz", undefined,                      LongMasked,                     'zero-width spaces in the tail do not count'],
    ["\u{5D0}\u{5D1}\u{5D2}\u{1F511}",                undefined,                                "",                             'a first line with no ASCII shows nothing'],
    ["caf\u{E9}-latt\u{E9}-grande-extra-hot",         undefined,                                `ca${stars(19)}hot`,            'a precomposed accented letter is dropped whole'],

    // overrides:
    [LongKey,                                         { head: 0, tail: 0 },                     stars(24),                      'head and tail of zero is stars only'],
    [LongKey,                                         { maxLen: Infinity },                     `sk-${stars(32)}wxyz`,          'a maxLen of Infinity never cuts'],
    ["hunter2",                                       { minLen: 0 },                            stars(7),                       'a minLen of zero leaves a short text its own length'],
    ["hunter2",                                       { minLen: 30 },                           stars(30),                      'a larger minLen pads further'],
    ["hunter2",                                       { maxLen: 8 },                            stars(8),                       'a maxLen wins over the row\'s minLen'],
    ["abcdefghijklm",                                 { head: 10, tail: 10 },                   `abcdefghij${stars(7)}klm`,     'a tail that would overlap the head gives way'],
    [LongKey,                                         { maxLen: 9 },                            "sk-**wxyz",                    'a short maxLen takes stars from the middle first'],
    [LongKey,                                         { maxLen: 5 },                            "sk-yz",                        'a maxLen too short for head and tail cuts the tail next'],
    [LongKey,                                         { maxLen: 2 },                            "sk",                           'and the head last'],
    [LongKey,                                         { maxLen: 0 },                            "",                             'a maxLen of zero gives nothing'],
    ["abcdefghijklm",                                 { head: 1000, tail: 1000, minLen: 1000 }, `abcdefghijklm${stars(987)}`,   'the ceilings show a text whole and pad it'],
    ["abcdefghijkl",                                  { head: undefined, tail: 1 },             `${stars(11)}l`,                'an option given as undefined leaves its row\'s field'],
  ]

  for (const [text, opts, expected, blurb] of Cases) {
    it(blurb, () => { expect(mask(text, opts)).to.eq(expected) })
  }

  describe("the schedule", () => {
    const Source = `${Alphabet}${Alphabet.toUpperCase()}0123456789`
    const RowCases = [
      [1,  12,            12, 0, 'texts up to 12 characters come out 12 stars'],
      [13, 20,            20, 2, 'texts of 13 to 20 characters come out 20 long, showing 2'],
      [21, 32,            24, 5, 'texts of 21 to 32 characters come out 24 long, showing 5'],
      [33, Source.length, 24, 7, 'texts of 33 characters or more come out 24 long, showing 7'],
    ] as const

    for (const [beg, end, resultLen, shown, blurb] of RowCases) {
      it(blurb, () => {
        for (let len = beg; len <= end; len += 1) {
          const masked = mask(Source.slice(0, len))
          expect(masked).to.have.lengthOf(resultLen)
          expect(masked.replaceAll('*', '')).to.have.lengthOf(shown)
        }
      })
    }

    it("is frozen, row by row", () => {
      expect(Object.isFrozen(MaskSchedule)).to.eq(true)
      for (const row of Object.values(MaskSchedule)) { expect(Object.isFrozen(row)).to.eq(true) }
    })
  })

  describe("whatever it is given", () => {
    const Adversaries: readonly string[] = [
      `${LongKey}\u{202E}`,
      '\u{2066}sk-ant-\u{2069}abcd1234\u{202D}\u{202B}',
      'abc\u{B}de\u{C}fg\u{85}hi\u{2028}jk\u{2029}lm',
      '\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}'.repeat(5),
      `z${'\u{300}\u{301}\u{302}'.repeat(30)}a`,
      '\u{D800}\u{DC00}\u{D800}x\u{DC00}y\u{DBFF}',
      '\u{A0}\u{1680}\u{2000}\u{3000}key\u{FEFF}',
      ...[1, 2, 3, 4, 5, 6].map((seed) => randomCodePoints(40, seed)),
      ...[7, 8, 9].map((seed) => randomCodePoints(400, seed)),
    ]
    const Variants: readonly MaskOpts[] = [{}, { head: 0, tail: 0 }, { head: 6, tail: 6 }, { maxLen: 8 }, { minLen: 0, maxLen: Infinity }]

    for (const [idx, adversary] of Adversaries.entries()) {
      it(`returns visible ASCII no longer than its maxLen (adversary ${String(idx)})`, () => {
        for (const opts of Variants) {
          const masked = mask(adversary, opts)
          expect(masked).to.match(/^[!-~]*$/)
          expect(masked.length).to.be.at.most(opts.maxLen ?? 24)
        }
      })
    }
  })

  describe("refusals", () => {
    const BadOpts: readonly [MaskOpts, string][] = [
      [{ head: -1 },                       'a negative head'],
      [{ tail: 1.5 },                      'a fractional tail'],
      [{ minLen: NaN },                    'a minLen that is not a number'],
      [{ maxLen: -3 },                     'a negative maxLen'],
      [{ maxLen: 2.5 },                    'a fractional maxLen'],
      [{ maxLen: NaN },                    'a maxLen that is not a number'],
      [{ maxLen: 1e300 },                  'a maxLen past the safe integers'],
      [{ minLen: 1001 },                   'a minLen past the ceiling'],
      [{ head: 1001 },                     'a head past the ceiling'],
      [{ tail: Infinity },                 'an infinite tail'],
      [{ head: '2' as unknown as number }, 'a head that is text'],
      [{ heads: 2 } as never,              'a field it does not accept, a misspelt head'],
      [{ minStars: 6 } as never,           'a field it does not accept, an option it no longer has'],
    ]
    for (const [opts, blurb] of BadOpts) {
      it(`refuses ${blurb}`, () => {
        TH.expectSyncRefusal(() => mask(LongKey, opts))
      })
    }

    it("refuses a text that is not a string", () => {
      for (const text of [42, null, undefined, { apiKey: 'x' }]) {
        TH.expectSyncRefusal(() => mask(text as unknown as string))
      }
    })

    it("never quotes the text in what it throws", () => {
      const fake = 'sk-FAKE-do-not-leak-0123456789'
      for (const opts of [{ head: -1 }, { maxLen: 0.5 }, { tail: 'x' as unknown as number }]) {
        const err = TH.expectSyncRefusal(() => mask(fake, opts))
        expect(TH.thrownText(err)).not.to.contain('FAKE')
      }
    })
  })
})

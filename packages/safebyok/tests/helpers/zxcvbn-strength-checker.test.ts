import { afterEach, describe, expect, it, vi } from 'vitest'
import { MinPassphraseChars, MinZxcvbnScore, zxcvbnStrengthChecker } from '../../src/helpers/zxcvbn-strength-checker'
import { StrongVerdict, guardStrengthChecker } from '../../src/helpers/passphrase-strength'
import * as Phrases from '../../src/helpers/phrases'
import type { VaultScope } from '../../src/shapes/shapes-core'
import * as TH from '../test-helpers'

/** The scope the tests hand the checker. */
const scope: VaultScope = Object.freeze({ applabel: 'acme', user_id: 'u1', vaultlabel: 'keys' })

// A fresh module, so its StrongVerdict is its own: the tests below compare verdicts deeply.
/** A checker made fresh, over a dictionary chunk that fails to load until `chunk.failing` is cleared. */
const freshCheckerOverChunk = async () => {
  const chunk = { failing: false, imports: 0 }
  vi.doMock('@zxcvbn-ts/language-common', async (importOriginal) => {
    chunk.imports += 1
    if (chunk.failing) { throw new Error('the chunk did not load') }
    return await importOriginal()
  })
  vi.resetModules()
  const { zxcvbnStrengthChecker: checker } = await import('../../src/helpers/zxcvbn-strength-checker')
  return { checker, chunk }
}

/** The checker's verdict, as a promise whether it answers at once or later. */
const judgedAsync = async (typed: string, vaultScope: VaultScope) => await zxcvbnStrengthChecker(typed, vaultScope)

afterEach(() => {
  vi.doUnmock('@zxcvbn-ts/language-common')
  vi.resetModules()
})

const VerdictCases = [
  // admitted:
  ["mauve lantern quietly orbits",  true,   'admits four words that do not go together'],
  ["correct horse battery staple",  true,   'admits a famous passphrase of four words, its length outweighing its fame'],
  ["purple sandwich ferry",         true,   'admits three uncommon words'],
  ["Tr0ub4dor&3xyz",                true,   'admits a mangled word with a tail, past the length floor'],
  // too short:
  ["Tr0ub4dor&3",                   false,  'refuses eleven characters, however mixed'],
  ["",                              false,  'refuses an empty passphrase as too short'],
  // too guessable:
  ["password1234",                  false,  'refuses a common password with digits on'],
  ["Password1234!",                 false,  'refuses a common password dressed up with a capital and a bang'],
  ["qwertyuiopasdf",                false,  'refuses a walk along the keyboard'],
  ["aaaaaaaaaaaaaaa",               false,  'refuses one character repeated'],
] as const

describe("zxcvbnStrengthChecker", () => {
  it("asks for twelve characters and a zxcvbn score of three", () => {
    expect(MinPassphraseChars).to.eq(12)
    expect(MinZxcvbnScore).to.eq(3)
  })

  for (const [typed, strong, blurb] of VerdictCases) {
    it(blurb, async () => {
      const { strong: found } = await zxcvbnStrengthChecker(typed, scope)
      expect(found).to.eq(strong)
    })
  }

  it("answers StrongVerdict of a strong passphrase", async () => {
    expect(await zxcvbnStrengthChecker('mauve lantern quietly orbits', scope)).to.eq(StrongVerdict)
  })

  it("tells a short passphrase to grow, and a guessable one to change", async () => {
    expect(await zxcvbnStrengthChecker('short one', scope)).to.deep.equal({ strong: false, reason: Phrases.passphraseTooShort(12) })
    expect(await zxcvbnStrengthChecker('password1234', scope)).to.deep.equal({ strong: false, reason: Phrases.PassphraseGuessable })
  })

  it("counts characters as a reader does, an emoji of several code points as one", async () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}'
    expect(family).to.have.lengthOf(8)
    expect(await zxcvbnStrengthChecker(`${family}${family}abcde`, scope)).to.deep.equal({ strong: false, reason: Phrases.passphraseTooShort(12) })
  })

  it("refuses the vault's own names, which a guesser who knows the user tries first", async () => {
    const typed = 'quokkavelodrome'
    expect(await zxcvbnStrengthChecker(typed, scope)).to.eq(StrongVerdict)
    for (const named of [{ applabel: typed }, { user_id: typed }, { vaultlabel: typed }]) {
      expect(await zxcvbnStrengthChecker(typed, { ...scope, ...named })).to.deep.equal({ strong: false, reason: Phrases.PassphraseGuessable })
    }
  })

  it("never quotes the passphrase in its reason", async () => {
    const weakOnes = VerdictCases.filter(([typed, strong]) => typed && ! strong).map(([typed]) => typed)
    for (const typed of weakOnes) {
      expect(JSON.stringify(await zxcvbnStrengthChecker(typed, scope))).to.not.include(typed)
    }
  })

  it("is frozen, its load beside it", () => {
    expect(Object.isFrozen(zxcvbnStrengthChecker)).to.be.true
    expect(zxcvbnStrengthChecker.load).to.be.a('function')
  })

  it("refuses a passphrase that is no text, and a scope that is no scope", async () => {
    await TH.expectRefusal(judgedAsync(42 as never, scope), 'bad_option')
    await TH.expectRefusal(judgedAsync('mauve lantern quietly orbits', { applabel: 'acme' } as never), 'bad_option')
  })

  it("keeps to the strength checker contract under the bank's guard", async () => {
    const guarded = guardStrengthChecker(zxcvbnStrengthChecker)
    await guarded.load()
    expect(await guarded('mauve lantern quietly orbits', scope)).to.eq(StrongVerdict)
    expect(await guarded('password1234', scope)).to.deep.equal({ strong: false, reason: Phrases.PassphraseGuessable })
  })
})

describe("zxcvbnStrengthChecker's load", () => {
  it("leaves the dictionary unloaded at import, and loads it once", async () => {
    const { checker, chunk } = await freshCheckerOverChunk()
    expect(chunk.imports).to.eq(0)
    await checker.load()
    await checker.load()
    expect(await checker('mauve lantern quietly orbits', scope)).to.deep.equal({ strong: true })
    expect(chunk.imports).to.eq(1)
  })

  it("fails while the dictionary does not load, and loads it at a later try", async () => {
    const { checker, chunk } = await freshCheckerOverChunk()
    chunk.failing = true
    await expect(checker.load()).rejects.toThrow()
    chunk.failing = false
    await checker.load()
    expect(await checker('mauve lantern quietly orbits', scope)).to.deep.equal({ strong: true })
  })

  it("is run by a check made before it, which answers a weak verdict while the dictionary does not load", async () => {
    const { checker, chunk } = await freshCheckerOverChunk()
    chunk.failing = true
    expect(await checker('mauve lantern quietly orbits', scope)).to.deep.equal({ strong: false, reason: Phrases.PassphraseUnjudged })
    chunk.failing = false
    expect(await checker('mauve lantern quietly orbits', scope)).to.deep.equal({ strong: true })
  })
})

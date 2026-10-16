import { describe, expect, it } from 'vitest'
import { MinZxcvbnScore, zxcvbnPassphraseTest } from '../src/zxcvbn-passphrase-test'

/** The reason a verdict gives, or '' for a strong one. */
const reasonOf = (passphrase: string): string => {
  const verdict = zxcvbnPassphraseTest(passphrase)
  return verdict.strong ? '' : verdict.reason
}

const StrengthCases = [
  // regular usage:
  ["correct horse battery staple",  true,  'four uncommon words together pass'],
  ["my cat is named fluffy",        true,  'a plain sentence passes, with no digit, capital or symbol'],
  ["xk7#pq2mzv9w",                  true,  'twelve random characters pass'],
  // what guessers try first, however long:
  ["password1234",                  false, 'a common password with digits on is refused'],
  ["p@ssw0rd12345",                 false, 'a common password in leetspeak is refused'],
  ["qwertyuiop12",                  false, 'a keyboard walk is refused'],
  ["aaaaaaaaaaaa",                  false, 'one character repeated is refused'],
  ["abcdefghijkl",                  false, 'a sequence is refused'],
  ["iloveyouiloveyou",              false, 'a common phrase repeated is refused'],
  // the length floor comes first:
  ["Tr0ub4dor&3",                   false, 'eleven characters are refused, however mixed'],
  ["hunter2",                       false, 'a short password is refused for its length'],
] as const

describe("zxcvbnPassphraseTest", () => {
  for (const [passphrase, strong, blurb] of StrengthCases) {
    it(blurb, () => { expect(zxcvbnPassphraseTest(passphrase).strong).to.eq(strong) })
  }

  it("admits 'correct horse battery staple', as its example says", () => {
    expect(zxcvbnPassphraseTest('correct horse battery staple')).to.deep.equal({ strong: true })
  })

  it("says what it found and what to do, as its example says, never quoting the passphrase", () => {
    expect(reasonOf('password1234')).to.eq('That is very like a commonly used password: add a few more words, less common ones.')
    const refused = StrengthCases.filter(([, strong]) => ! strong).map(([passphrase]) => passphrase)
    for (const passphrase of refused) { expect(reasonOf(passphrase)).to.not.include(passphrase) }
  })

  it("names the pattern it found: a keyboard walk, a repeat, a sequence", () => {
    expect(reasonOf('aaaaaaaaaaaa')).to.match(/repeats one character/)
    expect(reasonOf('abcdefghijkl')).to.match(/common sequence/)
    expect(reasonOf('iloveyouiloveyou')).to.match(/repeats a pattern/)
  })

  it("gives the length test's own reason to a passphrase under 12 characters, as its example says", () => {
    expect(reasonOf('hunter2')).to.match(/^A passphrase needs at least 12 characters/)
  })

  it("never asks for a digit, a capital or a symbol", () => {
    for (const [passphrase] of StrengthCases) {
      expect(reasonOf(passphrase)).to.not.match(/digit|capital|uppercase|symbol|number/i)
    }
  })

  it("answers at once, not as a promise, so a field may call it on every keystroke", () => {
    expect(zxcvbnPassphraseTest('correct horse battery staple')).to.not.be.instanceOf(Promise)
  })

  it("answers the same twice: it keeps nothing of one passphrase for the next", () => {
    expect(zxcvbnPassphraseTest('password1234')).to.deep.equal(zxcvbnPassphraseTest('password1234'))
    expect(zxcvbnPassphraseTest('correct horse battery staple').strong).to.be.true
  })

  it("asks for a score of 3 of 4", () => {
    expect(MinZxcvbnScore).to.eq(3)
  })
})

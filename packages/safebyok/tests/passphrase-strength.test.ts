import { describe, expect, it, vi } from 'vitest'
import { MinPassphraseChars, StrongVerdict, ensureStrongEnough, parseStrengthTest, passphraseLengthTest, type PassphraseStrengthTest, type PassphraseVerdict } from '../src/passphrase-strength'
import * as TH from './test-helpers'

const LengthCases = [
  // regular usage:
  ["correct horse battery staple", true,  'a few words together pass'],
  ["twelve chars",                 true,  'twelve characters, a space among them, is exactly enough'],
  ["hunter2",                      false, 'a short password is refused'],
  ["eleven char",                  false, 'one character short is refused'],
  // no composition rules:
  ["alllowercaseletters",          true,  'no digit, capital or symbol is asked for'],
  ["Tr0ub4dor&3",                  false, 'digits, capitals and symbols do not make up for length'],
  // characters, not bytes or UTF-16 code units:
  ["🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑",           false, 'eleven emoji are eleven characters, though 22 code units'],
  ["🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑🔑",          true,  'twelve emoji are twelve characters'],
  ["päßwörd-ünd",                  false, 'eleven accented letters are eleven, though more bytes'],
  // edge cases:
  ["",                             false, 'nothing at all is refused'],
] as const

/** A test that finds every passphrase weak. */
const neverStrong: PassphraseStrengthTest = () => ({ strong: false, reason: 'Pick a phrase nobody would guess.' })
/** A test that answers later, and finds every passphrase weak. */
const breachedLater: PassphraseStrengthTest = async () => {
  await Promise.resolve()
  return { strong: false, reason: 'Found in a breach.' }
}
/** A test that admits every passphrase. */
const alwaysStrong: PassphraseStrengthTest = () => StrongVerdict

describe("passphraseLengthTest", () => {
  for (const [passphrase, strong, blurb] of LengthCases) {
    it(blurb, () => { expect(passphraseLengthTest(passphrase).strong).to.eq(strong) })
  }

  it("admits a passphrase of MinPassphraseChars, 12, and refuses one shorter", () => {
    expect(MinPassphraseChars).to.eq(12)
    expect(passphraseLengthTest('x'.repeat(MinPassphraseChars))).to.deep.equal({ strong: true })
    expect(passphraseLengthTest('x'.repeat(MinPassphraseChars - 1)).strong).to.be.false
  })

  it("gives a reason saying how long a passphrase must be, never quoting the one it was given", () => {
    const verdict = passphraseLengthTest('hunter2')
    expect(verdict.strong).to.be.false
    const reason = verdict.strong ? '' : verdict.reason
    expect(reason).to.match(/at least 12 characters/)
    expect(reason).to.not.include('hunter2')
  })

  it("passes twelve spaces: the vault refuses a blank passphrase itself, before any test", () => {
    expect(passphraseLengthTest(' '.repeat(12)).strong).to.be.true
  })

  it("answers at once, not as a promise, so a field may call it on every keystroke", () => {
    expect(passphraseLengthTest('correct horse battery staple')).to.not.be.instanceOf(Promise)
  })
})

describe("StrongVerdict", () => {
  it("is the one verdict that admits, frozen", () => {
    expect(StrongVerdict).to.deep.equal({ strong: true })
    expect(Object.isFrozen(StrongVerdict)).to.be.true
  })
})

describe("ensureStrongEnough", () => {
  it("refuses one the test finds weak with kind 'weak_passphrase', the test's reason its message", async () => {
    const err = await TH.expectRefusal(ensureStrongEnough(neverStrong, 'acme acme acme'), 'weak_passphrase')
    expect(err.message).to.eq('Pick a phrase nobody would guess.')
  })

  it("awaits a test that answers a promise", async () => {
    await TH.expectRefusal(ensureStrongEnough(breachedLater, 'acme acme acme'), 'weak_passphrase')
  })

  it("passes a passphrase the test admits, handing it the passphrase exactly as given", async () => {
    const test = vi.fn((_passphrase: string): PassphraseVerdict => StrongVerdict)
    await ensureStrongEnough(test, '  Spaced Out Phrase  ')
    expect(test).toHaveBeenCalledWith('  Spaced Out Phrase  ')
  })

  const Misanswers = [
    [undefined,                         'nothing at all'],
    [true,                              'a bare boolean'],
    [{ strong: 'yes' },                 'a strong that is not a boolean'],
    [{ strong: false },                 'weak, with no reason'],
    [{ strong: false, reason: '' },     'weak, with an empty reason'],
    [{ strong: false, reason: 42 },     'weak, with a reason that is not text'],
    ['Too short.',                      'a reason alone, not in a verdict'],
  ] as const
  for (const [answer, blurb] of Misanswers) {
    it(`refuses a test answering ${blurb} with kind 'bad_option'`, async () => {
      const misfit = (() => answer) as unknown as PassphraseStrengthTest
      const err = await TH.expectRefusal(ensureStrongEnough(misfit, 'acme acme acme'), 'bad_option')
      expect(err.message).to.match(/passphraseStrengthTest/)
      expect(err.message).to.not.include('acme acme acme')
    })
  }

  it("throws whatever the test throws", async () => {
    const thrown = new Error('the strength service is down')
    const broken: PassphraseStrengthTest = () => { throw thrown }
    await expect(ensureStrongEnough(broken, 'acme acme acme')).rejects.toThrow(thrown)
  })
})

describe("parseStrengthTest", () => {
  it("takes the length test by default", () => {
    expect(parseStrengthTest(undefined)).to.eq(passphraseLengthTest)
  })

  it("keeps a host's own test as given", () => {
    expect(parseStrengthTest(alwaysStrong)).to.eq(alwaysStrong)
  })

  it("refuses anything but a function with kind 'bad_option'", () => {
    for (const misfit of [null, 12, 'zxcvbn', { strong: true }]) {
      expect(() => parseStrengthTest(misfit as unknown as PassphraseStrengthTest)).to.throw(/passphraseStrengthTest/).with.property('kind', 'bad_option')
    }
  })
})

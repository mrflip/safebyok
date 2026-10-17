import { describe, expect, it, vi } from 'vitest'
import { StrongVerdict, checkStrengthTest, ensureStrongEnough, type PassphraseStrengthTest, type PassphraseVerdict } from '../src/passphrase-strength'
import { zxcvbnPassphraseTest } from '../src/zxcvbn-passphrase-test'
import type { VaultScope } from '../src/types'
import * as TH from './test-helpers'

/** The scope the tests hand a strength test. */
const scope: VaultScope = TH.scopeOf('u1')

/** A test that finds every passphrase weak. */
const neverStrong: PassphraseStrengthTest = () => ({ strong: false, reason: 'Pick a phrase nobody would guess.' })
/** A test that answers later, and finds every passphrase weak. */
const breachedLater: PassphraseStrengthTest = async () => {
  await Promise.resolve()
  return { strong: false, reason: 'Found in a breach.' }
}
/** A test that admits every passphrase. */
const alwaysStrong: PassphraseStrengthTest = () => StrongVerdict

describe("StrongVerdict", () => {
  it("is the one verdict that admits, frozen", () => {
    expect(StrongVerdict).to.deep.equal({ strong: true })
    expect(Object.isFrozen(StrongVerdict)).to.be.true
  })
})

describe("ensureStrongEnough", () => {
  it("refuses one the test finds weak with kind 'weak_passphrase', the test's reason its message", async () => {
    const err = await TH.expectRefusal(ensureStrongEnough(neverStrong, 'acme acme acme', scope), 'weak_passphrase')
    expect(err.message).to.eq('Pick a phrase nobody would guess.')
  })

  it("awaits a test that answers a promise", async () => {
    await TH.expectRefusal(ensureStrongEnough(breachedLater, 'acme acme acme', scope), 'weak_passphrase')
  })

  it("passes a passphrase the test admits, handing it the passphrase exactly as given and the vault's scope", async () => {
    const test = vi.fn((_passphrase: string, _scope: VaultScope): PassphraseVerdict => StrongVerdict)
    await ensureStrongEnough(test, '  Spaced Out Phrase  ', scope)
    expect(test).toHaveBeenCalledWith('  Spaced Out Phrase  ', { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
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
      const err = await TH.expectRefusal(ensureStrongEnough(misfit, 'acme acme acme', scope), 'bad_option')
      expect(err.message).to.match(/passphraseStrengthTest/)
      expect(err.message).to.not.include('acme acme acme')
    })
  }

  it("throws whatever the test throws", async () => {
    const thrown = new Error('the strength service is down')
    const broken: PassphraseStrengthTest = () => { throw thrown }
    await expect(ensureStrongEnough(broken, 'acme acme acme', scope)).rejects.toThrow(thrown)
  })
})

describe("checkStrengthTest", () => {
  it("keeps a host's own test as given", () => {
    expect(checkStrengthTest(alwaysStrong)).to.eq(alwaysStrong)
  })

  it("keeps zxcvbnPassphraseTest, as its example says", () => {
    expect(checkStrengthTest(zxcvbnPassphraseTest)).to.eq(zxcvbnPassphraseTest)
  })

  it("refuses a missing test with kind 'bad_option', as its example says, naming where a good one is", () => {
    const missing = undefined as unknown as PassphraseStrengthTest
    expect(() => checkStrengthTest(missing)).to.throw(/passphraseStrengthTest is required.*browserOpts/).with.property('kind', 'bad_option')
  })

  it("refuses anything but a function with kind 'bad_option'", () => {
    for (const misfit of [null, 12, 'zxcvbn', { strong: true }]) {
      expect(() => checkStrengthTest(misfit as unknown as PassphraseStrengthTest)).to.throw(/passphraseStrengthTest/).with.property('kind', 'bad_option')
    }
  })
})

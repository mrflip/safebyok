import { describe, expect, it, vi } from 'vitest'
import { StrongVerdict, checkStrengthTest, checkStrongEnough, type PassphraseStrengthTest, type PassphraseVerdict } from '../src/passphrase-strength'
import { zxcvbnPassphraseTest } from '../src/zxcvbn-passphrase-test'
import type { VaultScope } from '../src/types'
import { VaultError } from '../src/errors'
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

describe("checkStrongEnough", () => {
  it("refuses one the test finds weak with kind 'weak_passphrase', the test's reason its message", async () => {
    const err = await TH.expectRefusal(checkStrongEnough(neverStrong, 'acme acme acme', scope), 'weak_passphrase')
    expect(err.message).to.eq('Pick a phrase nobody would guess.')
  })

  it("awaits a test that answers a promise", async () => {
    await TH.expectRefusal(checkStrongEnough(breachedLater, 'acme acme acme', scope), 'weak_passphrase')
  })

  it("passes a passphrase the test admits, handing it the passphrase exactly as given and the vault's scope", async () => {
    const test = vi.fn((_passphrase: string, _scope: VaultScope): PassphraseVerdict => StrongVerdict)
    await checkStrongEnough(test, '  Spaced Out Phrase  ', scope)
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
      const err = await TH.expectRefusal(checkStrongEnough(misfit, 'acme acme acme', scope), 'bad_option')
      expect(err.message).to.match(/passphraseStrengthTest/)
      expect(err.message).to.not.include('acme acme acme')
    })
  }

  it("refuses unexpected_error for a test that throws, what it threw the cause and nothing of it in the message", async () => {
    const thrown = new Error('could not judge acme acme acme')
    const broken: PassphraseStrengthTest = () => { throw thrown }
    const err = await TH.expectRefusal(checkStrongEnough(broken, 'acme acme acme', scope), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('acme acme acme')
  })

  it("refuses unexpected_error for a test that throws a VaultError of misuse, so its message, which may quote the passphrase, is never the refusal's own", async () => {
    const thrown = new VaultError('bad_option', 'acme acme acme is no passphrase I can judge.')
    const broken: PassphraseStrengthTest = () => { throw thrown }
    const err = await TH.expectRefusal(checkStrongEnough(broken, 'acme acme acme', scope), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
    expect(err.message).to.not.include('acme acme acme')
  })

  it("keeps a condition the test raises as it came, for the caller to show or retry", async () => {
    const thrown = new VaultError('storage_unavailable', 'The passphrase checker could not be loaded: try again shortly.')
    const broken: PassphraseStrengthTest = () => Promise.reject(thrown)
    const err = await TH.expectRefusal(checkStrongEnough(broken, 'acme acme acme', scope), 'storage_unavailable')
    expect(err).to.eq(thrown)
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
    expect(() => checkStrengthTest(missing)).to.throw(/passphraseStrengthTest is required.*browserOpts/).with.property('refusalkind', 'bad_option')
  })

  it("refuses anything but a function with kind 'bad_option'", () => {
    for (const misfit of [null, 12, 'zxcvbn', { strong: true }]) {
      expect(() => checkStrengthTest(misfit as unknown as PassphraseStrengthTest)).to.throw(/passphraseStrengthTest/).with.property('refusalkind', 'bad_option')
    }
  })
})

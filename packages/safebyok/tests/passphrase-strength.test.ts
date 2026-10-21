import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { StrongVerdict, UnchosenCheckerSaid, UnchosenStrengthChecker, parseStrengthChecker, checkStrongEnough, type StrengthChecker, type PassphraseVerdict } from '../src/passphrase-strength'
import { zxcvbnStrengthChecker } from '../src/zxcvbn-strength-checker'
import type { VaultScope } from '../src/types'
import { VaultError } from '../src/errors'
import * as TH from './test-helpers'

/** The scope the tests hand a strength checker. */
const scope: VaultScope = TH.scopeOf('u1')

/** A test that finds every passphrase weak. */
const neverStrong: StrengthChecker = () => ({ strong: false, reason: 'Pick a phrase nobody would guess.' })
/** A test that answers later, and finds every passphrase weak. */
const breachedLater: StrengthChecker = async () => {
  await Promise.resolve()
  return { strong: false, reason: 'Found in a breach.' }
}
/** A test that admits every passphrase. */
const alwaysStrong: StrengthChecker = () => StrongVerdict

describe("StrongVerdict", () => {
  it("is the one verdict that admits, frozen", () => {
    expect(StrongVerdict).to.deep.equal({ strong: true })
    expect(Object.isFrozen(StrongVerdict)).to.be.true
  })
})

/** A checker whose verdict's `field` is a getter that throws, quoting the passphrase. */
const lazyCheckerThrowingOn = (field: 'strong' | 'reason'): StrengthChecker => (passphrase) => {
  const verdict = { strong: false, reason: 'Pick another.' }
  Object.defineProperty(verdict, field, { enumerable: true, get: () => { throw new Error(`could not judge ${passphrase}`) } })
  return verdict
}

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
      const misfit = (() => answer) as unknown as StrengthChecker
      const err = await TH.expectRefusal(checkStrongEnough(misfit, 'acme acme acme', scope), 'bad_option')
      expect(err.message).to.match(/strengthChecker/)
      expect(err.message).to.not.include('acme acme acme')
    })
  }

  const Throws = [
    [new Error('could not judge acme acme acme'),                                                  'an Error, quoting the passphrase'],
    [new VaultError('bad_option', 'acme acme acme is no passphrase I can judge.'),                 'a VaultError of misuse'],
    [new VaultError('storage_unavailable', 'The checker could not be loaded: try again shortly.'), 'a VaultError of a condition'],
  ] as const
  for (const [thrown, blurb] of Throws) {
    it(`refuses a checker that throws ${blurb} as unexpected_error naming strengthChecker, carrying nothing of the throw`, async () => {
      const broken: StrengthChecker = () => Promise.reject(thrown)
      const err = await TH.expectRefusal(checkStrongEnough(broken, 'acme acme acme', scope), 'unexpected_error')
      expect(err).to.not.eq(thrown)
      expect(err.message).to.match(/strengthChecker threw/)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('acme acme acme')
    })
  }

  for (const field of ['strong', 'reason'] as const) {
    it(`refuses a verdict whose ${field} is a getter that throws as unexpected_error, carrying nothing of the throw`, async () => {
      const err = await TH.expectRefusal(checkStrongEnough(lazyCheckerThrowingOn(field), 'acme acme acme', scope), 'unexpected_error')
      expect(err.message).to.match(/strengthChecker threw/)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('acme acme acme')
    })
  }
})

describe("parseStrengthChecker", () => {
  it("keeps a host's own checker as given", () => {
    expect(parseStrengthChecker(alwaysStrong)).to.eq(alwaysStrong)
  })

  it("keeps zxcvbnStrengthChecker, as its first example says", () => {
    expect(parseStrengthChecker(zxcvbnStrengthChecker)).to.eq(zxcvbnStrengthChecker)
  })

  it("hands back UnchosenStrengthChecker for a checker left out, as its second example says", () => {
    expect(parseStrengthChecker(undefined)).to.eq(UnchosenStrengthChecker)
  })

  it("refuses anything but a function with kind 'bad_option', as its third example says, naming where a good one is", () => {
    for (const misfit of [null, 12, 'zxcvbn', { strong: true }]) {
      expect(() => parseStrengthChecker(misfit as unknown as StrengthChecker)).to.throw(/strengthChecker.*browserOpts/).with.property('refusalkind', 'bad_option')
    }
  })
})

describe("UnchosenStrengthChecker", () => {
  it("finds every passphrase weak, with a reason for the user that quotes none, as its example shows", async () => {
    for (const passphrase of ['correct horse battery staple', 'pw', '']) {
      const verdict = await UnchosenStrengthChecker(passphrase, scope)
      expect(verdict).to.have.property('strong', false)
      expect(verdict).to.have.property('reason').that.matches(/can't accept a new passphrase yet/)
    }
    await TH.expectRefusal(checkStrongEnough(UnchosenStrengthChecker, 'correct horse battery staple', scope), 'weak_passphrase')
  })
})

describe("UnchosenCheckerSaid, and the CUSTOMIZATION.md section it points at", () => {
  const customization = readFileSync(new URL('../CUSTOMIZATION.md', import.meta.url), 'utf8')

  it("names the option, browserOpts and the section by its heading, which CUSTOMIZATION.md has", () => {
    expect(UnchosenCheckerSaid).to.match(/strengthChecker/)
    expect(UnchosenCheckerSaid).to.match(/browserOpts/)
    expect(UnchosenCheckerSaid).to.include('CUSTOMIZATION.md, under Pluggable Passphrase Strength Checker')
    expect(customization).to.include('\n## Pluggable Passphrase Strength Checker\n')
  })

  it("keeps its AI prompt's last reason word for word", () => {
    expect(customization).to.include("it's too annoying and I just want it to let everything through, I understand the risks, you're not the boss of me")
  })
})

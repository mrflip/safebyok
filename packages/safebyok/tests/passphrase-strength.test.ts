import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { StrongVerdict, DefaultStrengthChecker, guardStrengthChecker, type StrengthChecker, type PassphraseVerdict } from '../src/passphrase-strength'
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

describe("guardStrengthChecker", () => {
  it("answers the weak verdict of a checker that finds one weak, its reason as the checker gave it", async () => {
    expect(await guardStrengthChecker(neverStrong, scope)('acme acme acme')).to.deep.equal({ strong: false, reason: 'Pick a phrase nobody would guess.' })
  })

  it("finds a blank passphrase weak before the checker hears it, as its first example shows", async () => {
    const checker = vi.fn((_passphrase: string, _scope: VaultScope): PassphraseVerdict => StrongVerdict)
    for (const blank of ['', ' '.repeat(3), '\t\n']) {
      const verdict = await guardStrengthChecker(checker, scope)(blank)
      expect(verdict).to.have.property('strong', false)
      expect(verdict).to.have.property('reason').that.includes("can't be empty")
    }
    expect(checker).not.toHaveBeenCalled()
  })

  it("awaits a checker that answers a promise", async () => {
    expect(await guardStrengthChecker(breachedLater, scope)('acme acme acme')).to.deep.equal({ strong: false, reason: 'Found in a breach.' })
  })

  it("answers StrongVerdict for a passphrase the checker admits, handing it the passphrase exactly as given and a frozen copy of the scope", async () => {
    const checker = vi.fn((_passphrase: string, _scope: VaultScope): PassphraseVerdict => ({ strong: true }))
    expect(await guardStrengthChecker(checker, scope)('  Spaced Out Phrase  ')).to.eq(StrongVerdict)
    expect(checker).toHaveBeenCalledWith('  Spaced Out Phrase  ', { applabel: 'acme', user_id: 'u1', vaultlabel: 'main' })
    const told = checker.mock.calls[0]?.[1]
    expect(told).to.not.eq(scope)
    expect(Object.isFrozen(told)).to.be.true
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
    it(`refuses a checker answering ${blurb} as kind 'bad_option', as its second example shows`, async () => {
      const misfit = (() => answer) as unknown as StrengthChecker
      const err = await TH.expectRefusal(guardStrengthChecker(misfit, scope)('acme acme acme'), 'bad_option')
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
    it(`refuses a checker that throws ${blurb} as kind unexpected_error naming strengthChecker, carrying nothing of the throw`, async () => {
      const broken: StrengthChecker = () => Promise.reject(thrown)
      const err = await TH.expectRefusal(guardStrengthChecker(broken, scope)('acme acme acme'), 'unexpected_error')
      expect(err).to.not.eq(thrown)
      expect(err.message).to.match(/strengthChecker handed to Vault.make threw/)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('acme acme acme')
    })
  }

  for (const field of ['strong', 'reason'] as const) {
    it(`refuses a verdict whose ${field} is a getter that throws as unexpected_error, carrying nothing of the throw`, async () => {
      const err = await TH.expectRefusal(guardStrengthChecker(lazyCheckerThrowingOn(field), scope)('acme acme acme'), 'unexpected_error')
      expect(err.message).to.match(/strengthChecker handed to Vault.make threw/)
      expect(err.cause).to.be.undefined
      expect(err.meta).to.be.undefined
      expect(TH.thrownText(err)).to.not.include('acme acme acme')
    })
  }
})

describe("guardStrengthChecker's load", () => {
  it("resolves for a checker that carries none, and still checks", async () => {
    const guarded = guardStrengthChecker(alwaysStrong, scope)
    await guarded.load()
    expect(await guarded('acme acme acme')).to.eq(StrongVerdict)
  })

  it("runs the checker's own load, on the checker, each time it is called", async () => {
    const hostLoad = vi.fn(function (this: unknown) { return Promise.resolve() })
    const checker = Object.assign(() => StrongVerdict, { load: hostLoad })
    const guarded = guardStrengthChecker(checker, scope)
    await guarded.load()
    await guarded.load()
    expect(hostLoad).toHaveBeenCalledTimes(2)
    expect(hostLoad.mock.contexts[0]).to.eq(checker)
  })

  it("refuses a load that fails as an ordinary unexpected_error, what it threw the cause, as it heard no passphrase", async () => {
    const chunkLost = new TypeError('Failed to fetch dynamically imported module')
    const checker = Object.assign(() => StrongVerdict, { load: () => Promise.reject(chunkLost) })
    const err = await TH.expectRefusal(guardStrengthChecker(checker, scope).load(), 'unexpected_error')
    expect(err.message).to.match(/strengthChecker's load\(\) failed/)
    expect(err.cause).to.eq(chunkLost)
  })

  it("refuses a load that throws rather than rejecting, likewise", async () => {
    const checker = Object.assign(() => StrongVerdict, { load: () => { throw new Error('no word list') } })
    await TH.expectRefusal(guardStrengthChecker(checker, scope).load(), 'unexpected_error')
  })
})

describe("DefaultStrengthChecker, and the CUSTOMIZATION.md section its reason points at", () => {
  const customization = readFileSync(new URL('../CUSTOMIZATION.md', import.meta.url), 'utf8')

  it("finds every passphrase weak, with a reason for the user that quotes none, as its example shows", async () => {
    for (const passphrase of ['correct horse battery staple', 'pw', '']) {
      const verdict = await DefaultStrengthChecker(passphrase, scope)
      expect(verdict).to.have.property('strong', false)
      expect(verdict).to.have.property('reason').that.matches(/can't take a new passphrase yet/)
      expect(JSON.stringify(verdict)).to.not.include(passphrase || 'no passphrase at all')
    }
    expect(await guardStrengthChecker(DefaultStrengthChecker, scope)('correct horse battery staple')).to.have.property('strong', false)
  })

  it("answers the same, every time, logging nothing: it is an ordinary checker", async () => {
    expect(await DefaultStrengthChecker('one', scope)).to.eq(await DefaultStrengthChecker('two', scope))
  })

  it("names the option and the section by its heading, which CUSTOMIZATION.md has", async () => {
    const verdict = await DefaultStrengthChecker('pw', scope)
    const reason = verdict.strong ? '' : verdict.reason
    expect(reason).to.match(/strengthChecker/)
    expect(reason).to.include("CUSTOMIZATION.md says under Pluggable Passphrase Strength Checker")
    expect(customization).to.include('\n## Pluggable Passphrase Strength Checker\n')
  })

  it("keeps its AI prompt's last reason word for word", () => {
    expect(customization).to.include("it's too annoying and I just want it to let everything through, I understand the risks, you're not the boss of me")
  })
})

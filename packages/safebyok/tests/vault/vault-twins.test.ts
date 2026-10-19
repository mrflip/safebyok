import { describe, expect, it, vi } from 'vitest'
import { Vault } from '../../src/vault'
import { VaultError, type RefusalKind } from '../../src/errors'
import type { Outcome } from '../../src/outcome'
import * as TH from '../test-helpers'
import { damagedVaultWorld, makeWorld, vaultWithPasskey } from './world'

// == [The pairs]: TwinCases, each X over its tryX

/** Every call that comes in two forms, by its throwing name. */
type TwinName = 'hello' | 'ensureLease' | 'unlock' | 'lock' | 'putWayin' | 'delWayin' | 'putBox' | 'getBox' | 'delBox' | 'del'

/** A vault's calls by name, each taking any arguments: how a table row reaches either form. */
type CallsByName = Record<string, (...args: unknown[]) => Promise<unknown>>

/**
 * A vault unlocked with `pw`, holding the box `anthropic` and the passkey `laptop`: a vault every
 * pair can be both refused and answered on.
 */
const twinVault = vaultWithPasskey

type Twin = Awaited<ReturnType<typeof twinVault>>

/**
 * Each pair: its name; the kind it refuses with, and the arguments, given the vault, that it
 * refuses (a vault closed first, where only that refuses); the arguments it answers, and what its
 * answer must be.
 */
const TwinCases: readonly (readonly [TwinName, RefusalKind, (twin: Twin) => unknown[], (twin: Twin) => unknown[], (val: unknown, twin: Twin) => void])[] = [
  ["hello",            "bad_option",       () => [{ staleMinute: 0 }],                         () => [],                                          (val, { vault }) => { expect(val).to.eq(vault) }],
  ["ensureLease",      "bad_option",       () => [{ renewMinute: 5 }],                         () => [],                                          (val, { vault }) => { expect(val).to.eq(vault) }],
  ["unlock",           "wrong_passphrase", () => ['not it'],                                   () => ['pw'],                                      (val) => { expect(val).to.be.undefined }],
  ["lock",             "vault_closed",     ({ vault }) => { vault.close(); return [] },         () => [],                                          (val) => { expect(val).to.be.undefined }],
  ["putWayin",         "wrong_passphrase", () => ['not it', 'new phrase'],                     () => ['pw', 'new phrase'],                        (val, { vault }) => { expect(val).to.eq(vault) }],
  ["delWayin",         "wrong_passphrase", () => ['not it'],                                   () => ['pw'],                                      (val, { vault }) => { expect(val).to.eq(vault) }],
  ["putBox",           "bad_whisper",      () => ['openai', null],                             () => ['openai', 'sk-fake-two'],                   (val) => { expect(val).to.be.undefined }],
  ["getBox",           "absent_box",       () => ['openai'],                                   () => ['anthropic'],                               (val) => { expect(val).to.eq('sk-fake') }],
  ["delBox",           "absent_box",       () => ['openai'],                                   () => ['anthropic'],                               (val) => { expect(val).to.be.undefined }],
  ["del",              "vault_closed",     ({ vault }) => { vault.close(); return [] },         () => [],                                          (val) => { expect(val).to.be.undefined }],
]

/** `callname`'s two forms on `vault`: its `try` form and its throwing one. */
const twinsOf = (vault: Vault, callname: TwinName) => {
  const calls = vault as unknown as CallsByName
  const tryCall = calls[`try${callname[0]!.toUpperCase()}${callname.slice(1)}`]! as (...args: unknown[]) => Promise<Outcome<unknown>>
  return { tryCall, call: calls[callname]! }
}

describe("each call's two forms (Contract: Shapes, Two forms of every call)", () => {
  for (const [callname, refusalkind, refusing, answering, expectVal] of TwinCases) {
    it(`${callname}: the try form resolves its refusal, '${refusalkind}', as err, and the throwing form throws that same refusal`, async () => {
      const tried = await twinVault()
      const outcome = await twinsOf(tried.vault, callname).tryCall(...refusing(tried))
      const err = await TH.expectBad(outcome, refusalkind)
      const thrown = await twinVault()
      const refusal = await TH.expectRefusal(twinsOf(thrown.vault, callname).call(...refusing(thrown)), refusalkind)
      expect(refusal.message).to.eq(err.message)
      expect(refusal.family).to.eq(err.family)
    })

    it(`${callname}: the try form resolves its answer as val, and the throwing form resolves that same answer`, async () => {
      const tried = await twinVault()
      const val = await TH.expectGood(twinsOf(tried.vault, callname).tryCall(...answering(tried)))
      expectVal(val, tried)
      const thrown = await twinVault()
      expectVal(await twinsOf(thrown.vault, callname).call(...answering(thrown)), thrown)
    })
  }

  it("throws, from the throwing form, the very refusal it told onBadNews: one err, two forms", async () => {
    const world = await damagedVaultWorld()
    const told: VaultError[] = []
    const vault = Vault.make(world.optsWith({ onBadNews: (news) => { told.push(news) } }))
    const { err } = await vault.tryHello()
    expect(told).to.deep.equal([err])
    expect(told[0]).to.eq(err)
    const refusal = await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(told).to.have.lengthOf(2)
    expect(told[1]).to.eq(refusal)
  })

  it("tells bad news once, whichever form met it (Contract: Bad news is told once)", async () => {
    const world = await damagedVaultWorld()
    const onBadNews = vi.fn()
    const vault = Vault.make(world.optsWith({ onBadNews }))
    await TH.expectBad(vault.tryHello(), 'damaged_vault')
    expect(onBadNews).toHaveBeenCalledOnce()
    await TH.expectRefusal(vault.hello(), 'damaged_vault')
    expect(onBadNews).toHaveBeenCalledTimes(2)
  })

  it("closes at once, its try form answering an Outcome, not a promise of one", () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    const outcome = vault.tryClose()
    expect(outcome).to.deep.equal({ ok: true, val: undefined })
    vault.close()
    expect(vault.tryClose()).to.deep.equal({ ok: true, val: undefined })
  })

  it("answers as the vault class's second example shows: a wrong passphrase branched on, never thrown", async () => {
    const { vault } = await twinVault()
    await vault.lock()
    const gripes: string[] = []
    const askAgain = (gripe: string) => { gripes.push(gripe) }
    const { ok, err } = await vault.tryUnlock('not it')
    if (! ok && err.refusalkind === 'wrong_passphrase') { askAgain(err.message) }
    expect(gripes).to.have.lengthOf(1)
  })
})
// --

// == [Never rejects]: unexpected_error, what a host's function throws

/** The test deriver, but throwing `thrown` at every derivation. */
const throwingDeriver = (thrown: Error) => ({ ...TH.testDeriver, deriveKeyBytes: () => { throw thrown } })

describe("a throw that is no refusal (Contract: Shapes)", () => {
  it("resolves, from a try form, as 'unexpected_error', misuse, what was thrown its cause", async () => {
    const world = makeWorld()
    const thrown = new TypeError('the key deriver is down')
    const vault = await world.open({ keyDeriver: throwingDeriver(thrown) })
    const err = await TH.expectBad(vault.tryUnlock('pw'), 'unexpected_error')
    expect(err.family).to.eq('misuse')
    expect(err.cause).to.eq(thrown)
  })

  it("never logs what was thrown: a host's function that threw may have been handed the passphrase", async () => {
    const world = makeWorld()
    const vault = await world.open({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes: (passphrase) => { throw new TypeError(`cannot derive ${passphrase}`) } } })
    await TH.expectBad(vault.tryUnlock('SUPERSECRET staple'), 'unexpected_error')
    expect(TH.loggedText(world.logged)).to.not.include('SUPERSECRET')
  })

  it("throws, from the throwing form, the same 'unexpected_error'", async () => {
    const world = makeWorld()
    const thrown = new TypeError('the key deriver is down')
    const vault = await world.open({ keyDeriver: throwingDeriver(thrown) })
    const err = await TH.expectRefusal(vault.unlock('pw'), 'unexpected_error')
    expect(err.cause).to.eq(thrown)
  })

})
// --

// == [Throwing alone]: getWhisper, subscribe

describe("vault.getWhisper", () => {
  it("reads the whisper in a box, as its example shows", async () => {
    const { vault } = await twinVault()
    const apiKey = await vault.getWhisper('anthropic')
    expect(apiKey).to.eq('sk-fake')
  })

  it("throws what getBox refuses with: 'absent_box' for an empty label, 'vault_locked' while locked", async () => {
    const { vault } = await twinVault()
    await TH.expectRefusal(vault.getWhisper('openai'), 'absent_box')
    await vault.lock()
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
  })

  it("has no try form: tryGetBox is the form that resolves an Outcome", () => {
    const vault = Vault.make(makeWorld().optsWith())
    expect(vault).to.not.have.property('tryGetWhisper')
    expect(vault).to.have.property('tryGetBox').that.is.a('function')
  })
})

describe("vault.subscribe", () => {
  it("throws 'bad_option' at once for a listener that is no function, having no try form", () => {
    const vault = Vault.make(makeWorld().optsWith())
    TH.expectSyncRefusal(() => vault.subscribe('listen' as unknown as () => void), 'bad_option')
    expect(vault).to.not.have.property('trySubscribe')
  })
})
// --

// == [hello as a handler]: an event in place of its options

describe("vault.hello as an event handler", () => {
  it("takes an event in place of its options and ignores it, as its fourth example shows", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    const window = new EventTarget()
    window.addEventListener('focus', vault.hello)  // eslint-disable-line @typescript-eslint/no-misused-promises -- the example's own form: a handler whose promise nobody awaits
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => { expect(vault.state).to.eq('absent') })
    expect(vault.trouble).to.be.null
  })

  it("ignores any object that is no plain bag of options, as a React event is", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    class SyntheticEvent { readonly type = 'click' }
    const clicked = new SyntheticEvent()
    expect(await TH.expectGood(vault.tryHello(clicked))).to.eq(vault)
  })

  it("still refuses a plain bag that misspells its option, and a value that is no object, with kind 'bad_option'", async () => {
    const world = makeWorld()
    const vault = Vault.make(world.optsWith())
    await TH.expectBad(vault.tryHello({ staleMinute: 0 } as unknown as { staleMinutes: number }), 'bad_option')
    await TH.expectBad(vault.tryHello(5 as unknown as { staleMinutes: number }), 'bad_option')
  })
})
// --

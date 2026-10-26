import { describe, expect, it, vi } from 'vitest'
import { Vault } from '../../src/vault'
import { VaultError, type RefusalKind } from '../../src/errors'
import type { Outcome } from '../../src/outcome'
import * as TH from '../test-helpers'
import { makeWorld, vaultWithPasskey, u1VaultPropsCkey, storedVaultPropsOf } from './world'

// == [The pairs]: TwinCases, each X over its tryX

/** Every call that comes in two forms, by its throwing name. */
type TwinName = 'hello' | 'ensureUnlocked' | 'lock' | 'putWayin' | 'delWayin' | 'putBox' | 'getBox' | 'getWhisper' | 'delBox' | 'del'

/** A vault's calls by name, each taking any arguments: how a table row reaches either form. */
type CallsByName = Record<string, (...args: unknown[]) => Promise<unknown>>

/**
 * A vault unlocked with `pw`, holding the box `anthropic` and the passkey `laptop`: a vault every
 * pair can be both refused and answered on.
 */
const twinVault = vaultWithPasskey

type Twin = Awaited<ReturnType<typeof twinVault>>

/** Script `vault`'s next gating to be answered with its passphrase `pw`, the next one `new phrase` for a change of passphrase. */
const answerWithPw = (vault: Vault) => {
  TH.answering(vault, async (gating) => {
    if (gating.gatingkind === 'change_passphrase') {
      await gating.attempt('pw', 'new phrase')
    } else if (gating.gatingkind === 'del_passkey' || gating.gatingkind === 'del_vault') {
      await gating.attempt('pw')
    }
  })
}

/** Script `vault`'s next gating to be declined, as a user pressing Cancel. */
const answerWithDecline = (vault: Vault) => {
  TH.answering(vault, (gating) => { gating.decline(); return Promise.resolve() })
}

/**
 * Each pair: its name; the kind it refuses with, and the arguments, given the vault, that it
 * refuses (a vault let go first, where only that refuses); the arguments it answers, and what its
 * answer must be.
 */
const TwinCases: readonly (readonly [TwinName, RefusalKind, (twin: Twin) => unknown[], (twin: Twin) => unknown[], (val: unknown, twin: Twin) => void])[] = [
  ["hello",           "bad_option",           () => [{ staleMinute: 0 }],                                          () => [],                                                       (val, { vault }) => { expect(val).to.eq(vault) }],
  ["ensureUnlocked",  "bad_option",           () => [{ renewMinute: 5 }],                                          () => [],                                                       (val, { vault }) => { expect(val).to.eq(vault) }],
  ["lock",            "vault_gone",           ({ vault }) => { TH.closeVault(vault); return [] },                  () => [],                                                       (val) => { expect(val).to.be.undefined }],
  ["putWayin",        "vault_locked",         ({ vault }) => { answerWithDecline(vault); return ['passphrase'] },  ({ vault }) => { answerWithPw(vault); return ['passphrase'] },  (val, { vault }) => { expect(val).to.eq(vault) }],
  ["delWayin",        "passphrase_required",  () => ['passphrase'],                                                ({ vault }) => { answerWithPw(vault); return ['passkey'] },     (val, { vault }) => { expect(val).to.eq(vault) }],
  ["putBox",          "bad_whisper",          () => [{ boxlabel: 'openai' }, null],                                () => [{ boxlabel: 'openai' }, 'sk-fake-two'],                  (val) => { expect(val).to.have.property('boxlabel', 'openai') }],
  ["getBox",          "bad_scope",            () => ['tab\there'],                                                 () => ['anthropic'],                                            (val) => { expect(val).to.have.property('boxlabel', 'anthropic') }],
  ["getWhisper",      "bad_scope",            () => ['tab\there'],                                                 () => ['anthropic'],                                            (val) => { expect(val).to.eq('sk-fake') }],
  ["delBox",          "absent_box",           () => ['openai'],                                                    () => ['anthropic'],                                            (val, { vault }) => { expect(val).to.deep.eq({ boxlabel: 'anthropic', vault_tok: vault.vault_tok, outcome: 'deleted' }) }],
  ["del",             "vault_gone",           ({ vault }) => { TH.closeVault(vault); return [] },                  ({ vault }) => { answerWithPw(vault); return [] },              (val) => { expect(val).to.be.undefined }],
]

/** `callname`'s two forms on `vault`: its `try` form and its throwing one. */
const twinsOf = (vault: Vault, callname: TwinName) => {
  const calls = vault as unknown as CallsByName
  const tryCall = calls[`try${callname[0]!.toUpperCase()}${callname.slice(1)}`]!.bind(vault) as (...args: unknown[]) => Promise<Outcome<unknown>>
  return { tryCall, call: calls[callname]!.bind(vault) }
}

/**
 * A vault unlocked with `pw`, born with `overrides` over a vaultDB that hears no change bells, whose
 * stored vault props are then spoiled underfoot: its next read meets 'damaged_vault', and no watch
 * has met it first.
 */
const damagedUnderfoot = async (overrides?: Partial<TH.BornVaultOpts>) => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw', { vaultDB: world.deafVaultDB(), ...overrides })
  world.dbStore.write(u1VaultPropsCkey, JSON.stringify({ ...storedVaultPropsOf(world), gate_epoch: 'one' }))
  return { world, vault }
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
    const told: VaultError[] = []
    const { vault } = await damagedUnderfoot({ onBadNews: (news) => { told.push(news) } })
    const { err } = await vault.tryHello({ staleMinutes: 0 })
    expect(told).to.deep.equal([err])
    expect(told[0]).to.eq(err)
    const refusal = await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    expect(told).to.have.lengthOf(2)
    expect(told[1]).to.eq(refusal)
  })

  it("tells bad news once, whichever form met it (Contract: Bad news is told once)", async () => {
    const onBadNews = vi.fn()
    const { vault } = await damagedUnderfoot({ onBadNews })
    await TH.expectBad(vault.tryHello({ staleMinutes: 0 }), 'damaged_vault')
    expect(onBadNews).toHaveBeenCalledOnce()
    await TH.expectRefusal(vault.hello({ staleMinutes: 0 }), 'damaged_vault')
    expect(onBadNews).toHaveBeenCalledTimes(2)
  })

  it("answers as the vault class's fourth example shows: a locked vault branched on, never thrown", async () => {
    const { vault } = await twinVault()
    await vault.putBox({ boxlabel: 'anthropic_api_key' }, 'sk-ant-test-not-a-real-key')
    await vault.lock()
    const offers: string[] = []
    const offerUnlock = () => { offers.push('unlock') }
    const { ok, err } = await vault.tryGetWhisper('anthropic_api_key')
    if (! ok && err.refusalkind === 'vault_locked') { offerUnlock() }
    expect(offers).to.have.lengthOf(1)
  })
})
// --

// == [Never rejects]: unexpected_error, what a host's function throws

/** An unlocked vault whose vaultDB's getBox throws a TypeError, as a bug in it would: the vault, and what it throws. */
const brokenStoreVault = async () => {
  const world = makeWorld()
  const vault = await world.openUnlocked('pw')
  const thrown = new TypeError('the storage adapter is down')
  vi.spyOn(world.vaultDB, 'getBox').mockRejectedValue(thrown)
  return { vault, thrown }
}

describe("a throw that is no refusal (Contract: Shapes)", () => {
  it("resolves, from a try form, as 'unexpected_error', misuse, what was thrown its cause", async () => {
    const { vault, thrown } = await brokenStoreVault()
    const err = await TH.expectBad(vault.tryGetBox('anthropic_api_key'), 'unexpected_error')
    expect(err.family).to.eq('misuse')
    expect(err.cause).to.eq(thrown)
  })

  it("never logs what was thrown: a host's function that threw may have been handed the passphrase", async () => {
    const world = makeWorld()
    const vault = await world.open({ keyDeriver: { ...TH.testDeriver, deriveKeyBytes: (passphrase) => { throw new TypeError(`cannot derive ${passphrase}`) } } })
    await TH.expectBad(TH.tryUnlock(vault, 'SUPERSECRET staple'), 'unexpected_error')
    expect(TH.loggedText(world.logged)).to.not.include('SUPERSECRET')
  })

  it("throws, from the throwing form, the same 'unexpected_error'", async () => {
    const { vault, thrown } = await brokenStoreVault()
    const err = await TH.expectRefusal(vault.getBox('anthropic_api_key'), 'unexpected_error')
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

  it("refuses 'absent_box' for an empty label, as its example shows, and 'vault_locked' while locked", async () => {
    const { vault } = await twinVault()
    await TH.expectRefusal(vault.getWhisper('openai'), 'absent_box')
    await vault.lock()
    await TH.expectRefusal(vault.getWhisper('anthropic'), 'vault_locked')
  })
})

describe("vault.subscribe", () => {
  it("throws 'bad_option' at once for a listener that is no function, having no try form", async () => {
    const vault = await makeWorld().open()
    TH.expectSyncRefusal(() => vault.subscribe('listen' as unknown as () => void), 'bad_option')
    expect(vault).to.not.have.property('trySubscribe')
  })
})
// --

// == [hello as a handler]: an event in place of its options

describe("vault.hello as an event handler", () => {
  it("refuses an event in place of its options as bad_option, naming the wrap, and reads nothing", async () => {
    const world = makeWorld()
    const vault = await world.open()
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    const err = await TH.expectBad(vault.tryHello(new Event('focus') as unknown as { staleMinutes: number }), 'bad_option')
    expect(err.message).to.match(/^Unrecognized keys?: "[^.]*\. hello\(\)'s only option is `staleMinutes`/)
    expect(err.message).to.include('handed to addEventListener or onClick as the handler itself')
    expect(err.message).to.include('`() => vault.tryHello()`')
    expect(propsReads).not.toHaveBeenCalled()
  })

  it("hellos when wrapped as its third example shows, the handler reading storage on the event", async () => {
    const world = makeWorld({ staleMinutes: 0 })
    const vault = await world.open()
    const propsReads = vi.spyOn(world.vaultDB, 'getVault')
    const window = new EventTarget()
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the example's own form: a handler whose Outcome nobody reads
    window.addEventListener('focus', () => vault.tryHello())
    window.dispatchEvent(new Event('focus'))
    await vi.waitFor(() => { expect(propsReads).toHaveBeenCalledOnce() })
    expect(vault.state).to.eq('novel')
    expect(vault.trouble).to.be.null
  })

  it("refuses any object that is no plain bag of options, as a React event is, as bad_option", async () => {
    const vault = await makeWorld().open()
    class SyntheticEvent { readonly type = 'click' }
    const clicked = new SyntheticEvent()
    await TH.expectBad(vault.tryHello(clicked as unknown as { staleMinutes: number }), 'bad_option')
    await TH.expectBad(vault.tryHello(null as unknown as { staleMinutes: number }), 'bad_option')
  })

  it("still refuses a plain bag that misspells its option, and a value that is no object, with kind 'bad_option'", async () => {
    const vault = await makeWorld().open()
    const misspelt = await TH.expectBad(vault.tryHello({ staleMinute: 0 } as unknown as { staleMinutes: number }), 'bad_option')
    expect(misspelt.message).to.eq("Unrecognized key: \"staleMinute\". hello()'s only option is `staleMinutes`, how many minutes it trusts the vault's last read of storage: check its spelling, and leave out any other.")
    const numbered = await TH.expectBad(vault.tryHello(5 as unknown as { staleMinutes: number }), 'bad_option')
    expect(numbered.message).to.match(/^Invalid input: expected object, received number\. hello\(\)'s only option .* an event, most likely/)
  })

  it("takes a bag of options with no prototype, as a plain bag", async () => {
    const vault = await makeWorld().open()
    const opts = Object.assign(Object.create(null) as object, { staleMinutes: 0 })
    expect(await TH.expectGood(vault.tryHello(opts))).to.eq(vault)
  })
})
// --

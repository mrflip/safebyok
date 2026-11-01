import { runInNewContext } from 'node:vm'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { deferred } from '../../src/helpers/deferred'
import { type AnyGating, Gating, type GatingOpts, type GatingWorld, type RequestCleartext } from '../../src/models/gating'
import { type PasskeyGatingKind, type PasskeyWayinHeader, type StrengthChecker, correctableKindVals } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import type { PasskeyAnswer } from '../../src/shapes/vault'
import * as TH from '../test-helpers'
import { quietLogger } from '../test-helpers/logging'
import { isZeroed } from '../test-helpers/proving-world'
import { type Outcome, outcomeOf } from '../../src/outcome'
import { Dna, Passphrase, makeBornVault, makeBornVaultWithPasskey, replacePasskeyElsewhere, useVaultWorlds } from '../test-helpers/vault-world'

useVaultWorlds()

/** What a run resolves: a gating hands back whatever its verb resolved, unexamined. */
const Resolved = Object.freeze({ resolved: true }) as unknown as Vault

const worldOf = (requestCleartext: RequestCleartext, overrides: Partial<GatingWorld> = {}): GatingWorld => ({
  requestCleartext,
  strengthChecker: () => ({ strong: true }),
  logger:          quietLogger,
  ...overrides,
})

/** A dialog the test holds open: `gating` resolves the gating it was handed, and `close()` resolves `requestCleartext`, as the host's dialog closing would. */
const heldDialog = () => {
  const handed = deferred<AnyGating>()
  const closed = deferred<undefined>()
  const requestCleartext = vi.fn((gating: AnyGating) => {
    handed.resolve(gating)
    return closed.promise
  })
  return { requestCleartext, gating: handed.promise, close: () => { closed.resolve(undefined) } }
}

/** Launch an 'unlock_vault' gating of `Dna` with no vault, its run a spy resolving {@link Resolved} unless told otherwise. */
const launchHeld = (overrides: Partial<GatingOpts<'unlock_vault'>> = {}) => {
  const dialog = heldDialog()
  const run = vi.fn((_cleartexts: unknown): Promise<Vault> => Promise.resolve(Resolved))
  // As an Outcome, so a test that never awaits the launch leaves no rejection unhandled.
  const launched = outcomeOf(() => Gating.launch('unlock_vault', { scope: Dna, vault: null, world: worldOf(dialog.requestCleartext), run, ...overrides }))
  return { ...dialog, run, launched }
}

const asUnlock = async (gating: Promise<AnyGating>): Promise<Gating<'unlock_vault'>> => {
  const held = await gating
  if (held.gatingkind !== 'unlock_vault') { throw new Error(`no ${held.gatingkind} here`) }
  return held
}

const weakChecker: StrengthChecker = () => ({ strong: false, reason: 'Add another word or two.' })

const refusalOf = (refusalkind: VaultError['refusalkind']) => new VaultError(refusalkind, `Refused as ${refusalkind}.`)

/** A requestCleartext whose user touches the passkey `tag` names, answering the salt the gating's passkeyHeader shows; each answer it hands is pushed onto `handed`. */
const touchPasskey = (tag: string, handed: PasskeyAnswer[]) => async (gating: AnyGating) => {
  const held = await asUnlock(Promise.resolve(gating))
  const passkeyAnswer = await TH.passkeyOf(tag, held.passkeyHeader?.prf_salt_b64)
  handed.push(passkeyAnswer)
  await held.attemptPasskey(passkeyAnswer)
}

describe("Gating.launch(gatingkind, opts): what the host is handed", () => {
  it("hands requestCleartext an open gating of the kind and scope, for the vault given", async () => {
    const { vault } = await makeBornVault()
    const { requestCleartext, gating, close } = launchHeld({ vault })
    const held = await gating
    expect(requestCleartext).toHaveBeenCalledOnce()
    expect(held.gatingkind).to.eq('unlock_vault')
    expect(held).to.deep.include(Dna)
    expect(held.vault).to.equal(vault)
    expect(held.isOpen).to.be.true
    close()
  })

  it("shows its kind, its scope and whether the vault has a passkey to JSON alone, never the vault, and is frozen", async () => {
    const { vault } = await makeBornVault()
    const { gating, close } = launchHeld({ vault })
    const held = await gating
    expect(held.toJSON()).to.deep.equal({ gatingkind: 'unlock_vault', ...Dna, hasPasskey: false })
    expect(JSON.stringify(held)).to.eq(JSON.stringify({ gatingkind: 'unlock_vault', ...Dna, hasPasskey: false }))
    expect(Object.isFrozen(held)).to.be.true
    close()
  })

  it("shows to JSON that the vault has a passkey, as the vault's snapshot does, but not its header", async () => {
    const { vault } = await makeBornVaultWithPasskey()
    const { gating, close } = launchHeld({ vault })
    const held = await gating
    expect(held.toJSON()).to.deep.equal({ gatingkind: 'unlock_vault', ...Dna, hasPasskey: true })
    expect(held.toJSON().hasPasskey).to.eq(vault.getSnapshot().hasPasskey)
    expect(JSON.stringify(held)).not.to.contain('credential_id')
    close()
  })

  const ProvedByCases = [
    ['build_vault',        []],
    ['unlock_vault',       ['passphrase', 'passkey']],
    ['replace_passphrase', ['passphrase']],
    ['add_passkey',        ['passphrase']],
    ['revoke_passkey',     ['passphrase']],
  ] as const

  for (const [gatingkind, provedBy] of ProvedByCases) {
    it(`says a '${gatingkind}' gating is proved by ${provedBy.length === 0 ? 'no wayin' : provedBy.join(' or ')}`, async () => {
      const { requestCleartext, gating, close } = heldDialog()
      const launched = Gating.launch(gatingkind, { scope: Dna, vault: null, world: worldOf(requestCleartext), run: () => Promise.resolve(Resolved) })
      const held = await gating
      expect(held.provedBy).to.deep.equal(provedBy)
      close()
      await TH.expectRefusal(launched, 'declined')
    })
  }
})

describe("Gating.launch: the opts check", () => {
  const OptsCases = [
    [{ gatingkind: 'open_sesame' },                                 'a gatingkind of no known kind'],
    [{ scope: { ...Dna, vaultlabel: undefined } },                  'a scope with no vaultlabel'],
    [{ vault: { vault_tok: 'vault-tok-u1' } },                      'a vault that is a plain object'],
    [{ run: 'not a function' },                                     'a run that is no function'],
    [{ world: { logger: quietLogger, strengthChecker: () => ({ strong: true }) } }, 'a world with no requestCleartext'],
  ] as const

  for (const [overrides, blurb] of OptsCases) {
    it(`refuses ${blurb} as 'bad_option', asking the host nothing`, async () => {
      const requestCleartext = vi.fn()
      const { gatingkind = 'unlock_vault', ...opts } = { scope: Dna, vault: null, world: worldOf(requestCleartext), run: () => Promise.resolve(Resolved), ...overrides } as Record<string, unknown>
      await TH.expectRefusal(Gating.launch(gatingkind as never, opts as never), 'bad_option')
      expect(requestCleartext).not.toHaveBeenCalled()
    })
  }
})

describe("gating.attempt(cleartexts): the ask loop", () => {
  it("runs the verb with the cleartexts, and settles the gating with what it resolves, which the launch resolves too", async () => {
    const { gating, run, launched, close } = launchHeld()
    const held = await asUnlock(gating)
    expect(await held.attempt({ passphrase: Passphrase })).to.equal(Resolved)
    expect(run.mock.calls).to.deep.equal([[{ passphrase: Passphrase }]])
    expect(held.isOpen).to.be.false
    close()
    expect(await TH.expectGood(launched)).to.equal(Resolved)
  })

  for (const refusalkind of correctableKindVals) {
    it(`leaves the gating open after an attempt refused '${refusalkind}', for the next attempt to settle`, async () => {
      const { gating, run, launched, close } = launchHeld()
      run.mockRejectedValueOnce(refusalOf(refusalkind))
      const held = await asUnlock(gating)
      await TH.expectRefusal(held.attempt({ passphrase: 'not the passphrase' }), refusalkind)
      expect(held.isOpen).to.be.true
      await held.attempt({ passphrase: Passphrase })
      close()
      expect(await TH.expectGood(launched)).to.equal(Resolved)
      expect(run).toHaveBeenCalledTimes(2)
    })
  }

  it("settles the gating on any other refusal: the attempt and the launch refuse as the verb refused", async () => {
    const { gating, run, launched, close } = launchHeld()
    const refused = refusalOf('stale_write')
    run.mockRejectedValueOnce(refused)
    const held = await asUnlock(gating)
    expect(await TH.expectRefusal(held.attempt({ passphrase: Passphrase }), 'stale_write')).to.equal(refused)
    expect(held.isOpen).to.be.false
    close()
    expect(await TH.expectBad(launched, 'stale_write')).to.equal(refused)
  })

  it("refuses an attempt on a gating settled as 'gating_landed', running nothing and spending the passkey answer (G2)", async () => {
    const { gating, run, close } = launchHeld()
    const held = await asUnlock(gating)
    await held.attempt({ passphrase: Passphrase })
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(held.attempt({ passkeyAnswer }), 'gating_landed')
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
    expect(run).toHaveBeenCalledOnce()
    close()
  })

  it("leaves the passkey answer of an attempt refused as correctable unspent, and spends the one whose attempt resolves (G2)", async () => {
    const { gating, run, close } = launchHeld()
    run.mockRejectedValueOnce(refusalOf('wrong_passkey'))
    const held = await asUnlock(gating)
    const wrong = { passkeyAnswer: await TH.passkeyOf('phone') }
    await TH.expectRefusal(held.attempt(wrong), 'wrong_passkey')
    expect(isZeroed(wrong.passkeyAnswer.prfBytes)).to.be.false
    const right = { passkeyAnswer: await TH.passkeyOf('laptop') }
    await held.attempt(right)
    expect(isZeroed(right.passkeyAnswer.prfBytes)).to.be.true
    close()
  })

  it("spends the passkey answer of an attempt the verb refuses for good, settling the gating (G2)", async () => {
    const { gating, run, close } = launchHeld()
    run.mockRejectedValueOnce(refusalOf('stale_write'))
    const held = await asUnlock(gating)
    const cleartexts = { passkeyAnswer: await TH.passkeyOf('laptop') }
    await TH.expectRefusal(held.attempt(cleartexts), 'stale_write')
    expect(isZeroed(cleartexts.passkeyAnswer.prfBytes)).to.be.true
    close()
  })

  it("runs attempts made at once one after another: the first settles the gating, and the second refuses 'gating_landed'", async () => {
    const { gating, run, close } = launchHeld()
    const first = deferred<Vault>()
    run.mockReturnValueOnce(first.promise)
    const held = await asUnlock(gating)
    const attempts = [held.tryAttempt({ passphrase: Passphrase }), held.tryAttempt({ passphrase: Passphrase })]
    await TH.eventually(() => run.mock.calls.length === 1)
    first.resolve(Resolved)
    const [one, two] = await Promise.all(attempts)
    expect(await TH.expectGood(one!)).to.equal(Resolved)
    await TH.expectBad(two!, 'gating_landed')
    expect(run).toHaveBeenCalledOnce()
    close()
  })

  it("tryAttempt answers the verb's refusal as a bad Outcome, throwing nothing", async () => {
    const { gating, run, close } = launchHeld()
    run.mockRejectedValueOnce(refusalOf('wrong_passphrase'))
    const held = await asUnlock(gating)
    await TH.expectBad(held.tryAttempt({ passphrase: 'not the passphrase' }), 'wrong_passphrase')
    close()
  })
})

describe("Settling a gating without an attempt", () => {
  it("refuses the launch 'declined' when the host declines, and an attempt after as 'gating_landed'", async () => {
    const { gating, run, launched, close } = launchHeld()
    const held = await asUnlock(gating)
    held.decline()
    await TH.expectBad(launched, 'declined')
    expect(held.isOpen).to.be.false
    await TH.expectRefusal(held.attempt({ passphrase: Passphrase }), 'gating_landed')
    expect(run).not.toHaveBeenCalled()
    close()
  })

  it("refuses the launch 'declined' when requestCleartext resolves with the gating still open", async () => {
    const { gating, launched, close } = launchHeld()
    const held = await gating
    close()
    await TH.expectBad(launched, 'declined')
    expect(held.isOpen).to.be.false
  })

  it("lets an attempt in flight finish before a decline: an attempt that succeeds wins", async () => {
    const { gating, run, launched, close } = launchHeld()
    const pending = deferred<Vault>()
    run.mockReturnValueOnce(pending.promise)
    const held = await asUnlock(gating)
    const attempt = held.attempt({ passphrase: Passphrase })
    held.decline()
    close()
    pending.resolve(Resolved)
    expect(await attempt).to.equal(Resolved)
    expect(await TH.expectGood(launched)).to.equal(Resolved)
  })

  it("keeps the first settling: a decline after the gating settled changes nothing", async () => {
    const { gating, launched, close } = launchHeld()
    const held = await asUnlock(gating)
    await held.attempt({ passphrase: Passphrase })
    held.decline()
    close()
    expect(await TH.expectGood(launched)).to.equal(Resolved)
  })

  it("replaces what a throwing requestCleartext threw with 'unexpected_error', quoting none of it and keeping no cause (G8)", async () => {
    const requestCleartext = vi.fn(() => { throw new Error(`the dialog broke on ${Passphrase}`) })
    const launched = Gating.launch('unlock_vault', { scope: Dna, vault: null, world: worldOf(requestCleartext), run: () => Promise.resolve(Resolved) })
    const err = await TH.expectRefusal(launched, 'unexpected_error')
    expect(err.cause).to.be.undefined
    expect(TH.thrownText(err)).to.not.include(Passphrase)
  })

  it("resolves when requestCleartext attempts at once and returns no promise", async () => {
    const requestCleartext = (gating: AnyGating) => { void (gating as Gating).tryAttempt({ passphrase: Passphrase }) }
    expect(await Gating.launch('unlock_vault', { scope: Dna, vault: null, world: worldOf(requestCleartext), run: () => Promise.resolve(Resolved) })).to.equal(Resolved)
  })
})

describe("gating.attemptPasskey(passkeyAnswer): the passkey path", () => {
  it("unlocks a vault through its passkey, as asked for the salt its passkeyHeader shows, and spends the answer (G2)", async () => {
    const { vault, requestCleartext } = await makeBornVaultWithPasskey()
    vault.lock()
    const handed: PasskeyAnswer[] = []
    requestCleartext.mockImplementationOnce(touchPasskey('laptop', handed))
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(handed.map(({ prfBytes }) => isZeroed(prfBytes))).to.deep.equal([true])
  })

  it("shows the vault's passkey header as the gating launched, frozen, and null for a vault with no passkey or no vault at all", async () => {
    const seen: (PasskeyWayinHeader | null)[] = []
    const peekAndDecline = (gating: AnyGating) => { seen.push(gating.passkeyHeader); gating.decline() }
    const laptop = await TH.passkeyOf('laptop')
    for (const { vault, requestCleartext } of [await makeBornVaultWithPasskey(), await makeBornVault()]) {
      vault.lock()
      requestCleartext.mockImplementationOnce(peekAndDecline)
      await TH.expectRefusal(vault.ensureUnlocked(), 'declined')
    }
    expect(seen[0]).to.deep.include({ wayinkind: 'passkey', credential_id: laptop.credential_id, prf_salt_b64: laptop.prf_salt_b64 })
    expect(Object.isFrozen(seen[0])).to.be.true
    expect(seen[1]).to.be.null
    const { gating, close } = launchHeld()
    const bare = await gating
    expect(bare.passkeyHeader).to.be.null
    close()
  })

  it("tryAttemptPasskey answers a wrong passkey as a bad 'wrong_passkey' Outcome, the gating left open and the answer unspent; the right passkey unlocks after (G2)", async () => {
    const { vault, requestCleartext } = await makeBornVaultWithPasskey()
    vault.lock()
    const wrong = await TH.passkeyOf('phone')
    const seen: { outcome?: Outcome<Vault>, isOpen?: boolean } = {}
    requestCleartext.mockImplementationOnce(async (gating: AnyGating) => {
      const held = await asUnlock(Promise.resolve(gating))
      seen.outcome = await held.tryAttemptPasskey(wrong)
      seen.isOpen = held.isOpen
      await held.attemptPasskey(await TH.passkeyOf('laptop'))
    })
    await vault.ensureUnlocked()
    expect(vault.isUnlocked).to.be.true
    expect(seen.outcome?.err?.refusalkind).to.eq('wrong_passkey')
    expect(seen.isOpen).to.be.true
    expect(isZeroed(wrong.prfBytes)).to.be.false
  })

  it("tryAttemptPasskey answers a malformed answer as a bad 'bad_option' Outcome, settling the gating: the unlock refuses 'bad_option', and each later attempt 'gating_landed'", async () => {
    const { vault, requestCleartext } = await makeBornVaultWithPasskey()
    vault.lock()
    const seen: { outcomes: Outcome<Vault>[], isOpen?: boolean } = { outcomes: [] }
    const tryEach = async (gating: AnyGating) => {
      const held = await asUnlock(Promise.resolve(gating))
      const laptop = await TH.passkeyOf('laptop')
      for (const sloppy of [undefined, 42, { ...laptop, prf_salt_b64: undefined }]) {
        seen.outcomes.push(await held.tryAttemptPasskey(sloppy as unknown as PasskeyAnswer))
      }
      seen.isOpen = held.isOpen
    }
    let asked = Promise.resolve()
    requestCleartext.mockImplementationOnce((gating: AnyGating) => (asked = tryEach(gating)))
    await TH.expectRefusal(vault.ensureUnlocked(), 'bad_option')
    await asked
    expect(seen.outcomes.map(({ err }) => err?.refusalkind)).to.deep.equal(['bad_option', 'gating_landed', 'gating_landed'])
    expect(seen.isOpen).to.be.false
  })

  const MovedCases = [
    ["phone", "gate_moved",   'a passkey the vault no longer has, another in its place'],
    [null,    "absent_wayin", 'a passkey revoked, none in its place'],
  ] as const
  for (const [tag, refusalkind, blurb] of MovedCases) {
    it(`refuses '${refusalkind}' the passkey the gating launched asking for, after another device stores ${blurb} unfetched here: the attempt fetches the gate first, settling the gating and spending the answer (G2)`, async () => {
      const born = await makeBornVaultWithPasskey()
      born.vault.lock()
      const laptop = await TH.passkeyOf('laptop')
      const seen: { outcome?: Outcome<Vault>, isOpen?: boolean } = {}
      born.requestCleartext.mockImplementationOnce(async (gating: AnyGating) => {
        const held = await asUnlock(Promise.resolve(gating))
        await replacePasskeyElsewhere(born, tag)
        seen.outcome = await held.tryAttemptPasskey(laptop)
        seen.isOpen = held.isOpen
      })
      await TH.expectRefusal(born.vault.ensureUnlocked(), refusalkind)
      expect(seen.outcome?.err?.refusalkind).to.eq(refusalkind)
      expect(seen.isOpen).to.be.false
      expect(isZeroed(laptop.prfBytes)).to.be.true
    })
  }

  it("refuses 'absent_wayin' a passkey offered to a vault with none, settling the gating and spending the answer (G2)", async () => {
    const { vault, requestCleartext } = await makeBornVault()
    vault.lock()
    const laptop = await TH.passkeyOf('laptop')
    const seen: { outcome?: Outcome<Vault>, isOpen?: boolean } = {}
    requestCleartext.mockImplementationOnce(async (gating: AnyGating) => {
      const held = await asUnlock(Promise.resolve(gating))
      seen.outcome = await held.tryAttemptPasskey(laptop)
      seen.isOpen = held.isOpen
    })
    await TH.expectRefusal(vault.ensureUnlocked(), 'absent_wayin')
    expect(seen.outcome?.err?.refusalkind).to.eq('absent_wayin')
    expect(seen.isOpen).to.be.false
    expect(isZeroed(laptop.prfBytes)).to.be.true
  })

  it("refuses 'bad_option' on a kind a passkey does not prove, running nothing, leaving the gating open, and spending the answer (G2)", async () => {
    const { requestCleartext, gating, close } = heldDialog()
    const run = vi.fn((_cleartexts: unknown): Promise<Vault> => Promise.resolve(Resolved))
    const launched = outcomeOf(() => Gating.launch('add_passkey', { scope: Dna, vault: null, world: worldOf(requestCleartext), run }))
    const held = await gating as unknown as Gating<'unlock_vault'>
    const passkeyAnswer = await TH.passkeyOf('laptop')
    await TH.expectRefusal(held.attemptPasskey(passkeyAnswer), 'bad_option')
    expect(run).not.toHaveBeenCalled()
    expect(held.isOpen).to.be.true
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
    close()
    await TH.expectBad(launched, 'declined')
  })

  it("is offered only on the kinds a passkey proves: 'unlock_vault' alone", () => {
    expectTypeOf<PasskeyGatingKind>().toEqualTypeOf<'unlock_vault'>()
  })

  it("zeroes PRF bytes made in another realm, which fail `instanceof Uint8Array` but carry its tag, when the attempt is refused for good (G2)", async () => {
    const { gating, run, close } = launchHeld()
    run.mockRejectedValueOnce(refusalOf('stale_write'))
    const held = await asUnlock(gating)
    const passkeyAnswer = { ...await TH.passkeyOf('laptop'), prfBytes: runInNewContext('new Uint8Array(32).fill(7)') as Uint8Array }
    expect(passkeyAnswer.prfBytes instanceof Uint8Array).to.be.false
    await TH.expectRefusal(held.attemptPasskey(passkeyAnswer), 'stale_write')
    expect(isZeroed(passkeyAnswer.prfBytes)).to.be.true
    close()
  })
})

describe("gating.checkStrength(passphrase)", () => {
  it("hands the passphrase to the world's strengthChecker for the gating's scope, without running the verb", async () => {
    const strengthChecker = vi.fn<StrengthChecker>(() => ({ strong: true }))
    const { requestCleartext, gating, close } = heldDialog()
    const run = vi.fn(() => Promise.resolve(Resolved))
    const launched = Gating.launch('build_vault', { scope: Dna, vault: null, world: worldOf(requestCleartext, { strengthChecker }), run })
    const held = await gating
    await held.checkStrength(Passphrase)
    expect(strengthChecker.mock.calls).to.deep.equal([[Passphrase, Dna]])
    expect(run).not.toHaveBeenCalled()
    expect(held.isOpen).to.be.true
    close()
    await TH.expectRefusal(launched, 'declined')
  })

  it("refuses a weak passphrase 'weak_passphrase' with the checker's reason, leaving the gating open; tryCheckStrength answers it as an Outcome", async () => {
    const { requestCleartext, gating, close } = heldDialog()
    const launched = Gating.launch('build_vault', { scope: Dna, vault: null, world: worldOf(requestCleartext, { strengthChecker: weakChecker }), run: () => Promise.resolve(Resolved) })
    const held = await gating
    const err = await TH.expectRefusal(held.checkStrength('pw'), 'weak_passphrase')
    expect(err.message).to.eq('Add another word or two.')
    await TH.expectBad(held.tryCheckStrength('pw'), 'weak_passphrase')
    expect(held.isOpen).to.be.true
    close()
    await TH.expectRefusal(launched, 'declined')
  })
})

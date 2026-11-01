import { describe, expect, it, vi } from 'vitest'
import { VaultError } from '../../src/errors'
import { deferred } from '../../src/helpers/deferred'
import { type AnyGating, Gating, type GatingOpts, type GatingWorld, type RequestCleartext } from '../../src/models/gating'
import { type StrengthChecker, correctableKindVals } from '../../src/models/models-shapes'
import type { Vault } from '../../src/models/vault'
import * as TH from '../test-helpers'
import { quietLogger } from '../test-helpers/logging'
import { isZeroed } from '../test-helpers/proving-world'
import { outcomeOf } from '../../src/outcome'
import { Dna, Passphrase, makeBornVault, useVaultWorlds } from '../test-helpers/vault-world'

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

  it("shows its kind and scope to JSON alone, never the vault, and is frozen", async () => {
    const { vault } = await makeBornVault()
    const { gating, close } = launchHeld({ vault })
    const held = await gating
    expect(held.toJSON()).to.deep.equal({ gatingkind: 'unlock_vault', ...Dna })
    expect(JSON.stringify(held)).to.eq(JSON.stringify({ gatingkind: 'unlock_vault', ...Dna }))
    expect(Object.isFrozen(held)).to.be.true
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
      await TH.expectRefusal(launched, 'vault_locked')
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

  it("spends the passkey answer of an attempt, whether the verb resolves or refuses (G2)", async () => {
    const { gating, run, close } = launchHeld()
    run.mockRejectedValueOnce(refusalOf('wrong_passkey'))
    const held = await asUnlock(gating)
    const wrong = { passkeyAnswer: await TH.passkeyOf('phone') }
    await TH.expectRefusal(held.attempt(wrong), 'wrong_passkey')
    const right = { passkeyAnswer: await TH.passkeyOf('laptop') }
    await held.attempt(right)
    expect(isZeroed(wrong.passkeyAnswer.prfBytes) && isZeroed(right.passkeyAnswer.prfBytes)).to.be.true
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
  it("refuses the launch 'vault_locked' when the host declines, and an attempt after as 'gating_landed'", async () => {
    const { gating, run, launched, close } = launchHeld()
    const held = await asUnlock(gating)
    held.decline()
    await TH.expectBad(launched, 'vault_locked')
    expect(held.isOpen).to.be.false
    await TH.expectRefusal(held.attempt({ passphrase: Passphrase }), 'gating_landed')
    expect(run).not.toHaveBeenCalled()
    close()
  })

  it("refuses the launch 'vault_locked' when requestCleartext resolves with the gating still open", async () => {
    const { gating, launched, close } = launchHeld()
    const held = await gating
    close()
    await TH.expectBad(launched, 'vault_locked')
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
    await TH.expectRefusal(launched, 'vault_locked')
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
    await TH.expectRefusal(launched, 'vault_locked')
  })
})

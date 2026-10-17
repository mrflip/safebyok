import * as Z from 'zod/mini'
import { VaultError } from './errors'
import type { VaultScope } from './types'

/**
 * What a passphrase strength test finds of one passphrase: strong enough, or weak, with a
 * `reason` written for the user -- calm, saying what to do, never quoting the passphrase -- which a
 * field shows beside the passphrase, and the vault throws as the message of its refusal.
 */
export type PassphraseVerdict = { strong: true } | { strong: false, reason: string }

/**
 * A check that a new passphrase is strong enough, `openVault`'s `passphraseStrengthTest`: handed
 * the passphrase as typed, and the scope of the vault it is for -- the applabel, the user's id
 * and the vaultlabel, words a guesser who knows the user tries first -- it answers a
 * {@link PassphraseVerdict}, at once or as a promise. The vault runs it on every passphrase about
 * to become a way in -- the one the first `unlock()` creates a vault with, and each
 * `addPassphrase()` or `changePassphrase()` sets -- before any key derivation, and refuses a weak
 * one with kind 'weak_passphrase', the verdict's reason its message. It never runs on `unlock()`
 * of a vault that stands.
 *
 * Call the same function from the passphrase field as the user types, so they hear "too weak"
 * before they submit (`safebyok-react`'s dialog does). It hears the passphrase in plain text: it
 * should keep nothing, send nothing anywhere, and never put the passphrase in its reason. In a
 * browser, `browserOpts()` from `safebyok/browser` supplies `zxcvbnPassphraseTest`, which turns
 * away short passphrases, common passwords and patterns; pass your own after the spread to
 * replace it, or wrap it to ask for more.
 *
 * @example
 *   const verdict = await passphraseStrengthTest(typed, vault.getSnapshot().scope)
 *   setHint(verdict.strong ? '' : verdict.reason)
 */
export type PassphraseStrengthTest = (passphrase: string, scope: VaultScope) => PassphraseVerdict | Promise<PassphraseVerdict>

/** A verdict that admits. Frozen, so a test handing it out shares it safely. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

const reasonText = Z.string().check(Z.minLength(1))
const passphraseVerdict = Z.union([
  Z.object({ strong: Z.literal(true) }),
  Z.object({ strong: Z.literal(false), reason: reasonText }),
])

/**
 * `passphrase` put to `strengthTest` for the vault named by `scope`, refused with kind
 * 'weak_passphrase' and the test's reason when it finds it weak; kind 'bad_option' for a test that
 * answers anything but a verdict. Whatever the test throws, this throws.
 */
export const ensureStrongEnough = async (strengthTest: PassphraseStrengthTest, passphrase: string, scope: VaultScope): Promise<void> => {
  const checked = passphraseVerdict.safeParse(await strengthTest(passphrase, scope))
  if (! checked.success) {
    throw new VaultError('bad_option', 'passphraseStrengthTest answered something other than a verdict: { strong: true }, or { strong: false, reason } with the reason as non-empty text.')
  }
  if (! checked.data.strong) { throw new VaultError('weak_passphrase', checked.data.reason) }
}

/**
 * A host's `passphraseStrengthTest`, exactly as handed in, once it is a function; kind
 * 'bad_option' for anything else, a missing one among them: the vault has no test of its own, so
 * every host chooses one (`browserOpts()` from `safebyok/browser` supplies a good one). openVault
 * runs it on its option; a binding or wrapper that takes the options apart runs it first, once, as
 * soon as it is handed the test.
 *
 * @example checkStrengthTest(zxcvbnPassphraseTest)  // the same function
 * @example checkStrengthTest(undefined)             // throws: bad_option
 */
export const checkStrengthTest = (strengthTest: PassphraseStrengthTest): PassphraseStrengthTest => {
  if (typeof strengthTest !== 'function') {
    throw new VaultError('bad_option', "passphraseStrengthTest is required: a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }. In a browser, spread browserOpts() from safebyok/browser, which supplies zxcvbnPassphraseTest; elsewhere, pass your own.")
  }
  return strengthTest
}

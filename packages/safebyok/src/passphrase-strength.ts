import * as Z from 'zod/mini'
import { VaultError } from './errors'

/**
 * What a passphrase strength test finds of one passphrase: strong enough, or weak, with a
 * `reason` written for the user -- calm, saying what to do, never quoting the passphrase -- which a
 * field shows beside the passphrase, and the vault throws as the message of its refusal.
 */
export type PassphraseVerdict = { strong: true } | { strong: false, reason: string }

/**
 * A check that a new passphrase is strong enough, `openVault`'s `passphraseStrengthTest`: handed
 * the passphrase as typed, it answers a {@link PassphraseVerdict}, at once or as a promise. The
 * vault runs it on every passphrase about to become a way in -- the one the first `unlock()`
 * creates a vault with, and each `addPassphrase()` or `changePassphrase()` sets -- before any key
 * derivation, and refuses a weak one with kind 'weak_passphrase', the verdict's reason its message.
 * It never runs on `unlock()` of a vault that stands.
 *
 * Call the same function from the passphrase field as the user types, so they hear "too weak"
 * before they submit. It is a plain function of the passphrase, with no vault behind it: it
 * should keep nothing and send nothing anywhere, and never put the passphrase in its reason.
 * {@link passphraseLengthTest} is the default; `safebyok/browser` exports `zxcvbnPassphraseTest`,
 * which also turns away common passwords and patterns.
 *
 * @example
 *   const verdict = await passphraseStrengthTest(typed)
 *   setHint(verdict.strong ? '' : verdict.reason)
 */
export type PassphraseStrengthTest = (passphrase: string) => PassphraseVerdict | Promise<PassphraseVerdict>

/**
 * The fewest characters {@link passphraseLengthTest} admits: 12. NIST SP 800-63B asks for length,
 * and against composition rules (a digit, a capital, a symbol), which make passphrases harder to
 * remember and no harder to guess.
 */
export const MinPassphraseChars = 12

/** A verdict that admits. Frozen, so a test handing it out shares it safely. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

/**
 * The default {@link PassphraseStrengthTest}: strong when the passphrase has at least
 * {@link MinPassphraseChars} characters, each Unicode code point counting as one (so an emoji or
 * an accented letter counts once, as NIST SP 800-63B says), and nothing more -- no composition
 * rules. Synchronous, so a field may call it on every keystroke.
 *
 * @param passphrase - The passphrase as the user typed it.
 * @returns `{ strong: true }`, or `{ strong: false, reason }` saying how long a passphrase must be.
 *
 * @example passphraseLengthTest('correct horse battery staple')  // { strong: true }
 * @example passphraseLengthTest('hunter2')                       // { strong: false, reason: 'A passphrase needs at least 12 characters: ...' }
 */
export const passphraseLengthTest = (passphrase: string): PassphraseVerdict => (
  codePointCount(passphrase) >= MinPassphraseChars
    ? StrongVerdict
    : { strong: false, reason: `A passphrase needs at least ${String(MinPassphraseChars)} characters: a few words together make one long enough, and easy to remember.` }
)

/** How many Unicode code points `text` holds: NIST's count of characters, a lone surrogate counting one. */
const codePointCount = (text: string): number => (text.match(/./gsu) ?? []).length

const reasonText = Z.string().check(Z.minLength(1))
const passphraseVerdict = Z.union([
  Z.object({ strong: Z.literal(true) }),
  Z.object({ strong: Z.literal(false), reason: reasonText }),
])

/**
 * `passphrase` put to `strengthTest`, refused with kind 'weak_passphrase' and the test's reason when
 * it finds it weak; kind 'bad_option' for a test that answers anything but a verdict. Whatever the
 * test throws, this throws.
 */
export const ensureStrongEnough = async (strengthTest: PassphraseStrengthTest, passphrase: string): Promise<void> => {
  const checked = passphraseVerdict.safeParse(await strengthTest(passphrase))
  if (! checked.success) {
    throw new VaultError('bad_option', 'passphraseStrengthTest answered something other than a verdict: { strong: true }, or { strong: false, reason } with the reason as non-empty text.')
  }
  if (! checked.data.strong) { throw new VaultError('weak_passphrase', checked.data.reason) }
}

/** The vault's `passphraseStrengthTest`: the host's, a function, or the default. Kind 'bad_option' for anything else. */
export const parseStrengthTest = (candidate: PassphraseStrengthTest | undefined): PassphraseStrengthTest => {
  if (candidate === undefined) { return passphraseLengthTest }
  if (typeof candidate !== 'function') {
    throw new VaultError('bad_option', 'passphraseStrengthTest is a function from the passphrase to a verdict, { strong: true } or { strong: false, reason }; leave it out for the default, passphraseLengthTest.')
  }
  return candidate
}

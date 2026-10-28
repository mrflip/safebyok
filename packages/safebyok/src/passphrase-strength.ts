import { VaultError } from './errors'
import { Validator } from './checks/validator'
import type { VaultScope } from './types/types'

/** What a strength checker finds of one passphrase: strong enough, or weak with a `reason` for the user.
 * The reason is calm, says what to do, and never quotes the passphrase. A field shows it, and the
 * vault's 'weak_passphrase' refusal carries it as its message.
 */
export type PassphraseVerdict = { strong: true } | { strong: false, reason: string }

/** `Bank.make`'s `strengthChecker`: a check that a new passphrase is strong enough, answering a {@link PassphraseVerdict} and never throwing.
 * It is handed the passphrase as typed, and the vault's scope: words a guesser who knows the user
 * tries first. The vault runs it on each new passphrase before any key derivation: the one an
 * `initialize_gate` gating creates a vault with, and each one a `change_passphrase` gating sets.
 * It never runs when a vault unlocks, and never hears a blank passphrase. One that throws refuses
 * its call 'unexpected_error', and one that answers no verdict 'bad_option'.
 *
 * It hears the passphrase in plain text: it should keep nothing, send nothing anywhere, and never
 * quote it.
 *
 * A checker that needs something fetched or built first, such as a dictionary, carries it as
 * `load`, which each bank's `hello()` runs. Make the checker once, before any bank, and hand the
 * same one to each; make `load` cost nothing once it has succeeded, and forget a failure. Call
 * `load` yourself only to warm up. A `load` that fails refuses the hello 'unexpected_error', so a
 * vault that cannot check a new passphrase never opens.
 *
 * `browserOpts()` supplies `zxcvbnStrengthChecker`: pass your own after the spread to replace it,
 * or wrap it to ask for more (CUSTOMIZATION.md). To ask it as the user types, call
 * `vault.tryCheckStrength(typed)`.
 *
 * @example
 *   const strengthChecker = (typed: string) => (typed.length < 20 ? { strong: false, reason: 'Twenty characters or more, please.' } : { strong: true })
 * @example
 *   const strengthChecker = Object.assign((typed: string) => judge(typed), { load: () => loadWordList() })
 */
export type StrengthChecker = {
  (passphrase: string, scope: VaultScope): PassphraseVerdict | Promise<PassphraseVerdict>
  /** Fetch or build what the checker needs before it can judge; each bank's `hello()` runs it. */
  load?: (() => void | Promise<void>) | undefined
}

/** A strength checker as a vault keeps it: the host's, told the vault's scope and held to its contract by {@link guardStrengthChecker}. */
export type GuardedStrengthChecker = {
  (passphrase: string): Promise<PassphraseVerdict>
  load: () => Promise<void>
}

/** A verdict that admits, frozen so that a checker may share it. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

/** The verdict {@link DefaultStrengthChecker} answers of every passphrase: a word to the user, and one to the app's makers. */
const DefaultVerdict: PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This app can't take a new passphrase yet: it hasn't been set up to judge how strong one is, so nothing was saved. To the app's makers: Bank.make needs a strengthChecker, as safebyok's CUSTOMIZATION.md says under Pluggable Passphrase Strength Checker.",
})

/** The strength checker of a vault whose host chose none: every passphrase is too weak, so no vault can be made, nor a passphrase changed.
 * Its reason tells the app's makers where to look. It logs nothing.
 *
 * @example DefaultStrengthChecker('correct horse battery staple')   // { strong: false, reason: "This app can't take a new passphrase yet: ..." }
 */
export const DefaultStrengthChecker: StrengthChecker = () => DefaultVerdict

/** True for a {@link StrengthChecker}: a function, whose `load`, if it carries one, is a function too. */
const isStrengthChecker = (candidate: unknown): candidate is StrengthChecker => (
  typeof candidate === 'function' && ['undefined', 'function'].includes(typeof (candidate as { load?: unknown }).load)
)

/** The checks of a `strengthChecker` and of the verdict it answers, each refusing 'bad_option'. */
export const { strengthChecker, passphraseVerdict } = Validator('bad_option', ({ custom, union, obj, lit, str }) => ({
  strengthChecker: custom<StrengthChecker>(isStrengthChecker, {
    error: "expected a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }, its load, if it carries one, a function too. In a browser, spread browserOpts() from safebyok/browser, which supplies zxcvbnStrengthChecker; elsewhere, pass your own.",
  }),
  passphraseVerdict: union([
    obj({ strong: lit(true) }),
    obj({ strong: lit(false), reason: str.min(1) }),
  ]),
}))

/** The verdict on a blank new passphrase, which no checker hears. */
const BlankVerdict: PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember." })

/** `hostChecker` held to its contract and told `scope`. Ask the host's checker only through it, so the vault and a dialog checking as the user types decide alike.
 * A blank passphrase is weak before the host's checker hears it. It refuses 'bad_option' for an
 * answer that is no verdict, and 'unexpected_error' for a throw, carrying nothing of it, as the
 * checker heard the passphrase. `load` refuses a failure 'unexpected_error', its cause the throw,
 * as it heard nothing.
 *
 * @example guardStrengthChecker(zxcvbnStrengthChecker, scope)('')   // resolves { strong: false, reason: "A new passphrase can't be empty ..." }
 * @example guardStrengthChecker(() => ({ strong: 'yes' }), scope)('pw')   // rejects: kind bad_option
 */
export const guardStrengthChecker = (hostChecker: StrengthChecker, scope: VaultScope): GuardedStrengthChecker => {
  // Frozen, so the host's checker can change nothing of what it is told.
  const told = Object.freeze({ applabel: scope.applabel, user_id: scope.user_id, vaultlabel: scope.vaultlabel })
  const check = async (passphrase: string): Promise<PassphraseVerdict> => {
    if (! passphrase.trim()) { return BlankVerdict }
    let checked: ReturnType<typeof passphraseVerdict.safeParse>
    try {
      // Parsed inside the guard: the verdict's fields may be the checker's getters, and throw as they are read.
      checked = passphraseVerdict.safeParse(await hostChecker(passphrase, told))
    } catch {
      throw new VaultError('unexpected_error', "The strengthChecker handed to Bank.make threw rather than answering a verdict, or answered one that threw as it was read. What it threw is left out of this report, as it heard the passphrase: have it answer { strong: false, reason } for a passphrase it cannot judge, and catch its own failures.")
    }
    if (! checked.success) {
      throw new VaultError('bad_option', "The strengthChecker handed to Bank.make answered something other than a verdict: have it answer { strong: true }, or { strong: false, reason } with the reason as non-empty text.")
    }
    return checked.data.strong ? StrongVerdict : checked.data
  }
  return Object.assign(check, { load: () => loadStrengthChecker(hostChecker) })
}

/** Run `hostChecker`'s `load`, if it has one, refusing a failure 'unexpected_error' with what it threw as the cause.
 *
 * @example await loadStrengthChecker(zxcvbnStrengthChecker)   // the zxcvbn chunk fetched, or 'unexpected_error'
 */
export const loadStrengthChecker = async (hostChecker: StrengthChecker): Promise<void> => {
  try {
    await hostChecker.load?.()
  } catch (err) {
    throw new VaultError('unexpected_error', "The strengthChecker's load() failed, so the bank could not check a new passphrase, and bank.hello() was refused rather than open a vault in that state. Its error is this error's cause. For zxcvbnStrengthChecker, it is the chunk holding zxcvbn and its dictionary that would not load: check that your build ships it and your page may fetch it. A dropped connection mends at the next bank.hello().", { cause: err })
  }
}

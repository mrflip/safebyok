import { decorate } from './helpers'
import * as Phrases from './phrases'
import { strengthCheckerLoadFailed, strengthCheckerMisanswered } from '../refusals/throwers'
import * as HostErrorSanitizer from '../refusals/host-error-sanitizer'
import * as CX from '../shapes/shapes-core'
import type { VaultScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import type { PassphraseVerdict } from '../shapes/shapes-gateish'

/** `Bank.make`'s `strengthChecker`: a check that a new passphrase is strong enough, answering a {@link PassphraseVerdict} and never throwing.
 * It is handed the passphrase as typed, and the vault's scope: words a guesser who knows the user
 * tries first. The vault runs it on each new passphrase before any key derivation: the one an
 * `initialize_gate` gating creates a vault with, and each one a `change_passphrase` gating sets.
 * It never runs when a vault unlocks, and never hears a blank passphrase. One that throws, or
 * answers no verdict, refuses its call.
 *
 * It hears the passphrase in plain text: it should keep nothing, send nothing anywhere, and never
 * quote it.
 *
 * A checker that needs something fetched or built first, such as a dictionary, carries it as
 * `load`, which each bank's `hello()` runs. Make the checker once, before any bank, and hand the
 * same one to each; make `load` cost nothing once it has succeeded, and forget a failure. Call
 * `load` yourself only to warm up. A `load` that fails refuses the hello, so a
 * vault that cannot check a new passphrase never opens.
 *
 * `browserOpts()` supplies `zxcvbnStrengthChecker`: pass your own after the spread to replace it,
 * or wrap it to ask for more (CUSTOMIZATION.md). To ask it as the user types, call
 * `vault.tryCheckStrength(typed)`.
 *
 * - A blank passphrase is sent back as a weak passphrase, unconditionally, without consulting the checker.
 * - The default strength checker refuses everything: see CUSTOMIZATION.md for why we do this, and instructions to supply one.
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

/** A strength checker as a vault keeps it: the host's, told the vault's scope and held to its contract by {@link invokeStrengthChecker}. */
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
 */
export const DefaultStrengthChecker: StrengthChecker = () => DefaultVerdict

/** The verdict on a blank new passphrase, which no checker hears. */
const BlankVerdict: PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember." })

/** `hostChecker` held to its contract and told `scope`. Ask the host's checker only through it, so the vault and a dialog checking as the user types decide alike.
 * A blank passphrase is weak before the host's checker hears it. It refuses a passphrase that is no string, an
 * answer that is no verdict, and a throw, carrying nothing of it, as the
 * checker heard the passphrase. `load` refuses a failure, its cause the throw,
 * as it heard nothing.
 */
export const invokeStrengthChecker = (hostChecker: StrengthChecker, scope: VaultScope): GuardedStrengthChecker => {
  // Frozen, so the host's checker can change nothing of what it is told.
  const told = CX.vaultScope.parse(scope)
  const check = async (passphrase: string): Promise<PassphraseVerdict> => {
    const typed = GX.passphraseCleartext.parse(passphrase)
    if (! typed.trim()) { return BlankVerdict }
    let checked: ReturnType<typeof GX.passphraseVerdict.safeParse>
    try {
      // Parsed inside the guard, to be certain no cleartext passphrase leakage
      checked = GX.passphraseVerdict.safeParse(await hostChecker(typed, told))
    } catch (err) {
      throw HostErrorSanitizer.refusalFor(err, 'unexpected_error', Phrases.StrengthCheckerThrew)
    }
    if (! checked.success) {
      throw strengthCheckerMisanswered()
    }
    return checked.data.strong ? StrongVerdict : checked.data
  }
  return decorate(check as GuardedStrengthChecker, { load: () => loadStrengthChecker(hostChecker) })
}

/** Run `hostChecker`'s `load`, if it has one, refusing a failure with what it threw as the cause. */
export const loadStrengthChecker = async (hostChecker: StrengthChecker): Promise<void> => {
  try {
    await hostChecker.load?.()
  } catch (err) {
    throw strengthCheckerLoadFailed(err)
  }
}

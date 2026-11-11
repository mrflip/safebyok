import { brandGuarded } from './consts'
import { isVaultError } from '../refusals/errors'
import { decorate } from './helpers'
import * as Phrases from './phrases'
import { strengthCheckerLoadFailed } from '../refusals/throwers'
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
 * `load` yourself only to warm up. A `load` that fails refuses the hello, a `VaultError` it throws as
 * it came and anything else with what it threw as the cause, so a vault that cannot check a new passphrase never opens.
 *
 * `safebyok/browser` ships `zxcvbnStrengthChecker`, or pass your own (notes/configuration.md). To ask it as the user types, call
 * `gating.checkStrength(typed)`, which answers its verdict.
 *
 * - A blank passphrase is sent back as a weak passphrase, unconditionally, without consulting the checker.
 * - The default strength checker refuses everything: see notes/configuration.md for why we do this, and instructions to supply one.
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

/** A strength checker as a bank keeps it: the host's, made to honor its contract by {@link guardStrengthChecker}. */
export type GuardedStrengthChecker = {
  (passphrase: string, scope: VaultScope): Promise<PassphraseVerdict>
  readonly load: () => Promise<void>
}

/** A verdict that admits, frozen so that a checker may share it. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

/** The verdict {@link DefaultStrengthChecker} answers of every passphrase: a word to the user, and one to the app's makers. */
const DefaultVerdict: PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This app can't accept a new passphrase yet: it hasn't been set up to judge how strong one is, so nothing was saved. To the app's makers: Bank.make needs a strengthChecker, such as zxcvbnStrengthChecker from safebyok/browser, as notes/configuration.md in safebyok's repository says under Pluggable Passphrase Strength Checker.",
})

/** The strength checker of a vault whose host chose none: every passphrase is too weak, so no vault can be made, nor a passphrase changed.
 * Its reason tells the app's makers where to look. It logs nothing.
 */
export const DefaultStrengthChecker: StrengthChecker = () => DefaultVerdict

/** The verdict on a blank new passphrase, which no checker hears. */
const BlankVerdict: PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember." })

// A blank passphrase is weak before the host's checker hears it. A throw is replaced, as the checker heard the passphrase;
// a failed `load` keeps its throw as the cause, as it heard nothing; a VaultError it throws passes as it came.
/** `hostChecker`, made to honor its contract: the one way a vault, or a dialog checking as the user types, asks it. */
export const guardStrengthChecker = (hostChecker: StrengthChecker): GuardedStrengthChecker => {
  const host = GX.strengthChecker.parse(hostChecker, { where: 'strengthChecker' })
  const check = async (passphrase: string, scope: VaultScope): Promise<PassphraseVerdict> => {
    // Frozen, so the host's checker can change nothing of what it is told.
    const told = CX.vaultScope.parse(scope)
    const typed = GX.passphraseCleartext.parse(passphrase)
    if (! typed.trim()) { return BlankVerdict }
    let answered: unknown
    try {
      // The spread reads each field here, inside the guard, so a getter or proxy of the host's that throws is replaced, and the parse below reads plain data.
      answered = { ...await host(typed, told) }
    } catch (err) {
      throw HostErrorSanitizer.refusalFor(err, 'unexpected_error', Phrases.StrengthCheckerThrew)
    }
    const verdict = GX.passphraseVerdict.parse(answered, { advice: Phrases.StrengthCheckerMisanswered })
    return verdict.strong ? StrongVerdict : verdict
  }
  const load = async (): Promise<void> => {
    try {
      await host.load?.()
    } catch (err) {
      if (isVaultError(err)) { throw err }
      throw strengthCheckerLoadFailed(err)
    }
  }
  return brandGuarded(decorate(check as GuardedStrengthChecker, { load }))
}

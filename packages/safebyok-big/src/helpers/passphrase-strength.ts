import { brandGuarded } from './consts'
import { isVaultError } from '../refusals/errors'
import { decorate } from './helpers'
import * as Phrases from './phrases'
import { strengthCheckerLoadFailed } from '../refusals/throwers'
import * as HostErrorSanitizer from '../refusals/host-error-sanitizer'
import * as CX from '../shapes/shapes-core'
import type { BankScope } from '../shapes/shapes-core'
import * as GX from '../shapes/shapes-gateish'
import type { PassphraseVerdict } from '../shapes/shapes-gateish'

/** `Device.make`'s `strengthChecker`: judges whether a new passphrase is strong enough, returning a {@link PassphraseVerdict}.
 * It is given the passphrase as typed, and the bank's scope: words a guesser who knows the user tries first.
 * It runs on each new passphrase before any key is derived: the one a `build_bank` gating builds the bank
 * with, and each one a `replace_passphrase` gating sets. It never runs on an unlock, and never hears a blank
 * passphrase, which is judged weak without it. It should not throw: one that throws, or returns no verdict,
 * refuses its call.
 *
 * It hears the passphrase in plain text: it should keep nothing, send nothing anywhere, and never quote
 * it, not even in its `reason`, which becomes the refusal's message.
 *
 * A checker that needs something fetched or built first, such as a dictionary, carries it as `load`.
 * Make the checker once, before any device, and pass the same one to each. Make `load` cost nothing once
 * it has succeeded, and forget a failure. A `load` that fails refuses the `ensureBank()` that ran it, so
 * a device that cannot judge a new passphrase never opens a bank.
 *
 * `safebyok-big/browser` ships `zxcvbnStrengthChecker`, or pass your own (notes/configuration.md). To judge as
 * the user types, call `gating.judgeStrength(typed)`. With no checker, every new passphrase is judged weak
 * ({@link DefaultStrengthChecker}).
 *
 * @example
 *   const strengthChecker = (typed: string) => (typed.length < 20 ? { strong: false, reason: 'Twenty characters or more, please.' } : { strong: true })
 * @example
 *   const strengthChecker = Object.assign((typed: string) => judge(typed), { load: () => loadWordList() })
 */
export type StrengthChecker = {
  (passphrase: string, scope: BankScope): PassphraseVerdict | Promise<PassphraseVerdict>
  /** Fetch or build what the checker needs before it can judge. Each device's `ensureBank()` runs it. */
  load?: (() => void | Promise<void>) | undefined
}

/** The host's strength checker as a device keeps it, wrapped by {@link guardStrengthChecker}. */
export type GuardedStrengthChecker = {
  (passphrase: string, scope: BankScope): Promise<PassphraseVerdict>
  readonly load: () => Promise<void>
}

/** The verdict that a passphrase is strong, frozen so that any checker may return it. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

/** The verdict {@link DefaultStrengthChecker} returns for every passphrase, with a word to the user and one to the app's makers. */
const DefaultVerdict: PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This app can't accept a new passphrase yet: it hasn't been set up to judge how strong one is, so nothing was saved. To the app's makers: Device.make needs a strengthChecker, such as zxcvbnStrengthChecker from safebyok-big/browser, as notes/configuration.md in safebyok's repository says under Pluggable Passphrase Strength Checker.",
})

/** The strength checker of a device given none: it judges every passphrase weak, so no bank can be built and no passphrase replaced.
 * Its reason tells the app's makers where to look. It logs nothing.
 */
export const DefaultStrengthChecker: StrengthChecker = () => DefaultVerdict

/** The verdict on a blank new passphrase, which no checker hears. */
const BlankVerdict: PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember." })

// A blank passphrase is weak before the host's checker hears it. A throw is replaced, as the checker heard the passphrase;
// a failed `load` keeps its throw as the cause, as it heard nothing; a VaultError it throws passes as it came.
/** Wrap `hostChecker` so that it keeps its contract, whatever it does.
 * Anything the checker throws is replaced by a refusal that keeps nothing of the throw.
 */
export function guardStrengthChecker(hostChecker: StrengthChecker): GuardedStrengthChecker {
  const host = GX.strengthChecker.parse(hostChecker, { where: 'strengthChecker' })
  const check = async (passphrase: string, scope: BankScope): Promise<PassphraseVerdict> => {
    // Frozen, so the host's checker can change nothing of what it is told.
    const told = CX.bankScope.parse(scope)
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

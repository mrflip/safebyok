import * as Z from 'zod/mini'
import { VaultError } from './errors'
import type { VaultScope } from './types'

/**
 * What a strength checker finds of one passphrase: strong enough, or weak, with a `reason` written
 * for the user -- calm, saying what to do, never quoting the passphrase -- which a field shows
 * beside the passphrase, and the vault refuses with as its message.
 */
export type PassphraseVerdict = { strong: true } | { strong: false, reason: string }

/**
 * A check that a new passphrase is strong enough, `Vault.make`'s `strengthChecker`: handed the
 * passphrase as typed, and the scope of the vault it is for -- the applabel, the user's id and the
 * vaultlabel, words a guesser who knows the user tries first -- it answers a
 * {@link PassphraseVerdict}, at once or as a promise. Its whole contract is that answer, good or
 * bad: what it cannot judge, it answers weak, with a reason saying what to do. The vault runs it on
 * every passphrase about to become a way in -- the one the first `unlock()` creates a vault with,
 * and each new one `putWayin()` sets -- before any key derivation, and refuses a weak one with kind
 * 'weak_passphrase', the verdict's reason its message. It never runs on `unlock()` of a vault that
 * stands.
 *
 * Call the same function from the passphrase field as the user types, so they hear "too weak"
 * before they submit (`safebyok-react`'s dialog does). It hears the passphrase in plain text: it
 * should keep nothing, send nothing anywhere, and never put the passphrase in its reason. In a
 * browser, `browserOpts()` from `safebyok/browser` supplies `zxcvbnStrengthChecker`, which turns
 * away short passphrases, common passwords and patterns; pass your own after the spread to
 * replace it, or wrap it to ask for more. CUSTOMIZATION.md says how to choose one.
 *
 * @example
 *   const verdict = await strengthChecker(typed, { applabel: vault.applabel, user_id: vault.user_id, vaultlabel: vault.vaultlabel })
 *   setHint(verdict.strong ? '' : verdict.reason)
 */
export type StrengthChecker = (passphrase: string, scope: VaultScope) => PassphraseVerdict | Promise<PassphraseVerdict>

/** A verdict that admits. Frozen, so a checker handing it out shares it safely. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

/** What the unchosen checker says to the user of every passphrase. */
const UnchosenVerdict: PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This app can't accept a new passphrase yet: it has not been set up to judge how strong one is. Nothing was saved; let the app's makers know.",
})

/**
 * The strength checker of a vault whose host chose none: it finds every passphrase too weak, so no
 * vault can be made, nor a passphrase changed, until the host chooses one. The vault says so once
 * through the host's logger, pointing at CUSTOMIZATION.md.
 *
 * @example UnchosenStrengthChecker('correct horse battery staple')   // { strong: false, reason: "This app can't accept a new passphrase yet: ..." }
 */
export const UnchosenStrengthChecker: StrengthChecker = () => UnchosenVerdict

/** What the vault logs, once, when it first consults {@link UnchosenStrengthChecker}. */
export const UnchosenCheckerSaid = "Vault.make was given no strengthChecker, so every new passphrase is refused as too weak: no vault can be made, nor a passphrase changed. Choose one: in a browser, spread browserOpts() from safebyok/browser, which supplies zxcvbnStrengthChecker, or pass strengthChecker yourself. CUSTOMIZATION.md, under Pluggable Passphrase Strength Checker, says how to choose."

const reasonText = Z.string().check(Z.minLength(1))
const passphraseVerdict = Z.union([
  Z.object({ strong: Z.literal(true) }),
  Z.object({ strong: Z.literal(false), reason: reasonText }),
])

/**
 * `passphrase` put to `strengthChecker` for the vault named by `scope`, refused with kind
 * 'weak_passphrase' and the checker's reason when it finds it weak; kind 'bad_option' for a
 * checker that answers anything but a verdict. A throw from the checker is refused as
 * 'unexpected_error', carrying nothing of what it threw -- no kind, no meta, no cause -- as the
 * checker heard the passphrase.
 */
export const checkStrongEnough = async (strengthChecker: StrengthChecker, passphrase: string, scope: VaultScope): Promise<void> => {
  let verdict: unknown
  try {
    verdict = await strengthChecker(passphrase, scope)
  } catch {
    throw new VaultError('unexpected_error', "The strengthChecker threw rather than answering a verdict. What it threw is left out of this report, as it heard the passphrase: have it answer { strong: false, reason } for a passphrase it cannot judge, and catch its own failures.")
  }
  const checked = passphraseVerdict.safeParse(verdict)
  if (! checked.success) {
    throw new VaultError('bad_option', "The strengthChecker answered something other than a verdict: { strong: true }, or { strong: false, reason } with the reason as non-empty text.")
  }
  if (! checked.data.strong) { throw new VaultError('weak_passphrase', checked.data.reason) }
}

/**
 * A host's `strengthChecker`, exactly as handed in, once it is a function; for one left out,
 * {@link UnchosenStrengthChecker}, which refuses every passphrase. Kind 'bad_option' for anything
 * else. Vault.make runs it on its option; a binding or wrapper that takes the options apart runs it
 * first, once, as soon as it is handed the checker, and passes on what it hands back.
 *
 * @example parseStrengthChecker(zxcvbnStrengthChecker)  // the same function
 * @example parseStrengthChecker(undefined)               // UnchosenStrengthChecker
 * @example parseStrengthChecker(12)                      // throws: bad_option
 */
export const parseStrengthChecker = (strengthChecker: StrengthChecker | undefined): StrengthChecker => {
  if (strengthChecker === undefined) { return UnchosenStrengthChecker }
  if (typeof strengthChecker !== 'function') {
    throw new VaultError('bad_option', "strengthChecker is a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }. In a browser, spread browserOpts() from safebyok/browser, which supplies zxcvbnStrengthChecker; elsewhere, pass your own.")
  }
  return strengthChecker
}

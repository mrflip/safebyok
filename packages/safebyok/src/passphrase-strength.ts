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
 * {@link PassphraseVerdict}, at once or as a promise. Its contract is that answer, good or bad,
 * for every passphrase it is handed; it never throws. The vault runs it on every passphrase about
 * to become a way in -- the one the first `unlock()` creates a vault with, and each new one
 * `putWayin()` sets -- before any key derivation, and refuses a weak one with kind
 * 'weak_passphrase', the verdict's reason its message. It never runs on `unlock()` of a vault that
 * stands.
 *
 * A checker that needs something fetched or built first -- a dictionary, say -- carries it as
 * `load`, which the vault's `hello()` runs, every time: so `load` is idempotent, costing nothing
 * once it has succeeded, and forgetting a failure, so the next hello tries again. A `load` that
 * fails fails the hello, kind 'unexpected_error', what it threw the cause: a vault that cannot
 * check a new passphrase never opens.
 *
 * It hears the passphrase in plain text: it should keep nothing, send nothing anywhere, and never
 * put the passphrase in its reason. In a browser, `browserOpts()` from `safebyok/browser`
 * supplies `zxcvbnStrengthChecker`, which turns away short passphrases, common passwords and
 * patterns; pass your own after the spread to replace it, or wrap it to ask for more.
 * CUSTOMIZATION.md says how to choose one. To ask it as the user types, call the vault's own,
 * `vault.strengthChecker`, which holds it to this contract.
 *
 * @example
 *   const strengthChecker = (typed: string) => (typed.length < 20 ? { strong: false, reason: 'Twenty characters or more, please.' } : { strong: true })
 * @example
 *   const strengthChecker = Object.assign((typed: string) => judge(typed), { load: () => loadWordList() })
 */
export type StrengthChecker = {
  (passphrase: string, scope: VaultScope): PassphraseVerdict | Promise<PassphraseVerdict>
  /** What the checker needs fetched or built before it can judge, idempotently; `hello()` runs it. */
  load?: (() => void | Promise<void>) | undefined
}

/** A strength checker as a vault keeps it, `vault.strengthChecker`: the host's, held to its contract.
 * It answers a verdict through a promise; a blank passphrase (empty, or only spaces) is weak
 * before the host's checker hears it. It refuses only a broken checker: kind 'bad_option'
 * for one that answers anything but a verdict, and 'unexpected_error' for one that throws,
 * carrying nothing of what it threw -- no kind, no meta, no cause -- as the checker heard the
 * passphrase. `load` runs the host's, if any, and refuses its failure as 'unexpected_error', what
 * it threw the cause, as it heard nothing.
 *
 * @example
 *   const verdict = await vault.strengthChecker(typed, { applabel: vault.applabel, user_id: vault.user_id, vaultlabel: vault.vaultlabel })
 *   setHint(verdict.strong ? '' : verdict.reason)
 */
export type GuardedStrengthChecker = {
  (passphrase: string, scope: VaultScope): Promise<PassphraseVerdict>
  load: () => Promise<void>
}

/** A verdict that admits. Frozen, so a checker handing it out shares it safely. */
export const StrongVerdict: PassphraseVerdict = Object.freeze({ strong: true })

/** What {@link DefaultStrengthChecker} answers of every passphrase: a word to the user, and one to the app's makers. */
const DefaultVerdict: PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This app can't take a new passphrase yet: it hasn't been set up to judge how strong one is, so nothing was saved. To the app's makers: Vault.make needs a strengthChecker, as safebyok's CUSTOMIZATION.md says under Pluggable Passphrase Strength Checker.",
})

/**
 * The strength checker of a vault whose host chose none: it finds every passphrase too weak, so no
 * vault can be made, nor a passphrase changed, until the host chooses one. Its reason, which the
 * refusal carries as its message, tells the app's makers where to look. It logs nothing.
 *
 * @example DefaultStrengthChecker('correct horse battery staple')   // { strong: false, reason: "This app can't take a new passphrase yet: ..." }
 */
export const DefaultStrengthChecker: StrengthChecker = () => DefaultVerdict

/** True for a {@link StrengthChecker}: a function, whose `load`, if it carries one, is a function too. */
const isStrengthChecker = (candidate: unknown): candidate is StrengthChecker => (
  typeof candidate === 'function' && ['undefined', 'function'].includes(typeof (candidate as { load?: unknown }).load)
)

/** What Vault.make's options schema holds `strengthChecker` to. */
export const strengthChecker = Z.custom<StrengthChecker>(isStrengthChecker, {
  error: "expected a function from the passphrase, and the vault's scope, to a verdict, { strong: true } or { strong: false, reason }, its load, if it carries one, a function too. In a browser, spread browserOpts() from safebyok/browser, which supplies zxcvbnStrengthChecker; elsewhere, pass your own.",
})

/** The verdict on a blank new passphrase, which no checker hears. */
const BlankVerdict: PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember." })

const reasonText = Z.string().check(Z.minLength(1))
const passphraseVerdict = Z.union([
  Z.object({ strong: Z.literal(true) }),
  Z.object({ strong: Z.literal(false), reason: reasonText }),
])

/** `hostChecker` held to its contract, as the vault keeps it ({@link GuardedStrengthChecker}).
 * It is the only caller of the host's checker, so every check -- the vault's, and a dialog's as
 * the user types -- decides strong or weak alike.
 *
 * @example guardStrengthChecker(zxcvbnStrengthChecker)('', scope)   // resolves { strong: false, reason: "A new passphrase can't be empty ..." }
 * @example guardStrengthChecker(() => ({ strong: 'yes' }))('pw', scope)   // rejects: bad_option
 */
export const guardStrengthChecker = (hostChecker: StrengthChecker): GuardedStrengthChecker => {
  const check = async (passphrase: string, scope: VaultScope): Promise<PassphraseVerdict> => {
    if (! passphrase.trim()) { return BlankVerdict }
    // Frozen, so the host's checker can change nothing of what it is told.
    const told = Object.freeze({ applabel: scope.applabel, user_id: scope.user_id, vaultlabel: scope.vaultlabel })
    let checked: ReturnType<typeof passphraseVerdict.safeParse>
    try {
      // Parsed inside the guard: the verdict's fields may be the checker's getters, and throw as they are read.
      checked = passphraseVerdict.safeParse(await hostChecker(passphrase, told))
    } catch {
      throw new VaultError('unexpected_error', "The strengthChecker threw rather than answering a verdict, or answered one that threw as it was read. What it threw is left out of this report, as it heard the passphrase: have it answer { strong: false, reason } for a passphrase it cannot judge, and catch its own failures.")
    }
    if (! checked.success) {
      throw new VaultError('bad_option', "The strengthChecker answered something other than a verdict: { strong: true }, or { strong: false, reason } with the reason as non-empty text.")
    }
    return checked.data.strong ? StrongVerdict : checked.data
  }
  const load = async (): Promise<void> => {
    try {
      await hostChecker.load?.()
    } catch (err) {
      throw new VaultError('unexpected_error', "The strengthChecker's load() failed, so the vault could not check a new passphrase, and hello() was refused rather than open a vault in that state. Its error is this error's cause. For zxcvbnStrengthChecker, it is the chunk holding zxcvbn and its dictionary that would not load: check that your build ships it and your page may fetch it. A dropped connection mends at the next hello().", { cause: err })
    }
  }
  return Object.assign(check, { load })
}

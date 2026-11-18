import { HostErrorSanitizer } from 'safebyok-big'
import { Consts, Errors, GX, Helpers, Phrases, Strength, Throwers } from 'safebyok-big/internals'
import { type GuardedStrengthChecker, type StrengthChecker, strengthChecker } from '../shapes/shapes-gateish'
import { type BankScope, bankScope } from '../shapes/shapes-stamps'

// == [The default]: DefaultStrengthChecker

/** The verdict {@link DefaultStrengthChecker} returns for every passphrase, with a word to the user and one to the app's makers. */
const DefaultVerdict: GX.PassphraseVerdict = Object.freeze({
  strong: false,
  reason: "This app can't accept a new passphrase yet: it hasn't been set up to judge how strong one is, so nothing was saved. To the app's makers: Device.make needs a strengthChecker, such as zxcvbnStrengthChecker from safebyok-big/browser, as notes/configuration.md in safebyok's repository says under Pluggable Passphrase Strength Checker.",
})

/** The strength checker of a device given none: it judges every passphrase weak, so no bank can be born.
 * Its reason tells the app's makers where to look. It logs nothing.
 */
export const DefaultStrengthChecker: StrengthChecker = () => DefaultVerdict
// --

// == [The guard]: guardStrengthChecker

/** The verdict on a blank new passphrase, which no checker hears. */
const BlankVerdict: GX.PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make a strong one, and easy to remember." })

// A blank passphrase is weak before the host's checker hears it. A throw is replaced, as the checker heard the passphrase;
// a failed `load` keeps its throw as the cause, as it heard nothing; a VaultError it throws passes as it came (G1, G8, G9).
/** Wrap `hostChecker` so that it keeps its contract, whatever it does.
 * Anything the checker throws is replaced by a refusal that keeps nothing of the throw.
 */
export function guardStrengthChecker(hostChecker: StrengthChecker): GuardedStrengthChecker {
  const host = strengthChecker.parse(hostChecker, { where: 'strengthChecker' })
  const check = async (passphrase: string, scope: BankScope): Promise<GX.PassphraseVerdict> => {
    // Frozen, so the host's checker can change nothing of what it is told.
    const told = Object.freeze(bankScope.parse(scope))
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
    return verdict.strong ? Strength.StrongVerdict : verdict
  }
  const load = async (): Promise<void> => {
    try {
      await host.load?.()
    } catch (err) {
      if (Errors.isVaultError(err)) { throw err }
      throw Throwers.strengthCheckerLoadFailed(err)
    }
  }
  return Consts.brandGuarded(Helpers.decorate(check as GuardedStrengthChecker, { load }))
}
// --

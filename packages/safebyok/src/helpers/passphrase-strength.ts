import { HostErrorSanitizer } from 'safebyok-big'
import { Consts, Errors, GX, Helpers, Phrases, Strength } from 'safebyok-big/internals'
import { type GuardedStrengthChecker, type StrengthChecker, GateishChecks } from '../shapes/shapes-gateish'
import { type BankScope, StampChecks } from '../shapes/shapes-stamps'
import * as Throwers from '../refusals/throwers'
import { bulletproofAsyncHandlerOf } from './bulletproof'

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

/** The verdict on a blank new passphrase, which no checker is asked to judge. */
const BlankVerdict: GX.PassphraseVerdict = Object.freeze({ strong: false, reason: "A new passphrase can't be empty or only spaces: a few words together make one that is strong and easy to remember." })

// A blank passphrase is judged weak without asking the host's checker. What the checker throws is replaced, since it was given
// the passphrase; what a failed `load` throws becomes the cause, since `load` is given nothing, and a VaultError `load` throws
// passes unchanged (G1, G8, G9).
/** Wrap `hostChecker` so that it meets its contract, whatever it does.
 * Anything the checker throws is replaced by a refusal that carries nothing of the throw.
 */
export function guardStrengthChecker(hostChecker: StrengthChecker): GuardedStrengthChecker {
  const host = GateishChecks.strengthChecker.parse(hostChecker, { where: 'strengthChecker' })
  // The spread reads each field here, inside the guard, so a getter or proxy of the host's that throws is replaced, and the parse below reads plain data.
  const judge = bulletproofAsyncHandlerOf(async (typed: string, told: BankScope) => ({ ...await host(typed, told) }), {
    ifError: 'fail', transformer: (err) => HostErrorSanitizer.refusalFor(err, 'unexpected_error', Phrases.StrengthCheckerThrew),
  })
  const check = async (passphrase: string, scope: BankScope): Promise<GX.PassphraseVerdict> => {
    // Frozen, so the host's checker can change nothing of what it is told.
    const told = Object.freeze(StampChecks.bankScope.parse(scope))
    const typed = GX.passphraseCleartext.parse(passphrase)
    if (! typed.trim()) { return BlankVerdict }
    const verdict = GX.passphraseVerdict.parse(await judge(typed, told), { advice: Phrases.StrengthCheckerMisanswered })
    return verdict.strong ? Strength.StrongVerdict : verdict
  }
  const load = bulletproofAsyncHandlerOf(async () => { await host.load?.() }, {
    ifError: 'fail', transformer: (err) => (Errors.isVaultError(err) ? err : Throwers.strengthCheckerLoadFailed(err)),
  })
  return Consts.brandGuarded(Helpers.decorate(check as GuardedStrengthChecker, { load }))
}
// --

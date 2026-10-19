# Customizing safebyok

The parts of safebyok an app chooses for itself, beyond the options every app answers the same
way. The package README has the options; this file says how to choose.

## Pluggable Passphrase Strength Checker

Every new passphrase -- the one a vault is created with, and each one `vault.putWayin()` sets --
goes to `Vault.make`'s `strengthChecker` before anything is derived or saved. A passphrase the
checker finds weak is refused with kind `weak_passphrase`, its reason the message your user sees.
A passphrase already in use is never checked again: `unlock()` of a vault that stands never asks.

**The contract** is one answer, good or bad:

```ts
type StrengthChecker = (passphrase: string, scope: { applabel: string, user_id: string, vaultlabel: string })
  => { strong: true } | { strong: false, reason: string } | Promise<...the same>
```

* Answer, never throw. A passphrase the checker cannot judge -- its word list did not load, a
  service it asks is down -- is answered `{ strong: false, reason }`, the reason saying what to
  do. A checker that throws is refused `unexpected_error`, and nothing of what it threw is kept:
  it heard the passphrase, so its error might quote it.
* The reason is for your user: calm, saying what to do, and never quoting the passphrase.
* It runs on the device, keeps nothing, and sends nothing anywhere: it hears the passphrase in
  plain text.
* `scope` names the vault: words a guesser who knows the user tries first. Treat them as the
  user's own words.
* Build it once, at module level. The vault keeps the checker it was opened with, and
  `safebyok-react`'s provider reopens the vault for a new one.

**If you choose none**, every new passphrase is refused as too weak, so no vault can be made,
and the vault logs once, at error level, that a checker must be chosen, pointing here. That is the
contract at its plainest: the core will not guess how strong a passphrase your users need, and a
checker of length alone is no checker ('a' and eleven spaces is twelve characters).

### The one safebyok ships

`safebyok/browser` exports `zxcvbnStrengthChecker`, and `browserOpts()` supplies it beside the
key deriver and the device store:

```ts
import { Vault } from 'safebyok'
import { browserOpts } from 'safebyok/browser'

const vault = Vault.make({ applabel: 'acme', userId, vaultlabel: 'main', vaultDB, ...browserOpts() })
```

It is a good checker: at least 12 characters, then a zxcvbn score of at least 3 of 4, which turns
away common passwords and ones very like them, keyboard walks, repeats, sequences, dates, and the
vault's own names, with no composition rules (NIST SP 800-63B advises against them). But it is
useless without its dictionary. Its strength is `@zxcvbn-ts/language-common`'s common-password
list, about 214 kB minified and brotlied, which it loads with a dynamic `import()` at its first
check, as a chunk of its own. Without that list it cannot tell `password1234` from a good
passphrase, so when the chunk does not load -- a dropped connection, a bundler that leaves the
chunk out, a Content Security Policy that blocks it, an offline build -- it answers weak ("This
passphrase couldn't be checked just now"), and no passphrase can be set until it does. Check that
your build ships the chunk and your page may load it.

To ask for more than it does, wrap it:

```ts
import { zxcvbnStrengthChecker } from 'safebyok/browser'

const strengthChecker = async (typed: string, scope: VaultScope) => (
  typed.toLowerCase().includes('acme') ? { strong: false, reason: 'Leave out the name of the app.' } : await zxcvbnStrengthChecker(typed, scope)
)
const vault = Vault.make({ ...opts, ...browserOpts(), strengthChecker })
```

### Your own

Pass it after the spread, and it replaces ours. To keep zxcvbn out of your bundle altogether, do
not spread `browserOpts()`: name the other two yourself, and nothing imports the checker.

```ts
import { Vault, argon2idWebV1Deriver } from 'safebyok'
import { idbDeviceDB } from 'safebyok/idb'

const vault = Vault.make({ ...opts, keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB(), strengthChecker: myStrengthChecker })
```

Call the same checker from your passphrase field as the user types, so they hear the reason
before they submit; `safebyok-react`'s dialog does so by default.

### Asking an AI for help

Paste this into an assistant, pick the reason that fits (or write your own), and fill in the
blanks:

> I'm building an app on safebyok (https://www.npmjs.com/package/safebyok), an end-to-end
> encrypted vault for API keys and other small secrets. `Vault.make` takes a `strengthChecker`
> option: a function `(passphrase, scope) => { strong: true } | { strong: false, reason }`, sync
> or async, where `scope` is `{ applabel, user_id, vaultlabel }`. Its contract, from the
> package's CUSTOMIZATION.md ("Pluggable Passphrase Strength Checker"): it answers and never
> throws, answering weak with a reason for anything it cannot judge; the reason is shown to my
> user, so it is calm, says what to do, and never quotes the passphrase; and it runs on the
> device, keeping and sending nothing. Left out, every new passphrase is refused. safebyok ships
> `zxcvbnStrengthChecker` in `safebyok/browser`, which `browserOpts()` supplies.
>
> Please help me choose a passphrase strength checker and wire it in. I'm not satisfied with the
> default because:
>
> - I can't get it to work.
> - I think I'm overriding it, but it isn't being tree-shaken out of my bundle.
> - I already have a checker I prefer, and want to plug it in instead.
> - It is too big a package for my app.
> - It's not in my app's language.
> - it's too annoying and I just want it to let everything through, I understand the risks, you're not the boss of me
>
> My app is built with ___ and bundled with ___. Show me the code, say where it goes, and tell me
> plainly what my users give up with the checker you suggest.

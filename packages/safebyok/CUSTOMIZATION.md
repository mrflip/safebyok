# Customizing safebyok

The parts of safebyok an app chooses for itself, beyond the options every app answers the same
way. The package README has the options; this file says how to choose.

## Pluggable Passphrase Strength Checker

Every new passphrase -- the one a vault is created with, and each one `vault.putWayin()` sets --
goes to `Bank.make`'s `strengthChecker` before anything is derived or saved. A passphrase the
checker finds weak is refused with kind `weak_passphrase`, its reason the message your user sees.
A passphrase already in use is never checked again: an `unlock_vault` gating never asks.

**The contract** is one answer, good or bad, and, if the checker needs one, a load:

```ts
type StrengthChecker = {
  (passphrase: string, scope: { applabel: string, user_id: string, vaultlabel: string }):
    { strong: true } | { strong: false, reason: string } | Promise<...the same>
  load?: () => void | Promise<void>
}
```

* Answer, never throw. A checker that throws is refused `unexpected_error`, and nothing of what the checker
  threw is kept: it heard the passphrase, so its error might quote it. A checker that answers
  anything but a verdict is refused `bad_option`.
* Whatever it needs fetched or built first -- a word list, say -- it fetches in `load`, which the
  bank's `hello()` runs, once, before any vault is born: so `load` is idempotent, costing nothing
  once it has succeeded, and forgets a failure, so the next hello tries again. A `load` that
  fails fails the hello, `unexpected_error` with what it threw as the cause, and leaves the bank
  `refused`: a bank that cannot judge a new passphrase births no vault, rather than failing
  later, when the user chooses one.
* A blank passphrase (empty, or only spaces) is weak before the checker hears it.
* The reason is for your user: calm, saying what to do. It is shown to the user as given, so it must never quote the passphrase.
* It runs on the device, keeps nothing, and sends nothing anywhere: it hears the passphrase in
  plain text.
* `scope` names the vault: words a guesser who knows the user tries first. Treat them as the
  user's own words.
* Build it once, at module level. A bank keeps the checker it was made with: make a new bank
  for a new checker.

**If you choose none**, every new passphrase is refused as too weak, so no vault can be made, and
the refusal's message says, to the user and to you, that a checker must be chosen, pointing here.
Nothing is logged: the first passphrase anyone tries in development meets it. That is the
contract at its plainest: the core will not guess how strong a passphrase your users need, and a
checker of length alone is no checker ('a' and eleven spaces is twelve characters).

### The one safebyok ships

`safebyok/browser` exports `zxcvbnStrengthChecker`, and `browserOpts()` supplies it beside the
key deriver and the device store:

```ts
import { Bank } from 'safebyok'
import { browserOpts } from 'safebyok/browser'

const bank = Bank.make({ applabel: 'acme', vaultDB, ...browserOpts() })
```

It is a good checker: at least 12 characters, then a zxcvbn score of at least 3 of 4, which turns
away common passwords and ones very like them, keyboard walks, repeats, sequences, dates, and the
vault's own names, with no composition rules (NIST SP 800-63B advises against them). But it is
useless without its dictionary. Its strength is `@zxcvbn-ts/language-common`'s common-password
list, about 214 kB minified and brotlied, which its `load` fetches with a dynamic `import()`, as a
chunk of its own, at the bank's `hello()`. Without that list it cannot tell `password1234` from a
good passphrase, so when the chunk does not load -- a dropped connection, a bundler that leaves the
chunk out, a Content Security Policy that blocks it, an offline build -- the hello fails, loud
and clear, and no vault is born until a later hello loads it. Check that your build ships
the chunk and your page may load it.

To ask for more than it does, wrap it, and carry its `load` along:

```ts
import { zxcvbnStrengthChecker } from 'safebyok/browser'

const strengthChecker = Object.assign(async (typed: string, scope: VaultScope) => (
  typed.toLowerCase().includes('acme') ? { strong: false, reason: 'Leave out the name of the app.' } : await zxcvbnStrengthChecker(typed, scope)
), { load: zxcvbnStrengthChecker.load })
const bank = Bank.make({ ...opts, ...browserOpts(), strengthChecker })
```

A wrapper that leaves `load` behind still works -- zxcvbn loads at the first check instead -- but
a chunk that will not load then fails that check, `unexpected_error`, as the user chooses a
passphrase, rather than the hello.

### Your own

Pass it after the spread, and it replaces ours. To keep zxcvbn out of your bundle altogether, do
not spread `browserOpts()`: name the other two yourself, and nothing imports the checker.

```ts
import { Bank, argon2idWebV1Deriver } from 'safebyok'
import { idbDeviceDB } from 'safebyok/idb'

const bank = Bank.make({ ...opts, keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB(), strengthChecker: myStrengthChecker })
```

Ask the vault's checker from your passphrase field as the user types, so they hear the reason
before they submit: `vault.tryCheckStrength(typed)` is yours, held to the contract above, its
`weak_passphrase` refusal carrying the reason as its message, so the field and the vault decide
alike. `safebyok-react`'s dialog does so by default.

### Asking an AI for help

Paste this into an assistant, pick the reason that fits (or write your own), and fill in the
blanks:

> I'm building an app on safebyok (https://www.npmjs.com/package/safebyok), an end-to-end
> encrypted vault for API keys and other small secrets. `Bank.make` takes a `strengthChecker`
> option: a function `(passphrase, scope) => { strong: true } | { strong: false, reason }`, sync
> or async, where `scope` is `{ applabel, user_id, vaultlabel }`, and an optional idempotent
> `load` the bank runs at `bank.hello()` for anything it must fetch first. Its contract, from the
> package's CUSTOMIZATION.md ("Pluggable Passphrase Strength Checker"): it answers a verdict for
> every passphrase and never throws; the reason is shown to my
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

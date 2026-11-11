# Configuring safebyok

This file covers the parts of safebyok an app chooses for itself, beyond the options every app
sets the same way. `Bank.make`'s options type, `BankOpts`, lists the options. This file says how to
choose.

## Pluggable Passphrase Strength Checker

Every new passphrase goes to `Bank.make`'s `strengthChecker` before anything is derived or put:
the one a `build_vault` gating creates a vault with, and each one a `replace_passphrase` gating
sets. A passphrase the checker finds weak is refused with kind `weak_passphrase`, and the checker's
reason is the message your user sees. A passphrase already in use is never checked again: an
`unlock_vault` gating never calls the checker.

**The contract** is a verdict, strong or weak, and a `load` if the checker needs one:

```ts
type StrengthChecker = {
  (passphrase: string, scope: { applabel: string, user_id: string, vaultlabel: string }):
    { strong: true } | { strong: false, reason: string } | Promise<...the same>
  load?: () => void | Promise<void>
}
```

* Return a verdict, never throw. If a checker throws, the call is refused, and nothing of what the
  checker threw is kept: the checker was given the passphrase, so its error might quote it. If a
  checker returns anything but a verdict, the call is refused too.
* Whatever the checker needs fetched or built first (a word list, say), it fetches in `load`. The
  bank's `hello()` runs `load` before any vault is born. So make `load` idempotent: it costs
  nothing once it has succeeded, and it forgets a failure, so the next hello tries again. A `load`
  that fails makes the hello fail, with what it threw as the cause, and the bank's `stage` stays
  `made`. A bank that cannot judge a new passphrase creates no vault, rather than failing later,
  when the user chooses one.
* A blank passphrase (empty, or only spaces) is weak, and never reaches the checker.
* The reason is for your user: calm, saying what to do. It is shown to the user as given, so it
  must never quote the passphrase.
* The checker runs on the device, keeps nothing, and sends nothing anywhere, because it receives
  the passphrase as cleartext.
* `scope` names the vault, and its names are words a guesser who knows the user tries first. Treat
  them as the user's own words.
* Build the checker once, at module level. A bank keeps the checker it was made with: make a new
  bank for a new checker.

**If you choose none**, every new passphrase is refused as too weak, so no vault can be made. The
refusal's message tells the user, and you, that a checker must be chosen, and points here. Nothing
is logged: the first passphrase anyone tries in development shows the message. That is the contract
at its plainest. The core will not guess how strong a passphrase your users need, and a checker
that only counts characters is no checker ('a' and eleven spaces is twelve characters).

### The one safebyok ships

`safebyok/browser` exports `zxcvbnStrengthChecker`, built on zxcvbn-ts (`@zxcvbn-ts/core`, over the
common dictionary of `@zxcvbn-ts/language-common`):

* A new passphrase needs `MinPassphraseChars` (12) characters, counted as a reader counts them, and
  then a zxcvbn score of `MinZxcvbnScore` (3, of 0 to 4) or more. There are no composition rules:
  it never asks for a digit, a capital or a symbol. A few words that don't usually go together
  pass. A common password with a capital and an exclamation mark on the end does not.
* The vault's own names (`applabel`, `user_id`, `vaultlabel`) are among the words it tries first.
* Its reasons are its own, in English, and never quote the passphrase.
* Its dictionary, most of its weight, is a separate chunk, which its `load` fetches when the
  bank's `hello()` runs, never at import. If the dictionary does not load, the hello fails, and the
  next hello tries again. If the checker is called before its dictionary has loaded, it loads it
  first. If it cannot, it returns a weak verdict, saying the passphrase could not be checked just
  now.

`browserOpts()` gives it to `Bank.make` with the rest of what a browser app usually chooses:
`argon2idWebV1Deriver` and an `idbDeviceDB` over the `dbName` you name. It returns the same frozen
bag for the same `dbName`, so it is safe to call during render, and a field you pass after the
spread wins. It supplies no `device_id`: keep your own, a `crypto.randomUUID()` per device.

```ts
import { Bank } from 'safebyok'
import { browserOpts } from 'safebyok/browser'

const bank = Bank.make({ ...browserOpts({ dbName: 'acme' }), applabel: 'acme', user_id, device_id, vaultDB, requestCleartext })
```

Why these live in `safebyok/browser` rather than as `Bank.make`'s defaults is
`notes/good_bank_opts_are_in_browser.md`: an app that never imports them never ships them.

### Wrapping it

To add a rule of your own, or to put its reasons in your user's language, wrap it, and carry its
`load` across so the bank still loads the dictionary at `hello()`:

```ts
import { Bank, type VaultScope } from 'safebyok'
import { browserOpts, zxcvbnStrengthChecker } from 'safebyok/browser'

const strengthChecker = Object.assign(async (typed: string, scope: VaultScope) => {
  if (typed.toLowerCase().includes('acme')) { return { strong: false, reason: 'Leave our name out of it.' } }
  return zxcvbnStrengthChecker(typed, scope)
}, { load: zxcvbnStrengthChecker.load })

const bank = Bank.make({ ...browserOpts({ dbName: 'acme' }), strengthChecker, applabel: 'acme', user_id, device_id, vaultDB, requestCleartext })
```

### Leaving it out: your own

Pass your own `strengthChecker` after the spread, and zxcvbn never runs. To keep it out of your
bundle too, import the deriver and the device database by name rather than `browserOpts`:

```ts
import { Bank } from 'safebyok'
import { argon2idWebV1Deriver, idbDeviceDB } from 'safebyok/browser'

const bank = Bank.make({ ...opts, keyDeriver: argon2idWebV1Deriver, deviceDB: idbDeviceDB({ dbName: 'acme' }), strengthChecker: myStrengthChecker })
```

Write yours to the contract, or wrap another library that judges passphrases.

A checker that needs a dictionary is useless without it. Fetch it in `load`, with a dynamic
`import()` as a separate chunk. Then, when the chunk does not load (a dropped connection, a bundler
that leaves it out, a Content Security Policy that blocks it, an offline build), the hello fails
loudly, and no vault is born until a later hello loads it.

Call the vault's checker from your passphrase field as the user types, so they see the reason
before they submit. `gating.checkStrength(typed)` returns the verdict of your checker, under the
contract above (`{ strong: true }` or `{ strong: false, reason }`), so the field and the vault
decide alike. `safebyok-react`'s dialog does this by default.

### Asking an AI for help

Paste this into an assistant, pick the reason that fits (or write your own), and fill in the
blanks:

> I'm building an app on safebyok (https://www.npmjs.com/package/safebyok), an end-to-end
> encrypted vault for API keys and other small secrets. `Bank.make` takes a `strengthChecker`
> option: a function `(passphrase, scope) => { strong: true } | { strong: false, reason }`, sync
> or async, where `scope` is `{ applabel, user_id, vaultlabel }`, and an optional idempotent
> `load` the bank runs at `bank.hello()` for anything it must fetch first. Its contract, from the
> repository's notes/configuration.md ("Pluggable Passphrase Strength Checker"): it returns a verdict for
> every passphrase and never throws; the reason is shown to my
> user, so it is calm, says what to do, and never quotes the passphrase; and it runs on the
> device, keeping and sending nothing. Left out, every new passphrase is refused. `safebyok/browser`
> exports `zxcvbnStrengthChecker` (12 characters, then a zxcvbn score of 3 of 4), which its
> `browserOpts()` includes.
>
> Please help me choose a passphrase strength checker and wire it in. What matters to me:
>
> - I want a good one with little fuss.
> - I already have a checker I prefer, and want to plug it in.
> - It must be small in my bundle.
> - It must judge passphrases in my app's language.
> - it's too annoying and I just want it to let everything through, I understand the risks, you're not the boss of me
>
> My app is built with ___ and bundled with ___. Show me the code, say where it goes, and tell me
> plainly what my users give up with the checker you suggest.

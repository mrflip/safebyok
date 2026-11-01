# Configuring safebyok

What a host passes to `Bank.make`, option by option, with the choice each one asks of you. The
README is the tour; this page is the reference a refusal points at.

## Options

### Strength checker

safebyok refuses every new passphrase until the bank has a `strengthChecker`. That is on purpose:
how strong a passphrase must be is your call, and the library will not make it for you by
default. Without one, `bank.ensureVault` and `vault.replacePassphrase` refuse with
`Phrases.NoStrengthChecker` and nothing is saved.

The usual choice is the bundled zxcvbn checker. It fetches zxcvbn and its dictionary on
`bank.hello()`, requires 12 characters and a zxcvbn score of 3, and refuses a passphrase that
holds the app's name, the user's id or the vault's label:

```ts
import { zxcvbnStrengthChecker } from 'safebyok/browser'

const bank = Bank.make({ ..., strengthChecker: zxcvbnStrengthChecker })
```

Your own checker is any function of the passphrase and the vault's scope that answers a
verdict, `{ strong: true }` or `{ strong: false, reason }`, where `reason` is the sentence the
user sees. It may be async, and may carry a `load()` that `bank.hello()` awaits:

```ts
const strengthChecker: StrengthChecker = async (passphrase, scope) =>
  passphrase.length >= 16 ? { strong: true } : { strong: false, reason: 'Use at least 16 characters.' }
```

The checker hears the passphrase. Keep it on the device, log nothing it is given, and know that
what it throws is replaced by a plain `unexpected_error` with no cause, so a bug in it cannot leak
a passphrase through an error message.

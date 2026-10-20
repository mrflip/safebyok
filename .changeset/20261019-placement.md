---
"safebyok": minor
---

**Public surface: three things leave it.** `safebyok/utils` no longer exports `adorn` and `decorate`: they are internal, and `adorn` takes `(obj, ckey, val)`. `PassphraseWayin` and `PasskeyWayin` have no public constructor: `Wayin.make(vault, record, holder)` makes a way in from its stored record, and `Wayin.seal` seals a new one; the classes stay exported, for `instanceof` and their types. `Ask.raise` is gone from `Ask`: the vault alone raises a prompt, and a host only answers the `Ask` its `getProof` is handed.

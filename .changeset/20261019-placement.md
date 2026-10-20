---
"safebyok": minor
---

**Public surface: three things leave it.** `safebyok/utils` no longer exports `adorn` and `decorate`: they are internal, and `adorn` takes `(obj, ckey, val)`. `PassphraseWayin` and `PasskeyWayin` have no public constructor: `Wayin.make(vault, record, holder)` makes a way in from its stored record, and `Wayin.seal` seals a new one; the classes stay exported, for `instanceof` and their types. `Ask.raise` is gone from `Ask`: the vault alone raises a prompt, and a host only answers the `Ask` its `getProof` is handed.

**`hello()` and `ensureLease()` refuse an event.** Handed anything in place of their options that is not a plain bag -- an event, when the call itself is passed to `addEventListener` or `onClick` as the handler -- each refuses `bad_option`, where an event used to be ignored. Wrap it: `addEventListener('focus', () => { void vault.tryHello() })`. TypeScript now flags `addEventListener('focus', vault.hello)` as well.

**A `Box` or proof from a second copy of safebyok is refused `bad_option`, naming the double load.** Two copies loaded side by side (two versions, or the ESM and CommonJS builds) each have their own classes; handing one copy's `Box` to the other's `vault.openBox`, `Box.make` or `Box.seal`'s `over`, or its proof to `wayin.tryOpen`, `Wayin.seal` or an unlock, now says so and says to load safebyok once, where it was refused as a record or proof of the wrong shape.

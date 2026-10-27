---
"safebyok": minor
---

**`proving.checkWayin()` is now `proving.demandOpens()`.** The method on a `Proving` that refuses `wrong_passphrase` or `wrong_passkey` when the gate's current wayin does not open under it is renamed for what it is: a demand, refusing, that keeps nothing. Its behaviour and refusals are unchanged. A host that calls it through a `PassphraseProving` or `PasskeyProving` renames the call; nothing stored changes shape.

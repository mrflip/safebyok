---
---

Empty: the new `safebyok` is private, and `safebyok-big` is untouched. What a caller of the new core and of `safebyok-react`'s giver now does:

- **A form verb's gating is an instance.** `Bank.birthGating(device, cleartexts)`, `bank.unlockGating(cleartexts)`, `bank.replacePassphraseGating`, `bank.addPasskeyGating` and `bank.revokePasskeyGating` each make a `Gating` over the form's cleartexts. It adopts them at once: a passkey answer's PRF bytes are copied, and those the host handed in are zeroed, even where the cleartexts are refused. JSON, `String()` and Node's inspect show it as `'[gating]'`, and a spread copies nothing. `gating.attempt()` proves the cleartexts and makes the verb's change, resolving the bank, and vacates the gating whatever the outcome; `gating.tryAttempt()` resolves an `Outcome`. A gating is attempted once: a second attempt, or one after `gating.vacate()`, refuses `gating_concluded`. The values of the cleartexts are still checked only at the attempt. `bank.unlock(cleartexts)` and the other plain verbs, and their `try` twins, work as before, each over its maker's gating.
- **`cloak()` and `Cloak` are gone**, and so is the type `CloakCleartexts` (`GatingCleartexts` takes its place).
- **The giver's form mutations take a `Gating`.** Each mutation hook (`useUnlock`, say) hands back `gating`, which makes the gating its `mutate` takes: `unlock.mutate(await unlock.gating({ passphraseCleartext }))`. `forBank` also gives each maker by name (`unlockGating`, say), for a host's own `useMutation` over `unlockMutationOptions()`. The mutation attempts the gating, and vacates it once it settles. A giver's bank (`GiverBank`) now has `birthGating`, `unlockGating`, `replacePassphraseGating`, `addPasskeyGating` and `revokePasskeyGating` in place of its five form verbs.

**Stored format:** unchanged.

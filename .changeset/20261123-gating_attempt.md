---
---

Empty: the new `safebyok` and `safebyok-react-lean` are private, and `safebyok-big` is untouched. What a host on the new core will see:

* **The `try…` gate verbs, and the giver's gatings and form-verb mutation options, are gone.** Gone from `safebyok`: `gate.tryUnlock`, `gate.tryReplacePassphrase`, `gate.tryAddPasskey`, `gate.tryRevokePasskey` and `Bank.tryBirth`. Call the form verbs instead (`device.gatingBirthAttempt`, `gate.gatingUnlockAttempt` and siblings), which take a `FormData` or a dna (`gatingAddPasskeyAttempt` a dna only) and throw a refusal, or a gating's `tryAttempt` for an `Outcome`. `gate.unlock(cleartexts)`, its siblings and `Bank.birth` stay. Gone from `safebyok-react-lean`: the giver's `birthGating`, `unlockGating`, `replacePassphraseGating`, `addPasskeyGating` and `revokePasskeyGating`; its `birthMutationOptions` and the four other `…MutationOptions` of the form verbs; the `FormMutationOptions` type; and each form hook's `gating`. Call the hook's `attempt` with the form or a dna. `FormMutationResult` takes one type parameter where it took two. `putBoxMutationOptions` stays.
* **`keepTextIfRefused(event, onEmptied?)`** calls `onEmptied` with the event whenever it lets the form empty, and never when it keeps the text: hand it `useNewPassphrase`'s `forget`.
* **`CreateVaultForm` and `ReplacePassphraseForm` keep what was typed through a refused attempt**, where they emptied every field; a stored attempt still empties the form.
* **`UnlockForm`'s Unlock button is disabled in a server render until React hydrates it**, and `UnlockDialog`'s with it. The form submits from a handler, so before hydration the browser would have submitted it its own way, posting the passphrase to the page's URL. The kit's other forms are Actions, which React holds and replays once hydrated. `SubmitButton` itself is unchanged: a host's own form that submits from a handler guards its button the same way.
* **Stored format:** unchanged.

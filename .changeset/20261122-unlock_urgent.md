---
---

safebyok-react-lean, private: the kit's `UnlockForm` (and so `UnlockDialog`) and `PasskeyUnlockButton` submit from an `onSubmit` handler, not a form action, and show their pending state from plain React state, so a host's pending Action that waits on the unlock no longer leaves the Unlock button disabled after a wrong passphrase. `PassphraseInput` gains `isPending`, which hides the field again for a form that submits from a handler. Nothing published changes.

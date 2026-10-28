---
"safebyok-react": patch
---

PassphraseModal, GatingModal and PasskeyUnlockButton, hidden by React's `<Activity>` or a Suspense boundary, wait rather than let go: an attempt, the passphrase advice or a lock landing that settles while hidden is met once the dialog shows again, `onDone` called then and the passkey button pressable again. A passkey touched while the dialog is hidden is never tried: its answer is zeroed at once, and the user presses again once the dialog shows (a passkey `GatingModal` made then for `put_passkey` stays on its authenticator, a way into nothing). Each dialog also zeroes a passkey's answer once its one attempt is done, refused or not. Before, an unlock that succeeded while an Activity hid the dialog left it up with `onDone` never called, and the passkey button stayed disabled. A dialog taken away now lets go in the commit that removes it, so no answer settling just after reaches a host that has taken it away.

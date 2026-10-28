---
"safebyok-react": patch
---

PassphraseModal, GatingModal and PasskeyUnlockButton, hidden by React's `<Activity>` or a Suspense boundary, wait rather than let go: an attempt, a passkey press, the passphrase advice or a lock landing that settles while hidden is met once the dialog shows again, `onDone` called then and the passkey button pressable again. Before, an unlock that succeeded while an Activity hid the dialog left it up with `onDone` never called, and the passkey button stayed disabled. A dialog taken away now lets go in the commit that removes it, so no answer settling just after reaches a host that has taken it away.

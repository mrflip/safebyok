---
"safebyok-react": patch
---

A `PassphraseModal` or `PasskeyUnlockButton` that a Suspense boundary hides for a moment (one already shown suspends again) still stands: an unlock, erase or passkey press that settles while it is hidden is met as ever once it shows again. Before, it was dropped as if the dialog had gone, and an erase interrupted that way left its button disabled. One that an `<Activity>` hides still lets go, as one that unmounts does.

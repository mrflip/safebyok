---
"safebyok": minor
"safebyok-react": minor
---

A lock no longer ends an open gating, and the `locked_while_asking` refusal kind is gone. `gating.decline()` is now `gating.dismiss()`, the `declined` refusal kind and dialog answer are now `dismissed`, and a host that branched on either old kind branches on `dismissed`: a sweep or a vacate dismisses an open gating. An attempt made after a lock goes through. Any change of passphrase or passkey now ends with the vault unlocked on a fresh lease of full term, even if it was locked before. Each gating carries a random `gatingTok`, also in its snapshot, for a dialog to key on.

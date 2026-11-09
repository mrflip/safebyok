---
"safebyok": minor
"safebyok-react": minor
---

A lock no longer ends an open gating, and the `locked_while_asking` refusal kind is gone. `gating.decline()` is now `gating.dismiss()`, the `declined` refusal kind and dialog answer are now `dismissed`, and a host that branched on either old kind branches on `dismissed`: a sweep or a vacate dismisses an open gating. An attempt made after a lock goes through. Any change of passphrase or passkey now ends with the vault unlocked on a fresh lease of full term, even if it was locked before. Each gating carries a random `gatingTok`, also in its snapshot, for a dialog to key on. `gating.whenSettled` is now `gating.whenConcluded`, `storable.settle()` is now `storable.align()`, and the `Settled` type is now `Aligned`.

`safebyok-react`: the `passphraseAdvice` prop and the `PassphraseAdvice` type are gone. A host's `strengthChecker` judges a passphrase and words the advice, for the live preview and the attempt alike.

The `gating_landed` refusal kind is now `gating_concluded`. For adapters, the `do*` calls answer `Written` and `BoxWritten` with `isWritten`, in place of `Landing`, `BoxLanding` and `landed`. `BoxFields.save` and `trySave` are now `put` and `tryPut`. `DeviceDB.delRawLease` and its `try` form are now `forgetRawLease` and `tryForgetRawLease`, and the `Phrases` names `storeFailed`, `NoBrowserStore` and `BrowserStoreFailed` are now `deviceDBFailed`, `NoBrowserDatastore` and `BrowserDatastoreFailed`.

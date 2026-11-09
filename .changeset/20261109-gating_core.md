---
"safebyok": minor
"safebyok-react": minor
---

A lock no longer ends an open gating, and the `locked_while_asking` refusal kind is gone. `gating.decline()` is now `gating.dismiss()`, the `declined` refusal kind and dialog answer are now `dismissed`, and a host that branched on either old kind branches on `dismissed`: a sweep or a vacate dismisses an open gating. An attempt made after a lock goes through. Any change of passphrase or passkey now ends with the vault unlocked on a fresh lease of full term, even if it was locked before. Each gating carries a random `gatingTok`, also in its snapshot, for a dialog to key on. `gating.whenSettled` is now `gating.whenConcluded`, `storable.settle()` is now `storable.align()`, and the `Settled` type is now `Aligned`.

`safebyok-react`: the `passphraseAdvice` prop and the `PassphraseAdvice` type are gone. A host's `strengthChecker` judges a passphrase and words the advice, for the live preview and the attempt alike.

The `gating_landed` refusal kind is now `gating_concluded`. For adapters, the `do*` calls answer `Written` and `BoxWritten` with `isWritten`, in place of `Landing`, `BoxLanding` and `landed`. `BoxFields.save` and `trySave` are now `put` and `tryPut`. `DeviceDB.delRawLease` and its `try` form are now `forgetRawLease` and `tryForgetRawLease`, and the `Phrases` names `storeFailed`, `NoBrowserStore` and `BrowserStoreFailed` are now `deviceDBFailed`, `NoBrowserDatastore` and `BrowserDatastoreFailed`.

The `lease_unerased` lifecycle event is now `lease_revoke_failed`, the `vacated` event's `unerased` count is now `unrevoked`, and the `EraseSite` type is now `RevokeSite`.

A passphrase wayin's `salt_b64` that does not decode as base64url now fails its vault row's check: `bank.hello()` tells it as `damaged_row` bad news and leaves that vault unlisted, and a fetch of it refuses `damaged_row`. Until now such a row read as usual, its passkey still opened the vault, and a passphrase attempt refused `bad_record` at unlock.

Refusals of a label or `user_id` that is too long, an empty token, an instant that is not whole and a passphrase that is not text now say what Zod says, and `box.put`'s refusal of a patch no longer ends with advice; each kept its kind. A `keyDeriverSpec` that misuses a supplied label or the reserved prefix now refuses with `key_deriver_label:` before its sentence, and a `strengthChecker` that answers no verdict now hears what failed before the sentence it heard.

In `safebyok-react`, the `VaultHeld` type that `useVault` returns is now `VaultLifecycle`.

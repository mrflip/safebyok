---
"safebyok-big": patch
---

Docs: the doc blocks of `FarFuture` and `ForeverMillis` no longer carry an example, which read an `ask_passphrase_at` and a gating's `leaseMillis` the core does not have; `PasskeyAnswer`'s example calls `gating.attempt({ passkeyClear })`, and `isVaultError`'s calls `box.extractWhisper()`, both real calls.

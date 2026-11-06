# Example rebalance: what is left for a Coach (2026-11-06)

From the thread that applied `whiteboard/20261102-newdesign/example-audit.md` (branch `20261106-example_rebalance`).

* **Two adds wait on model doc blocks**: `Bank`'s call order, and `vault.putBox`'s bare-whisper refusal
  (`{ boxlabel, whisper: 'sk-...' }`). Each lands when its doc block is rewritten.
* **Untested validators**: `bankedVaultScope` (the audit's `vaultBag` and `bankBag`) and `freshPasskeyAnswer` now
  have a test per kept example and one passing case each, nothing more. Should they get full case tables, as
  `label` and `user_id` have, in a thread of their own?
* **A pointer pass is owed** on kept examples with no pointer: `FarFuture` 1, `ForeverMillis` 1,
  `deriveWrappingKey`, `VaultLogger` 2 and 3, `DefaultLogger`, both of `StrengthChecker`, `stableJsonify` 1,
  `storageUnavailable` 1, `VaultBag`, `PasskeyAnswer`, `capacity`. Some are tested without a pointer, some not at all.
* **A stale example**: `isVaultError`'s example in `refusals/errors.ts` calls `vault.getWhisper('ANTHROPIC_API_KEY')`;
  the core has no `getWhisper`, and that label fails `label`. Left for the next doc-block pass on errors.ts.

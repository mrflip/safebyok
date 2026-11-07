# Sprint react_new: progress

The orchestrator's curated summary of what the threads have taught: newer than the plan wherever
they disagree. Workers look things up here; the handoffs quote what each thread needs.

## Where things stand

*Orchestrator:* planned 2026-11-07. Thread 1 underway.

## Facts every thread may need

* *Orchestrator:* main at `495cc5d6e` has the vaultdb line merged. `safebyok-indexeddb` is on the
  new core (`idbVaultDB`), and `safebyok/storage` exports what an adapter needs. `safebyok-idb-old`
  holds the old adapter, private, on `safebyok-old`.
* *Orchestrator:* new-core facts the React layer turns on (from design.md):
  * `Bank.make` requires `device_id`, `deviceDB`, `keyDeriver` and `requestCleartext`. With no
    `strengthChecker`, every new passphrase is refused `weak_passphrase`.
  * `bank.hello()` lists vaults; `bank.snapshot.stage` is `made` / `ready` / `refused`;
    `bank.vaultAt(scope)` is sync and needs `ready`.
  * `bank.ensureVault` launches `build_vault` for an unborn vault, which asks for a new passphrase.
  * `vault.hello()` lists boxes and starts their watch.
  * `vault.boxListing.snapshot` is the present boxes' snapshots; `vault.boxListing.at(scope)` is the
    one Box per label.
  * `extractWhisper`, `expose` and `put` refuse `vault_locked` instead of asking.
  * Gating: `gating.attempt(clears)`, `gating.decline()`, `gating.whenSettled`,
    `gating.checkStrength()`, `gating.passkeyHeader`, `gating.gatingkind`.
  * The clears by kind are `ClearsForGatingkind` in `shapes/shapes-gateish.ts`.
  * Vault gate verbs: `replacePassphrasePrompt`, `addPasskeyPrompt`, `revokePasskeyPrompt`,
    `delVaultPrompt`.

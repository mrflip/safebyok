# Sprint react_new: progress

The orchestrator's curated summary of what the threads have taught: newer than the plan wherever
they disagree. Workers look things up here; the handoffs quote what each thread needs.

## Where things stand

*Orchestrator:* thread 1 filed (#573); thread 2 reviewed, filing (#574); next 3, 4 and 12.

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

## From thread 1 (core_for_react, #573)

* *Orchestrator:* `safebyok` now exports `correctablekindVals`, `PasskeySaltBytes`, `PrfAnswerBytes`
  (32), `MinuteMillis`, `HostErrorSanitizer` (a namespace; `HostErrorSanitizer.refusalFor(foreign,
  kind, message)` reads nothing of `foreign`), and the types `Gatingkind`, `LockState`, `Wayinkind`,
  `Damagekind`, `BankStage`, `DamagedBox`, `BoxSparse`, `WayinHeader`, `PasskeyWayinHeader`,
  `PassphraseWayinHeader`, `PasskeyAnswer`.
* *Orchestrator:* there is no `isCorrectable` export (it waits on the devicedb_idb line). Test a
  refusal with `(correctablekindVals as readonly string[]).includes(err.refusalkind)`.
* *Orchestrator:* `stage` is on `BankSnapshot` (`bank.snapshot.stage`), not on `Bank`.
  `gating.passkeyHeader` is `WayinHeader | null`.

## From thread 2 (react_port, #574)

* *Orchestrator:* **planning lesson:** thread 2 compacted three times before its first justify. A
  port that rewrites a package plus its tests is a thread's whole budget. Thread 3 was split (passkeys
  became thread 11); keep later threads to one feature.
* *Orchestrator:* `useVault(vaultlabel)` answers `{ stage: 'waiting' | 'unborn' | 'present', vault }`.
  A tombstoned vault reads as `unborn`. A hook reaches the bank through `useProvided(hookname)`. The
  vaults it has called `hello()` on are kept in a WeakSet. The hooks live in
  `packages/safebyok-react/src/hooks.ts`.
* *Orchestrator:* `GatingModal`'s dialogs are the map `DialogForGatingkind` in `src/gating-modal.tsx`.
  An unmapped kind gets `NoDialog`, which declines it.
* *Orchestrator:* the provider runs `bank.autolock()` every minute. `allowStartOver` is gone.
  Sign-out in the demo is `bank.lock()`.
* *Orchestrator:* the core gained `ForeverMillis` in its exports.
* *Orchestrator:* vitest resolves `safebyok` through its built dist, so react and demo tests need
  `pnpm --filter safebyok build` first (`pretest` does it).
* *Orchestrator:* the demo is a `SessionBar` (sign in, sign out) over `BankProvider`, with storage in
  `demos/safebyok-demo-react/src/lib/stores.ts`. `lib/anthropic.ts` and the CSS of the removed
  components are kept. The demo depends on `safebyok` and `safebyok-indexeddb`, and keeps
  `safebyok-old` only for the fake auth's `StringStore` in `lib/`.
* *Orchestrator:* thread 2's review (#574) found the provider's handler props wanting: inline
  `onPanic` remakes the bank, non-function `onBadNews` / `requestCleartext` are no longer refused,
  and the remake warning is gone. All three are thread 12's.

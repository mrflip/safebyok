# Sprint react_new: progress

The orchestrator's curated summary of what the threads have taught: newer than the plan wherever
they disagree. Workers look things up here; the handoffs quote what each thread needs.

## Where things stand

*Orchestrator:* the Coach merged #573 to #578 (2026-11-07); #579 (thread 9) is filed and open,
stacked on them, so threads 1 to 4, 11 and 12 are on main. Since then #579 and #581 merged too; 13 filed as #583 (after a doc-block conflict with #581). Thread 10 is folded into 5 (the demo on `browserOpts`) and 8 (`DevDeviceDBInspector`).

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

## From threads 3, 4 and 12 (#577, #576, #575), before their reviews

* *Orchestrator:* thread 3: `GatingModal` maps `replace_passphrase` → `ReplacePassphraseModal`
  (answers 'unlocked') and `del_vault` → `DelVaultModal` (answers 'deleted', and stays open through a
  `bank.lock()`, as a lock does not stop a delete). A lock while asking refuses
  `locked_while_asking`, not `vault_locked`. The demo stays quiet for that and for `declined`.
  `BadOutcome.err` is already a VaultError: compare `err.refusalkind`, since `! isVaultError(err, kind)`
  narrows to `never`.
* *Orchestrator:* **for thread 11:**
  * `NoDialog`'s tests in `gating-modal.test.tsx` aim at `add_passkey` (`TH.addingPasskey`); once
    thread 11 maps that kind, aim them at something still unmapped, or at a forged kind.
  * `useAttempts` no longer returns `isShown`: re-add it, or call `useWhenShown` directly.
  * The passkey `Messages` strings were kept.
  * Export `ReplacePassphraseModal` and `DelVaultModal` beside the passkey exports (whole lines in
    `src/index.ts`).
* *Orchestrator:* thread 4: hooks in `src/hooks.ts` (*Box hooks*):
  * `useBoxes(vaultlabel)` answers null while the vault is not present.
  * `useBox(vaultlabel, boxlabel)` answers the Box only while it is present.
  * `useWhisper(null)` answers a frozen encrypted bag.
  * `BoxWhisperField` (`src/box-whisper-field.tsx`) is read-only while `! box.isShowing`, takes no
    `ref` or `onChange`, has no `name`, and needs a stable `path`: changing it unbinds, and unexposes
    a box's only field.
  * `VaultLockControl` and `CreateVaultButton` are in `src/vault-controls.tsx`; Unlock is
    `bank.tryEnsureVault` then `tryEnsureUnlocked`.
  * Three words were added at the end of `Messages` (`vaultLocked`, `vaultUnlocked`, `lockButton`). Thread
    3 also edited `messages.ts`: expect a trivial conflict at the restack.
* *Orchestrator:* thread 12: a non-function handler is refused `bad_option` again. `onPanic` is held
  in a ref, and a host's having one or not is what remakes the bank. The remake warning is said once
  through `bank.logger`.

## From thread 9 (browser_batteries, #579), before its review

* *Orchestrator:* `safebyok/browser` exports `zxcvbnStrengthChecker`, `MinPassphraseChars` (12),
  `MinZxcvbnScore` (3), `browserOpts({ dbName }?)` (the frozen bag of `keyDeriver`, `deviceDB`,
  `strengthChecker`, the same bag for the same `dbName`, safe in render), `BrowserOpts`, and the
  `StrengthChecker` type.
* *Orchestrator:* `browserOpts` supplies **no `device_id`**: a host (the demo) keeps passing its own.
* *Orchestrator:* a check made before the dictionary loads triggers the load. A failed load answers
  weak with a "check your connection" reason, never throws.
* *Orchestrator:* thread 9's review: the checker now counts code points where `Intl.Segmenter` is
  missing (Hermes, older browsers). Nothing on the main entry's path reaches zxcvbn.
* *Orchestrator:* **for thread 5 and later**: the line will sit on main `de4943bd6` after the
  restack. The DeviceDB verbs there are `stow`, `peek`, `forget`, `listLeases` and `listRawLeases`.
  `idbDeviceDB` is in `safebyok/browser` (#569), and `browserOpts` arrives with #579, which is not in
  the line for 5 and 13 (it joins at thread 10).

## Rulings of 2026-11-07 (Open Matters)

* *Orchestrator:* the demo runs on `browserOpts` now ("speedrun the browser resurrection"): no DEMO
  JANK checker, no `MemoryDeviceDB`.
* *Orchestrator:* the safebyok-react README is cut to a sentence or so (thread 14); no thread adds
  README sections. Every doc block is one simple line; a documentarian runs later.
* *Orchestrator:* kept as built: a deleted vault reads `unborn`; a refused `vault.hello()` from
  `useVault` goes to `onBadNews`; the gesture check leans open; a let-go bank's panic goes to the
  platform; `onBadNews: null` is refused (the changeset is to say so, thread 13); a quiet `declined`;
  `useBoxes` has no "not listed yet" (unless a flow needs it: say so as an open matter).
* *Orchestrator:* still open with the Coach: what `device_id` should be (they asked about
  `mash(applabel^user_id)`; it must be a UUID, and it is only a label in wayin headers), and whether
  `BankProvider` should read its options once per `user_id` instead of remaking the bank on a
  change. Neither blocks thread 5; keep the demo's `device_id` minting in one small function.

## From thread 14 (react_doc_trim, #581)

* *Orchestrator:* every doc block in `packages/safebyok-react/src` is one line, and the README is two
  lines. New doc blocks follow suit. Expect doc-block conflicts with 5 and 13 at the restack.

## From thread 13 (react_tidy, #583)

* *Orchestrator:* `passkey.ts` checks its arguments with one module-level `Checkers('bad_option', ...)`;
  `Checkers` reaches safebyok-react through `safebyok/storage`. The passkey button uses
  `aria-disabled`. `BankProvider` takes `passkeyRpId`. `AddPasskeyModal` refuses an empty passphrase
  with `Messages.passphraseFirst` before any WebAuthn call.

## Rulings of 2026-11-07, second batch

* *Orchestrator:* a device id is get-or-created in the DeviceDB, keyed by bank scope, as a `bank` row
  `{ applabel, user_id, device_id }` (thread 15, core: `deviceDB.ensureBank`), and `BankProvider`
  calls it right before `Bank.make` (thread 16; my reading, a row). The demo's localStorage
  `device_id` goes then.
* *Orchestrator:* `BankProvider` makes one bank per `applabel` + `user_id`, every prop read once, a
  later change warned of once (thread 16; handlers too, my call, a row).
* *Orchestrator:* the core gains `passkey_unavailable` (thread 17).

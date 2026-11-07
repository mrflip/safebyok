# react_new: safebyok-react and the demo on the new core

Branch `20261107-react_new`, worktree `../byok-react_new`, cut from `origin/main` at `b0458e43a`.
Read on main, not on the base checkout's `20261104-newdesign_plan`, which is 297 commits behind.
Regressions and concerns we accept for now: [regressions.md](regressions.md).

## 1. Inventory

### safebyok-react today

Every import is from `safebyok-old` (peer dependency `safebyok-old: workspace:^`). Nothing compiles
against the new core. What it has, and where it lands on the new core:

| File | What it does | On the new core |
|---|---|---|
| `bank-provider.tsx` | `BankProvider` makes a Bank per `user_id`, renders `GatingModal` as the default `requestCleartext` (only while `navigator.userActivation` is active), `closeVaults()` on unmount or user change; hooks `useBank`, `useListedVault`, `useVault`, `useVaultSnapshot` | Rewrite. Old calls: `bankVaultOf`, `vaultOf`, `closeVaults`, `tryEnsureVault` in an effect, `lifecycle`, `leaseHours`, `staleMinutes`, `maxBoxes`, `clock`. New: `bank.hello()`, `bank.snapshot.stage`, `bank.vaultAt`, `bank.sweep()`, `bank.autolock()` |
| `gating-modal.tsx`, `modal.tsx`, `passphrase-modal.tsx` | One dialog per gating kind; strength advice; correctable refusals keep it open | Port. Old `attemptPassphrase` / `attemptPasskey` / `lockLanded` / `leaseMillis` become `gating.attempt(clears)`, `gating.whenSettled`, `gating.decline()`, `gating.checkStrength()`. Kinds rename: `initialize_gate` → `build_vault`, `change_passphrase` → `replace_passphrase`, `put_passkey` → `add_passkey`, `del_passkey` → `revoke_passkey` |
| `passkey.ts`, `passkey-unlock-button.tsx` | `createPasskey`, `askPasskey`, `passkeysAvailable` | Port to `gating.passkeyHeader` and the new `passkeyAnswer` shape |
| `whisper-field.tsx`, `reveal-toggle.tsx` | `WhisperField`: uncontrolled, `type=password`, `WhisperFieldAttributes`, Show/Hide eye | Keep; import `WhisperFieldAttributes` from `safebyok/utils` |
| `boundary.tsx`, `attempt-refusals.ts`, `messages.ts`, `when-shown.ts` | Error boundary, correctable-refusal test, copy, `useWhenShown` | Port |

Missing against the request: anything that holds a **Box**, a lock control for an account menu,
the Dev*Inspector panels, and a `safebyok-react/devmode` entry.

### demos/safebyok-demo-react today

On `safebyok-old` throughout (`browserOpts`, `domStore` / `memoryStore`, `inspectIdbDeviceDB`, the
old IndexedDB adapter and inspector, `OutageVaultDB`). Runs under `<StrictMode>`.

| Piece | Becomes |
|---|---|
| `KnockKnock.tsx` | Nearest flow 1, a bare-string whisper. Becomes three components, flows 3, 2, 1, whisper `{ apiKey }` |
| `VaultDashboard.tsx` | `DevBoxInspector` |
| `inspection/VaultDBInspectionPanel.tsx`, `StoreTable.tsx` | `DevVaultDBInspector` (the outage switch stays in the demo) |
| `inspection/DeviceDBInspectionPanel.tsx` | `DevDeviceDBInspector`, the lease browser |
| `SessionBar.tsx`, `WaysIn.tsx` | `vault.delVaultPrompt`, `replacePassphrasePrompt`, `addPasskeyPrompt`, `revokePasskeyPrompt`; the lock part becomes `VaultLockControl` |

## 2. What the React layer needs from the core

* **Persistent stores.** IndexedDB VaultDB is `#560` (end of the port stack); an IndexedDB DeviceDB
  is being written by another agent (2026-11-07). Until both land, the demo runs on memory stores.
* **`safebyok/browser` as it was** (thread A2 below). The reason it lives in core, as a subpath, is
  the old README's *Entry points, and why the main one asks for everything*: `Bank.make` names no
  default, because a default would be imported by `Bank.make` and ship in every app; a subpath plus
  `sideEffects: false` means an app that never imports `safebyok/browser` never ships the deriver
  (~15 kB) or zxcvbn, while one that does gets the batteries in one spread. The deriver is the
  choice an app most plausibly swaps, which is why `safebyok-fastkey` is its own package. NOTYET.md
  records the Coach's later wish (2026-10-16, #136) to gather the best-practice defaults into a
  `-utils` or `-bestpractices` package; not this sprint.
* **Small exports, no behaviour change**: `correctablekindVals` (or an `isCorrectable`),
  `Gatingkind`, `LockState`, `BankStage`, `DamagedBox`, `PasskeySaltBytes` / `PrfAnswerBytes`, the
  passkey header type, `MinuteMillis`, `parseLogger`, `refusalFor`.
* **Creating the box needs no core change.** `vault.putBox({ boxlabel, whisper: {} }, { ifPresent: 'get', ifAbsent: 'add' })`
  answers the stored box, or stores an empty one. Both options are spelled out at every call, so the semantics show. Then `box.expose()`.
  The flows do that in the Show / Edit handler after `vault.ensureUnlocked()`. To verify in B's
  tests: that `ifPresent: 'get'` over a stored box writes nothing.
* **An unborn vault: worked around in React.** `bank.ensureVault` on an unborn vault launches
  `build_vault`, which asks for a new passphrase. `useVault` reads `bank.vaultAt` (after `hello` is
  `ready`) and never asks; it reports the vault `unborn`. The first action that needs it calls
  `bank.ensureVault` from the click, so the build dialog rides the user's gesture. The tombstoned
  vault idea (start with a void vault, vivify it later) is left for the Coach.
* **Shaping the React layer** (Coach: lgtm): nothing prompts on its own (handlers call
  `vault.ensureUnlocked()` first); the provider runs `bank.autolock()` on an interval; the provider
  calls `vault.hello()` once for each vault a hook names.

## 3. Plan

One PR each. A1 and A2 are independent; B waits on A1; C–F wait on B.

**A1: core for React.** The small exports above. Changeset.

**A2: resurrect `safebyok/browser`.** The same cohort the old entry exported:
* `argon2idWebV1Deriver` (there already), `zxcvbnStrengthChecker`, `MinPassphraseChars`,
  `MinZxcvbnScore`, `idbDeviceDB` (from the other agent's work), and `browserOpts({ dbName }?)`,
  the frozen bag of `keyDeriver`, `deviceDB`, `strengthChecker`, the same bag for the same `dbName`.
* The zxcvbn dictionary loads as its own chunk at `hello()`, through the checker's `load`.
* Dependencies, as on -old: `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`, and `idb-keyval` if
  `idbDeviceDB` lands in core.
* Open: `Bank.make` now requires `device_id`, which the old bag had no part in. `browserOpts` is
  sync and called in render, so a persisted `device_id` would come from `localStorage`, or the
  host keeps supplying it. Decide in the thread.
* The core README's *Not done yet* and CUSTOMIZATION.md's *The one safebyok ships* come back with it.

**B: safebyok-react on the new core.** Peer dependency to `safebyok`; delete what only the old core
needed.
* `BankProvider`: one Bank per `user_id`; `hello` on make; `sweep` on unmount or user change; the
  `autolock` interval; `GatingModal` as the default `requestCleartext`, still gesture-gated.
* Hooks, each `useSyncExternalStore` over `subscribe` / `getSnapshot`: `useBank`,
  `useBankSnapshot`, `useVault(vaultlabel)` (never asks), `useVaultSnapshot`,
  `useBoxes(vaultlabel)`, `useBox(vaultlabel, boxlabel)`, `useBoxSnapshot(box)`, `useWhisper(box)`.
  No holder count: unmounting one holder unexposes for all (regressions.md).
* Components:
  * `WhisperField`, kept: free and uncontrolled, for flow 1.
  * `BoxWhisperField`: `BoxFields.bind(path)` with `WhisperFieldAttributes`, `type=password` and the
    eye, which flips the input's type and is not `veil`. For flow 3.
  * `VaultLockControl`: lock state, Lock (`vault.lock()`), Unlock (`vault.ensureUnlocked()`), for
    the account menu.
  * `CreateVaultButton`.
  * The gating dialogs and passkey calls, ported.
* Tests in proportion, over memory stores with `testDeriver` and `anyStrengthChecker`.

**C: the demo on the new core, flow 3 first.** Memory stores for now; a demo-local `localStorage`
store replaces `domStore` for the fake auth; the outage switch subclasses the VaultDB in use.
`KnockKnockFields`: `useBox` + `BoxWhisperField` + `BoxFields.save`; Edit is `ensureVault` →
`ensureUnlocked` → `putBox(..., { ifPresent: 'get', ifAbsent: 'add' })` → `expose`, from a button after mount.

**D: flow 2.** `KnockKnockExposed`: `useWhisper(box)`, a controlled input, `box.patchWhisper`,
`box.putExposed`, `unexpose` on unmount. Aim for the note's twelve lines.

**E: flow 1.** `KnockKnockSealed`: `WhisperField` + `vault.putBox({ boxlabel, whisper: { apiKey } })`;
`await box.extractWhisper()` inside the knock handler; nothing exposed.

All three sit under one provider on one page, over the same `anthropic_api_key` box: no routes or
tabs. The demo should read as something that could ship once the inspectors are removed, while
still letting 3 and 2 be compared side by side; we iterate on that tension.

**F: Dev*Inspector panels**, only from the `safebyok-react/devmode` entry, so a host gets them only by
importing it by name. No core entry: the panels use public VaultDB and DeviceDB verbs.
* `DevVaultDBInspector`: `listVaults`, then `listBoxes` for each live vault, `watch` for changes;
  raw `getVault`, `getBox`, `delBox`, `tidyGone`. Works over any adapter.
* `DevBoxInspector`: pick a vault scope and a boxlabel, then `put`, `expose`, `unexpose`,
  `veil`, `unveil`, `lock`, `ensureUnlocked`, `extractWhisper`, `delBox`, on the provider's shared Box.
* `DevDeviceDBInspector`: the lease browser, from `deviceDB.leasesProvedBefore(FarFuture)`, with a
  per-row `vacate`.

The demo drops `src/components/inspection/` and `VaultDashboard.tsx` for these.

**Later:** switch the demo to `idbVaultDB` and `idbDeviceDB` (`browserOpts`) once `#560` and the
DeviceDB land.

## Settled (Coach, 2026-11-07)

* Panel names: `DevBoxInspector`, `DevVaultDBInspector`, `DevDeviceDBInspector` (the Coach asked for `...Db...`; the code is uniform on `VaultDB` / `DeviceDB`, so those spellings).
* Creating a box: (a) or (b) both fine; going with (a) through `putBox`'s `{ ifPresent: 'get', ifAbsent: 'add' }`, both spelled out,
  which needs no change to `expose`.
* No holder count for now; the Coach expects a different approach, not a counter.
* Memory stores first. `safebyok/browser` exports the old cohort. Dependencies as on -old may be
  added without asking first; report each one.
* "Requires importing" means `safebyok-react/devmode`: the panels exist only behind that import.

# Sprint gripeoween_vault: progress

What the threads have taught, newer than the plan where they disagree. Kept by the orchestrator;
workers look things up here and never write it.

## Sprint doc

https://claude.ai/artifact/EunK4WYVspRmtVNmnStttk (doc `70a5671a-f1d2-452b-ab6b-96967076ed0d`).
Tabs, by tab id / body id: Open Matters `fdffceb1-e16e` / `2b0e312a-7bf3` (bookmark rev 1);
Cleanup `e894b5ba-5a8a` / `537a9793-f406`; Progress `c2cac15c-ed58` / `66c5201c-0978`; Resolved
`a6071e62-dda3` / `63aa62c1-0680`. State enum `64ebedf1-6002`.

## Standing calls (YOLO)

* The preplan's *Open for the Coach* items, until the Coach rules otherwise:
  - `#goneBy` keeps its factory; a comment says why (each `#demandNotGone` throws a fresh Error
    with its own stack, never one shared object).
  - `#replaceSnapshot`'s whole-snapshot `stableJsonify`: a one-line comment, no change.
  - `useWhisper`'s member doc says it is the one public method without the try and the
    gone-check, and why.
  - `DeviceDB.raiseDeviceRecord` keeps "raise"; only the vault's `#raiseRecordAfter` renames
    (`#noteEpochSeen`).

## Threads

### 1. vault_refresh (#336, stacked on #334)

* Names now in `vault.ts`: `refresh()` / `hello()` → `#refreshIfStale(staleMillis)` → `#refresh()`
  (a method over the one-at-a-time run; logs the recovery after a warned streak) → `#doRefresh()`
  → `#loadFromStorage()`, `#applyVault`, `#noteEpochSeen`, `#becomeGone(refusal)` (`[letGo]`
  calls it with null), `#forceNextRefresh()`. Gone: `#helloWithin`, `#refreshOnce`,
  `#takeStorage`, `#judgeStored`, `#takePicture`, `#raiseRecordAfter`, `#letGo`, `#freshen`.
* `#doRefresh`'s catch is `catch (err) { throw this.#onRefreshRefused(err) }`. Thread 2: fold or
  rename it with the `#onRefused` family.
* `#onStorageRefusal` is called where a refusal is met, inside the try (`getVault`'s refused
  Outcome, the behind check), not from the catch: the catch cannot tell a `getVault` refusal from
  a host device store's throw of the same kind. The house pattern, as #334 has it.
* `#freshen` is now the body of the `freshen:` gating-tool closure in the constructor (five lines,
  the tool's shape unchanged). Thread 3 reshapes it.
* `DeviceDB.getDeviceRecord` and `raiseDeviceRecord` (and their try forms) resolve a checked
  `DeviceRecord | null`; `deviceRecordFor` is module-private. Tests spy on the throwing forms or
  the store's `doGetDeviceRecord` hook.
* The refresh reads in sequence now, one round trip longer: a race test that unlocks on another
  device waits for that device's watch to read the gate first. Expect the same in later
  timing-sensitive tests.
* "picture" survives in the doc blocks thread 1 touched (thread 4's pass).

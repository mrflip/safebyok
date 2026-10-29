# Sprint gripeoween_vault: progress

What the threads have taught, newer than the plan where they disagree. Kept by the orchestrator;
workers look things up here and never write it.

## Sprint doc

https://claude.ai/artifact/EunK4WYVspRmtVNmnStttk (doc `70a5671a-f1d2-452b-ab6b-96967076ed0d`).
Tabs, by tab id / body id: Open Matters `fdffceb1-e16e` / `2b0e312a-7bf3` (bookmark rev 1);
Cleanup `e894b5ba-5a8a` / `537a9793-f406`; Progress `c2cac15c-ed58` / `66c5201c-0978`; Resolved
`a6071e62-dda3` / `63aa62c1-0680`. State enum `64ebedf1-6002`.

## Rulings and standing calls

* Ruled (2026-10-28): the four-thread split; thread 3 builds the gating tools' shape without a
  stop, and keeps the lockings apart rather than fold them under a flag; `#goneBy` keeps its
  factory, with a comment; `#replaceSnapshot` compares with es-toolkit's `isEqual`, not a
  whole-snapshot `stableJsonify` (thread 4); `useWhisper` is made uniform, the gone-check and
  the one catch like every public method (thread 2); a refresh let go mid-read still reads and
  may lock (#336 as built).
* Under explanation: what `raiseDeviceRecord` means and whether "record" and "raise" stay; why
  `#onStorageRefusal` is called in the try, not the catch (the Coach: "seems better to have the
  error handler section handle errors"); what a null device record means. Expect renames on
  `DeviceDB` and a move of the dispatch into the catch: thread 2 should not entrench either.

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

### 2. vault_boxes (#340, stacked on #336)

* `#onRefused(thrown)` is the one conversion: every public catch is `throw this.#onRefused(err)`,
  and it takes any throw. The `heardRefusal:` gating tool still points at it (thread 3 removes it).
  `#onRefreshRefused` keeps its name.
* `#onStorageRefusal(refused, call)` logs under the call that met the refusal; `VaultCall` has no
  `'untrustedStorage'`.
* `#ensureUnlocked(renewMillis)` no longer refreshes: each caller runs `#refreshIfStale(staleMillis)`
  and `#demandNotGone()` first, then checks a locked vault's listing itself.
* Failure plans: `#onGetBoxRefused`, `#onPutGateRefused`, `#dropEndedLease`; bad news is
  `#reportBadNews` and `#reportNewDamage`. The three lockings are untouched (thread 3's).
* `useWhisper`: `#demandNotGone()`, a try with the one catch around the callback check and
  `getWhisper`; the host's callback runs after the try, its throw passing through as it came.
* **The race** (review, flagged): a ring arriving mid-refresh joins the refresh in flight
  (`oneAtATime`), and `isOlderPicture` compares only epochs, which a box write does not raise, so
  put-then-delete showed the deleted box until the next ring or stale hello. A rework added a
  follow-up refresh and a ledger of landed writes; it broke STYLE.md (*Control flow*: no retry,
  refresh or re-read in the core) and CLAUDE.md (never a check to catch a stale cache earlier),
  and is reverted (2982245e). The Coach's design: the `VaultDB` callback carries the vault as
  stored, and a ring triggers no refresh (thread 2b). A test that needs `TH.readAfresh` after a
  change of timing is a smell: suspect a race first; and a fix that adds a read or a ledger is a
  stop, not a deviation.
* The PR edit and `gh pr ready` were refused by the permission classifier for a background
  worker; the Coach is handling #340's. Later workers: report a PR-body draft as a file if refused.

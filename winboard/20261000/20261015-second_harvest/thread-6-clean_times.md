# Thread 6: clean_times (2026-10-15)

Branch `20261015-clean_times`, PR [#64](https://github.com/mrflip/safebyok/pull/64), stacked on [#52](https://github.com/mrflip/safebyok/pull/52)
(the top of the merge stack, `2ca104f`; first cut from #62 at `4303367` and rebased). Justify green:
core 669, convex 265, react 27, demo 61, root 105. `pnpm size` within the stack's limits
(everything 22.13 -> 22.45 kB, openVault 15.11 -> 15.43 kB; no limit raised).

* **Built**:
  - **Time fields (roadmap 3)**, in `types.ts`: `Lockbox` drops `created_at`/`updated_at` for
    `registered_at` and `changed_at`; `VaultBundle` drops them for `registered_at`;
    `DeviceUnlock.expires_at` is `ask_passphrase_at`. All `EpochMillis`. `LockboxSummary`,
    `safebyok/testing`'s `bundleOf`/`boxOf` and `describeVaultDB` (all in
    `packages/safebyok/tests/test-helpers.ts` since #52) follow, and so do Convex's
    validators (`v.number()`), hence its tables. `store()` deciphers the previous record it
    already reads (a new `decipherLockbox`, shared with `openBox`) and carries `changed_at`
    forward when the two whispers' `stableJsonify` forms are equal (`holdsWhisper`); a previous
    record that will not open counts as changed. `changePassphrase` carries the bundle's
    `registered_at` by its spread. No old field is read anywhere.
  - **The clock is checked**: `parseClock` (a `{ now }` function, else `bad_option`) and
    `readClock` (each reading in bounds, a fraction allowed, else `bad_option`; a `now()` that
    throws is `bad_option` with its error as the cause, unquoted; floored to whole ms). openVault
    reads it once before touching storage; every later reading goes through `clockNow()`, which
    **fails closed**: on a bad reading it drops the vaultKey before throwing.
  - **Infinity coerced at the parse**: `forcePassphraseReentryHours`' schema maps any number of
    hours to `min(round(hours * 3.6e6), ForeverMs)`, `ForeverMs = FarFuture - FarPast`; the internal
    window schema then refuses anything over it, `Infinity` included. `deadlineAfter` still floors
    and caps at `FarFuture`. `rememberedUnlock`'s `Math.min(..., FarFuture)` clamp is gone (the
    schema bounds it; thread 3's review flagged it redundant).
  - `EpochMillis` keeps its `int` check (after review: values inside the interface in their final
    form): every stored time is whole ms and a stored fraction fails as `corrupt_record`. Only the
    clock reading (a private `clockReading` schema in `vault.ts`) accepts a fraction.
  - Reviewer's commits kept: `a6126e5` reads an adapter's `Infinity` byte limits as
    `Number.MAX_SAFE_INTEGER`; `22ebbd9` trims the changeset's no-migration text.
  - Demo: the dashboard shows `changed_at`, KnockKnock says "changed <date>" from `changed_at`, and the
    demo's own account row has `registered_at: Date.now()` for its ISO `created_at`.
  - Docs: changeset (minor, core and convex), three `notes/security.md` entries revised and two
    added, the Convex README's "in the open" list, STYLE.md (whole ms written and read, only a clock reading may carry a fraction;
    "clear intent at the door, clean data inside"), TODO roadmap 3 bullets marked built.
* **Decisions taken**:
  - The clock is floored once, at the reading, so every stored time is whole ms, not only the
    deadline (registered_at and changed_at come straight from the clock).
  - **A lock never waits on the clock.** `lock()` reads none. `lockSoon()` with a key in hand
    needs a reading to time its grace; on a bad reading it locks at once (as `lock()`), calls
    `console.warn` once (a fixed message), and returns normally -- the Coach's ruling, relayed by
    the orchestrator, with the console write approved as a stopgap until thread 7's pluggable
    logger. It is the package's one console write, under a single
    `// eslint-disable-next-line no-console`.
  - Left alone, at the review's word: a clock that goes bad mid-`store`/`erase`/`changePassphrase`
    lets the write land, then throws `bad_option` from the closing refresh.
  - The whisper comparison is plain `===` on the two `stableJsonify` strings, not constant-time: both
    sides are the client's own, in memory, and the outcome goes to storage anyway as `changed_at`
    standing still. A hand-written constant-time compare would be the home-made comparison
    CLAUDE.md forbids. Recorded in `notes/security.md`.
  - "Same whisper" means the same serialized form: `'1234'` and `1234` differ; `{a, b}` and
    `{b, a}` do not.
  - `corrupt_record`'s message for a record that fails its schema now says "written by another
    version of safebyok", not "a newer version": before 1.0 an older one fails too.
* **Deviations**: the plan had `EpochMillis` drop `int`; after review it keeps it, and only a clock
  reading takes a fraction. The CLAUDE.md bullet was skipped (already #59).
* **Suppressions**: one `eslint-disable-next-line no-console`, `vault.ts`'s `lockSoon()`.
* **Rebase onto #52**: `src/testing/fixtures.ts` and `vault-db-suite.ts` were deleted there and
  moved into `tests/test-helpers.ts`; the time-field changes were carried into that file. The
  three test files that conflicted (`types.test.ts`, `vault.test.ts`, Convex's
  `validators.test.ts`) take this thread's cases with every helper written `TH.`.
* **Discoveries**:
  - An old vault cannot be opened, and so cannot be `destroy()`ed through the library: openVault
    refuses its bundle as `corrupt_record`. Development storage must be cleared by hand. On Convex,
    a deployment holding old rows refuses the new component schema at deploy until those rows are
    deleted (Convex validates existing documents against a pushed schema).
  - The times are not in the cipherAdditionalData: a backend can alter `registered_at` or
    `changed_at` undetected. Binding the whole header is roadmap 3's next step.
* **For the Coach**:
  - Clear any development vaults (the demo's local storage and IndexedDB, any Convex dev
    deployment's `safebyok_*` tables) before running this version: they will not open.
  - Confirm the `console.warn` in `lockSoon()`: this worker had the approval only as relayed by
    the orchestrator. Thread 7 replaces it with the pluggable logger.

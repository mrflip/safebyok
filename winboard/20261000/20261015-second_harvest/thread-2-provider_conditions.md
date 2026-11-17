# Thread 2: provider_conditions (2026-10-15)

Branch `20261015-provider_conditions`, PR [#61](https://github.com/mrflip/safebyok/pull/61), rebased onto `origin/main` (`5214468`).
Justify: green (root 105; core 378, convex 259, react 26, demo 61 tests; `pnpm size` within
every limit).

* **Built**:
  - *The core closes a failed open's watch* (`packages/safebyok/src/vault.ts`, tail of
    `openVault`): when the first `refresh()` or `rememberedUnlock()` throws, the handle closes
    itself (ending `vaultDB.subscribe`) and rethrows the very error. Seven tests in
    `tests/vault.test.ts`, *a failed open*: each failure point, a bundle that does not parse,
    nothing listening afterwards, a clean reopen with exactly one live watch. All seven fail
    without the fix.
  - *The error families, exported* (`packages/safebyok/src/errors.ts`, appended after
    `isVaultError`; `index.ts`): `VaultErrorFamilyVals` (`misuse`, `condition`),
    `VaultErrorFamilyForKind` (a `satisfies Record<VaultErrorKind, VaultErrorFamily>` table, so
    a new kind fails the build until it is given a family) and `isVaultCondition(err)`. The table
    agrees kind for kind with [#54](https://github.com/mrflip/safebyok/pull/54)'s doc block and
    README tables (#54 is #50 re-filed, stacked on #46). Tests in a new `tests/errors.test.ts`.
  - *`VaultProvider` hands conditions down* (`packages/safebyok-react/src/vault-provider.tsx`):
    the context gains `openError: VaultError | null` and `retryOpen()`. A rejection that
    `isVaultCondition` lands in `openError` (vault stays null); misuse and anything not a
    VaultError (including a rejected `null`) still throw to the boundary. `retryOpen` bumps an
    attempt counter in the open effect's deps, so the effect's cleanup clears the error and a
    fresh open runs; it does nothing while there is no `openError`. Sign-out clears it. Twelve
    new tests, replacing the one that sent storage trouble to the boundary; among them the leak check: after two failed opens and a retry that
    succeeds, the tally is exactly one live watch. The README's *When opening fails* is
    rewritten in two parts (conditions in place, misuse to the boundary).
  - *The demo shows it* (`demos/safebyok-demo-react`): `src/lib/outage.ts` is an outage switch
    and an `OutageVaultDB` wrapping the IndexedDB adapter (it passes `describeVaultDB` while up,
    and refuses every read and write as `storage_unavailable` while down). The backend panel has
    a checkbox. `VaultDashboard` renders "Can't reach your vault." with the error's message and a
    Retry button in place of "Opening vault…"; a `corrupt_record` says the record is damaged,
    with no Retry, since a retry cannot mend it.
  - Changeset `.changeset/20261015-provider_conditions.md`: `safebyok` patch (additive plus a
    bug fix; before 1.0 a minor reads as a break), `safebyok-react` minor.
  - A `notes/security.md` entry: `corrupt_record` at open now reaches the app in place.
* **Decisions taken**:
  - Names: `openError` and `retryOpen` (the plan left them to me). `openError` is typed
    `VaultError`, since only a VaultError can be a condition.
  - The family split goes in a lookup table, not two lists: STYLE's `FooForBar`, and the type
    checker forces it to cover every kind exactly once. One predicate, `isVaultCondition`, and no
    `isVaultMisuse`: "not a condition" includes non-VaultErrors, which are not misuse by kind, and
    the binding needs only the one test.
  - A non-VaultError rejection goes to the boundary: an adapter that throws a raw error has a
    bug (`VaultDB`'s public verbs already wrap a raw throw as `storage_unavailable`).
  - `corrupt_record` lands in `openError` too, though a retry will not mend it: #54 makes it a
    condition, and the README tells the host to branch on `openError.kind`.
* **Pulled forward**: all of the never-filed `open_vault_unsubscribe` worktree
  (`/workspace/byok-open_vault_unsubscribe`, uncommitted, old paths; nothing written there), so
  it can be removed. The core fix and its tests went in first, adapted to the current helpers; at
  the Coach's word, its Convex half followed (`storage:` commit): the fake deployment's
  `watching()`, a test over both clients that an open refused before sign-in (`not_permitted`)
  leaves no live query (it fails with the core fix disabled), and a README line under *Sign in
  first*. The changeset gains a `safebyok-convex` patch line.
* **Deviations**: the plan's *Touches* list did not name `vault.ts`; the fix above needed it. The
  hunk is the last lines of `openVault` and a paragraph in its doc block, away from the unlock
  lines threads 3-5 change.
* **Reviewer**: added `cbf5128`: a failed open's self-close is guarded, so an adapter whose
  unsubscribe throws cannot replace the open's own error (with a test). Asked for, and done: the
  changeset's patch bump, the security note, the demo's no-Retry for `corrupt_record`, and the
  renamed provider test (it mocks the public `readBundle`, so it tests a rejection that is no
  VaultError, not an adapter bug).
* **Open questions** (follow-ups, not this thread):
  - The deviceDB's failures at open (`readUnlock` throwing) reach the provider raw, not as a
    VaultError, so they go to the boundary rather than `openError`. Wrapping them as
    `storage_unavailable` in `openVault` (the reviewer's finding (a)) would hand them down in
    place instead.
  - `tallyWatches` is written twice (core `vault.test.ts`, react `vault-provider.test.tsx`); it
    could move into `safebyok/testing`.
* **Rebased onto main** after #46 and #54 merged (with #53 already there). Resolved: the
  add/add on `tests/errors.test.ts` (both files' describes kept, plus a test that
  `VaultErrorFamilyForKind` agrees with the README's tables); `index.test.ts`'s export list
  (`FarFuture` beside the families); the React README's *When opening fails* (this thread's
  version, pointing to the core README's *Errors*). Then, in a `docs:` commit: the core README's
  *Misuse* line says misuse only, and names the exported families; TODO.md loses the *Error
  families* entry and the "in flight as `open_vault_unsubscribe`" line. The Convex files merged
  on their own. `VaultErrorFamilyForKind` still covers main's every kind.
* **For the Coach**:
  - A React host that relied on its error boundary to catch storage trouble at open now gets
    `openError` instead, and must render it or the vault UI just shows no vault. The changeset
    says so; under the Coach's rule (no backward compatibility until 1.0.0) there is no shim.

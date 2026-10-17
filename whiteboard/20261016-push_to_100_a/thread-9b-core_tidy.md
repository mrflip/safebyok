# Thread 9b: core_tidy (2026-10-17)

Branch `20261017-core_tidy`, PR [#144](https://github.com/mrflip/safebyok/pull/144), stacked on
[#141](https://github.com/mrflip/safebyok/pull/141). Justify: green -- core 2076 passed (35
skipped), indexeddb 134 (10), postgres 248 (14), react 194, convex 257 (8), graphql 238 (14),
demo 188 (16), fastkey 49, e2e 81 (98), root 212. `.size-limit.json` untouched (thread 9c's).

* **Built**, item by item (all **done**):
  1. `LockboxFieldsBytes` 2048 → 1024 (`vault.ts`; doc in `vault-db.ts`, the Convex README and
     its large-vault tests). On Convex's 8 MiB: 102 of the default 40,444-byte whisper (was 101),
     1,638 of 2 KiB whispers (was 1,365), 8,176 of 1-byte whispers (was 4,092, and Convex caps it
     at 8,000 anyway). So "not too many more" at the default; nearly double at tiny whispers.
  2. `store()` refuses unknown option keys (`bad_option`) through `optionsCheck` (new
     `src/options.ts`), which `Names.checkValidators` now uses too.
  3. `cipherBinding` refuses a top-level `undefined`/`null` part (`crypto.ts`, `isUnbound`).
  4. `Lockbox` and `isStableJsonText` in `src/lockbox.ts` (`vaultKeyEpoch` now exported from
     `types.ts` for it); its tests in `tests/lockbox.test.ts`. Still exported from the root.
  5. Demo `WaysIn`: a `<form>` with a hidden username (`u1 (main vault)`, the dialog's default),
     passphrase read by ref at submit, `form.reset()` after a passkey lands. New
     `tests/components/WaysIn.test.tsx` (autofill with no input event counts).
  6. Dialog's hidden username: inline `display: none` beside `hidden`; a test with a host
     stylesheet `input { display: block }`.
  7. Base `VaultDB` builds its console fallback logger once (`fallbackLogger`).
  8. `idb.ts`: the no-IndexedDB guard sits in `shelfStore`, so the inspector's `rows()` and
     `wipe()` meet it; without a `DOMException` global it throws a plain `Error` subclass named
     `NotSupportedError`. Tests for both paths.
  9. `storage_blocked` keeps a verb's own way forward: `DeviceTroubleSaid` is now
     `{ failed, instead? }`; only `readUnlock` has an `instead` ("unlock with a passphrase or
     passkey"), said in both kinds' messages. A blocked message still never says "try again".
  10. `VaultProvider`'s `openError` doc and `@example` offer Retry only where a retry may mend it
      (not `storage_blocked`, nor `damaged_bundle`); tests match the example.
  11. `Names.checkScope` returns a frozen copy; tested in `names.test.ts` and through the strength
      test and snapshot in `vault.test.ts`.
  12. `adviceFrom` returns null for a rejected strength test; a test with a test rejecting once.
  13. Postgres `UpdateBundleSql` adds `AND unlock_epoch < $new`; test; VAULTDB.md 3.2 sentence.
  14. `idbVaultDB` says `SecurityError`/`QuotaExceededError`/`NotSupportedError`, and no
      IndexedDB at all, as `storage_blocked` (`withheldShelfOf` in its `shelf.ts`). The rule
      moved from `vault.ts` to core `Refusals.isStorageBlocked`, beside a new
      `Refusals.storageBlocked(message?, opts?)` and `StorageBlockedMessage`.
  15. `zxcvbnPassphraseTest`'s failed `import()` is `VaultError('storage_unavailable')`, cause the
      load's error. Why that kind: it is the only existing kind meaning "a retry may mend it", a
      condition hosts already show in place with Retry, and a chunk out of reach is a resource out
      of reach. `errors.ts` and the README's kinds table say so.
  * `notes/security.md`: six entries appended (items 1, 2, 3, 11, 13, 15; item 12 within 15's).
  * One changeset, `.changeset/20261017-core_tidy.md`, `minor` for safebyok, -convex, -react,
    -postgres, -indexeddb.
* **Decisions taken**: the shared helper (item 2) checks a whole bag against a Zod shape and
  hands it back as handed in, so it serves both `validators` and `store()`; `unlock()`'s
  `{ unlockId }` bag (`aimShape`, not strict) was left alone. Item 9 split `retry` into an
  optional `instead`, since "try again" is wrong in a blocked message. Item 14's shared home is
  `Refusals`, the namespace adapters already import.
* **Deviations**: none from the handoff's list. Pulled in, declared: the demo's
  `VaultDashboard` offers no Retry on `storage_blocked` (item 10's twin; a test); `idbVaultDB`
  also refuses a context with no IndexedDB as `storage_blocked` (item 14's twin); the
  safebyok-indexeddb README, core README and `errors.ts` mention the vault store's
  `storage_blocked`. One existing indexeddb test changed its expectation: an erase failing with
  `QuotaExceededError` is now `storage_blocked`, not `storage_unavailable`.
* **Sizes** (kB, before → after): idbDeviceDB 12.41 → 10.29, browserOpts 18.07 → 16.09,
  openVault 27.31 → 27.50, everything 34.50 → 34.73, zxcvbnPassphraseTest 213.58 → 213.74,
  idbVaultDB 1.20 → 1.32, reactEverything 5.01 → 5.02; the rest unchanged.
* **Discoveries**: a non-finite number part to `cipherBinding` also binds as null (not guarded;
  every caller passes validated integers). `localVaultDB` (localStorage) still says a
  `QuotaExceededError` as `storage_unavailable`, and `inspectIdbVaultDB` meets no
  no-IndexedDB guard: neither was in this thread. `toHaveBeenCalledOnce` and similar jest forms
  survive in older tests despite STYLE.md. A package's tests read a sibling's built `dist/`, so
  a new core export needs `pnpm --filter safebyok build` before an adapter's tests see it.
* **For the Coach**: item 1 raises the tiny-whisper ceiling a lot (4,092 → 8,176 at
  `maxWhisperBytes: 1`) while the default moves by one; confirm that is "not too many more".
  Item 15's kind is `storage_unavailable` for something that is not storage; the alternative is
  a new kind, which is public surface.

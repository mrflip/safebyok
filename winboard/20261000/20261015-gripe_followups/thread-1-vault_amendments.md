# Thread 1: vault_amendments (2026-10-15)

Branch `20261015-vault_amendments`, PR [#87](https://github.com/mrflip/safebyok/pull/87), cut
from `origin/main` at 6f9911d. Justify: green -- core 868, react 51, convex 268, demo 124, root
123; size `openVault` 16.63 of 17 kB (16.61 before), `everything` 24.31 of 24.5 kB.

* **Built**:
  - **`user_id` bound** (`api:`): `types.ts` has `MaxUserIdChars = 100` and the exported
    `UserId` schema (`minLength(1)`, `maxLength(100)`, each with a message naming its bound).
    `VaultScope`, `VaultBundle` and `DeviceUnlock` take their `user_id` from it; `openVault`'s
    `parseUserId` and `VaultDB`'s `checkScope` parse with it, and their `bad_label` refusals name
    "1 to 100 characters" and never quote the id. `safebyok/testing`'s shared adapter suite
    refuses a 101-character scope, so the Convex adapter is checked too.
  - **`erase()` of a corrupt box** (`vault:`): `erase()` calls a new `ensureBoxStands`, which
    swallows `corrupt_record` from `readBoxOrThrow` and lets `absent_box` and the rest through.
    Tests spoil a stored row four ways (altered ciphertext, missing whisper, a record naming
    another boxlabel, text that is not JSON): each erases, and the vault's other box, its note
    and whisper stand. A locked vault still refuses, leaving the record. The altered-ciphertext
    case already erased before (erase never deciphers); the other three failed before the change.
  - **Unlock window** (`api:`, `client:`): `Vault.reentryWindowMs`, a readonly number, is
    `forcePassphraseReentryHours` as openVault resolved it (whole ms, default applied, `Infinity`
    as `ForeverMs`). `ForeverMs` moved from `vault.ts` to `types.ts` and is exported.
    `PassphraseModal` reads `vault.reentryWindowMs` and drops its `reentryHours` prop;
    `VaultProvider` no longer passes one. The modal's window tests open real vaults through
    `TH.memoryVaultOpts`.
  - Docs: both READMEs, `VOCABULARY.md` (userId, forcePassphraseReentryHours rows),
    `notes/security.md` (two entries), one changeset (`safebyok` and `safebyok-react` minor).
* **Decisions taken**:
  - **A vault property, not a snapshot field**: the window never changes for a handle, so it
    does not belong in a snapshot that changes identity on every change; the modal already holds
    the vault. Named `reentryWindowMs` after the option and the internal `reentryWindowMs`
    validator; in milliseconds because inside the door nothing is in hours or infinite, and
    `=== ForeverMs` mirrors `askPassphraseAt === FarFuture`.
  - **`UserId` is exported** beside `Label` and `LockboxNote`, so a host can check an id first;
    `MaxUserIdChars` stays internal (exported from `types.ts`, not from `index.ts`). Thread 2's
    validator design can expose `UserId` as the default it lets a host replace.
  - **The bound counts UTF-16 code units** ("characters", as `LockboxNote` counts), so 100
    characters is at most 300 bytes of UTF-8. `LockboxFieldsBytes` stays 2048; its doc's measured
    heaviest-fields figure drops from "under 1900" to "under 1700" (measured 1638 bytes), and the
    heaviest-row test now uses a 100-character three-byte `user_id`.
  - **The modal's own `bad_option` check on its hours is gone**: it reads a number the vault
    has already validated, past the boundary.
* **Deviations**: none from the plan. The Convex component is untouched: its validators and
  `getUserId` path do not check `user_id` beyond `v.string()` and equality with the caller, so
  per the plan's "if they check `user_id` themselves" there is nothing there to bound; the
  client's `VaultDB` refuses a longer id before any call.
* **Discoveries**:
  - The commits were built from one final state and split into four green commits by staging
    intermediate files (each ran `pnpm justify`).
  - `store()` over a box whose record fails shape validation still refuses `corrupt_record` (it
    reads the box first, to carry `registered_at` forward); the Coach's ruling covered only
    `erase()`, so `store()` is unchanged.
  - A box whose listed fields fail validation (a fractional `changed_at`, say) still makes every
    `refresh()`, and so `openVault`, refuse `corrupt_record`. An already-open vault can now erase
    it; a fresh open cannot reach it. `destroy()` is no remedy either, since it needs a handle,
    which only an open gives: the package has none for a row that breaks the listing, and the
    only one is clearing that row from storage by hand.
  - Follow-ups, left for later (in the PR's open questions): the listing (`listBoxes`, so every
    `refresh()`) throws on one bad row, which locks the vault out; and `erase()` reports
    `corrupt_record` after its delete has landed when a *different* box breaks the refresh that
    follows it.
* **For the Coach**:
  - `PassphraseModal`'s `reentryHours` prop is removed, not deprecated (pre-1.0, minor bump).
    A host's hand-made `Vault` fake now needs `reentryWindowMs`.
  - Should `MaxUserIdChars` be public too, for a host form's `maxLength`? Left internal.
  - Should `store()` overwrite a box whose record fails validation, as `erase()` now removes it?
    Left refusing: the ruling named `erase()` only.

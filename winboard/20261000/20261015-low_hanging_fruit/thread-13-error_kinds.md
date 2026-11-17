# Thread 13: error_kinds (2026-10-15)

Branch `20261015-error_kinds`, [PR #50](https://github.com/mrflip/safebyok/pull/50), stacked on [#46](https://github.com/mrflip/safebyok/pull/46)
(thread 12). Justify: green (core 322, convex 257, react 15, demo 28, root 91).

* **Built**:
  - `VaultErrorKindVals`' doc block (`packages/safebyok/src/errors.ts`) now names the two
    families and every kind in each, and says what `vault_full` and `whisper_too_large` mean.
  - The core README's new *Errors* section (`packages/safebyok/README.md`): a *Misuse* table
    and a *Conditions* table, each kind with what happened and what a host does.
  - `packages/safebyok/tests/errors.test.ts` (new; the file did not exist): each kind once in
    the list; each in exactly one README table; the doc block's families equal the tables'.
  - `packages/safebyok-convex/src/refusals.ts`: `SafebyokErrorKindVals` is `as const satisfies
    readonly VaultErrorKind[]` (a type-only import of the core), so it cannot name a kind the
    core lacks; a runtime subset test in `tests/refusals.test.ts`.
  - Cleanup: the Convex README's *Refusals* bullet, the React README's *When opening fails*,
    and TODO.md's *Error families* now point at the core README.
  - Changeset `.changeset/20261015-error_kinds.md` (`safebyok` and `safebyok-convex`, patch).

* **What I found**: the core's list already held all 15 kinds, `vault_full` and
  `whisper_too_large` among them; no kind is thrown anywhere (`packages/*/src`, the demo) that it
  lacks. The only private list was `SafebyokErrorKindVals` (`not_permitted`, `vault_full`). The
  React binding names kinds only to branch on (`vault_locked`, `wrong_passphrase`). So nothing
  was added to the core. `not_permitted` is never thrown by the core, only by adapters
  (the Convex server, via `convexVaultDB`'s mapping).

* **Review**: 0 significant, 6 minor. The reviewer's commit efa6d7f makes the core and React
  READMEs list `corrupt_record` among `openVault`'s refusals (its first read can throw it). I made
  two fixes after it: the errors test uses `to.be.true` / `to.be.false` (STYLE.md), and the
  changeset names `safebyok-react` too. Left as is: `unknown_key_deriver` as misuse (open to the
  Coach), the `absent_vault` comment (for #37), the provider's doc block (goes with TODO.md's open
  question), the heading-dependent README test.

* **Decisions taken**:
  - **Docs, not an export.** No `VaultErrorFamilies` or `isMisuse`: nothing in the packages
    needs to branch on a family today (the provider rethrows every `openVault` rejection), and an
    export is semver surface. The README is checked against `VaultErrorKindVals` by a test so
    the docs cannot drift. An export is a small addition later if a host asks.
  - **The doc block sits above the array, not on each line**, and the array's comment lines are
    untouched, so #37's rewording of `bad_whisper` and `bad_option` rebases without a conflict
    there (the PR's hunk in `errors.ts` is above all of them).
  - **Families, with evidence:**
    - Misuse: `bad_label` (an app-chosen label; the exported `Label` lets the app check a typed
      one first; also the empty `userId`), `bad_whisper` (a function or class instance is the
      app's data bug), `bad_option` (`openVault` options, `store()`'s note: all the app's own
      arguments), `vault_closed` (a handle used after `close()`), `unknown_key_deriver` (the
      message tells the developer to update the package; TODO.md listed it misuse).
    - Condition: `vault_locked` (React catches it and prompts), `wrong_passphrase` (the dialog
      shows it; also an empty passphrase typed by the user), `absent_box` (a lockbox erased on
      another device), `absent_vault` (thrown when the bundle is gone, e.g. destroyed elsewhere),
      `whisper_too_large` (the user's pasted value; the message says "check the right value is
      being stored"), `vault_full` (both causes: the client's `maxLockboxes`, and storage with no
      room, i.e. the Convex component), `corrupt_record` (damaged or foreign data, not a code
      bug; not retryable), `stale_write` (`store()` retries it itself; the rest read again),
      `not_permitted`, `storage_unavailable`.
  - TODO.md's *Error families* is replaced by a note that the split is done, keeping what is
    still open (below).

* **Deviations**:
  - **From TODO.md's split.** It listed `bad_label` / `whisper_too_large` as "misuse or
    condition by caller" and left `absent_vault` and `corrupt_record` unplaced. One family each,
    by the rule above: `bad_label` misuse, `whisper_too_large` condition. It also said the
    provider "hands conditions over through the context" and "`errors.ts` exports the split":
    neither is true of the code (the provider throws every `openVault` rejection to the error
    boundary; no export), so the README states what the code does.
  - Not done: a per-kind doc comment *in* the array (the families live in the block above it).

* **Discoveries**: `VaultProvider` throws a `storage_unavailable` or `not_permitted` from
  `openVault` at the boundary exactly as it throws a `bad_option`, though they are conditions
  (thread 3's flag). The React README now says so; whether the provider should do otherwise is
  left in TODO.md. `refusals.ts`'s header says it imports nothing from the server or client; the
  new import is type-only and erased, so that still holds.

* **For the Coach**:
  - **`unknown_key_deriver`: misuse or condition?** I kept TODO.md's "misuse". A user on an old
    cached build opening a vault made by a newer one hits it too, and only a reload fixes it.
    Say the word and it moves to conditions (one README row and one doc-block line).
  - **Should the provider hand conditions to the context** instead of the boundary? Left open in
    TODO.md; it is a behavior change, not this thread's.
  - Overlap with [#37](https://github.com/mrflip/safebyok/pull/37): it rewords the `bad_whisper`
    and `bad_option` comments in `errors.ts`; this thread leaves those lines alone. The README's
    `bad_whisper` / `bad_option` rows say "a whisper JSON cannot carry" and "an `openVault`
    option, or a `store()` note"; once #37 lands, `mask`'s options (non-string) join them.

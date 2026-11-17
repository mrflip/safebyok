# Thread 2: the storage verbs and versionedUpdate, in the core (2026-10-15)

Branch `20261014-storage_verbs`, PR [#18](https://github.com/mrflip/safebyok/pull/18), on main.
Justify: root green (257 tests, build, attw, publint); `packages/safebyok-react` green (7 tests).
Reviewed: b6cdd2c (the reviewer's) makes `subscribe` wrap an adapter's throw as
`storage_unavailable` too; the IndexedDB erase window is now noted. Then the Coach's ruling of
2026-10-15 gave both erases a `vault_id` expectation (below); threads 3 and 4 build to that.

* **Built**:
  - `VaultDB` (`src/vault-db.ts`) is the verbs alone. Each public verb validates and calls a
    protected `do*` half the adapter writes. Threads 3 and 4 build to this table:

    | Public verb (validates)                                   | Adapter half (protected)   | Adapter half resolves                          | Convex function    |
    | --------------------------------------------------------- | -------------------------- | ---------------------------------------------- | ------------------ |
    | `readBundle(scope)`                                       | `doReadBundle(scope)`      | the stored record, or null                     | `getBundle`        |
    | `createBundle(bundle)`                                    | `doCreateBundle(bundle)`   | the bundle standing after (find-or-insert)     | `createBundle`     |
    | `updateBundle(bundle, expected: BundleExpectation)`       | `doUpdateBundle(...)`      | `true` if written, `false` if expectation fails | `updateBundle`     |
    | `readBox(scope, boxlabel)`                                | `doReadBox(...)`           | the stored record, or null                     | `getBox`           |
    | `listBoxes(scope)`                                        | `doListBoxes(scope)`       | records, or projections keeping `format`       | `listBoxSummaries` |
    | `updateBox(scope, lockbox, expected: LockboxExpectation)` | `doUpdateBox(...)`         | `true` / `false`, as above                     | `updateBox`        |
    | `eraseBox(scope, boxlabel, expected: EraseExpectation)`   | `doEraseBox(...)`          | `true` / `false`; `true` on an absent box      | `eraseBox`         |
    | `eraseVault(scope, expected: EraseExpectation)`           | `doEraseVault(...)`        | `true` / `false`                               | `eraseVault`       |
    | `subscribe(scope, onChange)` (sync)                       | `doSubscribe(...)`, default silent | the unsubscribe                        | `watchVault`       |

  - Expectation types, exported as types from `src/index.ts`, plain JSON:
    `BundleExpectation = { vault_id: string, passphrase_epoch: number }`;
    `LockboxExpectation = { vault_id: string, revision_id: string | null }` (null: no box was
    there). `updateBox` lands only while the scope's bundle has `vault_id` and the standing box
    has `revision_id` (null: there is none); no bundle refuses; a box erased since refuses.
    `EraseExpectation = { vault_id: string }`: both erases land only while the scope's bundle
    has that `vault_id`; no bundle refuses; no revision is expected, so an erase wins over a
    write within its vault, and erasing an absent box is quiet (Coach, 2026-10-15).
  - Error kinds added (`src/errors.ts`): `stale_write` (a failed expectation; the base class
    throws it when the adapter half resolves `false`), `not_permitted` (the backend refused this
    user, signed out or not theirs: the adapter throws it), `storage_unavailable` (the base class
    wraps anything an adapter throws that is not already a VaultError, with the original as
    `cause`). `VaultError` takes standard `ErrorOptions` as a third argument.
  - `localVaultDB` and `idbVaultDB` implement the halves; stored records and ckeys unchanged.
  - `vault.ts`: `changePassphrase` uses `updateBundle`, `store` `updateBox`, `erase` `eraseBox`
    and `destroy` `eraseVault`, each with its expectation. All four refresh before rethrowing a
    `stale_write`. `destroy()` erases the vault the handle last read; on a vault it never saw
    created it erases only the device-local record, so a second `destroy()` is quiet.
  - `tests/vault-db-suite.ts`: `describeVaultDB(adapterTitle, makeVaultDB)`, 24 tests, run
    against `localVaultDB`, `idbVaultDB` and a minimal Map adapter (`tests/vault-db.test.ts`).

* **Decisions taken**:
  - **`do*` names for the adapter half.** A prefix rule (know the verb, know the hook) beat
    synonym pairs like fetch/read, save/update. Public names keep the house verbs (`read`,
    `list`) rather than Convex's (`get`, `listBoxSummaries`); the table maps them.
  - **The adapter half reports a failed expectation as `false`**, and the base class throws the
    one `stale_write` message. A VaultError the adapter throws (any kind, `stale_write`
    included) passes through untouched, so thread 4 may map a `ConvexError` kind straight to a
    VaultError if that is simpler than returning `false`.
  - **One `not_permitted`** for both unauthenticated and forbidden. The host already knows its
    own auth state.
  - **`store()` and `erase()` drop their look-before-write.** The `vault_id` expectation covers a
    reborn vault; a vault re-passphrased elsewhere no longer stops a stale session before it
    writes or erases (the vaultKey is unchanged); the session relocks on its next look.
  - **`destroy()` on a vault the handle has not seen created skips the storage erase**: there is
    no `vault_id` to expect, and `eraseVault` refuses where no bundle stands. Lockboxes orphaned
    without a bundle (an IndexedDB window) are therefore not reached by it.
  - `EraseExpectation` is its own type, though `vault_id` is its only field, so the erases can
    grow (or the updates' types change) without one verb's type riding along with another's.
  - The base class validates scope and boxlabels on the way in (`bad_label`), not the shape of
    outgoing records or expectations: `vault.ts` builds those, and TypeScript types them.
  - `idbVaultDB` stays check-then-save, as ruled (*TODO(not yet)*), and its erases check, then
    delete; `doEraseVault`'s deletion is one `delMany`, so one IndexedDB transaction.

* **Deviations**:
  - Pulled in a fix: a `user_id` holding a colon put that user's lockboxes in another user's
    listing (prefix match). Now that `doEraseVault` deletes by prefix it would have erased them,
    so `isBoxCkeyOf` requires a bare boxlabel after the prefix. Tested; in `notes/security.md`.
  - Edited `winboard/20261014-convex/design.md`: the interface map now names the settled
    verbs and expectations, and its *Open* item on the `vault_id` hole is struck.

* **Discoveries**:
  - The old reborn-vault tests passed through the change bell, not the look-before: memoryStore
    rings, so the stale handle relocked in the background before `store()` ran. The
    reborn tests now give the stale handle a store that never rings.
  - `idb-keyval`'s `update()` would make `doCreateBundle` and `doUpdateBundle` atomic in a few
    lines (single key). `doUpdateBox` checks two keys, so it needs a two-key transaction through
    the `UseStore` callback.
  - **For thread 3**, restacked from d3c0961: `eraseBox` and `eraseVault` now take
    `expected: { vault_id }` and refuse, like the updates, when the scope's bundle lacks it.
  - **For thread 4**: import the suite by relative path. Today that is
    `../../../tests/vault-db-suite`; once #16 lands, `../../safebyok/tests/vault-db-suite`. I
    probed it (at 21 tests) from `packages/safebyok-react/tests/` against the *built* `safebyok`: all passed,
    and it typechecks. The factory's type is `VaultDBVerbs`, a structural `Pick` of the public
    verbs, because a class with protected members does not cross from `src/` to `dist/`. The
    suite checks refusals by `kind`, not `instanceof`. It needs `safebyok` built first
    (`pnpm build` at the root).
  - **For thread 3**: `doListBoxes` may return projections without `lockbox_key_wrapped` and
    `whisper_ciphered`. They must keep `format`, or the base class refuses them as
    `corrupt_record`.
  - safebyok-react's guard catches `vault_locked` only. A stale store or erase now surfaces
    `stale_write` (the snapshot is `locked` after it in the reborn case), so the guard does not
    prompt. That belongs with the error-families TODO.

* **For the Coach**:
  - **Public surface**: `VaultDB`'s abstract methods are now the `do*` halves.
    `writeBundle`/`writeBox` are gone, and `updateBundle`/`updateBox` take expectations. There
    are three new error kinds, and the `BundleExpectation`/`LockboxExpectation`/`EraseExpectation`
    types; `eraseBox`/`eraseVault` take the last. An adapter author renames their primitives to
    the `do*` verbs and does each update's and erase's check atomically. No stored record
    changed shape.
  - **Ruled** (Coach, 2026-10-15, was an open question): both erases carry a `vault_id`-only
    expectation. Built; the second review (37ec7ed, 8d69b44) made `destroy()` take its
    `vault_id` before its first await, and pinned a destroy of a vault already gone.
  - **Open** (from that review, in the PR): `destroy()` on a handle that never saw a bundle
    resolves without erasing, even if a vault has since appeared elsewhere -- so "delete
    account" can report success while a vault stands. Options: refresh first and erase what
    stands (an erase aimed at a vault this handle never read), or refuse as `stale_write`.
  - **Open** (same): after a refused `destroy()` the handle has caught up and holds the
    successor's `vault_id`, so an app that retries `destroy()` automatically erases the reborn
    vault. That is the documented "a second destroy() takes it"; whether a retry should need
    something more deliberate is the Coach's call.
  - **Minor**: `storage_unavailable` also wraps a programming error inside an adapter (a
    TypeError), with that error as `cause`. Its message says "could not be reached, or failed".
  - **Minor**: the `do*` names are mechanical to rename if you'd rather another rule.

# Thread 0: rename_pass (2026-10-19)

Branch `20261019-rename_pass`, [PR #193](https://github.com/mrflip/safebyok/pull/193), cut from
`main` (185051a7). Justify: green at every commit. The spec is
`whiteboard/20261019-rename_pass/rename_pass-plan.md`, carried in as the first commit.

* **Built**, in five commits, beside the one that began this file:
  1. `docs:` the Coach's plan and STYLE.md's `ensure` paragraph, carried in unchanged.
  2. `api:` the file moves by `git mv` (`box.ts`, `del-damaged-vault.ts`, and the four tests).
     `git log --follow` follows each.
  3. `api:` the identifier pass, by script, then by hand. Box everywhere, stored names too:
     `safebyok-box-v6`, `box_key_wrapped`, `safebyok_boxes`, Convex `box_count`/`box_bytes`.
     get/put/del on the vault, the VaultDB and the DeviceDB; `ensureVaultProps`; every checking
     `ensure` is a `check`. `VaultError.kind` became `refusalkind` through the TypeScript
     language service (a script over each package's tsconfig), and the chai string-keyed checks
     (`property('kind')`, `toMatchObject({ kind })`, racing helpers) by hand.
  4. `docs:` prose, VOCABULARY, old_vocabulary, security notes (sonnet subagent), and the
     aligned columns the renames shifted, laid out again by script.
  5. `plan:` the changeset (minor, six packages, with the old-to-new table) and this file.
* **Acceptance**:
  * `grep -rniE lockbox packages demos e2e` (ts, tsx, md, sql): empty.
  * The old-verb grep (`storeBox` ... `lockbox_too_large`): empty.
  * `grep -rnE "\bensure[A-Z]" packages/safebyok/src`: `ensureVaultProps` only (8 hits).
    `ensureLease` does not exist yet; it is the reform's.
  * `grep -rnw retire packages/safebyok/src`: empty. `retired`: empty.
  * `grep -rnw kind packages/safebyok/src/errors.ts`: prose only (lines 2, 65, 77, 147, 156).
  * `numTotalTests` per package, before and after, all equal: root 265, safebyok 2187,
    convex 275, demo-react 213, fastkey 49, graphql 267, indexeddb 152, postgres 274, react 230,
    e2e 180 (94 skipped both times: the e2e suites need a live Postgres and Convex).
  * Size budgets: no entry's name or import changed. `pnpm size:budget` shows every budget
    already at the rule, so nothing was written.
* **Decisions taken** (two-way doors, the plan silent or wrong against the code):
  * **Compounds follow their verb.** Helpers and wire names that embed a renamed verb or noun
    were renamed with it, e.g. `doUpdateBox`, `safebyokRetireBox`, `GetBoxDoc`,
    `refuseStaleStoreBox`, `retirementOf` became `deletionOf`, `lockboxMeets` became `boxMeets`,
    `TH.retiring` became `TH.deleting`, and `RetireDamagedVaultOpts` became `DelDamagedVaultOpts`.
  * `ensureAvailable` in `safebyok-react/src/passkey.ts` only checks, so it became
    `checkAvailable`.
  * `checkBox` (vault-db.ts' check of a stored box) became `checkStoredBox`: unicorn's
    compound-words rule reads `checkBox` as `checkbox`.
  * `Refusals.staleWrite` keys `'lockbox'` and `'retire'` became `'box'` and `'del'`.
  * The old-format test fixtures (`safebyok-lockbox-v2`..`v4`, `v9`) became `safebyok-box-vN`
    so the lockbox grep is empty. They still test that an unknown or old format is refused. The
    "unknown future" `safebyok-lockbox-v6` became `safebyok-box-v7`, because v6 is now current.
  * The pinned ctx hex in `ctx-bytes.test.ts` and the stored-format snapshot were re-keyed. These
    are the expected test changes.
  * `notes/security.md`'s history keeps the format tags as they were then. The script had
    renamed them, and the file's own header says literal tags stay.
  * The demo's CSS class `.lockbox-form` follows the markup, to `.box-form`.
* **Deviations**:
  * **The del doc line.** The plan's line under each `del` says *a tombstone of label and
    revision stands*. Today's code keeps no tombstone: vault.ts and VAULTDB.md say so, and every
    adapter deletes the row. I wrote the true part only, under both `delBox`s: deleted is gone,
    and a put naming the deleted revision is refused stale. The tombstone line lands with the
    reform thread that builds tombstones.
  * **Changeset bump: minor, not major.** The plan says major and adds that pre-1.0 changesets
    makes that a minor. It does not: changesets takes 0.4.0 to 1.0.0 on a major. PROCESS.md,
    *Releases*, says minor before 1.0.
  * **Realignment folded into the prose commit.** Shorter names left ragged columns in about
    200 lines of aligned tables and object literals. A script laid them out again against the
    pre-rename tree: each column moves by what its longest content lost, keeping its slack. A
    handful were fixed by hand.
* **Discoveries**:
  * **No `RefusalKind` type.** The preplan says "`RefusalKind` the type stays", but the type is
    `VaultErrorKind` (with `VaultErrorKindVals`, `VaultErrorFamilyForKind`). I left it as it is.
  * **Wire keys keep `kind`.** The GraphQL error `extensions.kind`, Convex's `SafebyokErrorData`
    `{ kind, message }`, and the Postgres route recipe's `{ refusal: { kind } }` are transport
    shapes, not `VaultError`, so only their reads of the error changed.
  * **StringStore keeps `read`/`write`/`erase`.** That is `string-store.ts`, under the vault's
    stores, and the plan does not list it. It is the one store whose verbs are not the trio.
  * Locals named `retired` became `deleted` too, as did the CTE in `postgres-vault-db.ts`
    (`WITH deleted AS`).
* **For the Coach**: the open matters below.
  * **Tombstone line**: written as true today. Recommend: the tombstone wording lands with the
    thread that builds tombstones.
  * **Bump**: minor. Recommend keeping it, unless 1.0.0 is meant.
  * **`RefusalKind`**: the type is `VaultErrorKind`. Recommend leaving it to A1 (`outcome`), if
    the Contract names it `RefusalKind`.
  * **Wire `kind`**: kept on the GraphQL, Convex and route-recipe wire. Recommend renaming it
    with the Outcome reshaping, if at all.
  * **StringStore verbs**: `read`/`write`/`erase` kept. Recommend a later quiet-tree rename to
    `get`/`put`/`del`, if wanted.

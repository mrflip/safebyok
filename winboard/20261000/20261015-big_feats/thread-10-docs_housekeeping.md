# Thread 10: docs_housekeeping (2026-10-15)

Branch `20261015-docs_housekeeping`, PR [#86](https://github.com/mrflip/safebyok/pull/86),
stacked on #77 `12fc4d0` (restacked onto thread 9 at assembly). Justify: green, 1,955 tests
(core 941, convex 275, graphql 142, postgres 134, demo 124, root 123, indexeddb 101, react 71,
argon2-wasm 44); `pnpm size` green.

* **Built**:
  - `perUser(vaultDBFor)` in the core's `tests/test-helpers.ts`, so `safebyok/testing` exports it,
    with a doc block. The core's `tests/test-helpers.test.ts` runs `describeVaultDB` through it
    over `servingOnly`, a VaultDB that refuses every user but its own (the suite fails without
    `perUser`), plus four unit tests: routing by scope or bundle, one VaultDB per user, made once,
    the limits, a refusal passed on. A `safebyok: minor` changeset says so.
  - The Postgres and GraphQL `tests/test-helpers.ts` lose their copies; their suites call
    `TH.perUser` as before, now the core's.
  - CLAUDE.md *Layout* lists all seven packages and the naming rule in one sentence. PROCESS.md
    gains a short *Packages* section (names, what a new package copies, peers on and joins), and
    its `storage` prefix row names the adapter packages. The core's README lists every storage
    adapter in its opening and its *Errors* section.
  - `notes/security.md`: a "Dependencies: hash-wasm has no published audit" entry right after
    thread 1's argon2-wasm entry (not at the end, to stay clear of other threads' appends),
    pointing at that entry for the unzeroed working memory. At the review, it and two older
    entries (2026-10-14's Argon2id, thread 1's argon2-wasm) stopped calling `@noble/hashes`'s
    Argon2id audited: its README says its one audit (Cure53, January 2022, at 1.0.0) left `argon2`
    out of scope. Our Argon2id is unaudited either way.
  - The review (`fixed`) added a limits test that bites and a u2 routing test for
    `updateBundle`, `subscribe`, `eraseBox` and `eraseVault`.
  - `graphql-yoga` 5.24.1 (2026-09-17) and `@graphql-tools/schema` 10.1.3 (2026-09-30), exact
    pins, in `safebyok-graphql`'s devDependencies.
* **Decisions taken**:
  - `perUser`'s factory returns a `VaultDBVerbs`, not a `VaultDB`: the suite's own structural
    type, so an adapter extending either copy of `VaultDB` fits.
  - Its limits come from the VaultDB it makes for the user `anyone`, now cached like any other
    user's (the copies made a separate, uncached one).
  - The pins are exact (no caret), so a fresh install cannot float onto a younger release.
* **Deviations**:
  - **Pulled forward: Convex's copy too.** `safebyok-convex`'s `convex-vault-db.test.ts` had a
    third `perUser`, nearly the same; it now calls
    `TH.perUser((userId) => convexVaultDB(connect(deployment, userId || null), api))`.
  - PROCESS.md has no "two weeks old" rule; the plan's citation of *Dependencies* points at
    nothing. I pinned as the Coach ruled and did not add a rule.
* **Discoveries**:
  - **For thread 8 at restack**: it adds `maxLockboxes` to `VaultDB`, and surely to
    `VaultDBVerbs`. `perUser` here then needs `maxLockboxes: anyone.maxLockboxes`, and the
    test's `servingOnly` the same. The typecheck flags both; the per-package copies thread 8
    may have edited are gone here, so take this side's deletion.
  - `@graphql-tools/schema` now has two copies in the lockfile: ours at 10.1.3, and 10.1.4
    under `graphql-yoga` (its own `^10` range). They share one `graphql`, so nothing breaks;
    transitive dependencies (`@graphql-tools/utils` 12.0.4 among them) can still be days old.
  - **For thread 7 at restack**: the review's u2 routing test in the core's
    `tests/test-helpers.test.ts` names `passphrase_epoch` (twice, in one `updateBundle` call);
    rename it with the rest.
  - Left as minor: perUser's `@example` (`postgresVaultDB({ client, userId })`) is not a call the
    core's tests make, and leaves out `listen`; `servingOnly` lets a blank `user_id` through to
    `localVaultDB` (which refuses it `bad_label`), where a server refuses `not_permitted`.
  - TODO.md still names `safebyok-fastkey` "or so" and lists the IndexedDB and Postgres
    side quests; that is the sprint's wrap-up to strike, so left alone.
* **For the Coach**:
  - pnpm (12.4 here) has a `minimumReleaseAge` setting that would hold every install, transitive
    ones included, to releases a set age old. It would make "two weeks old" a rule the tooling
    keeps, not a pin someone remembers. Not done: it is a repo-wide policy, not ruled.

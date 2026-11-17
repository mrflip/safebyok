# 2026-10-15: Sprint convex_vaultdb done -- the Convex adapter, in four PRs, and what needs your word

Sprint `convex_vaultdb` built `winboard/20261014-convex/design.md`. Before the Convex work could start, the core
needed its storage verbs, which had been ruled on but never built. Thread 2 built them: `VaultDB` is now the smart
verbs only, with versioned updates. Then came the Convex component, the client adapter, and Convex's own agent skills,
scoped to `packages/safebyok-convex/`. Plan and progress: `winboard/20261014-convex_vaultdb/`; live mirror: the
sprint doc (https://claude.ai/code/artifact/8dd7cca3-8544-48d3-a2f3-911642d6252a).

## PRs, in the order to merge

1. [#17](https://github.com/mrflip/safebyok/pull/17) -- Convex agent skills, scoped to safebyok-convex (documents only;
   independent, merge any time).
2. [#18](https://github.com/mrflip/safebyok/pull/18) -- the core's storage verbs: `versionedUpdate` for bundle and
   lockbox, vault_id expectations on both erases, `stale_write` / `not_permitted` / `storage_unavailable`. Public
   surface changes; no stored record changes. Two reviews.
3. [#19](https://github.com/mrflip/safebyok/pull/19) -- the Convex component. Stacked on #18.
4. [#20](https://github.com/mrflip/safebyok/pull/20) -- `convexVaultDB`, the client. Stacked on #19.

#16 (core moves to packages/safebyok) touches the files #18 changes; whichever merges second rebases across the move.

## Your rulings this sprint

* Erases carry a `vault_id`-only expectation -- `eraseBox` and, on asking, `eraseVault` (built on #18).
* Generic kinds live in the core, and the Convex threads may shape the core's architecture (#19 used it:
  `VaultBundle`/`VaultScope` exported as Zod values).

## Open questions, gathered

From #18:
* `destroy()` on a handle that never saw a bundle resolves without erasing, even if a vault has since appeared
  elsewhere -- "delete account" can report success while a vault stands.
* After a refused `destroy()` the handle holds the successor's vault_id, so an app's automatic retry erases the
  reborn vault.
* `storage_unavailable` also wraps an adapter's own programming errors; the `do*` naming; safebyok-react prompts
  only on `vault_locked`, so `stale_write` does not prompt.

From #19:
* **The vault-size ceiling**: no write enforces a cap, so a vault can outgrow a one-transaction `eraseVault`
  (~150 of the largest lockboxes; thousands at API-key size). A write-side cap or a batched erase, before publishing?
* Label grammar enforced server-side? CI for safebyok-convex once #15 lands; a publishable `dist/`; optional codegen.

From #20:
* A hand-written three-line once-guard (`let subscribed`) on unsubscribe -- a state flag, declared under
  library-first; overrule if you want a dependency.
* A failed `openVault` leaks its subscription (a small core follow-up, recommended).
* `safebyok` should be a peer of safebyok-convex before publishing (`instanceof VaultError` across copies).
* Should a vault lock itself on `not_permitted` (sign-out)?
* The tests' `react` dev dependency for a real `ConvexReactClient` (you asked): keep (recommended -- it caught both
  of #20's review bugs), move to safebyok-react, or drop.
* Accept the first-emit deviation (every `watchVault` result refreshes, the first included).

From #17: the TODO.md two-line conflict with your uncommitted rewrite; whether to install Convex's own Claude Code plugin.

Also: a flaky core test (`tests/crypto.test.ts`, "refuses altered ciphertext...", 1 run in 64 -- overwrite-with-`A`
is a no-op when the character already is `A`; flip a byte instead). Two dead worktree directories to `rm -rf`:
`/workspace/byok-storage_verbs`, `/workspace/byok-convex_component` (everything in them is pushed).

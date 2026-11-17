# Sprint convex_vaultdb: progress

**Status**: done -- four threads filed: #17, #18, #19 (stacked on #18), #20 (stacked on #19)

The orchestrator's document: newer than the plan wherever they disagree. Each worker's own
account is in `thread-<N>-<label>.md` on its branch.

## Status

| Thread | Label            | Branch                       | Base               | Status   |
| ------ | ---------------- | ---------------------------- | ------------------ | -------- |
| 1      | convex_skills    | `20261014-convex_skills`     | origin/main        | filed [#17](https://github.com/mrflip/safebyok/pull/17) (no review: docs only) |
| 2      | storage_verbs    | `20261014-storage_verbs`     | origin/main        | filed [#18](https://github.com/mrflip/safebyok/pull/18), tip 0e67d7a (erase ruling in, two reviews) |
| 3      | convex_component | `20261014-convex_component`  | #18 at 0e67d7a     | filed [#19](https://github.com/mrflip/safebyok/pull/19), tip b8145dc (review: clean) |
| 4      | convex_client    | `20261014-convex_client`     | #19 at b8145dc     | filed [#20](https://github.com/mrflip/safebyok/pull/20), tip 870db58 (review: fixed) |

## What the threads have taught

*Orchestrator:* from thread 1 (convex_skills):

* **Six Convex skills** live under `packages/safebyok-convex/.claude/skills/` (from get-convex/agent-skills
  at 191a5c33, Apache-2.0), edited so none runs `npx convex dev` or touches a deployment. Threads 3 and 4
  read them with `git show origin/20261014-convex_skills:packages/safebyok-convex/.claude/skills/<path>`:
  `convex-create-component` (and its `references/`) for the component; `convex-expert` for schema,
  validators, queries and mutations; `convex-test` and `convex-verify` for tests (the latter has the
  edge-runtime vitest config); `convex-reviewer`; `convex-docs` for version pinning. Thread 1's file,
  `thread-1-convex_skills.md` on that branch, has the full table.
* **No skill covers the client** (`ConvexClient`, `ConvexReactClient`, `onUpdate`) or `ConvexError` with
  `data`. Read docs.convex.dev, the `.d.ts` files under `node_modules/convex/dist/esm-types/`, and
  `node_modules/convex-test/README.md`.
* **Thread 3's package eslint config must ignore `.claude/**`.** Today `pnpm justify` inside
  `safebyok-convex` fails on main too ("all files ignored"), because the package has no source; thread 3's
  sources fix that.
* Nested skills load once an agent reads a file in that subtree. Whether a subagent sees them is undocumented,
  so read the SKILL.md directly.

*Review:* thread 1 had no review, since it is documents only. At filing, the worker found one more
deployment-running rule (`npx convex dev --typecheck-components` in
`references/packaged-components.md`) and removed it (`9af2ddd`). The full local edits are
`git diff 96c7a91 9af2ddd -- packages/safebyok-convex/.claude`. Open: the TODO.md two-line conflict
with the Coach's uncommitted rewrite, and whether to install Convex's own Claude Code plugin.

*Orchestrator:* **a flaky core test, for the Coach.** `tests/crypto.test.ts` › "refuses altered ciphertext
and the wrong key alike" overwrites the first base64url character with `A`. When that character already is
`A` (1 run in 64), the test fails. The defect is in the test, not the crypto. The fix is to flip a byte
instead. No thread of this sprint owns it; thread 2 may fix it if it touches that file anyway, declared.

*Review (thread 2, [#18](https://github.com/mrflip/safebyok/pull/18)):* `fixed`. Kept b6cdd2c: `subscribe` now wraps an
adapter's synchronous throw as `storage_unavailable` (shared `asStorageTrouble` helper), so thread 4's `doSubscribe` may
throw freely. Left, minor: `idbVaultDB.doEraseVault` lists, then deletes in two transactions (an orphan box can survive;
now named in security.md, the rework stays with the ruled IndexedDB TODO); `expected` and `createBundle`'s input go
unvalidated, and `updateBundle` does not check `bundle.vault_id === expected.vault_id` (a recorded decision: vault.ts builds
them, TypeScript types them); `listBoxes` validates the projected shape, so a damaged ciphered field shows at `read()`.

## The storage contract threads 3 and 4 build to

*Orchestrator:* settled by thread 2 (`thread-2-storage_verbs.md` on its branch has the detail). Each
public verb on `VaultDB` validates input (`bad_label`) and output (`corrupt_record`), and calls a
protected `do*` method the adapter writes:

| Public verb                          | Adapter writes                               | Convex function    |
| ------------------------------------ | -------------------------------------------- | ------------------ |
| `readBundle(scope)`                  | `doReadBundle`                               | `getBundle`        |
| `createBundle(bundle)`               | `doCreateBundle` (returns the bundle standing) | `createBundle`   |
| `updateBundle(bundle, expected)`     | `doUpdateBundle` (resolves true/false)       | `updateBundle`     |
| `readBox(scope, boxlabel)`           | `doReadBox`                                  | `getBox`           |
| `listBoxes(scope)`                   | `doListBoxes` (records, or projections keeping `format`) | `listBoxSummaries` |
| `updateBox(scope, lockbox, expected)`| `doUpdateBox` (resolves true/false)          | `updateBox`        |
| `eraseBox(scope, boxlabel)`          | `doEraseBox`                                 | `eraseBox`         |
| `eraseVault(scope)`                  | `doEraseVault`                               | `eraseVault`       |
| `subscribe(scope, onChange)`         | `doSubscribe` (silent by default)            | `watchVault`       |

* `BundleExpectation { vault_id, passphrase_epoch }`; `LockboxExpectation { vault_id, revision_id: string | null }`
  (null: no box was there). A scope with no bundle refuses; so does updating a box erased since it was read.
* Error kinds: `stale_write` (the base throws it when `doUpdate*` resolves false), `not_permitted` (the
  adapter throws it when the backend refuses this user), `storage_unavailable` (the base wraps any
  non-VaultError an adapter throws, original as `cause`). A `VaultError` an adapter throws passes through
  untouched, so thread 4 may map a `ConvexError` kind straight to a `VaultError`.
* The behaviour suite: `tests/vault-db-suite.ts` exports `describeVaultDB(adapterTitle, makeVaultDB)`
  (21 tests) over `VaultDBVerbs`, a structural type of the public verbs, so an adapter built against
  `dist/` qualifies. From `packages/safebyok-convex/tests/` it is `../../../tests/vault-db-suite`
  (`../../safebyok/tests/vault-db-suite` once #16 lands). `safebyok` must be built first.
* **Erases carry a `vault_id` expectation** (Coach, in chat, 2026-10-15, superseding "erase wins" for this
  case): `eraseBox` and `eraseVault` each take `{ vault_id }` and land only if the scope's standing bundle has
  that `vault_id`; otherwise `stale_write`, a scope with no bundle included. An absent box still erases
  quietly; no revision expectation. Thread 2 adds it to #18 as new commits on d3c0961 (worktree
  `/workspace/byok-storage_verbs_erase`); thread 3 builds its mutations to it and is restacked onto the new tip
  (`git rebase --onto <tip> d3c0961`) before it files.

*Review (thread 2's erase commits, second review):* `fixed`. Kept 37ec7ed: `destroy()` read the bundle after its
first await, so a background refresh could swap in a reborn vault and the stale destroy would erase it; it now
captures the bundle first (test reproduces it). 8d69b44 adds a test for destroying a vault already destroyed
elsewhere. For the Coach, in #18's Open questions: `destroy()` on a handle that never saw a bundle resolves without
erasing, even if a vault has since appeared, so "delete account" can report success while a vault stands; and an
app's automatic retry after a refused `destroy()` would take the reborn vault, since the handle has caught up.

## What thread 4 builds on, from thread 3

*Orchestrator:* thread 3's file (`thread-3-convex_component.md` on its branch) names every function's args and
returns. The decisions that shape the client:

* **A failed expectation resolves `false`**, never throws, matching the `do*` halves one to one. Updates and
  erases alike; `eraseBox` with no box is quiet.
* **The only `ConvexError` is `{ kind: 'not_permitted', message }`**, thrown by the host's wrapper (signed out,
  or not this vault's user), never by the component; the message is fixed and names no user. Anything else
  (a validator refusing args, a transport failure) is a plain Error, which the base class makes
  `storage_unavailable`.
* **Pulled forward for thread 4:** the `SafebyokApi` type (a client's `api.safebyok`), so `convexVaultDB`'s
  signature needs nothing new. Test helpers in `packages/safebyok-convex/tests/helpers.ts`: `realRecords()`,
  `componentTest()`. Entry points `./convex.config`, `./_generated/component.js`, `./server`, `./test`; the root `.`
  is left for thread 4's client.
* **A real vault-size ceiling.** Listing, watching and erasing read the whole vault in one transaction (an
  erase twice), against Convex's 16 MiB read limit: about 150 lockboxes at the largest default whisper
  (~54 KB each), thousands at API-key size. In the README.
* **Codegen ran offline** from Convex 1.46.0's own templates: no deployment, nothing blocked on the Coach.
  `ComponentApi` is derived from the functions rather than generated.
* **Core change, under the 2026-10-15 ruling** (`c7ea3e5`, `api:`): `safebyok` now exports `VaultBundle` and
  `VaultScope` as Zod validators too, like `Lockbox`. Thread 3's tests import from `safebyok`; only the core's
  test-only `testDeriver` is still a relative import (it moves when #16 lands).
* Restacked cleanly onto #18's tip 0e67d7a; the erase validator is the core's `EraseExpectation`, checked by a
  type-equality test. design.md carries the refusal conventions, the size bound, and packaging as settled for
  the workspace (a publishable `dist/` is the release threads').
* **Open for the Coach:** should the component enforce the label grammar server-side (structural only today)?

*Review (thread 3, [#19](https://github.com/mrflip/safebyok/pull/19)):* `clean`, no fixes. Confirmed: each mutation matches
the core's `do*` semantics in its own transaction; the auth wrapper refuses signed-out and other users with fixed
messages; the validators match the Zod records; every read is indexed, `user_id` leading. Taken at filing (docs):
Convex's own argument-validation errors quote the refused arguments (user_id, notes, ciphertext; never plaintext)
into host logs, and on dev to the client (security.md); `./test` assumes vitest/Vite (README). Left, minor: the
**vault-size ceiling** (no write-side cap; for the Coach before publishing); no server check of `vault_id`
constancy, epoch increase or fresh `revision_id` (matches the core); `watchVault` reads whole documents (Convex
cannot project); `boxes` validated as `string[][]` (no tuple validator); wrappers restate the validators (style).

*Orchestrator, thread 4 ready:* `convexVaultDB(client, api.safebyok)` from the package root, over either client by
structural type (no `convex/react` import in `src/`). **Deviation:** every `watchVault` result refreshes, the first
included, because a `ConvexReactClient` already watching the query sends no first result, and the first result
may carry a write the opening read missed (design.md records it). Tests run the real, unmodified clients over a fake
WebSocket into `convex-test`; this cannot prove concurrency, real invalidation, `setAuth`/token refresh, or
reconnect. **For the Coach:** (1) the tests' `ConvexReactClient` brings `react` in as a dev dependency. The Coach
asked why; the options are keep, move that test to safebyok-react, or drop it. (2) Should a vault lock itself when
storage refuses `not_permitted`, as after a sign-out? (3) Accept the first-emit deviation?

*Review (thread 4, [#20](https://github.com/mrflip/safebyok/pull/20)):* `fixed`. Kept 0de3501: `ConvexReactClient.query`
throws a refusal it already holds synchronously, which skipped the mapping (`refusing` now takes a thunk). Kept 40d6331:
Convex unsubscribes count down per call, so a double close ended another watch; it now acts once, via a hand-written
three-line flag (declared for the Coach). Both were found only because the tests run the real clients. Left: a failed
`openVault` leaks its subscription (core); refreshes are not serialized (core); `safebyok` should be a peer of
safebyok-convex before publishing (`instanceof VaultError`); the "never quotes a record" test is weak.

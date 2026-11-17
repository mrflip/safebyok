# 20261014-convex_vaultdb: resolution

Sprint `convex_vaultdb` built the Convex adapter in four threads plus a plan PR: [#17](https://github.com/mrflip/safebyok/pull/17) (Convex agent skills), [#18](https://github.com/mrflip/safebyok/pull/18) (the core's storage verbs), [#19](https://github.com/mrflip/safebyok/pull/19) (the Convex component), [#20](https://github.com/mrflip/safebyok/pull/20) (`convexVaultDB`) and [#21](https://github.com/mrflip/safebyok/pull/21) (the sprint's plan, progress and wrap-up). Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

41 gripes: 16 unresolved, 25 resolved.

## Unresolved

- G116 **Decide:** `destroy()` on a handle that never saw a bundle resolving without erasing, a retry after a refused `destroy()` taking the reborn vault, and `destroy()` needing no unlock — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G234 **Decide:** the demo over Convex needs a deployment and an auth story for `getUserId`, both the Coach's to choose — todo_gripes, old_gripes, humans_gripes, whiteboard_gripes
- G236 **Decide:** keep the hand-written unsubscribe once-guard in `convexVaultDB`, or take a library — old_gripes, humans_gripes, whiteboard_gripes
- G237 **Decide:** Convex agent tooling: re-sync plan for vendored skills, nested-skill visibility for subagents, `guidelines.md`, installing Convex's own plugin — old_gripes, humans_gripes, whiteboard_gripes
- G478 **Decide:** rule on the adapter `do*` hook naming (mechanical rename if another rule is preferred) — old_gripes, whiteboard_gripes, humans_gripes
- G025 Reserve `whisper_codec` (default `json_v1`) and `whisper_schema_version` (default 1) in the lockbox record and its binding; Convex schema widens with them — todo_gripes, old_gripes, whiteboard_gripes, humans_gripes
- G136 Serialize the core's refreshes (every open runs two at once, which can interleave after a write) — old_gripes, whiteboard_gripes
- G144 `storage_unavailable` also wraps an adapter's own programming errors (TypeError) under "try again shortly" — old_gripes, humans_gripes, whiteboard_gripes
- G243 Run against a real Convex deployment: concurrency, invalidation, `setAuth`/JWT refresh, reconnect, resend, error redaction, the big-vault erase — old_gripes, whiteboard_gripes
- G247 Make the component check rows beyond structure: empty ids, `vault_id` constancy, epoch increase, `revision_id` freshness — old_gripes, whiteboard_gripes
- G248 `watchVault` reads whole lockbox documents to emit revision pairs (Convex cannot project fields) — old_gripes, whiteboard_gripes
- G249 Make the `./test` entry stop assuming Vite/vitest (`import.meta.glob`) and importing devDependency `convex-test`; stop wrappers restating validators — old_gripes, todo_gripes, prs_60_80, whiteboard_gripes
- G250 Guard the fake socket that follows convex 1.46.0's wire protocol against a convex bump — old_gripes, whiteboard_gripes
- G251 Run Convex codegen against a real deployment (`ComponentApi` is derived, `_generated/` from templates) — old_gripes, whiteboard_gripes
- G254 `boxes` validated as `string[][]` since Convex has no tuple validator — old_gripes, whiteboard_gripes
- G506 Delete the leftover worktree directories and `git worktree prune` (look first at byok-strict_configs and byok-passkey_unlock, which hold unpushed work) — Coach: the Coach will, when things settle down — gripes_1_doc, bigfeats_doc, humans_gripes, prs_80_main, old_gripes, whiteboard_gripes *(deferred)*

## Resolved

- G076 Add compare-and-swap writes and a conflict kind (revision_id/epoch were stored but unused) → `versionedUpdate`, storage verbs, `stale_write` (PR#18)
- G077 Close the vault_id hole (a box from a destroyed vault landing in its recreation) → `vault_id` expectations on writes and erases (PR#18)
- G081 Name the storage-trouble kinds, list every kind (vault_full included) with a family, split misuse from conditions → done (PR#18, PR#50, PR#54, PR#61)
- G084 A failed `openVault` leaks its storage watch (a live Convex watch per boundary reset) → handle closes itself, rejects with the original error (PR#61)
- G087 Should a vault lock itself when storage says the user signed out (`not_permitted`)? → `identity_revoked` kind and `whenIdentityRevoked` policy, default lock (Coach ruling, PR#106)
- G098 Cap vault size (Convex could not erase past ~150 big lockboxes) → `maxVaultBytes`, `maxLockboxes`, `vault_full` (PR#34)
- G150 Validate VaultDB inputs evenly (expectations, `createBundle`, `vault_id` match, outgoing records) → write verbs validate before `do*`; `updateBundle` refuses a changed vault_id (PR#70)
- G166 Convex server-side label grammar? → Coach: do what comes naturally; the server accepts any string (Coach ruling; PR#95)
- G186 VaultDB should be verbs adapters implement, not dumb primitives → Coach: smart verbs, `versionedUpdate`; built (Coach ruling, PR#18)
- G187 Erases need an expectation (erase-wins overturned) → Coach: `vault_id`-only expectation on `eraseBox`/`eraseVault` (Coach ruling, PR#18)
- G216 Build a Convex VaultDB adapter (own package, typed columns, convex a peer) → component and `convexVaultDB(client, api.safebyok)` (PR#17-PR#20)
- G217 Make `safebyok` a peer of `safebyok-convex` (two copies break `instanceof VaultError`) → done (PR#41)
- G218 Put `safebyok-convex` in CI and give it its own configs, so its `justify` stops failing on an empty source → done (PR#16, PR#36)
- G219 Give the component a publishable `dist/` per module with `convex.config` and `_generated/`, `.claude/` kept out of the tarball → `files: [dist, src]`, released as 0.1.0 (PR#41)
- G220 Codegen and Convex skills without a deployment; nothing should run `npx convex dev` → templates run offline, skills vendored and edited (PR#17, PR#19)
- G221 Cap a Convex vault on the server (the client cap was the only guard; erase past ~150 big lockboxes) → per-vault tally, 8,000 lockboxes and 7 MiB, `vault_full` (PR#46)
- G222 Make the README's "about 150 lockboxes" a number the library enforces → enforced cap (PR#34, PR#46)
- G224 Accept the first-`watchVault`-emit deviation? → Coach: accepted as built (Coach ruling, PR#105 TODO)
- G225 Keep the Convex tests' `react` dev dependency? → Coach NOTED; kept (Coach ruling, Sprint big_feats)
- G230 Strengthen the weak "Convex client never quotes a record" test → sweeps every leaf of the refusal, mutation-checked (PR#75)
- G262 Make IndexedDB `versionedUpdate`, `doEraseVault` and `doUpdateBox` single transactions (orphaned lockboxes) → every write verb one readwrite transaction, four race tests (PR#77)
- G316 safebyok-react prompts only on `vault_locked`, so a stale store/erase does not prompt → a retry finding the device relocked now throws `vault_locked` (PR#44)
- G361 Fix the flaky "altered ciphertext" tests in crypto.test.ts and vault.test.ts (overwriting with `A`, ~1 in 64) → flip a byte; `TH.tweakB64` (PR#25, PR#36)
- G363 Publish test helpers for adapter authors → `safebyok/testing` entry (PR#36, PR#38)
- G477 The storage-verbs thread changed VaultDB's surface and exported `VaultBundle`/`VaultScope` unasked → Coach: generic kinds live in the core, Convex threads may shape it (Coach ruling, PR#18, PR#19)

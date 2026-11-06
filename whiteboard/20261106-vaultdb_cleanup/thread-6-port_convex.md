# Thread 6: port_convex (2026-11-06)

Branch `20261106-port_convex`, PR (draft, see the branch), stacked on #558. Justify: **red** --
the component and the core additions are done; the client, server, testing and their tests are
still the old design's, and no longer typecheck against the rewritten validators. Blocked on the
handoff's two-compaction rule, not on a question.

* **Built**:
  * `packages/safebyok-convex/package.json` -- on `safebyok` (`workspace:*` dev, `workspace:^`
    peer), off `safebyok-old`.
  * `src/component/validators.ts` -- each scope and record converted from the core's checker
    (`zodToConvex`; `zodOutputToConvex` for `putOpts` and `capacity`, defaults filled); answers
    hold rows as `v.any()`; one args object per function, shared with the host wrapper to come.
  * `src/component/schema.ts` -- `safebyok_vaults`, `safebyok_boxes` (one row per box per life,
    keyed by `vault_tok`), `safebyok_tallies` (per life). `user_id` leads every index.
  * `src/component/tallies.ts` -- per-life live-box count and all-row byte weight, kept in a
    tally row, counted afresh when none is kept; hard limits sized so one `delVault` can always
    tombstone a life in one transaction.
  * `src/component/vaults.ts` -- queries `listVaults`, `getVault`, `listBoxes`, `getBox`,
    `watchRows`; mutations `putVault`, `putBox`, `delVault`, `delBox`, `tidyGone`, each mirroring
    `memory-vault-db.ts`'s do* step for step and answering a Landing. `putBox` answers
    `{ capacity }` instead when the life has no room.
  * `src/refusals.ts` -- `SafebyokErrorData = { kind: 'identity_revoked' }`, no message.
  * Core: `storageFailed(call, thrown)` (`storage_unavailable`, naming only the call and the
    thrown name, no cause) and `identityRevoked()` in `refusals/throwers.ts`, their phrases, both
    on the storage door with `Checker, Checkers, objCheck` and tests.
  * `_generated/` untouched: it is generic, and needs no regeneration while the modules stay
    under `component/` and the schema in `schema.ts`.

* **Decisions taken**:
  * Rows are stored whole as `v.any()` under their labels, so the battery's damaged plants
    round-trip, and the component judges rows only by SX predicates (`isLiveRow`,
    `isCheckedLiveVault`, `isLifeOver`, `boxTombstoneOf`, ...).
  * `vault_full` travels as a `{ capacity }` answer from `putBox`, and the client throws
    `SX.vaultFull(capacity)`; the cap is the client's `maxBoxes` (for `makeCappedVaultDB`),
    min'd with the component's `MaxVaultBoxes`.
  * Tallies drop at `delVault`'s tombstone sweep and go with the box rows at `tidyGone`.

* **What remains** (in order; a fresh agent can take it from here):
  1. `src/convex-vault-db.ts` -- `ConvexVaultDB extends VaultDB` from `safebyok/storage`, one
     do* per component function, `maxRecordBytes` 1 MiB. Keep the old mechanics: calls as
     thunks (`ConvexReactClient.query` throws at once), `isConvexClient`, `isSafebyokApi` by
     `getFunctionName(ref).endsWith(':'+fnName)`, both client flavours for watching
     (`ConvexClient.onUpdate(ref, args, cb, onError)`; `ConvexReactClient.watchQuery().onUpdate`
     reading `localQueryResult()`). Triage: `ConvexError` whose data `isSafebyokErrorData` with
     `identity_revoked` -> `SX.identityRevoked()`; anything else -> `SX.storageFailed(call, err)`.
     doWatch: first `watchRows` result is an unheard baseline; diff by key (vaultlabel;
     vaultlabel+vault_tok+boxlabel) by `JSON.stringify`, hear `{vault}` or `{vault, box}`;
     guard unwatch to run once (Convex unsubscribes count down per call).
  2. `src/server.ts` -- `SafebyokComponent(component).api({ getUserId })` with
     queryGeneric/mutationGeneric over the validators' args objects, refusing a `user_id` that
     is not the caller's with `ConvexError({ kind: 'identity_revoked' })`.
  3. `src/testing.ts` (FakeDeployment over convex-test: one `createTest()`, serialized calls,
     watched queries rerun after each mutation -- keep its mechanics), `src/test.ts`,
     `src/index.ts`; doc blocks one line, fresh.
  4. `tests/convex-vault-db.test.ts` -- the battery: component at the root of
     `convexTest({schema, modules})`, `api = anyApi.vaults`, plants through `backend.run`,
     `makeTwin` a second client, `makeCappedVaultDB` passing `maxBoxes`, `_cheat_failNextCall`
     rejecting the next call with `new Error('[Request ID: ...] Server Error')`. Close clients
     in afterEach. Then server, refusals, testing, test and component tests.
  5. `e2e/tests/convex/*` onto the new contract; drop `safebyok-old` from `e2e/package.json` only
     if nothing else uses it (thread 4 edits the same file).
  6. Changeset: safebyok-convex breaking rewrite; safebyok minor for the throwers.

* **Discoveries**:
  * Convex field names may not start with `$` or be non-ASCII, in args and in nested stored
    values, so a row whose sidecar keys break that rule cannot be stored.
  * `safebyok` must be rebuilt (`pnpm --filter safebyok build`) after a core change before the
    convex tests see it.

* **For the Coach**:
  * The battery writes several `user_id`s, so it runs against the component directly, past the
    host wrapper's auth; the wrapper gets its own tests.
  * `watchRows` over a bank rereads and resends every row on each change.
  * `tidyGone` reads a whole bank in one mutation.
  * Threads 3 and 4 add the same `Checker, Checkers, objCheck` line to the storage door at other
    places: a merge conflict to resolve by keeping one.

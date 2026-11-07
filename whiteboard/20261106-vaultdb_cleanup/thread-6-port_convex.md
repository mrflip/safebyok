# Thread 6: port_convex (2026-11-06)

Branch `20261106-port_convex`, PR #559, stacked on #558. Justify: green (safebyok 2270,
safebyok-convex 227, e2e 208, every other package as on its base).

* **Built**:
  * `packages/safebyok-convex` on `safebyok` (dev `workspace:*`, peer `workspace:^`), off
    `safebyok-old`.
  * The component (`src/component/`): `validators.ts` converts each scope and record from the
    core's checker (`zodToConvex`; `zodOutputToConvex` for `putOpts` and `capacity`); `schema.ts`
    has `safebyok_vaults`, `safebyok_boxes` (a row per box per life, keyed by `vault_tok`) and
    `safebyok_tallies` (per life), `user_id` leading every index; `tallies.ts` keeps each life's
    live-box count and byte weight, with hard limits (8000 boxes, 7 MiB less 1 KiB) sized so one
    `delVault` reaches a whole life in one transaction; `vaults.ts` has the queries `listVaults`,
    `getVault`, `listBoxes`, `getBox`, `watchRows` and the mutations `putVault`, `putBox`,
    `delVault`, `delBox`, `tidyGone`, each mirroring `memory-vault-db.ts`'s do* step for step.
  * `src/convex-vault-db.ts`: `ConvexVaultDB extends VaultDB`, one do* per function, over a
    `ConvexClient` or a `ConvexReactClient`. Convex errors are triaged: `identity_revoked` data
    becomes `SX.identityRevoked()`, anything else `SX.storageFailed(call, err)`, quoting nothing.
  * `src/server.ts`: `new SafebyokComponent(components.safebyok).api({ getUserId })`, each function
    refusing `ConvexError({ kind: 'identity_revoked' })` unless the caller is the `user_id` named.
  * `src/testing.ts`: the fake deployment, with a new `arrange(change)` that runs a backend change
    in turn and pushes the watched queries it changes.
  * Core: `storageFailed` and `identityRevoked` throwers and phrases; `safebyok/storage` exports
    them, `Checker, Checkers, objCheck`, and the `Sidecar` and `WhisperJson` types `BoxRecord` names.
  * Tests: the battery over a real `ConvexClient` (`tests/convex-vault-db.test.ts`) and again over a
    `ConvexReactClient` (`e2e/tests/convex/convex-vault-db.test.ts`, hooks copied, a comment says
    so); the wrapper's own tests; component tests of watches, tidying, tallies, caps, validators
    and Convex's transaction limits (convex-test's `transactionLimits`).
  * README written fresh; changeset `.changeset/20261106-port_convex.md` (both packages minor).

* **Decisions taken**:
  * Rows are stored whole as `v.any()` beside their labels, so the battery's damaged plants
    round-trip; the component judges rows only by the core's predicates.
  * `vault_full` travels as a `{ capacity }` answer from `putBox`; the client throws
    `SX.vaultFull`. The cap is the client's `maxBoxes`, capped at the component's limit.
  * `watch`: the first `watchRows` answer is an unheard baseline; each later one is diffed by
    `JSON.stringify` per row key. On a `ConvexReactClient` already watching the same rows,
    `watchQuery` sends no first answer, so the client reads `localQueryResult()` at once.
  * The live-record validators are typed as the core's `VaultRecord` and `BoxRecord`. Convex's
    own copy of those types carries zod brands, which a declaration file cannot name, so the
    build failed. For a box, the copy also recursed past TypeScript's depth (TS2589). Typed this
    way, the casts that dodged TS2589 in the client and the tests are gone. `boxRecord` is
    `as unknown as Validator<SX.BoxRecord, ...>`, since even the assignment check recurses.
    Set aside: importing zod's `$brand` into each module so the emitter can name it (works only
    with a dummy use of the import, in every module whose exports carry it, the public
    `server.ts` included).
  * The client keeps its sentences in its own `src/phrases.ts`; the export is the class alone
    (no `convexVaultDB` factory); `SafebyokApi` is a mapped type over `ComponentApi`.

  * Rework (the Coach's ruling on *Deleted Convex boxes pile up*): a box tombstone counts toward
    the row cap as a live box does, so a life holds at most 8,000 box rows of either kind. A
    `putBox` over a tombstone (or a damaged row) takes that row's place and leaves the count as
    it was; only a new boxlabel adds one. A `delBox` leaves the count alone, and moves only the
    bytes. At the cap, a new boxlabel refuses `vault_full`, the same answer as for live boxes,
    `capacity.boxes.used` counting tombstones. Within a live life nothing frees a tombstone's row
    but a put under its boxlabel: `delVault` ends the life (the next starts empty) and `tidyGone`
    then removes the old rows. The client's `maxBoxes` counts the same rows (one count, no second
    tally). Tests: put and delete under fresh boxlabels until the cap refuses; a rebirth over a
    tombstone in a full life; a full life freed by `delVault`; 8,000 planted tombstones refused,
    listed, watched and deleted within Convex's transaction limits.

* **Deviations**:
  * Old tests dropped, the battery covering their contract: the Bank-math sizing cases, the
    `not_permitted` kind, `getCapacity` (gone), and e2e's Bank flows (sign-out lock, two devices,
    opened before sign-in), which need the old Bank.
  * `e2e/package.json` gains `safebyok` (one line, beside `safebyok-old`, which stays: other e2e
    tests use it). Thread 4 edits the same file.
  * Pulled forward: `Sidecar` and `WhisperJson` on `safebyok/storage`, which the build needed.

* **Discoveries**:
  * Convex field names may not start with `$` or be non-ASCII, nested values included, so a box
    whose sidecar has such keys cannot be stored (left as is, per the handoff).
  * `ConvexClient.query` answers from its cache while a query is watched, so a test changes the
    backend through `arrange`, not `as(...).run`.
  * `tsc --noEmit` does not catch a declaration that cannot be named; only the build does
    (`pnpm --filter safebyok-convex build`).

* **For the Coach**:
  * The Convex `maxBoxes` now counts tombstones; `MemoryVaultDB`'s counts live boxes only. The
    battery's capped case (#558) puts no tombstone, so it passes both ways.
  * The battery writes as several users, so it runs against the component directly, past the
    wrapper's auth; the wrapper has its own tests, including a refusal for another `user_id`.
  * `watchRows` resends a whole bank on each change; `tidyGone` reads a whole bank in one mutation.
  * Threads 3 and 4 add the same `Checker, Checkers, objCheck` line to the storage door elsewhere:
    a merge conflict, resolved by keeping one.

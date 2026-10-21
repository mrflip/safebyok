# Thread C1: putbox_store (2026-10-21)

Branch `20261020-putbox_store`, PR #PRNUM, cut from 47ab50be (#209, B5 `placement`). Justify: green
(core 2602 passed / 35 skipped; postgres 276/14; convex 279/8; graphql 270/14; indexeddb 148/10;
react 280; fastkey 49; demo 207/16; e2e 93 passed, 100 skipped: no Docker here, live backends unrun).

* **Built**:
  * `VaultDB.putBox(scope, expected, box, { signal }?)` and `doPutBox(scope, expected, box)` in
    `vault-db.ts`. A miss is thrown by the hook from the step that refused it:
    `Refusals.staleBox(standing)` or `Refusals.vaultMismatch()` (`refusals.ts`); a key-value store
    asks `Expectations.boxRefusalOf` (replaces `boxMeets`). The base checks what stands as `getBox`
    does and carries it as `meta.box_stored` (`BoxRecord | DamagedBox | null`); a stale write naming
    nothing standing, a `null` answer, or a landed answer at another revision is `corrupt_record`.
    `signal` (`VaultDBCallOpts`): an abort before the answer is `storage_unavailable`, reason as
    cause; an already-aborted signal sends nothing.
  * Refusal kinds `vault_mismatch` (condition, no meta) and `invalid_box` (misuse) in
    `RefusalKindVals`, `FamilyCases`, the README table, VAULTDB.md (3.3, 3.6, 3.8, 4.3, 5.1, 5.3).
  * Adapters: Postgres one statement each way (`ReplaceBoxSql`: `SET col = CASE WHEN revision_tok =
    $read ...`; `InsertBoxSql`: `ON CONFLICT DO UPDATE` no-op), `RETURNING` the locked row that
    stands and `landed`; FK `23503` is `vault_mismatch`. Convex: one mutation returning
    `PutBoxAnswer` (`{ landed: true, box_stored } | { landed: false, refusalkind, box_stored? }`).
    IndexedDB and local: one transaction/step. GraphQL: `extensions.meta.box_stored` both ways.
    Postgres route recipe (README and test): `refusal.box_stored`.
  * Battery (`vault-db-conformance.ts`): 3.3 asserts `meta.box_stored` (winner, null), `vault_mismatch`
    cases, a pre-aborted signal; the races `rivalFirstWrites`/`rivalReplacements` assert the loser
    names the winner, `delBeatsReplacement` a null, `vaultDelBeatsWrite` `vault_mismatch`. Base tests
    in `vault-db.test.ts` (*on a box write that misses*, *a box write's signal*); vault tests in
    `vault-races.test.ts`.
  * `notes/security.md` (sonnet): the C1 paragraph in the putBox-returning entry, three amended.
* **Decisions taken**:
  * **`meta.box_stored` is the whole stored record** (the Coach, 2026-10-21, superseding "summary
    only"): "it come in as a read, so that the host can choose". Ciphertext and wrapped boxKey are
    under the random vaultKey, not offline-guessable; noted in security.md, audit later.
  * `scope` stays the first argument; `expected` keeps its name (in tests `expect` is chai's).
    `BoxExpectation` stays: the Contract names no type for `expect`. The `outcome:` field style is
    `BoxDeletion`'s, C3's to remove.
  * `signal` is honoured in the base (a race against the abort), not passed to hooks.
  * Arg order of makers (ruled: `(vault, holder, ...what, key, opts)`): no maker touched here.
* **Deviations**:
  * **`meta.capacity` is not filled** on `vault_full`/`box_too_large`. `Capacity` is vault-wide
    `used`/`max` for boxes and bytes; no store knows bytes used in its one statement (Postgres keeps
    none), and a read for it is what the core no longer does. Proposal in Open matters.
  * **Interim shim (until C2/lean_core)**: `vault.ts` `#refuseStalePutBox` catches up after
    `vault_mismatch` as after `stale_write` (`isCatchingUpKind`), then refuses `vault_locked` if the
    read relocked, else `stale_write`; `invalid_box` becomes `bad_record`; `stale_write` carries
    `meta.box_stored` on. The catch-up read is the one lean_core drops.
* **Resumed work**: the stopped worker's 17 files were sound and kept: the base, refusals,
  adapters, README rows. Changed: `box_stored` from summary to whole record (the ruling), dropping
  the summary-accepting path in `boxStoredOf`; reverted its incidental Convex `listedOfRow`
  refactor; `RefusalMeta` cast fixed for `exactOptionalPropertyTypes`. Added everything else above.
* **Discoveries**:
  * Swapping `putBox`'s middle arguments was done with a TypeScript-checker codemod (by argument
    types). Spy assertions like `putBox.mock.calls[0]?.[2].revision_tok` kept type-checking with
    the wrong index (a `BoxRecord` has `revision_tok` too): grep for them on any arg reorder.
  * `pnpm --filter safebyok-graphql test` needs the Postgres dist; run it through pnpm, not vitest.
  * Size budgets for `everything`, `Vault`, `idbVaultDB` rewritten by `size:budget --write`.
* **For lean_core / C2**: `putBox` resolves the record as stored; a stale refusal carries the
  winner whole, so the listing can be updated from either with no read, and `openBox` on
  `meta.box_stored` needs no round trip. `vault_mismatch` carries nothing: the vault relocks from it.
* **Contract drift** (for the tab):
  * *VaultDB.putBox* signature: `putBox(scope, expect, box, opts?)` -- the scope is needed.
  * Its `vault_mismatch err.meta.vault_props_stored` line: strike; it carries no meta.
  * Its *Returns*: add "a landed answer at another revision, or a stale refusal naming nothing
    standing, is `corrupt_record`".
  * *Shapes*' `box_stored`: at the store, `BoxRecord | DamagedBox | null` (C3 adds the tombstone;
    whether the vault hands a `Box` is C2's).
  * `capacity` on `box_too_large`/`vault_full`: see Open matters.
* **For the Coach** (Open matters):
  * **capacity from storage**: recommend the vault fills `meta.capacity` (C2) from its own
    reckoning when it passes on storage's `vault_full`/`box_too_large`; the store says only the
    kind. Alternative: a store-level `capacity` with `max` only.
  * **signal into the hooks**: recommend not now; D1's default timeout is enough while the base
    stops waiting. Passing it to `fetch` (GraphQL, route) would cancel the request too.
  * **live e2e**: the Postgres EvalPlanQual path (winner committed while the write waited) is
    proven only by reasoning and PGlite's serial runs; CI's live Postgres run is the check.

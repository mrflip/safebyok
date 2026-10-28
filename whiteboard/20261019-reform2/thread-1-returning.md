# Thread 1: returning (2026-10-19)

Branch `20261019-returning`, PR [#177](https://github.com/mrflip/safebyok/pull/177), cut from `origin/main`. Justify: green (core 2179 passed,
35 skipped; indexeddb 137; postgres 250; convex 262; graphql 243; react 227; fastkey 49; demo
193; e2e 83; scripts 258). No size line moved past its limit.

* **Built**:
  * `VaultDB.updateBox(scope, lockbox, expected): Promise<Lockbox>`; abstract
    `doUpdateBox(...): Promise<unknown>` resolves the stored record, or `null` for a failed
    expectation (`packages/safebyok/src/vault-db.ts`). The base class reads the answer back
    through `checkLockbox` -- `readBox`'s check, now factored out -- inside `writtenBack(said,
    check)`, which turns a `corrupt_record` from the check into one saying the write may have
    landed, the inner refusal its cause.
  * Adapters, each from its one write: `localVaultDB` re-reads the row in the same synchronous
    turn; IndexedDB reads it in the same transaction (returned after commit); Postgres
    `RETURNING` the lockbox columns (`ReplaceBoxSql`; `InsertBoxSql`'s `inserted` CTE, joined
    into its one answer row); the Convex component's `updateBox` (and the host wrapper in
    `server.ts`) returns `v.nullable(Lockbox)`, read with `ctx.db.get` in the mutation;
    GraphQL's `safebyokUpdateBox` is `SafebyokLockbox!`, its resolver returning the record and the
    client selecting it. The demo's outage wrapper and the Postgres README route recipe (and its
    test copy) pass the record on.
  * `describeVaultDB`: 1.1 gains "hands back from a lockbox write the record as stored, field
    for field the one written and the one a read then finds" (and the stray-field test checks the
    answer too); 3.3 gains "hands back the lockbox it wrote ..., and nothing from a write refused
    as stale" (the refusal quotes nothing of the standing record). The core's `vault-db.test.ts`
    gains "the abstract VaultDB, on the way back from a lockbox write": the answer resolved, null
    as stale, five malformed answers as `corrupt_record`, nothing quoted.
  * `VAULTDB.md`: *Who does what*, 3.3 (new paragraph), the paragraph closing section 4, 5.1.
  * `storeBox()` doc block: a paragraph of its own after the catch-up one (the sidecar paragraph
    untouched, for thread 7). The core README's `corrupt_record` row names the new case.
  * `notes/security.md` has an entry (via a sonnet subagent).
  * `refreshOnStale` in `vault.ts` is generic (`Promise<WrittenT>`) and resolves what the write
    resolved; `writeOver` still discards it.
* **Decisions taken** (YOLO; each also an open matter below):
  * Only `null` is stale. `undefined`, `true` or anything else from `doUpdateBox` is a
    malformed answer, `corrupt_record`: an adapter still on the old contract fails loudly rather
    than reading every landed write as stale.
  * The `corrupt_record` case is proven by the base class's own tests, not the battery: the
    battery reaches adapters through their public verbs and cannot make one answer badly.
    VAULTDB.md 3.3 says so, as 1.3 does for damage.
  * The storeBox paragraph names `damaged_vault` beside the four kinds the handoff listed: the
    refresh after a write reads the vault props through `damagedAs(..., damagedVaultProps)`, so a
    damaged record there is `damaged_vault`. It also names `corrupt_record` from an adapter that
    answers badly, which `storeBox` throws as it came.
  * `storeBox()` does not translate that `corrupt_record` into a vault-level kind; the README row
    says it can arrive there, a write that may have landed.
  * Postgres's insert answers its lockbox columns through `FROM (SELECT 1) AS answer LEFT JOIN
    inserted ON true`, keeping one statement and one answer row.
  * Convex reads the row back with `ctx.db.get` in the same mutation, rather than echoing the
    argument, so the answer is what the transaction holds.
* **For thread 2**: `writtenBack(said, check)` takes any check that refuses as `corrupt_record`;
  a retire outcome can go through it as `writtenBack('a retirement', () => checkRecord(Outcome,
  raw, 'retire outcome'))`, though its message says "handed back what this package cannot read",
  worded for a record -- adjust if it reads oddly for an outcome. IndexedDB's `ringIfLanded` is
  generic and rings for anything but `false` and `null`.
* **Discoveries**: the packages' tests import siblings from `dist/`, so a bare `vitest run` in an
  adapter needs `pnpm --filter safebyok build` first (justify does this).

## Open matters

* **null only is stale** (decision taken): any other non-record answer is `corrupt_record`.
* **Battery cannot test the corrupt answer** (decision taken): base-class tests prove it;
  VAULTDB.md 3.3 says so.
* **damaged_vault and corrupt_record named in storeBox's paragraph** (decision taken) beside the
  four the handoff listed.
* **storeBox passes an adapter's corrupt_record through** (decision taken) rather than naming a
  vault-level kind for it; README's kinds table updated to say so. Rec: keep until the
  always-complete result (Deferred) reworks the refusal side.

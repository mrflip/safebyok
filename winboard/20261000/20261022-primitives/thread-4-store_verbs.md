# Thread 4: store_verbs (2026-10-22)

Branch `20261022-store_verbs`, PR [#251](https://github.com/mrflip/safebyok/pull/251), stacked on [#246](https://github.com/mrflip/safebyok/pull/246)
(the line main, #243, #244, #246, this). Justify: green (core 2802, indexeddb 159, postgres 301, convex 306, graphql 312, react 287, demo 216, e2e 102; size budgets: `everything` to 46 kB, `idbVaultDB` to 2.6 kB); the live-service
suites (`SAFEBYOK_PG_URL`, a Convex deployment: `e2e/`) skip here and were typechecked and linted
only.

* **Built**:
  * **`vault_epoch`** on `VaultProps` (`types.ts`), a counter the *store* sets: standing plus one on
    every `putVaultProps` (whatever the writer sent) and on `delVault`; no box write moves it.
    A draft claims 0 (`checkDraft`: else `bad_record`).
  * **The tombstone** `{ format: 'safebyok-tombstone-v1', ...scope, vault_epoch }` (`Tombstone`,
    `TombstoneFormat`, exported). Key-value adapters (local, IndexedDB) keep it in the vault props'
    row; Postgres in `safebyok_vault_tombstones`; Convex in `safebyok_vault_tombstones`. One
    statement/transaction moves a vault to its tombstone (boxes with it) and back (`ensureVault`).
  * **VaultDB verbs** (`vault-db.ts`): `ensureVault(draft)` one argument, over a tombstone a new
    life with the counter carried on; `putVaultProps` resolves the props as stored (checked: same
    scope, `vault_tok`, `gate_epoch`, else `corrupt_record`); `delVault(scope, { vault_tok,
    gate_epoch })` resolves the tombstone (the orchestrator's directive: a stale gate refuses);
    `delDamagedVault` resolves `Tombstone | null` and expects `gate_epoch: null`, the `vault_tok`
    alone. Gone: `getVaultProps`, `ensureVaultProps`, `listBoxes`, `listBoxRecords`, their hooks
    (`doGetVaultProps`, `doEnsureVaultProps`, `doListBoxes`), `Expectations.vaultTokMeets`.
  * **`Expectations`** gains `isTombstone`, `vaultPropsPutOf`, `newLifeOf`, `tombstoneOf` for
    key-value adapters.
  * **Every adapter**: local, IndexedDB, Postgres (DDL, statements, route recipe), Convex
    (validators, schema, component functions, server wrapper, client), GraphQL (schema, resolvers,
    client, `VaultOperations`), the demo's outage adapter.
  * **DeviceDB**: `putLease` resolves the record as stored; the ordering obligation stated in the
    interface and checked by `describeDeviceDB`; `idb.ts` `getLease` asks for its read first, and
    discards an unreadable row only in one readwrite transaction that re-checks it is still
    unreadable.
  * **The core's `vault.ts`**: the fewest edits that keep its tests green. It reads through
    `getVault` (heed wrapper in `refusal-policy.ts`), `del()` passes the gate it read, and the first
    unlock is `ensureVault` of a gateless draft then `putVaultProps` of the first gate expecting
    `gate_epoch` 0 (the wayin is sealed before storage is touched, so a failing deriver creates
    nothing). The losing first gate hears the winner in `meta.vault_props_stored`.
  * **Conformance suite** (`vault-db-conformance.ts`): rewritten to `getVault`/`ensureVault`; new
    tests for the tombstone's life (leave, resolve, new life, nothing meets it), the gate half of a
    `delVault`, `vault_epoch` on a put; `describeDeviceDB` gains the stored-record and ordering
    tests. TH gains `ensureGated`, `propsOf`, `boxesOf` and `leaseOf` overrides.
  * **Docs**: VAULTDB.md (lines 3.1, 3.2, 3.5 and the verbs), the core README (the tombstone, and a
    server that restores a backup must wipe the restored vaults), each adapter's README, the loud
    TODO entry in the Coach's words, `notes/security.md` (five entries, three amendments) through a
    sonnet subagent, one changeset.
* **Decisions taken**:
  * **The tombstone holds the scope and `vault_epoch` only** (as the spec says), so a second
    `delVault` of a vault already deleted refuses `stale_write`, as today: keeping today's contract
    (the plan's "a tombstone meets no expectation but delVault's" read as a repeated delete being
    idempotent would change what `del()` promises, so it waits for a ruling). Built first with the
    `vault_tok` and `gate_epoch` in the tombstone and an idempotent delete, then withdrawn.
  * **`getVault` reads a tombstone as no vault** (null), not as a third answer, to keep the
    vault's call paths unchanged; the counter reaches a new life through `ensureVault`.
  * **`delBox`'s "tombstone"** (spec: `vault.delBox` returns the tombstone) is today's
    `BoxDeletion`, unchanged and not stored: a box tombstone row is a larger change (listing,
    expectations, every adapter); thread 5 shapes what `vault.delBox` returns.
  * **`listBoxRecords` goes** with `doListBoxes` (not named in the thread text): `getVaultRecords`
    carries the boxes to a server's clients.
  * **Postgres bumps `vault_epoch` in the UPDATE** (`vault_epoch + 1 + (param * 0)`, so no
    parameter is left unused) and ensures over a tombstone with a `DELETE ... RETURNING` CTE.
  * **The private helpers of `VaultDB` are `private` methods, not `#`**, as a host may wrap a
    VaultDB in a Proxy (a test does) and `#` methods break on a Proxy.
  * **The test helper `ensureGated`** (ensure gateless, then first gate; returns the standing props
    if already gated) stands in for the old `ensureVaultProps(gatedProps)` in tests.
* **Deviations**:
  * `listBoxRecords` removed (above); `delDamagedVault`'s Outcome carries `Tombstone | null`.
  * The first unlock now makes two writes, and a first unlock over gateless props another device
    ensured sets its passphrase over them: the interim `created_elsewhere` for gateless props
    (thread 2's note) is gone, with its test (ledgered).
  * `getVaultRecords` cannot carry a stored row that is no object (non-JSON text), since it has no
    boxlabel to be named by: through the GraphQL client, the Postgres route recipe and the demo's
    outage adapter such a row is no longer listed damaged (key-value stores still list it). A
    typed backend cannot hold one.
* **Discoveries**:
  * An unused `$N` parameter in a Postgres statement needs a reference or the types are
    undetermined: hence the `* 0` and the `GREATEST` in the statements.
  * The core's tests spied `getVaultProps` and `listBoxes` separately; `getVault` is one read now, so
    "the listing fails after the props" tests became "the read fails".
  * STYLE.md and VOCABULARY.md still name the removed verbs in examples (`ensureVaultProps`):
    thread 11's sweep.
  * The device mark (`rolled_back`) still checks `gate_epoch`; the device record of the highest
    `vault_epoch` is thread 7's.
* **Contract lines this makes untrue** (for thread 11): the `VaultDB` interface (`getVaultProps`,
  `ensureVaultProps`, `listBoxes`, `listBoxRecords`; `ensureVault(scope, draft)`; `delVault`'s
  expectation `{ vault_tok }` and its `void` answer; `delDamagedVault`'s answer; `putVaultProps`'s
  `void` answer), the `DeviceDB.putLease` answer, "no tombstone is kept" (box and vault deletion),
  the stale `delVault`/`del()` row (now gate-aware), `ensureVault`'s draft, the Convex function
  list (twelve to nine), the GraphQL schema, the Postgres route's verbs. **Refusal kinds added:
  none.**
* **For the Coach**: see the PR's *Open questions*; each is also in the report.
  1. **A repeated `delVault`** (a retry after a lost answer) refuses `stale_write`, today's
     contract. Rec: keep until you rule; the alternative (idempotent over the tombstone, which
     then needs the `vault_tok` and `gate_epoch` in it) is a small change, built once and
     withdrawn.
  2. **`delDamagedVault` expects the `vault_tok` alone** (the directive), so over damaged props it
     can delete a vault whose gate changed meanwhile. Its tombstone counts a counter it cannot read
     from zero, which can be lower than devices have seen (`vault_behind`, thread 7).
  3. **`delBox`'s "tombstone"** is today's `BoxDeletion`, not stored.
  4. **`getVault` over a tombstone is null**: a refresh cannot tell "deleted elsewhere" from
     "never made". Rec: thread 5/7 decide whether a read needs to say so.
  5. **Non-object stored rows vanish from the record-carrying verbs** (above). Rec: the loud
     TODO's consolidation of checks at the store nearest the database settles it.
  6. **A backup restore** is accepted as the README says (wipe the restored vaults), and nothing
     enforces it; toldjaso entry 1 stands.

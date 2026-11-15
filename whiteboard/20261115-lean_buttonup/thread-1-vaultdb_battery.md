# Thread 1: vaultdb_battery (2026-11-15)

Branch `20261115-vaultdb_battery`, PR #707 (draft), on main. Proved: `pnpm justify` green at the rework's tip
(safebyok 766 tests, safebyok-postgres 329, the battery on PGlite among them). `notes/security.md` has a new
2026-11-15 entry for the rework; the earlier entry of this thread is left as written (notes/transition.md).

## Why Postgres redoes the classifier's work

The store's own code is one of the two security boundaries that count. The other, and larger, is `bank.unlock`.
Behind Postgres the adapter's TypeScript runs in the page, beside whatever else runs there, so what it decides is a
claim; only SQL in the database holds against a script that calls the store directly. And only the statement that
writes sees the row it writes over: Postgres checks an UPDATE's WHERE again against the row a concurrent writer left.
So each write function makes every check again in its writing statement. Never "simplify" the SQL by trusting the
adapter's classification, and never add a SELECT-then-write.

PGlite is one connection: the battery cannot race two births or two writes of a row. How a race settles is argued
in the SQL's comments, not tested; a test of two births on PGlite would pass by queueing, so none is written.

* **Built**:
  * `src/storage/`: `MaxLabelsUnder = { bank: 0, gate: 0, box: 1 }`. Every answer, refusals included, and every
    notice carries `world: WorldRecord | null` (the bank's record spread flat, its main gate as `maingate`).
  * **track / tracked** (the Coach's 2026-11-15 ruling): an ask may carry `track: { bank, gate }`, each
    `{ revseq, lifepath }`; the answer then carries `tracked: { bank: BankRecord | 'same', gate: GateThing | 'same' }`.
    The store compares; `notifyTrackedRecords` (`adapter-vault-db.ts`) tells the bank's watches of each entry not
    `'same'`, with `doNotifyTracked` on (the default).
  * The battery, `tests/test-helpers/vaultdb-battery*.ts`, published by `safebyok/testing` as
    `describeVaultDBBattery(label, { makeVaultDB, _cheat_rowsOf, watches? })`. `MemoryVaultDB` runs it.
  * `safebyok-postgres`: `PostgresVaultDB`, `VaultTablesSql`, `VaultFunctionsSql` (`safebyok_write_<kind>` from one
    template, `safebyok_birth_roots`, `safebyok_world`, `safebyok_tracked`, `safebyok_tell_thing`) and
    `vault-queries.ts`. It passes the battery on PGlite, plus direct SQL tests of the write functions' refusals and
    verdicts, and of RLS and REVOKE.
* **Rework after the Coach's rulings** (the damaged-row policy, store-decides verdicts):
  * **A write reads only its preconditions** of the Thing stored: `storedCitedOf` parses scope, revtok, revseq, am,
    lifepath and born_at (`storedCited` in `shapes-thing.ts`, non-strict); `demandPolicies` parses only the gate's
    `wayins`, and only when policies are named. A refusal still fully parses the row it reports. So a box damaged in
    its body, cited exactly, carries forward on both stores (battery), and a gate damaged outside its wayins carries
    forward under a policy. The policy text is in the `VaultDB.tryWriteThing` doc (`vault-db.ts`) and the
    `[Protected, for a subclass to write]` banner comment (`adapter-vault-db.ts`). No wontfix entry.
  * **Plain steps, in `thing-classifier.ts`, exported from `safebyok/storage`**: `storedCitedOf`, `writeActOf`,
    `unwrittenWriteOf` (a refusal or `passed`), `demandBornAtKept`, `demandPolicies`, `unwrittenBirthOf`.
    `classifyWriteThing` and `classifyBirthBank` are composed of them. Policies now return a phrase or null
    (`policyRefusalOf` in `policies.ts`); the throw is built where the full row is at hand.
  * **Postgres refusal path** (`doWriteThing`): `storedCitedOf` -> `writeActOf` -> not a write act:
    `unwrittenWriteOf`; a write act: `born_at_ok` false -> `demandBornAtKept` (`bad_record`), `policies_ok` false
    -> `demandPolicies` (`gate_issue`); then `storage_issue`. `doBirthBank`: `unwrittenBirthOf`, or `storage_issue`.
  * **Verdict columns**: `born_at_ok` (every kind), `policies_ok` (gate). Both are computed by one JS string each,
    used in the UPDATE's WHERE and in the read-back, and both apply live over live only, as the classifier's do
    (the policies check had applied to any gate UPDATE). `lifeseq_ok` is gone: under a write act cited equals stored,
    the table's CHECK ties lifeseq to lifepath, and the ask's own `lifeseqNotNext` already ran, so it cannot fail.
  * **The birth race** (Coach-approved): each of `safebyok_birth_roots`'s INSERTs is `ON CONFLICT DO NOTHING`, so
    the loser stores nothing and its read path answers the winner's roots. The write function's shell INSERT carries
    the same approved comment.
  * The world after a write has a running SQL comment: a statement does not see its own write, and at worst it reads
    a newer world, which receivers order by revision.
* **Decisions made**:
  * The write functions take no op flags: `mayWrite` calls one only where the flags let the ask write.
  * A rule about one row is a CHECK on its table, never a clause in a write function.
  * Policy SQL tests `jsonb_typeof(wayins->'passkey0')`: our gate always carries `passkey0`.
  * A missing or damaged tracked row is **unspecified** (notes/wontfix.md).
  * The three tables keep RLS on with no policy; the writing functions are revoked from PUBLIC.
  * **`PostgresVaultDB` stays unexported**: `safebyok` is `"private": true`, so a published `safebyok-postgres`
    cannot depend on it. The devDependency and its one `import-x/no-extraneous-dependencies` hatch stay until
    `safebyok` publishes. The changeset stays empty: nothing a host imports changed.
* **Set aside**:
  * Reclassifying the row read back (the first build): the Coach wants verdicts read, as the Convex exemplar.
  * A callback or hook inside `classifyWriteThing` for a store to inject its verdicts: plain steps instead.
  * `refusedWriteOf` for refusals alone: Postgres also meets `passed` (a birth cite with `ifPresent: 'get'` over a
    live Thing reaches the write function), so the step answers any act but a write.
  * A SQL filter for a missing tracked row; tightening the CHECKs to refuse every damaged shape; a SELECT before the
    UPDATE.
* **Discoveries**:
  * The protected `classify*` methods on `AdapterVaultDB` are pure pass-throughs, overridden nowhere, and Postgres
    now calls the steps for its write refusals. Proposed for removal; not removed.
  * With `ON CONFLICT DO NOTHING` on three independent INSERTs, a birth racing a single-Thing write of one root (a
    gate birth through `tryWriteThing` before the bank exists) could store two roots of three; before, the
    primary-key error rolled the statement back. The read path then answers `stale` or `storage_issue`.
  * `safebyok-postgres`'s tests run against `safebyok`'s **built** dist.
* **For the Coach**:
  * Remove the protected `classify*` overrides from `AdapterVaultDB`?
  * Whether a box birth should check that its parent is live; nothing does now.

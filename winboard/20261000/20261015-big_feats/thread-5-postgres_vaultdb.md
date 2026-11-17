# Thread 5: postgres_vaultdb (2026-10-15)

Branch `20261015-postgres_vaultdb`, PR [#73](https://github.com/mrflip/safebyok/pull/73), stacked on
[#76](https://github.com/mrflip/safebyok/pull/76) (thread 3, at `571743a`), which stands on
[#71](https://github.com/mrflip/safebyok/pull/71): merge in order #71, #76, #73. Cut from #63's
`ea4b93d`, rebased onto #71 before filing, then restacked onto #76 at the Coach's word. Justify
green: root 105, core 804, convex 272, postgres 132, react 47, demo 61.

* **Built**: `packages/safebyok-postgres/`, packaged like the core and React binding (ESM+CJS,
  tsdown-written `exports`, `safebyok` a peer, its own eslint cut from the core's, a README, a
  changeset, a place in the `fixed` group).
  - `vault-tables.sql`, also exported as `VaultTablesSql`: `safebyok_bundles` and
    `safebyok_lockboxes`, **a column to a field** (text, bigint, each Ciphered one opaque
    `jsonb`; a lockbox with no note has a null `note`), the lockbox's foreign key naming its bundle
    down to the `vault_id` with `ON DELETE CASCADE`, row-level security on with no policy, and a
    trigger notifying `safebyok_vault_changes` (`VaultChangeChannel`) with the scope as JSON.
  - `src/columns.ts`: **the one row mapper**. `BundleColumns` and `LockboxColumns` name each
    record's columns once; the compiler holds each list to the record's fields both ways (a field
    missing, or a stray column, fails to compile); every statement is built from them;
    `paramsOf`/`recordOf` map a record to parameters and a row back. A test holds the DDL's
    columns (information_schema) to these lists, name, type and order.
  - `postgresVaultDB({ client, userId, listen })` -> `PostgresVaultDB`: the per-request factory.
    `client` is anything with `query(text, params) => Promise<{ rows }>` (pg Pool/Client/PoolClient
    and PGlite type-checked as they stand). Every verb one statement. `not_permitted` for another
    user's scope, or any while signed out, before any query. `subscribe` fed by an optional
    `listen(channel, onNotify) => unlisten | Promise<unlisten>`.
  - `PostgresVaultDB.listBoxRecords(scope)`: the listing as stored records (see Discoveries).
  - Tests: `describeVaultDB` over it (one VaultDB per user, `TH.perUser`), and again over the
    README's route recipe (`tests/route-recipe.test.ts`, a POST handler plus a client VaultDB
    over fetch, run in-process); authorization, storage shape, unicode kept, trouble kinds, the
    foreign-key race, subscribe and its listen lifecycle, row-level security, the pg fan-out.
* **Decisions taken**:
  - The client is an object with a `query` method, not a bare function: `pool` and `pglite` pass
    as they stand, with no `this`-binding trap (`pool.query` unbound fails).
  - The statement races, each closed by one statement: create is `ON CONFLICT DO UPDATE` (no-op)
    `RETURNING`, since `DO NOTHING` returns no row when a concurrent insert wins; a first lockbox
    is `INSERT ... SELECT FROM safebyok_bundles WHERE vault_id = $`, and a foreign-key violation
    (SQLSTATE 23503, a bundle erased meanwhile) resolves `false`; a replacement matches the
    lockbox row's own `vault_id`, which the foreign key keeps equal to its bundle's.
  - `updateBundle` lands only when the new bundle's `vault_id` equals the expectation's.
  - bigints are read as `::float8` and jsonb as `::text` (parsed by us), so every driver hands
    back numbers and the same JSON whatever its type parsers; every parameter is cast.
  - Table and channel names are fixed (no prefix option): no identifier is ever interpolated
    from a host. A host wanting another schema uses `search_path`.
  - `maxRecordBytes` 1 MiB, `maxVaultBytes` Infinity: the server sets no vault limit.
  - No zod import: the three option checks are hand-written, as convexVaultDB's are; the
    notification payload is parsed with the core's exported `VaultScope`.
  - RLS on with no policy, in the DDL itself: harmless to the owner role, and it keeps Supabase's
    Data API out.
* **Deviations**:
  - Packaging follows `safebyok-react`'s tsdown shape rather than `safebyok-convex`'s (whose
    hand-written, ESM-only exports are Convex's component layout), so the package builds ESM and
    CJS like the core.
  - The plan's first rule (records whole as text) was built first, then replaced at the Coach's
    correction with field-by-field columns before any commit.
* **Discoveries**:
  - **A VaultDB's public `listBoxes` output is not valid `doListBoxes` input.** Summaries drop
    `format` and give `note: null`; the base class validates a listing as records with `format`
    and an optional string note. So a VaultDB over a wire cannot serve the server VaultDB's public
    `listBoxes`: hence `listBoxRecords`. **Thread 6 meets this** in its listBoxes resolver: use
    `listBoxRecords`, or the core grows a way for `doListBoxes` to hand back summaries.
    gripe_fixes' `vaultdb_validation` may move listing to whole-row validation, which would make
    the wire carry ciphered fields too; `listBoxRecords` would then select every column.
  - The suite's two users through one adapter means a per-request VaultDB needs `perUser`.
  - PGlite starts in about a second once its wasm is cached; tests share one per file and
    truncate. NOTIFY is delivered to the same PGlite, deduplicated per transaction.
  - For thread 6: `vaultDB.subscribe(scope, onChange)` is the change hook a subscription
    resolver wraps; one `listen` (the README's pg fan-out) is shared by every per-request VaultDB.
* **After review** (the thread-reviewer's two doc commits: a PGlite's `listen` must be called on
  its PGlite; a driver's `cause` can quote a whole failing row), at filing: rebased onto #71 and
  moved the bundle's columns to its shape -- `key_deriver_label`, `passphrase_salt_b64` and
  `vault_key_passphrase_wrapped` gone, `unlocks` one `jsonb` column (the envelope list, order
  kept). A YOLO call of the orchestrator's: the README's route recipe reads the body inside a
  guard (`postedCall`), so a malformed body answers 400, not 500.
* **For the Coach** (open questions, also in the PR):
  - The server holds no vault limit (Convex's component does). Worth a follow-up: a lockbox count
    cap inside the insert statement, refusing `vault_full`.
  - A `listen` that rejects is dropped silently: the subscriber never hears, and nothing says so
    (LISTEN has a connection of its own, so the vault's next call does not meet the trouble).
  - Server-side record validation: past the scope and boxlabel, a route's bundles, lockboxes and
    expectations are only what the core's VaultDB validates (gripe_fixes' `vaultdb_validation`).
  - The NOTIFY payload's scope is visible to any role that can connect and LISTEN.
  - `listBoxRecords` copies the core's `bad_label` and `storage_unavailable` messages, since the
    core's `checkScope` and `asStorageTrouble` are not exported; and `listBoxRecords` itself
    versus a core change letting `doListBoxes` return summaries.
  - `placeholderOf` throws a plain Error, at module load only, for a column-list mistake of ours.
  - The Supabase section is from Supabase's docs, untested against Supabase.

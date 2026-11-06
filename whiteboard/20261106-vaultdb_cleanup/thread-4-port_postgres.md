# Thread 4: port_postgres (2026-11-06)

Branch `20261106-port_postgres`, PR #561 (base main; carries threads 4 and 5, filed). Justify green: core 2272,
safebyok-postgres 121 (+1 skipped), safebyok-graphql 210 (+3), e2e 206 (+11; the Postgres suites, 99, ran
against a real Postgres at `SAFEBYOK_PG_URL`).

## Rework after the Coach's rulings (2026-11-06), from tip 0b27c1128

* **Channels** (b5ac34a94). `VaultChangeChannel` is gone; each write notifies its user's channel,
  `vaultChannelOf(user_id)` = `safebyok_` + user_id (exported), and each watch listens on its user's channel.
  user_id handling is unchanged: a channel past 63 bytes (a user_id past 54 characters, a percent-encoded
  character counting 3) makes every write that would notify refuse `storage_unavailable`, cause
  `{ message: 'channel name too long', code: '22023' }`, storing nothing. Tests show the 54/55 boundary,
  `%C3%A9` x9 (54 chars, writes) and +1 (refuses), raw `é` refused `bad_option` before Postgres, and a user_id
  of capitals and punctuation heard over a quoted LISTEN. README recipe: LISTEN (`escapeIdentifier`) the
  first time a channel is asked, never UNLISTEN, stop only drops the handler; "You own the database's roles,
  and are responsible for its row-level security". Test helpers (postgres, graphql, e2e) follow the recipe.
* **Payloads** (24989ebbb). Built in the `[Notices]` section of `postgres-vault-db.ts`, encoder
  (`noticeTextOf`) and decoder (`toldOf`) side by side, the field orders written once:
  * vault notice: the vault row as stored, a JSON object.
  * box notice: one JSON array `[...vault props, ...box props]`.
  * `VaultPropFields = applabel, user_id, vaultlabel, fmt, am, revision_tok, revision_seq, registered_at,
    written_at, vault_tok, gate_epoch` (gate_epoch null for a tombstone).
  * `BoxPropFields = boxlabel, am, fmt, revision_tok, revision_seq, registered_at, written_at, box_tok,
    whisper_codec, whisper_schema_version, sidecar, box_key_wrapped, whisper_ciphered`: the live-only fields
    last, so a tombstone's array ends at whisper_schema_version; ciphered fields `[cipher_iv_b64, ciphertext_b64]`.
  * past 7999 bytes: a vault as `[...vault props]`, a box as `[...vault props, boxlabel]`; the listener reads
    the row afresh (doGetVault / doGetBox).
  * The decoder checks the vault props' scope and vault_tok, and rebuilds the box row for the core's strict
    `boxRow` parse; the vault props are not rebuilt into a vault row.
* **Core**: `Notice.world: VaultRow | null`, `Heard.vault` optional; watch hands a box heard without a vault
  as `world: null`. `listing.ts` `#onNotice`: `if (world !== null) { this.world.takeWorld(world) }`, the only
  change there (test in `listing-delivering.test.ts`, red without it). Battery opt `boxNoticesCarryVault`
  (default true): false makes box notices expect `world: null` and skips the cascade-world case; passed by the
  Postgres batteries (package and e2e) and both GraphQL batteries.
* **safebyok-graphql (on hold)**: only the `heard` checker, `vault: unk` -> `vault: unk.optional()` (8 watch
  tests red without it), and `boxNoticesCarryVault: false` in `graphql-vault-db.test.ts` and `yoga-recipe.test.ts`.

### Decisions taken in the rework

* **No batching**: one notice per box, so each stays under 8000 bytes with no chunking; the boxes shape
  `[...vault props, [[...box props], ...]]` is not built. A cascade of N boxes sends N notices in one
  `pg_notify` statement, as before.
* **A sweep tells its boxes only under a vault row of their life** (the landed tombstone, or a tombstone of
  the same life on a repeat). Sweeping an old life under a newer vault sends no box notice: the vault props
  would carry the wrong vault_tok. Tested.
* PGlite's first LISTEN resolves late, so tests that use a fresh channel listen on it first.

### Set aside

* Nulls for a tombstone's absent fields: an absent tail is shorter and needs no special case to decode.
* Re-reading the vault on a box notice: ruled out (vault changes arrive on their own; no refresh added).

## The build (before review)

* `PostgresVaultDB extends VaultDB` (`safebyok/storage`): `new PostgresVaultDB({ client, listen?, maxBoxes?,
  maxRecordBytes? })`; `client` = `{ query, transaction }`, a PGlite as it is, or `pgClientOf(pool)`
  (pg's transaction recipe, hand-rolled, ~20 lines). Two tables of jsonb rows beside key columns
  (`VaultTablesSql`), RLS on, no policy, idempotent.
* Every write locks the vault row `FOR UPDATE`, so the box cap is exact and races serialize; a birth is
  `INSERT ... ON CONFLICT DO NOTHING`. Notices are sent by the write itself, `pg_notify` in the transaction.
* Triage: SQLSTATE class 42 -> `unexpected_error`, anything else `storage_unavailable`, the cause only the
  driver's message and code. listen / unlisten failures are swallowed: a watch is a hint.
* e2e: the battery over real Postgres, a box-cap race and a delete-while-writing race.

## For the Coach

* **mash() user_ids fail**: core's `mash(email)` yields 64 hex characters, past the 54 a channel allows; a
  host that uses it cannot write with this package until the user_id gap is repaired.
* A double quote or space cannot reach a channel: user_id validation refuses them, so the quoting tests
  cover capitals and punctuation (`|.@~:-+%`), not those characters.
* The fallback re-read gives rows as they are now: a watcher may hear a later row.
* Should the box cap count bytes? `vault_full` reports `bytes: { used: 0, max: Infinity }`.

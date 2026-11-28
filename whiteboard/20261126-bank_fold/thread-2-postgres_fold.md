# Thread 2: postgres_fold (2026-11-26)

Branch `claude/bank-table-refactor-fr1ycq`, local commits only (no PR in this run), on thread 1's `b29fb38`.
Proved: `pnpm --filter safebyok-postgres` lint clean, typecheck clean, test 5 files / 177 tests green (the vaultDB
battery on PGlite, in-process: no server needed), build green (attw, publint clean).

* **Built**: `PostgresVaultDB` on the two-root contract, in `packages/safebyok-postgres/`.
  * `vault-tables.ts`: `safebyok_bank_things` is gone. `safebyok_gate_things` gains `lifetok text NOT NULL`; its labelpath
    CHECK is `labelpath = banklabel AND label = banklabel`; `CHECK (labelpath <> 'gate' OR am = 'a')` is gone, so a gate's
    tombstone (the bank's end) is stored.
  * `vault-functions.ts`: `write_bank` and `root_box` are gone; `banktok_of` is new (copies `ManifestTags.banktokOf`).
    `world` now returns the bank's two roots `{ gate, root }` (the gate at the banklabel), so every statement reads one
    `world` column and `tracked(world, track)` takes two arguments. The write functions return `(tags, actual, world)`.
    The gate's write function carries the lifetok clause and the policies clause under one `isGate`; `lifetok_cmp` in
    `write_tags_of` and `written_tags_of` keys on `'gate'`. `birth_roots(gate_record, root_record)` writes the gate
    (ON CONFLICT DO NOTHING) and the root box only from the gate's RETURNING, as it did from the bank's.
    `birth_tags_of` takes two roots.
  * `tell_thing(thing, banktok)`: the notice carries `banktok` (a lifetok, ~36 bytes) instead of the bank row; too large,
    it falls to the scope and `read_tc` alone (one fallback, was two).
  * `vault-queries.ts`, `notifications.ts`, `postgres-vault-db.ts`: follow. The watch hands the notice's `banktok` to
    `receive` raw; `AdapterVaultDB` already reads a non-lifetok as the void lifetok.
  * Tests: the bank cases in "makes the tags ManifestTags makes" become gate cases (a live-over-live put, a del, a
    rebirth over a gate tombstone with another lifetok, and a lifetok-moved put and del, refused).
  * README and package.json description: "three tables" -> two; the notification paragraph and *What is stored*.

* **Decisions made**:
  * Folded `root_box` into `world` rather than keep a `world` that holds only the gate: the world is now exactly the
    `RootRows` a birth and a get of the world answer, and one function and one column per statement go. The name
    `world` stays for thread 6.
  * No `CHECK (banklabel <> 'box')`: the design leaves the banklabel `box` refusal open for the Coach; the core refuses
    it before any statement, and a CHECK would cement it in hosts' schemas.
  * `TableVersion`/`SqlRevision` not bumped: `ThingFormat` did not move, and pre-1.0 the file says not to.

* **Deviations**: the README and package.json description edits are thread 7's ground (READMEs); made because they state
  the notification's shape and the tables, which changed here. Thread 7 may rewrite them.

* **For the Coach / thread 7 (host upgrade)**: `VaultTablesSql` creates only what is missing, so a host with the old
  tables must, before running the new SQL: `DROP TABLE safebyok_bank_things, safebyok_gate_things, safebyok_box_things`
  (old gates are at `gate` with no `lifetok`; old vaults do not read under the new core in any case), and drop the old
  functions whose arguments or result changed, which Postgres will not replace in place:
  `safebyok_a010501_r000_write_bank(jsonb, jsonb, text, text)`, `..._root_box(text, text)`,
  `..._tracked(jsonb, jsonb, jsonb)`, `..._birth_tags_of(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, boolean)`,
  `..._birth_roots(jsonb, jsonb, jsonb)`, `..._write_gate(jsonb, jsonb, text, text, text[])`,
  `..._write_box(jsonb, jsonb, text, text)` (their result columns changed). `world` and `tell_thing` replace in place.
  Simplest: drop every `safebyok_a010501_r000_*` function and run `VaultFunctionsSql` again. A host that LISTENs
  itself sees `banktok` where `bank` was.

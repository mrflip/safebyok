# Thread store_rulings: the Coach's fourth pass on C1's rows (2026-10-21)

Branch `20261021-store_rulings`, PR [#217](https://github.com/mrflip/safebyok/pull/217), stacked on #216, in the line main → #213 → #212 →
#214 → #215 → #216. Justify: green (core 2696 passed / 37 skipped; postgres 282/15; convex
293/9; graphql 279/15; indexeddb 150/11; react 284; fastkey 49; demo 209/17; e2e 95 passed, 104
skipped: no Docker here, so no live Postgres or Convex backend ran).

* **Built**:
  * **1. No signal.** `VaultDB.putBox(scope, expected, box)` takes no options; `VaultDBCallOpts`,
    `checkCallOpts` and `untilAborted` are gone (`vault-db.ts`, `index.ts`), with VAULTDB.md 3.3's
    signal paragraph and the battery's and base tests' signal cases. No storage call takes one.
  * **2. A resent write is stale.** Every adapter now answers a box write sent again after it
    landed as `stale_write` naming that box. Local, IndexedDB and Convex already compared the
    expectation with what stood; Postgres answered landed because it compared the standing
    revision with the one sent. Its two statements are rewritten (`postgres-vault-db.ts`):
    `StandingBoxSql` locks the box `SELECT ... FOR UPDATE` (after the vault row, as `delVault`
    locks them); `ReplaceBoxSql` is a plain `UPDATE ... WHERE revision_tok = $read RETURNING`, the
    no-op `CASE` gone; `InsertBoxSql` inserts only where no box stands, keeps `ON CONFLICT DO
    UPDATE` for a first write raced in after the snapshot, and says landed by `xmax = 0` (its own
    row). Battery: a 3.3 case sends one write twice (first and replacement), and a race,
    `resentFirstWrites`, sends one first write from two devices at once (added to `SplitLosses`).
  * **3. Convex's unknown answer.** `convexVaultDB`'s `doPutBox` checks the answer's shape
    (`isPutBoxAnswer`) before reading it: null, the bare box an older component answered with, or
    any other shape is `corrupt_record`, "the deployed safebyok component is out of date". No
    `TypeError` can escape. Tests: `convexVaultDB, answered by a component of another version`.
  * **4. Capacity.** `VaultDB.getCapacity(scope)` → `Outcome<Capacity>`, from an abstract
    `doGetCapacity`; `Capacity` is now a zod schema in `types.ts`, `max` accepting `Infinity` and
    kept as `Number.MAX_SAFE_INTEGER`. `Refusals.vaultFull(capacity, opts?)` replaces
    `vaultFull(limit?, opts?)`, its message naming the limit met; the base checks a `vault_full`'s
    `meta.capacity` as it checks a stale write's `box_stored`. Per adapter:
    * Postgres: `count(*)` and `sum(octet_length(row_to_json(box)::text))` in one statement; the
      insert weighs only when it refuses as full, in the same statement as its count.
    * Convex: the component's tally row, against its own limits (8,000 boxes, `MaxVaultBoxBytes`);
      a vault uncounted past a limit reads as full. Its `putBox` now *answers* `vault_full` with
      the capacity (`PutBoxAnswer`), no `ConvexError`; `getCapacity` is a new component query and
      host function.
    * IndexedDB, local: count the scope's rows in one read, weighing each row's JSON.
    * GraphQL: `safebyokGetCapacity` and `SafebyokCapacity` (Float fields); a `vault_full` crosses
      with `extensions.meta.capacity`. The Postgres route recipe sends a refusal's `meta` whole and
      serves `getCapacity`; the demo's outage adapter hands it on.
    * Battery line 4.7, *An adapter says how full a vault is* (VAULTDB.md 4.7).
  * `notes/security.md` (sonnet): the C1 putBox entry, the `FOR SHARE` entry, the `meta` entry,
    and the Convex, GraphQL and route-recipe entries amended in place for all four rulings.
* **Decisions taken**:
  * `getCapacity`, a `get` verb as STYLE.md has them; the hook answers a whole `Capacity`, since
    only the adapter knows the limit it enforces (Convex's bytes limit is not its declared
    `maxVaultBytes`). The base coerces `Infinity` there, so nothing past it is infinite, and a
    capacity crosses JSON.
  * A `vault_full` from storage without a sound capacity is `corrupt_record`, as C1 made a stale
    write naming nothing standing (see Open matters).
  * Convex's `vault_full` moved into the box write's answer (results, not throws, as its stale
    and mismatch already were); `SafebyokErrorKindVals` is `identity_revoked`, `not_permitted`.
  * The vault's own `vault_full` (its `#checkRoomFor`) still carries no capacity: the vault's
    reckoning is `vault.capacity`; `props_bag` decides what the vault shows.
* **Discoveries**:
  * The Postgres insert cannot see, in any `SELECT` of its statement, a box another writer
    inserted after the statement began; only `ON CONFLICT` meets it, and only `xmax` tells that
    path from its own insert on Postgres 14 to 17 (`RETURNING old` is Postgres 18's). PGlite runs
    one statement at a time, so that path never runs locally: CI's live Postgres runs
    `resentFirstWrites` and the other races. Verified by hand on PGlite 0.5.8 (Postgres 18):
    an insert's row answers `xmax = 0`, a conflict's no-op update a nonzero `xmax`.
  * Convex declares `maxVaultBytes` 8 MiB, but its component refuses at `MaxVaultBoxBytes`
    (7 MiB less 1 KiB) as Convex counts a document: two measures. Its capacity reports the
    component's.
* **For `props_bag`**: `vaultDB.getCapacity(scope)` is the source for the vault's virtual
  capacity props; it is one round trip (Postgres, Convex, GraphQL) or one read (IndexedDB,
  local), so read it where the vault reads, not per render. Bytes are the backend's measure,
  never the vault's reserved-room reckoning: say which one a prop shows.
* **Contract drift** (for the tab):
  * *VaultDB.putBox*: `putBox(scope, expect, box)`, no `opts`; strike `signal` and its
    `storage_unavailable` line. Its Refuses: a resend of a landed write is `stale_write` naming
    that box; `vault_full` carries `meta.capacity`.
  * *VaultDB.getCapacity(scope)*, new: resolves `Capacity` (`{ boxes: { used, max }, bytes: {
    used, max } }`), an estimate; an unkept limit is `Number.MAX_SAFE_INTEGER`; refuses `bad_label`,
    `corrupt_record`.
  * *Shapes*: `meta.capacity` on storage's `vault_full` always (none on the vault's own); a
    `vault_full` without one is `corrupt_record`. `Refusals.vaultFull(capacity, opts?)`.
  * *Refusals*: `corrupt_record` adds "a Convex component of another version answered".
* **For the Coach**: the two questions are answered in
  [`thread-store_rulings-answers.md`](thread-store_rulings-answers.md), ready to paste as rows.
  Open matters:
  * **xmax for "landed"**: Postgres says a first write landed by `xmax = 0` on the row its insert
    returned, the only single-statement signal on 14 to 17. It is how Postgres marks a locked row,
    widely relied on, but an implementation detail. If it ever misread, a rival's box would come
    back "landed" at another revision, which the base already refuses as `corrupt_record`; only
    two sends of one identical write racing would both read landed. Recommend keeping it.
  * **vault_full without capacity**: `corrupt_record`, like C1's stale write without
    `box_stored`. The alternative passes `vault_full` on with no capacity. Recommend as built.

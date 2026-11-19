# Thread 3: format_string (2026-11-19)

Branch `20261119-format_string`, PR #768, cut from origin/main. Proved: `pnpm --filter safebyok test` (1226 pass), `pnpm --filter safebyok typecheck`, `pnpm --filter safebyok-postgres test` (341 pass); `pnpm justify` pending.

* **Built**: `ThingFormat` is `'a010501'` (`packages/safebyok/src/shapes/shapes-thing.ts`). Every Thing's `fmt` check was already `lit(ThingFormat)`; the sparse check's `fmt: uint` is now `lit(ThingFormat)` too. safebyok-postgres: the vault tables' `fmt` column is `text COLLATE "C"` (was `integer`), and `TableVersion` in `vault-functions.ts` is `ThingFormat`, so the SQL functions are `safebyok_a010501_r000_write_box` (was `safebyok_t01_r000_...`). Changeset (`safebyok-postgres` minor) says an old table needs dropping.
* **Decisions made**: `TableVersion = ThingFormat` (one constant, as the Coach's wording has it) rather than a second literal; a table-only change (a CHECK, a column) now bumps `ThingFormat`, and the comment says so. The `t01` zero-pad is gone; `SqlRevision` keeps its pad. Tests that built an off-format fmt use `'a010502'`. `notes/reference-sizes.md`'s fmt arithmetic is now `+5 bytes` (quoted `"a010501"` against four bare digits).
* **Deviations**: none. Left alone: safebyok-big's numeric fmts, and the lease's `LeaseFormat = 7102` (a number, not a Thing's; the plan names only the Thing's constant).
* **Discoveries**: the postgres `bank-*` files (6003, 3001) belong to the old core and are untouched. `CREATE TABLE IF NOT EXISTS` will not alter an existing `integer` fmt column, so a dev database needs its vault tables dropped.
* **For the Coach**: whether `LeaseFormat` should become a string like it (not done).

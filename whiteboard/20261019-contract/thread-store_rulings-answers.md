# store_rulings: answers to the Coach's two questions (2026-10-21)

For the Coach and the orchestrator: each paragraph is ready to paste as a row's answer.

## "Why is the postgres function running a select following -- can't it just use returning?"

It was still one statement and one round trip, and every part of a Postgres statement reads
the one snapshot taken when the statement starts, so the trailing `SELECT` opened no gap for
another writer: it was not two steps in the sense of a race. But it was there for a poor reason.
`RETURNING` hands back only rows the statement wrote, and a write that does not happen must still
say why (vault gone, vault full, another box standing) and which box won. C1's insert got that by
reading the boxes table again at the end, for the full vault where the insert never ran; its
replace avoided a read by "writing" every column back to its own value, a no-op `UPDATE` whose
only job was to lock and return the row. Now both first lock the box standing with
`SELECT ... FOR UPDATE`, which writes nothing and, under READ COMMITTED, reads the row as it
stands once locked, a box another device committed while we waited included. The write is
conditioned on it, and `RETURNING` carries the box written. The closing `SELECT` stays, but only
to shape one answer row from those results: it reads no table. One case still needs the insert's
`ON CONFLICT DO UPDATE`: a first write that another device committed after our statement began is
in no snapshot, so no `SELECT` of ours can see it, and only the insert's conflict check meets it.
"Landed" is now the write's own condition passing -- a row from the `UPDATE`, or the insert's own
new row (`xmax = 0`) -- never "the box standing has my revision", so a resend of a write that
landed is `stale_write`, naming that box. PGlite runs one statement at a time, so the raced paths
run only on CI's live Postgres.

## "What capacity estimate are we doing that's faster than Select sum(size(...))?"

None, for Postgres: `getCapacity` is exactly `SELECT count(*), sum(octet_length(row_to_json(box)::text))`
over the vault's rows, one statement on its primary-key range, a few hundred rows at most. A box
write sums the bytes only when it refuses `vault_full`, in the statement that already counts for
the limit. The one faster estimate is a tally kept in step with every write, which Convex has
(its component cannot afford to read a full vault in one transaction), so Convex answers from its
tally row; Postgres keeps none, as the baseline asks no counter kept in step. IndexedDB and local
storage count and weigh the vault's rows in one read. Each store's bytes are its own measure:
Postgres the row as JSON, Convex its document size with scope and system fields, IndexedDB and
local each record's JSON. None is the vault's own `capacity`, which weighs each box at the room it
reserves (twice `maxWhisperBytes`, its fields and names) against `maxVaultBytes`, from the listing
it already holds, at no cost. A store's bytes are smaller, and a measure of what is there.

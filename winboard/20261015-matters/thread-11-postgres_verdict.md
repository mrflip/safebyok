# Thread 11: does the Coach's one-statement insert meet the contract? (2026-10-16)

For thread 12 (postgres_soft_cap), and whoever reviews it. The contract is
`packages/safebyok/VAULTDB.md`; line numbers below are its.

## Verdict: yes, at READ COMMITTED, with three conditions

The Coach's statement, adapted to our tables -- insert only where the vault's `count(*)` is under
the limit, no lock, no counter column, no trigger -- meets lines 3.3, 3.6, 4.2 to 4.5 and 5.2 at
Postgres's default isolation, **provided**:

1. **It says why it did not land, in the same statement.** The Coach's literal form returns no
   row for "full", "stale" and "boxlabel already taken" alike, and `StillFullSql` existed to tell
   them apart with a second read. CTEs over one snapshot do it in one:

   ```sql
   WITH vault AS (
       SELECT applabel, user_id, vaultlabel, vault_id FROM safebyok_bundles
       WHERE <scope> AND vault_id = $4
     ), counted AS (
       SELECT count(*) AS lockbox_count FROM safebyok_lockboxes WHERE <scope>
     ), inserted AS (
       INSERT INTO safebyok_lockboxes (...)
       SELECT ... FROM vault, counted WHERE counted.lockbox_count < $5
       ON CONFLICT (applabel, user_id, vaultlabel, boxlabel) DO NOTHING
       RETURNING 1
     )
   SELECT EXISTS (SELECT 1 FROM inserted) AS landed,
          EXISTS (SELECT 1 FROM vault) AS vault_stands,
          EXISTS (SELECT 1 FROM safebyok_lockboxes WHERE <scope> AND boxlabel = $6) AS box_stood,
          (SELECT lockbox_count FROM counted) AS counted_before
   ```

   Not landed: `! vault_stands` or `box_stood` is stale (box first: line 4.3, a replacement is
   never full); `counted_before >= cap` is `vault_full`; otherwise a same-boxlabel insert that
   committed after the statement began hit `ON CONFLICT`, and it is stale. I ran this shape on
   PGlite (scratch, not committed): every case comes out as above, and the outer `box_stood` and
   `counted_before` see the statement's snapshot, not the row it just inserted -- so
   `counted_before` is "the count when the statement began", the Coach's acceptable
   "1 + the count when I started" minus the one.
2. **A foreign-key violation (`23503`) on that insert is stale, not trouble.** With no
   `FOR UPDATE`, a vault erased (or erased and made anew) after the statement's snapshot but
   before its foreign-key check makes the check fail: Postgres's RI check reads the latest
   committed bundle, not the snapshot, and raises `23503`. No lockbox lands in the wrong vault --
   the foreign key still guarantees that -- but the adapter must map that error code to `false`
   (`stale_write`), or line 5.2 breaks (contention reported as `storage_unavailable`).
3. **The README says the guarantee holds at READ COMMITTED.** Above it (a host's session
   default, or a host wrapping calls in its own transaction), some races fail with `40001` -- a
   retry the baseline promises not to ask for. At SERIALIZABLE, two inserts into one vault that
   each read `count(*)` and insert into the range read conflict through its predicate locks, and
   one fails. At REPEATABLE READ the count-then-insert race does not conflict (it overshoots, as
   at READ COMMITTED); the `40001`s there come from `ON CONFLICT DO NOTHING` meeting a row its
   snapshot cannot see, and from the foreign key's cross-check finding the bundle changed since
   the snapshot. These are `storage_unavailable` (5.2 allows that: real contention, under a
   non-default setting). *Corrected by the review: an earlier draft had REPEATABLE READ's
   count-then-insert racers fail too.*

Under concurrency at READ COMMITTED: each statement sees the vault as of its own start, so `N`
racers at `cap - 1` can all see room and all land, overshooting by up to `N - 1`. Line 4.2 allows
exactly this; writes made one after another always see each other and never overshoot. A refusal
for the count inserted nothing (the `WHERE` failed inside one atomic statement), which is line
3.6. Every row that landed is readable by boxlabel (2.2), and once erases bring a vault under its
limit, a new lockbox lands (4.4). `eraseVault` racing an insert is safe too: the cascade runs on
a fresh snapshot and waits behind the insert's key-share lock on the bundle, so it takes the new
lockbox with the vault.

## What else goes with it

* **Erase** loses its `FOR UPDATE` too: it only existed to order the erase with the count trigger.
  `WITH erased AS (DELETE ... AND EXISTS (SELECT 1 FROM safebyok_bundles WHERE <scope> AND vault_id
  = $5)) SELECT 1 FROM safebyok_bundles WHERE <scope> AND vault_id = $5`.
* **The NOTIFY trigger.** The contract's baseline (*The baseline*, first bullet) needs no trigger
  and makes push that needs one opt-in. `VaultTablesSql` installs the notify trigger
  unconditionally today. To meet the letter of the baseline, split it into its own SQL for hosts
  that pass `listen`. That is a call for thread 12 (or the Coach) -- it is a host-visible change.
* **Performance**: `count(*)` per new lockbox walks the primary key's prefix for the vault: an
  index-only scan of at most about `cap` entries, since the cap stops growth near it.
* **What PGlite cannot prove.** PGlite runs one statement at a time, so no test there races. The
  battery's 4.5 test (racers at `cap - 1`) passes for a strict and a soft adapter alike; it checks
  the outcome, not the race.

## A trap for rotation (thread 14, from #105's section 5)

Rotation will compare `vault_key_epoch` -- a non-key column of the bundle -- in the lockbox
write's atomic step. With the lock-free statement, that comparison is a snapshot read: a rotation
committing between the insert's snapshot and its end is not seen, and the foreign key (which
covers only `vault_id`) does not catch it. The old `FOR UPDATE` would have. So when rotation lands,
the insert and the replace need the bundle row read `FOR SHARE` (a shared lock, for that one
statement only: lockbox writers do not block each other, only a bundle update waits a moment, and
READ COMMITTED re-reads the row it waited for), or another mechanism. Nothing in the contract
rules this out; thread 12 should not design it away, and should say so in its README text.

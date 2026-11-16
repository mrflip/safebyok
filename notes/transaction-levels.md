# Transaction levels in Postgres

Three premises to fix first, because they change the shape of the ladder.

1. **Nothing in Postgres reads "at commit".** A read sees a snapshot taken at statement start (the default, `READ COMMITTED`) or at the transaction's first statement (`REPEATABLE READ` and up). What you can buy is "what I read is still true at commit", through locks or `SERIALIZABLE`. So #seen-at-commit becomes #still-true-at-commit.
2. **#at-once is not a separate rung.** A commit publishes all of a transaction's writes, across all tables, at one instant to every other snapshot. It comes free with #all-or-none, and there is no row-by-row publication, even in a bare statement.
3. **"None raise" cannot hold on the upper rungs.** `REPEATABLE READ` and `SERIALIZABLE` earn their guarantees by raising SQLSTATE 40001 and making you rerun the bundle. `SERIALIZABLE` takes no blocking locks, so #needs-lock misnames it: locking is the pessimistic route to the same guarantee (wait, never retry), and `SERIALIZABLE` is the optimistic one (never wait, sometimes retry).

This is all from the concurrency-control and wire-protocol chapters of the manual and I'm confident of it; I did not look anything up.

## The ladder

Weakest to strongest. It is a partial order: 📸 guarantees more than 📦 but constrains you to what fits in one statement.

|     | Term of art                          | #handle        | Plain description                                                                                                                                                                                                                           | Postgres shape                                                |
| --- | ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 🎲   | Autocommit                           | #each-alone    | Each statement is its own transaction. Others can see and act on the state between any two of your statements.                                                                                                                              | `a; b; c;` sent separately, no `BEGIN`                        |
| 📦   | Atomic transaction at Read Committed | #all-or-none   | Writes land together or not at all and publish at one instant. Each statement still takes a fresh snapshot, so later statements can see a different world than earlier ones did.                                                            | `BEGIN; a; b; COMMIT;`                                        |
| 📸   | Statement-level snapshot             | #one-statement | Everything in the statement, including every CTE and subquery, reads all tables as of one instant, and its writes are all-or-none. A target row someone else changed mid-flight is waited for and its `WHERE` rechecked, for that row only. | `WITH w AS (UPDATE … RETURNING …) INSERT … SELECT … FROM w`   |
| 🔒   | Pessimistic row locks                | #hold-the-rows | Rows you read with a lock cannot change or vanish until you commit, so decisions about those rows are still true at commit. Rows that don't exist yet are not covered.                                                                      | `BEGIN; SELECT … FOR UPDATE; …; COMMIT;`                      |
| 🎞️   | Snapshot isolation                   | #frozen-view   | The whole transaction reads one snapshot. Writing a row that changed since the snapshot raises. Decisions resting on rows you only read can still be stale (write skew).                                                                    | `BEGIN ISOLATION LEVEL REPEATABLE READ; …`                    |
| ⚖️   | Serializable (SSI)                   | #as-if-alone   | The outcome equals some one-at-a-time ordering of the bundles. Everything you read, absences included, holds at commit, or you get a 40001.                                                                                                 | `BEGIN ISOLATION LEVEL SERIALIZABLE; …` plus a retry loop     |
| 🚧   | Coarse mutual exclusion              | #take-a-number | Bundles that take the same lock really do run one at a time. No retries, only waiting.                                                                                                                                                      | `BEGIN; SELECT pg_advisory_xact_lock(k); …` or `LOCK TABLE t` |

## ODCR per rung

|     | Orient                                                 | Decide                                                       | Commit                  | Return                                             | Cost                                    |
| --- | ------------------------------------------------------ | ------------------------------------------------------------ | ----------------------- | -------------------------------------------------- | --------------------------------------- |
| 🎲   | One instant per statement                              | Stale across statements                                      | Per statement           | Per statement                                      | Nothing; others interleave freely       |
| 📦   | One instant per statement                              | Stale across statements; target rows rechecked               | All tables, one instant | `RETURNING` rows are final unless you rewrite them | Row locks held to commit                |
| 📸   | One instant, all tables                                | Target rows rechecked; rows only read may be stale           | All tables, one instant | `RETURNING` rows are exactly what commits          | Must fit in one statement               |
| 🔒   | Locked rows current and frozen; the rest per statement | True at commit for locked rows; blind to new rows            | All tables, one instant | Locked and written rows are as of commit           | Waiting; deadlock if lock order varies  |
| 🎞️   | One instant, all tables, whole transaction             | True at commit for written rows; read-only rows may be stale | All tables, one instant | Your writes over the frozen view                   | 40001 and rerun                         |
| ⚖️   | One instant, all tables                                | True at commit, absences included                            | All tables, one instant | Consistent with the serial order                   | More 40001s; every writer must use it   |
| 🚧   | Current, and nobody else moves                         | True at commit                                               | All tables, one instant | As of commit                                       | Throughput; everyone must take the lock |

Two shapes inside 📸 deserve their own names, since they carry most daily traffic:

- **Decide inside the write** (`UPDATE t SET n = n + 1 WHERE …`): the decision uses the row as relocked, so it is never stale. CAS is one instance of this.
- **#claim-the-key** (`INSERT … ON CONFLICT`): the only cheap way to decide on absence, and it works only for absences a unique index can express.

## Things one might guess matter

| Conjecture                                             | Effect                                                                                                                                                     | Same as                       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Single `SELECT`, one table                             | One snapshot; never sees a half-applied commit                                                                                                             | #one-statement                |
| `SELECT` joining several tables                        | Same; the snapshot spans all tables                                                                                                                        | #one-statement                |
| Has a `WITH` clause                                    | No change to guarantees                                                                                                                                    | #one-statement                |
| Writing CTEs                                           | Siblings and the main query cannot see each other's writes in the tables, only through `RETURNING`; changing one row twice in a statement is unpredictable | #one-statement                |
| `RETURNING`                                            | No change; it hands back the row as you wrote it, which commit will publish                                                                                | rung of its statement         |
| Write, read back *at* commit, written rows             | `RETURNING` already is that                                                                                                                                | #one-statement                |
| Write, read back *at* commit, other rows               | Needs those rows locked, or serializable                                                                                                                   | #hold-the-rows / #as-if-alone |
| Write, read back *after* commit, simultaneous v tables | One `SELECT` after `COMMIT`; it may include strangers' later commits                                                                                       | #one-statement                |
| Same, across several `SELECT`s                         | `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`                                                                                                          | #frozen-view                  |
| Might `RAISE`                                          | Inside a statement or `BEGIN` block, everything rolls back                                                                                                 | #all-or-none                  |
| Might `RAISE`, no `BEGIN`                              | Earlier statements stay committed, and psql runs the later ones unless `ON_ERROR_STOP` is set                                                              | #each-alone                   |
| How the bundle is delivered                            | `psql -c "a; b"` and most drivers' multi-statement query strings are one implicit transaction; `psql -f` or stdin is not, unless `-1`                      | #all-or-none vs #each-alone   |

## Your handles, mapped

| Yours                       | Becomes                                                   |
| --------------------------- | --------------------------------------------------------- |
| #all-or-none                | 📦, unchanged                                              |
| #at-once                    | Same as #all-or-none                                      |
| #seen-before-commit         | #one-statement or #frozen-view, depending on span         |
| #seen-at-commit             | #still-true-at-commit, earned by 🔒, ⚖️ or 🚧                |
| #return-written-at-commit   | `RETURNING`                                               |
| #return-at-commit, all rows | 🔒 or ⚖️                                                    |
| #snapshot-after-commit      | One `SELECT` after commit                                 |
| #needs-lock                 | Split into #as-if-alone (retry) and #take-a-number (wait) |

## What would change these answers

- **Triggers**: `BEFORE` triggers alter what `RETURNING` shows; `AFTER` triggers write elsewhere.
- **Foreign keys**: child writes take share locks on parent rows, adding waits and deadlocks, but also giving a cross-table existence guarantee.
- **Unique, exclusion and check constraints**: inserts wait on rival inserts and can raise.
- **Sequences and clocks**: sequences ignore rollback, and `now()` is transaction start while `clock_timestamp()` is not.
- **Functions**: a volatile function at Read Committed takes a fresh snapshot per inner statement, and an exception block is a hidden savepoint.
- **Read replicas**: a read after commit may not see your commit yet.
- **Poolers**: transaction-mode poolers break session-level locks and settings.
- **Lock modifiers**: `SKIP LOCKED` and `NOWAIT` trade waiting for skipping or raising.
- **A changed `default_transaction_isolation`**: every row above shifts.

## Recommendation

Default to 📸: push the decision into the write's `WHERE` or `ON CONFLICT`, and chain steps with writing CTEs. When the bundle won't fit in one statement, use 📦 plus 🔒 on the rows the decision rests on, locked in a consistent order. Reach for 🚧 with an advisory lock keyed on the natural unit (one vault, say) when the decision depends on absence or on a set of rows. For an adapter library, the main reason is that 📸, 🔒 and 🚧 work at whatever isolation level the host configured and need no retry loop from the host.

The case for ⚖️ everywhere, which is what the Postgres manual itself suggests: it is the only rung where you can reason about each bundle alone and be right without auditing every other query against the tables. Locks only protect against writers who follow the same convention, and one forgotten `FOR UPDATE` is a silent bug. If you own every writer and can wrap every call in a retry loop, it is the simpler mental model.

I would switch to ⚖️ if all writes go through code you control, with retry built in and low contention.
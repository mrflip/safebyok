Exported from the big_feats sprint doc's "Matter: Postgres vault cap" tab, 2026-10-16. The doc is the source; this copy is for workers.

# Matter: the Postgres vault cap

Written assuming the big_feats stack is merged, as it is (`e86125a`). Every path is on main, so a fresh session can start here with the repo and this tab.

## What's built

* **The core already holds the soft limit.** `openVault`'s `maxLockboxes` refuses a new lockbox past the app's number, counted from the vault's own snapshot. It defaults to the smaller of 100 and the store's limit. Asking for more than the store declares is refused at open (`bad_option`).
* **Every store declares a `maxLockboxes`.** `localVaultDB` and IndexedDB: Infinity. Convex: 8000 (`MaxVaultLockboxes`, from its transaction limits). Postgres: 1000 by default. GraphQL's browser side: 1000, mirroring its server.
* **Postgres also guarantees the limit on the server** ([#89](https://github.com/mrflip/safebyok/pull/89)):
  * a `lockbox_count` column on `safebyok_bundles`, kept by a trigger;
  * the lockbox insert locks the bundle's row (`FOR UPDATE`) and inserts only while the count is under the limit;
  * on a `full` answer only, a second read (`StillFullSql`) tells `vault_full` from `stale_write`.
* **The README's promise changed** from "every verb is one statement" to "every write is one statement", and it documents a recount statement for when the count drifts.
* **Where it lives:**
  * `packages/safebyok-postgres/src/postgres-vault-db.ts`: `InsertBoxSql` and `StillFullSql`, around lines 170–230;
  * `packages/safebyok-postgres/src/vault-tables.ts`: the column and the trigger;
  * `packages/safebyok-postgres/README.md`: lines 33–45, 75, 207–210 and 329;
  * `packages/safebyok-graphql/README.md`: line 158.

## Its weight

* A column and a trigger in the host's schema: every host migrates them, and they must never drift.
* A row lock that serializes every lockbox insert and erase in one vault. At SERIALIZABLE isolation it raises serialization failures, which the host must retry.
* Two statements on the full path, and a race argument a reviewer had to correct twice.
* All for a limit Postgres doesn't need: lockbox rows are small, and a table holds millions.

## What the cap is for (your words)

* An alarm bell for the implementor: an app holding 100 lockboxes may have a bug.
* For some stores, a hard capacity limit, such as Convex's transaction limits.
* So the vault refuses additions past the app's number, and whether a store also guarantees that is the store's choice.

## The options

* **(a) Keep the guarantee as built.**
* **(b) Declare, don't guarantee.**
  * Postgres declares no practical limit: Infinity, or 1_200_300_400_500_600 if Infinity won't do.
  * The column, the trigger, the lock and the second read all go.
  * Writes go back to one statement each, and the README's promise reads "every verb" again.
  * The vault's soft limit is the alarm bell, and GraphQL follows Postgres.
* **(c) A cheap check on the server.** Insert only where `count(*)` is under the limit, without a lock. Racing writers can overshoot by a few. It stops a runaway loop, not a determined client.
* **(d) An opt-in guarantee.** (b) by default, with the trigger and the lock behind an option. It keeps all of #89's code for a rare host.

## What (b) gives up

* **The limit then lives only in the client.** A client that bypasses the library could add lockboxes without bound: a hostile client, or a bug in another app sharing the tables.
* **That is an abuse quota, which the host owns anyway**, just as it owns request rates. The README would say so.

## Recommendation

* **(b).** Concretely:
  * Postgres declares no practical limit, and the default of 1000 goes;
  * the README says that quotas are the host's;
  * the battery's cap tests run only on stores that declare a finite limit.
* **One thread does it**, sized for sonnet once you've ruled. No migration is needed, since nothing binds before 1.0.

## Your thoughts

I'd like vaults to offer the following contract; can it be satisfied in full even with a transactionless backing store?

* does not require operational work more complicated than "create tables with these columns, indexed thusly"
* is fully performant
* will succeed if safe and possible
* fails with clear actionable errors
* does not require retry logic in normal situations
* does not require record locking or other impactful concurrency modes
* **Normal usage should produce consistent logical results**. Large records and large loads might imply larger edge-case variation (eg records over a softmax), but will never impact correctness according to this contract
* **updates obey the versioned-update guarantees** and are otherwise last-write-wins (<-- note -- please correct/clarify; what layer owns the versioned update logic)

* **listings will return exactly LIMIT records if a limit is given, or all records** if higher (Infinity, by default)
  * ?the same each time if no updates/inserts are committed between reads?
  * ?with a promise of which ones -- eg most recently changed_at?
* **adapter makes best effort to not insert more than SOFTMAX records**
* **if backend rejects for being over SOFTMAX, it also promises that that particular insert did not take place**
* **if a write succeeds, it returns success and a best-effort updated count**.
  * note: there is no guarantee that a too-many-records situation will be reported to the app: returning "1 + the count when I started writing" is acceptable
  * each store will state what guarantees it makes for that count (eg "recalculated after commit", "exact at commit", or "exact at start of transaction")
* **after deleting records to fewer than SOFTMAX, listings are guaranteed to include all records**
* **any inserted record is retrievable by id**, even if there are more than SOFTMAX present
* The baseline (no-extra-options) contract of an adapter should be the one that meets the above guarantees. If offering a tighter guarantee would imply (a) more operational work, specific instructions, or maintenance; (b) imply retries or failures above what the baseline contract offers; (c) impact performance in either normal or edge-case scenarios, the app must opt-in to that.

```
INSERT INTO items (id, content, created_at)
SELECT 'new_id', 'some_content', NOW()
WHERE (SELECT COUNT(*) FROM items) < 100
RETURNING (SELECT COUNT(*) FROM items);
```

Adapters may provide *vaya con dios* instructions for the ambitious person who wants a stronger guarantee.

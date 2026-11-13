# Thread 22: convex_tidy (2026-11-13)

Branch `20261113-convex_tidy`, PR #690, stacked on #689 (`20261113-bank_tidy`). Justify: green
(safebyok 2963, convex 313, graphql 409, indexeddb 197, postgres 213, e2e 549, the rest
unchanged).

* **Built**:
  - **The contract**: `Tidied` (packages/safebyok/src/storage/bank-db.ts) gains
    `leftover: Leftover`, `'none' | 'some' | 'many'`; `leftoverVals` and `Leftover` sit in
    shapes-enums.ts (*Upkeep*) and are exported from `safebyok/storage`. The answer check
    `tidied` in shapes-bank-answers.ts takes it, strict. `'some'`: one more call deletes the
    rest; `'many'`: it does not.
  - **The other stores** (memory, IndexedDB, Postgres) delete every ended box row in one go and
    answer `'none'`; GraphQL carries the field (`enum SafebyokLeftover`,
    `SafebyokTidied.leftover`, the operation's selection, the README sentence). The battery
    (bank-db-battery-dels.ts) and memory/GraphQL tests assert `'none'`.
  - **Convex**: banks.ts `tidyGone` deletes ended vault rows and tallies whole, then
    `deleteEndedBoxes` scans the bank's box index once (`listBoxDocsQuery`), skipping live and
    damaged-label rows, deleting up to `MaxTidiedBoxes` (1000) or `MaxTidiedBoxSize` (2 MiB),
    then counting further ended rows against a second budget of the same size: none counted is
    `'none'`, a few is `'some'`, the second budget spent is `'many'`. `endedBoxQueries` and
    `byCodeUnits` are gone. The budget is `tidyBudget()` in tallies.ts, beside `cascadeBudget`.
  - **Tests** (convex-bank-db.test.ts): a table over 0, 3, 1000 (`'none'`), 1003, 2000
    (`'some'`), 2001 (`'many'`), each with a live box in another bank left intact; a `'some'`
    cleared on the next call; the byte budget (40 rows of 128 KiB: `'many'`, then `'some'`);
    a fit test beside 6 MiB of live rows under `transactionLimits`; delBank's overflow now
    tidied in three calls (`many`, `some`, `none`). tallies.test.ts checks the budget. Each
    tidy case runs in 20-130 ms; the delBank overflow test about 600 ms.
  - Changeset `.changeset/20261113-convex_tidy.md`, minor for the five packages.

* **Decisions taken**:
  - **1000 fits.** Per batch: at most 1000 deletes (limit 16,000 written) and about 2001 box
    rows read plus the live ones (limit 32,000). Bytes are what bind: Convex reads 16 MiB per
    transaction, so each budget also stops at 2 MiB, and the two together take a quarter of it.
    With today's 5.6 KB default records a batch stops near 375 rows by bytes, not 1000.
  - **A plain scan, live rows read.** It reads live box rows as it passes them, as `watchRows`
    already does, so a bank whose live box rows pass about 12 MiB makes `tidyGone` throw
    `storage_unavailable` (the README says so). That is the price of dropping the range
    arithmetic.
  - **The remainder is counted, never totalled**: a second budget the batch's size, so
    `'some'` honestly means the next call (bytes included) clears it.
  - **Vault rows and tallies of ended lives are deleted whole**, unbudgeted: they are already
    bounded by the `listVaultDocs` and `listTallyDocs` reads that precede them.
  - **One field, three literals, additive**; minor bump, as an interface a host implements.
  - The #670 ruling, "contract unchanged ({ totalCount } says nothing of rows left)", is
    superseded by the Coach's ask for this thread.

* **Approaches set aside**:
  - **The index-only ranges** (`endedBoxQueries`, 2N+1 queries that never read a live row):
    what the Coach asked to replace; correct but hand-checked.
  - **Tally-driven discovery** (walk tallies of ended lives, delete their box rows by life):
    not every life has a tally, and `delBank` deletes tallies before box rows, so orphans
    would be missed.
  - **Reordering `delBank`** to keep tallies for the above: out of scope.
  - **A full count of what is left**: unbounded reads, which is the problem being solved.

* **Discoveries**:
  - The sprint base `20261113-bank_tidy` was restacked under me (same messages, new SHAs);
    rebased onto 94c6b57e0 before the first push.
  - `delBank` still runs on `cascadeBudget` and answers nothing about leftovers; its overflow
    test now leans on `tidyGone`'s batches to finish.
  - Sanity: widening `MaxTidiedBoxSize` to half the read limit makes the fit test throw
    `storage_unavailable`, so it discriminates.

* **For the Coach**:
  - Accept that Convex `tidyGone` reads live box rows (and fails past about 12 MiB of them)?
    Recommended: yes, `watchRows` already has that bound.
  - The 2 MiB byte cap means a batch of large rows is fewer than 1000. Recommended: keep.
  - Vault and tally deletes unbudgeted. Recommended: keep.
  - `delBank`'s cascade has no `leftover` of its own. Recommended: leave for a later thread.

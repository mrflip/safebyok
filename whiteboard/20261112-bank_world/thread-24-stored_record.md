# Thread 24: stored_record (2026-11-13)

Branch `20261113-stored_record`, PR (draft, see below), stacked on #692. Justify: not yet run; per-package tests green so far (core 2962, IndexedDB 200, Postgres 215).

The Coach (2026-11-13): the classifier's write branch answered `box: ask.record`, the record sent, where it should answer the stored record, the row the datastore reports holding. Repair it in every bankDB; reword the contracts so "the stored record" (what the datastore contains, as fetched or written) and "the record sent" (what the caller asked to store) are never confused.

* **Built**
  * `bank-classifier.ts`: the classifier decides the act and returns the rows it fetched, every act alike. It no longer stands in for storage. New `BX.writtenBankOf / writtenGateOf / writtenVaultOf / writtenBoxOf(scope, raw)`: a row an adapter reports writing, checked as a bag and for its address (`RowOfOtherAddress`), never for agreement with the record sent; that is the delivery's to judge (`as_sent`, `deliveredNotAsSent`, F2, unchanged).
  * `adapter-bank-db.ts` / `memory-bank-db.ts`: a write step stores `ask.record`, then answers with the row the store reports (`{ ...classified, vault: BX.writtenVaultOf(ask, stored) }`). Memory answers its copy.
  * IndexedDB (`idb-bank-db.ts`): `storeAt` puts, then reads the row back in the same transaction.
  * Postgres (`bank-functions.sql`, regenerated `src/bank-functions.ts`): each write statement `RETURNING safebyok_record(to_jsonb(<alias>)) INTO <out>`; the client substitutes via `BX.written*Of`, dropping its `revision_tok: ask.record.revision_tok` pins.
  * Battery: `tests/test-helpers/bank-db-battery-stored.ts`, `describeStoredOtherwise`, registered when a test file passes the optional hook `_cheat_storeOtherwise(bankDB)` ("from now on, store otherwise"). Seven cases (buildBank, a gate verb, delBank, vault put born/replaced, vault del, box put born/replaced, box del), each asserting the answer's `val` is the stored row and the rows read back agree. `TH.storedOtherwiseOf(row)` appends `TH.StoredOtherwiseSuffix` ('.stored') to `revision_tok`: the row stays valid and addressed, so only the delivery's revision pin can bite.
  * Doubles: Memory spies its shelf and box maps; IndexedDB spies `IDBObjectStore.prototype.put`; Postgres installs a BEFORE INSERT OR UPDATE trigger on the four tables, dropped at test end.
  * Core `vault-boxes.test.ts`: the delivery refuses `storage_issue` when the stored record disagrees with the record sent.

* **Decisions taken**
  * The delivery's refusal is proven once, in core: the listing's judgment does not depend on the adapter. The battery proves each adapter answers with what it stored.
  * The hook is optional, like `makeCappedBankDB`'s siblings: an adapter whose datastore cannot be made to store otherwise skips the describe rather than registering skips.

* **To do** (in order): Convex (component returns the written docs; client substitutes), GraphQL (delegates to the server adapter's hook), the docs (part 2), changeset, justify.

* **Safety hatches**: `idb-bank-db.test.ts`, `// eslint-disable-line @typescript-eslint/unbound-method` on `const { put } = IDBObjectStore.prototype`: the original is held to be called with the store as `this` inside the spy.

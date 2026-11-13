# Thread 24: stored_record (2026-11-13)

Branch `20261113-stored_record`, PR #694 (draft, by instruction), stacked on #693. Justify: green; scripts 287, core 2970, IndexedDB 200, Postgres 215, fastkey 43, react 262, Convex 306, demo 99, GraphQL 417, e2e 540.

The Coach (2026-11-13): the classifier's write branch answered `box: ask.record`, the record sent, where it should answer the stored record, the row the datastore reports holding. Repair it in every bankDB; reword the contracts so "the stored record" (what the datastore contains, as fetched or written) and "the record sent" (what the caller asked to store) are never confused.

* **Built**
  * `bank-classifier.ts`: the classifier decides the act and returns the rows it fetched, every act alike. It no longer stands in for storage. New `BX.writtenBankOf / writtenGateOf / writtenVaultOf / writtenBoxOf(scope, raw)`: a row an adapter reports writing, checked as a bag and for its address (`RowOfOtherAddress`), never for agreement with the record sent; that is the delivery's to judge (`as_sent`, `deliveredNotAsSent`, F2, unchanged).
  * `adapter-bank-db.ts` / `memory-bank-db.ts`: a write step stores `ask.record`, then answers with the row the store reports (`{ ...classified, vault: BX.writtenVaultOf(ask, stored) }`). Memory answers its copy.
  * IndexedDB (`idb-bank-db.ts`): `storeAt` puts, then reads the row back in the same transaction.
  * Postgres (`bank-functions.sql`, regenerated `src/bank-functions.ts`): each write statement `RETURNING safebyok_record(to_jsonb(<alias>)) INTO <out>`; the client substitutes via `BX.written*Of`, dropping its `revision_tok: ask.record.revision_tok` pins.
  * Convex: each write mutation of the component (`src/component/banks.ts`) reads back the docs it wrote, in the mutation, and answers them as `written` (null where it wrote nothing); `putBox` answers `roomless` beside it. The `write*Doc` helpers return the row read back. `validators.ts`: `gateWritten / bankWritten / vaultWritten / boxWritten / boxPutWritten` carry `written`; `buildBank` gets its own `bankBuilt`. The client (`convex-bank-db.ts`) classifies the fetched rows, then substitutes `BX.written*Of(ask, written.*)`.
  * GraphQL: no source change; the server's adapter answers, and the client passes it through. Its tests wire the hook through a Postgres trigger on its own PGlite.
  * Battery: `tests/test-helpers/bank-db-battery-stored.ts`, `describeStoredOtherwise`, registered when a test file passes the optional hook `_cheat_storeOtherwise(bankDB)` ("from now on, store otherwise"). Seven cases (buildBank, a gate verb, delBank, vault put born/replaced, vault del, box put born/replaced, box del), each asserting the answer's `val` is the stored row and the rows read back agree. `TH.storedOtherwiseOf(row)` appends `TH.StoredOtherwiseSuffix` ('.stored') to `revision_tok`: the row stays valid and addressed, so only the delivery's revision pin can bite. Each adapter's new cases fail against its old source.
  * Doubles: Memory spies its shelf and box maps; IndexedDB spies `IDBObjectStore.prototype.put`; Postgres and GraphQL install a BEFORE INSERT OR UPDATE trigger on the four tables, dropped at test end; Convex spies the `asyncSyscall` getter and alters `1.0/insert` and `1.0/replace` args.
  * Core `vault-boxes.test.ts`: the delivery refuses `storage_issue` when the stored record disagrees with the record sent.
  * Wording (part 2): `notes/answer-contract.md` (Returning, gate ops, the adapter's role, Responding), `notes/deliver-contract.md` (*What an answer carries* defines both terms; the `as_sent` row; F2; open item 3), the `GateAnswer / VaultAnswer / BoxAnswer` doc blocks in `bank-db.ts`, the fielding doc in `shapes-enums.ts`, `deliveredNotAsSent` in `throwers.ts` (its pins are the scope and the revision and life tokens, not the whole record), and the verbs' banner comment in `gate-listing.ts`.
  * Review rework: `BankListing.build` checks `answer.parent` against the bank record sent and `answer.val` against the gate sent, under `born` and `reborn`, by scope plus `revisionPins` (no field-by-field compare), throwing `deliveredNotAsSent('as_sent', ...)` as a delivery refusal. The check is the new exported `demandDeliveredAs` in `listing.ts`, which `#answerDeliveringOf` now calls too, so the two share one copy. Under `passed` the rows are the live bank's and are not checked against the sent. Proven in `device.test.ts` (`device.ensureBank`): a `tryBuildBank` answering `parent` or `val` stored otherwise refuses `storage_issue` and lists no bank; both cases fail without the check.
  * Changeset `.changeset/20261113-stored_record.md`, minor: Postgres functions to rerun, Convex component to redeploy, the testing additions.

* **Decisions taken**
  * The delivery's refusal is proven once, in core: the listing's judgment does not depend on the adapter. The battery proves each adapter answers with what it stored.
  * The hook is optional, like `makeCappedBankDB`'s siblings: an adapter whose datastore cannot be made to store otherwise skips the describe rather than registering skips.
  * `as_sent` keeps its name: the stored record is checked *as sent*, against the record sent, which still reads right.
  * `reqval` in the answer contract's tables now names the record sent that the stored record must agree with; the tables are otherwise untouched.
  * VOCABULARY.md defines neither phrase and uses "stored record" only in the persisted sense: no edit.

* **Deviations**
  * Convex grew where the handoff expected simpler code: a Convex mutation's `db.insert` returns only an id and `db.replace` nothing, so the component reads each written doc back (`db.get`) to report what it stored, and needs a validator per answer shape to carry it (+41 lines net over component, validators and client). Elsewhere: the classifier +25 (the four `written*Of` checks, against the write branches it dropped), the SQL +6 (`RETURNING ... INTO` and a variable per function), Memory +5, IndexedDB even, the Postgres client -6.
  * GraphQL's test trigger helper duplicates Postgres's: graphql runs its own PGlite and does not import Postgres's test helpers.

* **Discoveries**
  * The e2e batteries (`e2e/tests/{graphql,convex,postgres}`) do not pass `_cheat_storeOtherwise`, so they skip the seven cases; the packages' own batteries carry them.
  * Agreement is checked by tokens alone (deliver-contract open item 3): a datastore that stored another value under the same revision and life tokens would pass.
  * `notes/guarantees.md`: none of the files changed is under *Where the guarantees are kept*, and no line of it is falsified.

* **Safety hatches**: `idb-bank-db.test.ts`, `// eslint-disable-line @typescript-eslint/unbound-method` on `const { put } = IDBObjectStore.prototype`: the original is held to be called with the store as `this` inside the spy.

# vault_manifest: progress

The orchestrator's curated summary of what the threads have taught. Newer than the plan wherever they disagree.

## Rulings so far (2026-11-26, in chat)

* The new core's code is the contract; report where it differs from a doc or first principles.
* Answers carry the actual row, for every verb: never `ask.record`.
* Words: actual (returned), ante (in the datastore at the start), proposed (the ask's value, in prose; `WriteAsk.record` keeps its name for now).
* Postgres keeps Things in columns (it does). Convex is restructured to typed per-kind tables.
* `damaged_row` is renamed `incompatible_row` (Open Matters).
* Red PRs are green-lit: threads 1–2 may land red in idb, postgres and convex, mended by 3–5.
* Tags spell their fieldname; `'same'` rather than `'kept'`.
* The address check moves into `demandThreeWayConsistency` ("for comfort").
* Banktok: aspirational; will later hard-scope every record. No comparison now.

## Orchestrator's YOLO calls

* `lifepath_eq`, not the Coach's `lifeseq_eq`: the comparison is of the lifepath (and `am`, which folds out of `presence`).
* `MemoryDatastore`, not `MemoryVaultStore`: VOCABULARY.md has no `store` noun.
* The manifest carries `banktok`, not the bank row.
* `EX.StoragePolicy` stands for the Coach's `PolicyTag`.

## Threads

(none yet)

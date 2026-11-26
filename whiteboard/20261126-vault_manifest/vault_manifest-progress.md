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
* All seven Open Matters rows ruled (took the Recs). Open Matters is read again only once new rows are added.
* A Closer Look runs once threads 3, 4 and 5 have filed.

## Orchestrator's YOLO calls

* `lifepath_eq`, not the Coach's `lifeseq_eq`: the comparison is of the lifepath (and `am`, which folds out of `presence`).
* `MemoryDatastore`, not `MemoryVaultStore`: VOCABULARY.md has no `store` noun.
* The manifest carries `banktok`, not the bank row.
* `EX.StoragePolicy` stands for the Coach's `PolicyTag`.

## Threads

(none yet)

### Thread 1, manifest_things (ready, #934)

* `doGetThing`/`doWriteThing` return `GetManifest`/`WriteManifest` (`src/shapes/shapes-manifest.ts`); datastores build tags with `ManifestTags`, exported from `safebyok/storage`.
* `Received.banktok` is `unknown`; the watch checks it with `checkedBanktokOf`, so an adapter's watch need not call `Classifier.banktokOf`.
* One consistency function per verb (`demandGetConsistency`, `demandWriteConsistency`): Open Matters.
* The ancestor is checked whole, address and all, when read: the shell is built from it. Open Matters.
* *Orchestrator:* a three-way check only our code can fail refuses `unexpected_error` (thread 2 switches `answerOfOtherManifest`).
* The demos' `LocalStorageVaultDB` overrides `doWriteThing`; it takes its ckey from `MemoryDatastore.ckeyOf`.

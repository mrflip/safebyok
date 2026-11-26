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
* Ruled: one consistency function per verb, each calling a shared function for the checks every verb shares (thread 2 builds it, and moves thread 1's onto it). The ancestor stays checked whole when read. Every `damaged_row` check becomes `incompatible_row` (thread 7).
* *Orchestrator:* thread 1's review found MemoryDatastore's write predicate narrower than Postgres's `WHERE` (no `fmt`, no `lifeseq_ok`): a datastore's predicate copies its model's `WHERE` clause by clause, every ante field it reads. Threads 3 and 5 check theirs against `writeFunctionOf` the same way.
* *Orchestrator:* a `policied` refusal is a scribed act, not a throw, so it carries the step's real banktok, tracked and read_tc (kept, YOLO; Coach row).
* *Orchestrator:* filing a red-by-ruling thread: `scripts/file-thread --prove` with lint, typecheck and test over every package but safebyok-indexeddb, safebyok-postgres, safebyok-convex and the dojo demo (which typechecks against safebyok-indexeddb's source). Threads 1 and 2 file this way; their PRs stay drafts until threads 3–5 make the line green.

### Thread 2, manifest_rest (ready, #937)

* Every verb on the manifest; each `demand*Consistency` calls `demandSharedConsistency`. `notes/vault-adapter-contract.md` is the datastore author's one document; `MemoryDatastore` the TypeScript reference.
* A manifest with no `banktok` key refuses `storage_issue`; a present-but-malformed banktok answers void (a damaged bank row's `ManifestTags.banktokOf` is undefined).
* `TrackedRows` exported top level from `safebyok/storage`.
* *Orchestrator:* thread 2 compacted four times at medium size: the manifest work is context-heavy. Threads 4 and 5 run on `thread-worker-400k`.

### Thread 3, idb_manifest (ready, #939)

* `IdbDatastore` (`packages/safebyok-indexeddb/src/idb-datastore.ts`, unexported): one `DB.inOneStep` transaction per verb, a manifest back; the quota refusal, the bell and the BroadcastChannel watch live there; a ring follows a commit whose `tags.written` is true. `idb-vault-db.ts` is the options check and one line per `do*`.
* `isWritable` and `isBirthWritable` are exported from `safebyok/storage`: a datastore running TypeScript in its step (Convex, thread 5) reuses them rather than copying.
* The dojo demo needed no change; it was red only through safebyok-indexeddb.

### Thread 4, postgres_manifest (ready, #940)

* Each SQL tag function in `vault-functions.ts` names the TypeScript function it copies; the ask's flags are a clause of the write predicate; banktok copies `ManifestTags.banktokOf` (void lifetok for no bank row; key always kept).
* `PolicyPhrases` exported from `safebyok/storage`: one copy of each policy message, filling the SQL.
* Hosts upgrading drop every `safebyok_a010501_r000_*` function first (the changeset's snippet); no `SqlRevision` bump before 1.0.
* *Orchestrator:* a network outage (EAI_AGAIN, ~06:06Z) stopped threads 4 and 5 and thread 3's push; resumed with SendMessage, no work lost.

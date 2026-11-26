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

### Thread 5, convex_manifest (filed, #941)

* Three tables mirroring Postgres's; each Convex function hands back a manifest via `ManifestTags`, `isWritable`, `isBirthWritable`. The watch reads `by_commit` across the three tables from one snapshot (no skip, no repeat).
* `ManifestTags.banktokOf` returns null for a bank row without a lifetok; the contract's "send null" line is gone.
* `read_tc` stays client-stamped (a Convex query's clock is frozen at its start; a cached result can return).

### After the threads (2026-11-26)

* *Orchestrator:* thread 4 rebased cleanly onto thread 5: the line is `1 → 2 → 3 → 5 → 4`.
* The Coach relaxed "a datastore reads no check and no act table": "It's not strictly important that other repos emulate the action/implementation of PG, only that they share a common contract/interface." He asked for a side quest on a dispatch table keyed by the tags (an opus explorer, read-only); plans otherwise unchanged until it reports. Thread 6 waits for it and for the Closer Look triage.
* The Closer Look (at 517463cf4) is in the doc's tab; its E1 (a write may land over an incompatible ante row) needs a ruling.
* The line passes `pnpm justify` at f0ef7e1b9 (thread 4's tip, on thread 5); all five PRs out of draft.
* The Coach, on refusals: "refusals might best come back from the adapter as a refusaltag matching a Phrases element, with a lookup table for refusalkind sent to a function that prepares an error with its loggable ask/manifest, the refusalkind and phrase". Folded into the side quest's brief.
* Why Postgres 18: `uuidv7()` for every statement's `read_tc` and `tell_thing`'s (on main already); thread 4 added `RETURNING WITH (NEW AS written)` so the UPDATE's alias can be `ante` while its returned row is `written`: cosmetic, droppable if 18 ever bites.
* *Orchestrator:* the dispatch side quest reported (sketches in `dispatch/`). Recommended: several exact-keyed tables (`RevisionGrid` revtok_cmp × revseq_cmp, `MatchActs`/`StaleActs[op][presence][flag]`, `GetActs`, a policied map, `brokenOf`): about 14 table lines, the act decision's branches 33 → 11, equal to today's on all 67,392 tag combinations. One ordered first-match table (24 rows) and per op × presence tables (about 54 rows) were weighed and passed over. `isWritable` stays the hand copy of Postgres's `WHERE` (a table is looser for an ask that skipped `checkedWriteAsk`). Found: a written manifest's tags are not cross-checked against `written` (broken state only; three-way's). Refusal tags: the base class scribes a refusaltag beside the act, replacing the three policied throwers and `policiedRefusalOf`. Awaiting the Coach's rulings (Open Matters); thread 6 still held.
* The Coach, on every Open Matters row (2026-11-26, chat): "go ahead woth it all, great news, and yes policy tags". *Orchestrator:* read as: every row's Rec taken, except policy verdicts as phrase tags, which he took against the Rec. So decomposition B and the policied refusal builder are thread 8 (`act_tables`), policy tags thread 9 (`policy_tags`); the 18-thrower move waits for a later ruling; the self-contradicting listing manifest stays `storage_unavailable` (leave the order); a policied refusal keeps the real banktok, tracked and read_tc; Postgres hosts drop the old functions. The ground rule "a datastore reads no check and no act table" becomes "datastores share a contract, not an implementation"; the write predicate stays a hand copy (orchestrator's call, Cleanup).
* *Orchestrator:* base-sync bailed after thread 9: the base stands on the open adapter_port line (#932, #935, #936, #938), which edits `thing-classifier.ts` (crossed-refusal helpers) where this line deletes it. Base left as it was (snapshot `.git/base-sync/20261126T191442Z`). TOP row for the Coach: which line merges first; Rec this one, adapter_port restacked onto it.
* The Coach (2026-11-26, chat and doc): keep `PolicyTag` ("its refusals are named for it, just as the Phrase is named for the Refusaltag"). On the collision: "stack yours on theirs, you have a better handle on what's modern. Revert or integrate as makes sense, their run was less supervised". *Orchestrator:* the line is restacked onto adapter_port's top (`main → #932 → #935 → #936 → #938 → #913`), so it reads `… → #913 → #934 → … → #945 → #946 → #933`. Where adapter_port's crossed-refusal work (`refusedOverWire`, `crossedErrOf`, `crossedRefusedWriteOf`, `crossedRefusedBirthOf` in `thing-classifier.ts`, `throwers.ts`, `shapes-crossed.ts`, `storage.ts`) meets the manifest, it is ported onto the manifest flow, or reverted where the manifest makes it moot.

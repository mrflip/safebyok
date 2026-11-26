# vault_manifest: plan

* **Date:** 2026-11-26 · **Mode:** YOLO · **Issued by:** the Coach (Philip), in a design talk, then `/sprint YOLO /turbochat`
* **Default levels:** review `medium`; worker `thread-worker` on its own model and effort; reviewer `thread-reviewer` on its `sonnet` pin; style pass `style-reviewer` on its `sonnet` pin
* **At once:** 3 threads
* **Sprint doc:** https://claude.ai/artifact/NJ79cHNaiWKs2MNcRPegmD (State enum `284c80a7-3a91`; Open Matters body `6515179e-17ac`, Cleanup `d7cdbdea-e78f`, Progress `98e00e1b-46fc`, Resolved `fa82f351-58d7`)
* **Status:** threads 1–5 filed and out of draft; the line `#934 → #937 → #939 → #941 → #940` passes `pnpm justify` at f0ef7e1b9. Threads 8 and 9 filed (#942, #943); thread 6 in review (#944); then 7 and 10

## Read first

* `whiteboard/20261126-vault_manifest/vault_manifest-design.md`, whole. It is the design; this plan schedules it.
* `notes/answer-contract.md`, *Rules* > *Revisions* and *Operations* (the get, put and del tables): the tags are its columns.
* `notes/gallant.md`: `#pass-it-whole`, `#no-bouncing`, `#impossible-is-a-broken-system`, `#use-what-you-parse`, `#callee-parses`.
* `VOCABULARY.md`: *Verbs, by how precise they are* and *Words safebyok does not use*; the *storage, datastore* and *damaged* rows.
* `notes/transition.md`, before exporting from the new core or reaching for something big has.

## Ground rules

* **The new core's code is the contract** (the Coach, 2026-11-26: "The code in safebyok is your reference for contract, if those differ: I'm happy with how it is operating. (But do still report if it differs from your first principles reasoning or one of our docs)"). A thread changes how an answer is made, never what a working vaultDB answers, except where the design says so. A difference from a doc or from your own reasoning is reported, in your thread file's *Open matters*.
* **Readability and correctness are paramount, not compute, not LOC** (the Coach). Count branches; one plain straight-line function per verb.
* **Validate the ask once, at the entry**; past it, helpers take `ask` or `(ask, manifest)` (or a `Pick`) and neither re-validate nor null-check what the types exclude.
* **Datastores share a contract, not an implementation** (the Coach, 2026-11-26: "It's not strictly important that other repos emulate the action/implementation of PG, only that they share a common contract/interface."). The base class never looks inside a datastore. The datastore's write predicate (`isWritable`, `isBirthWritable`, Postgres's `WHERE`) stays a clause-by-clause hand copy, never a table lookup; its overlap with the base class's act is what the three-way check costs: never optimize it away.
* **Words**: actual, ante, proposed, stored, manifest, incompatible, as the design's *Words* table has them. `store` is not a noun; no keep/kept/hold. `WriteAsk.record` keeps its name.
* **Red, then mended.** Threads 1 and 2 change `AdapterVaultDB`'s `do*` signatures, so `safebyok-indexeddb`, `safebyok-postgres` and `safebyok-convex` fail to typecheck until threads 3, 4 and 5 port them. A worker on 1 or 2 is ready when `packages/safebyok` passes and `pnpm justify` is red only in those three packages; its PR body names what is red and the threads that mend it. Threads 3 to 5 bring `pnpm justify` back to green.

## Threads

The Coach issued the design rather than numbered threads. Each thread quotes the Coach's words that bear on it, verbatim, then the orchestrator's gloss.

### 1. manifest_things — the Manifest, and get and write on it

> "1. Tag the result (lifeseq ahead, behind, equal; lifetok eq/ne;... op; presence) in the backing store onto a partial Actual object 2. in the parent class, Use those tags to cleanly accrue properties onto Actual and finally dispatch to a function that strips it to an answer. 3. Validate the ask at the start, and out of the db. Most methods should have ask or (ask, actual) (or a pick if it's more readable to be specific) -- meaning they don't need to revalidate and definitely don't need to nullcheck"
>
> "The returned record (Val or dbhas) should always be the actual row exactly as it sits in the db at the final read snapshot (close of the transaction, preferably)."
>
> "I propose the carrier of the tags, data and metadata be a Manifest (rather than Actual as I just proposed); wherever reasonable, its structure should resemble the Answer."
>
> "For policies you'll want a Record<PolicyTag, {ok:false,message:string}|{ok:true}> with each policy in the ask answered."
>
> "I know it's gauche function to write on ones arguments, but using the manifest as an accumulator may work cleanly -- the method to determine an act scribes it on the manifest directly so that the caller isn't doing spread surgery or using a mutable variable."
>
> "Is MemoryVaultStore the one that returns a manifest and then MemoryVaultDB is calling "functions" on it as Postgres and Convex do? I like that a lot. Make clear that the MemoryVaultStore is infallible as far as our code is concerned; a record that fails validation ("damaged") should really be regarded as incompatible."
>
> "Move the redundant verification of the ask against the manifest, and consistency checks within each into a demandThreeWayConsistency(ask, manifest, answer) method. That doesn't mean move every safety check, or even every repeated check. It means that if the one line were commented out, you'd say the precondition, postcondition and any intermediate checks were conservatively prudent; with the call you'd say "overkill, but justifiably for a nascent code base""

*Gloss.* Touches `packages/safebyok/src/shapes/` (a new `shapes-manifest.ts`: `WriteTags`, `PolicyVerdict`, `GetManifest`, `WriteManifest` and their scribed narrowings), `src/storage/` (the shared tag functions, likely `manifest-tags.ts`; the act scribing and answer functions for get and write; `demandThreeWayConsistency`; `adapter-vault-db.ts`'s `tryGetThing` and `tryWriteThing` and their abstract `do*`; a new `memory-datastore.ts` and a slimmed `memory-vault-db.ts`), `src/refusals/throwers.ts`, `src/phrases.ts`, and the vaultDB battery and `tests/storage/`. `MemoryDatastore` gets all six functions now; its list, birth, world and stats return today's fetched shapes until thread 2 (each marked "Scaffolding: until thread 2 (manifest_rest)"). The born_at, lifetok and policy `demand*` throwers become tags and scribed `policied` acts. `StoredCited` and the `stored*` picks go where get and write were their only readers. Tests: the battery must pass unchanged in what it expects of answers; add unit tests of `scribeWriteAct` row by row against the put and del tables (PV1…DL9, as the new core's code reads them), and of `demandThreeWayConsistency` with a doctored manifest per check.
*Levels:* worker `thread-worker-400k`; review `high` on `opus`; style pass `opus` (it sets the words every later thread copies).
*Depends on:* nothing; cut from `origin/main`.
*Look-ahead:* thread 2 copies its pattern for the other verbs, and threads 3–5 implement its `do*` contract: keep the manifest types and the tag functions exported from `safebyok/storage`, documented as a datastore's contract.
*Size:* large; the largest in the sprint. If it nears its cap, stop after the write verb and report what remains.
*Status:* ready 2026-11-26, PR #934; one compaction (~366k), just before its readiness check. Red only in the three adapters. Deviations: one consistency check per verb; the ancestor checked whole, address and all, when read; a `policied` refusal carries the step's real banktok, tracked and read_tc; a write over an incompatible row is written where its cited revision matches (the reviewer weighs it); a void get under an incompatible ancestor refuses `damaged_row`; the demos pulled forward.
*Review:* flagged (opus, high), 7 fixes: MemoryDatastore's `isWritable` now copies Postgres's `fmt` and `lifeseq_ok` clauses (it overwrote rows of another format); distinct policies counted in `demandTagsOfAsk`; `ante` for `stored` in three throwers; doc and style fixes. Significant, left: a `policied` refusal now carries the real banktok, tracked and read_tc in a working vaultDB; kept (YOLO), Open Matters TOP. Minor: m1 missing manifest banktok, m6 types into shapes, m7 `checkedBanktokOf` rename, m8 destructure spelling, m9 interfaces → thread 2; m3 `unexpected_error` → thread 2; m4 ancestor → Coach accepted; m10 security-note wording → amended before filing; m11 VOCABULARY → thread 6; m2, m5 stand.

### 2. manifest_rest — list, birth, world and stats on the Manifest

> "Postgres should actually be your model, one transaction handing back a Manifest in whole"
>
> "The line about outcome deserves more nuance. The adapter records all *observations* of the transaction and snapshot. That tells you what *it* based its actions on. The VaultDB prepares an answer based solely on those observations. Finally, the parent class does three way consistency of the answer, manifest and ask."
>
> "Banktok is aspirational right now but will later on hard scope every record"

*Gloss.* The rest of `AdapterVaultDB`'s verbs (`tryListThings`, `tryBirthBank`, `tryGetWorld`, `tryStats`) and their `MemoryDatastore` functions, on thread 1's pattern; removes the Scaffolding thread 1 left and whatever of `thing-classifier.ts` and the `Actual` types and `ActualChecks` nothing reads any more (the module may be renamed for what it becomes). Writes the new core's adapter contract, the three roles of the design, as a new note (`notes/vault-adapter-contract.md` is a fair name) that `notes/answer-contract.md`'s *Adapter contract* points to as safebyok-big's. Fixes the doc drift the design lists: `BadAct`'s doc block (lifetok refuses `policied` too) and `AskChecks`'s "a vaultDB checks it, and nothing more" of banktok.
*Levels:* defaults; review `medium`.
*Depends on:* thread 1; cut from its tip once it is ready.
*Look-ahead:* threads 3–5 port to the contract note this thread writes.
*Size:* medium.
*Review:* fixed (opus, medium), 7 fixes (style; `scribeBirthAct`'s double act; `PutTableTags` inlined; the contract note's write-predicate, banktok and refusal-table text). Left: banktok key presence → thread 5 (`banktokOf` returns null); a self-contradicting listing manifest answers `storage_unavailable` → Open Matters; doc and naming leftovers → thread 6; the rest stand.
*Status:* filed 2026-11-26 at f8c6fa0b0; ready was PR #937; four compactions (the last just before its readiness check). Built `demandSharedConsistency` per the Coach's ruling and thread 1's review directives; `notes/vault-adapter-contract.md`. Narrowed m1 to a missing banktok key (my call: accept).

### 3. idb_manifest — IndexedDB onto the Manifest

> "then work on Convex. Memory is weird and confusing because I haven't drawn a sharp enough line for you"

*Gloss.* `packages/safebyok-indexeddb/src/idb-vault-db.ts`: each `do*`'s transaction body becomes its datastore function, returning a manifest as `MemoryDatastore` does. Its own tests and the battery over it pass.
*Levels:* worker `sonnet`; review `low`.
*Depends on:* thread 2. *Orchestrator:* takes the dojo demo too (it imports safebyok-indexeddb).
*Look-ahead:* none.
*Size:* small.
*Status:* filed 2026-11-26 at 517463cf4 (PR #939).
*Review:* fixed (sonnet, low): three doc blocks trimmed. Left: `isWritable` doc blocks and `written` → `isWritten` → thread 6; `readTc` order stands.

### 4. postgres_manifest — Postgres hands back a Manifest whole

> "There should not in general be an assumption of a separate read (your two types) -- the Postgres adapter should actually be your model, one transaction handing back a Manifest in whole"
>
> "Is Postgres storing a thing in columns or a json blob? In all stores that have the notion it should be a s columns (whisper_sealed, sidecar and wayins are blobs)." (It is columns already.)

*Gloss.* `packages/safebyok-postgres/src/`: each statement returns a manifest. The write functions in `vault-functions.ts` return the tags (constants on the written branch, worked out over the read-back row on the unwritten one) and the policies as a jsonb object of verdicts whose messages come from the same phrases as `storage/policies.ts`; `vault-queries.ts` returns tags for the reads; the ancestor subquery runs only where it is read. `postgres-vault-db.ts` loses `mayWrite`, `writtenActOf` and the TS re-run of the act tables after a refusal; each `do*` is one statement. Every check stays in the SQL (the design, *Per datastore*). No `SqlRevision` bump before 1.0 (`vault-functions.ts`'s header).
*Levels:* worker `thread-worker-400k` (*Orchestrator:* thread 2 compacted four times at medium size); review `high` on `opus`: the SQL is the trust boundary behind GraphQL.
*Depends on:* thread 2.
*Look-ahead:* thread 5 copies its manifest shape over Convex.
*Size:* medium-large.
*Status:* ready 2026-11-26, PR #940; cut off once by the network outage while proving, resumed. Deviations: the policy clause applies over any live gate (as the TypeScript); a missing wayins key fails a policy in SQL, passes in TypeScript (incompatible rows only); a write function out of step refuses `storage_issue` (three-way) not `unexpected_error`; the write functions' signatures change, so the changeset tells hosts to drop every `safebyok_a010501_r000_*` function before rerunning; `PolicyPhrases` exported.
*Review:* fixed (opus, high), 5 fixes: `PolicyPhrases` moved to `src/phrases.ts`; the Postgres-18 header and README (predates the thread); test names and titles; style. Checked the predicate clause for clause, tags, quoting, REVOKE. Left: phrases baked into the SQL (stands); `StoredNothing` hint gone (stands); header's privilege sentence, README's "beside the old ones", doc blocks, a long title → thread 6.
*Status:* filed 2026-11-26 at d2b6998a8.

### 5. convex_manifest — Convex in typed tables, onto the Manifest

> "I agree -- postgres columns sounds right. Convex should be restructured."

*Gloss.* `packages/safebyok-convex/src/component/` (`schema.ts`, `things.ts`, `validators.ts`) and `src/convex-vault-db.ts`: one table per kind with a typed field per column, as Postgres's tables have, `v.any()` only where Postgres has jsonb; each mutation and query returns a manifest, its tags worked out in TypeScript inside the Convex transaction as `MemoryDatastore` does. A stored-format change before 1.0: no migration, and the changeset says a host's existing Convex vaults read as absent. The watch's `by_commit` cursor works across the three tables.
*Levels:* worker `thread-worker-400k` (*Orchestrator:* as thread 4); review `medium`.
*Depends on:* thread 2.
*Look-ahead:* none.
*Size:* medium-large: if the table split and the manifest port will not fit one context, split the table restructure into a thread of its own and report.
*Review:* fixed (opus, medium), 2 fixes (validators' doc blocks, README's field list). Cross-table watch cursor sound; client `read_tc` sound; the timeouts were load. Left: the damaged-bank battery case hollow for Convex and Postgres → thread 6; `banktok: null` on the watch's first empty result (stands).
*Status:* filed 2026-11-26 at f82c00e20. Ready was PR #941, rebased onto thread 3 (517463cf4). Three tables mirroring Postgres's; the watch reads `by_commit` across all three; `banktokOf` returns null (the directive); read_tc stays client-stamped (thread E's reason); the damaged-bank plant drops fields the table lacks; a write disagreement refuses `storage_issue`.

### 8. act_tables — the act decided by tables, refusals by tag

> "I'd actually be quire pleased to use a dispatch table if it simplified: looking up 'put-eq-moot-neq...': { ok: false, act: "...", thrower: <thrower func>, ... } would significantly reduce the complexity."
>
> "refusals might best come back from the adapter as a refusaltag matching a Phrases element, with a lookup table for refusalkind sent to a function that prepares an error with its loggable ask/manifest, the refusalkind and phrase"
>
> "important for the table opus to not axiomatize "one table" -- there are a few ways to decompose it (operation and present/absent are key) -- and definitely there are a few places where a table can make it simpler"
>
> "go ahead woth it all, great news, and yes policy tags"

*Gloss.* *Orchestrator:* the side quest's decomposition B, from `whiteboard/20261126-vault_manifest/dispatch/split-tables.ts` (its sketch) and `dispatch/split.test.ts` (the equivalence test that checked it against the old tree on all 67,392 tag combinations; run it once against the tables before the old tree goes): in `packages/safebyok/src/storage/manifest-acts.ts`, `RevisionGrid` (revtok_cmp × revseq_cmp → match, stale, retcon, clash, forked, ahead), `MatchActs[op][presence][flag]`, `StaleActs[op][presence][flag]`, `GetActs[presence][ifAbsent]`, the policied map and `brokenOf`, leaving about eleven branches. Port the equivalence test as a test of the tables against the answer contract's get, put and del tables (not against the old tree, which goes). The base class scribes a refusaltag beside the act, naming a `Phrases` element; a lookup gives its refusal kind; one function builds the error with the refusal kind, the phrase and the loggable ask and manifest. It replaces the three policied throwers and `policiedRefusalOf`; export big's `RefusalkindForVaultAct` through `safebyok-big/internals` if the lookup needs it (`notes/transition.md`). Other throwers stay as they are (moving 18 of the 39 onto the builder is a later ruling). One check: a written manifest's tags cross-checked against `written` in three-way (presence `live` + revtok `birth` + `written` now passes as `replaced`; broken state only). The self-contradicting listing manifest's `storage_unavailable` stays (the Coach took the Rec: leave the order). No answer of a working vaultDB changes.
*Levels:* worker `thread-worker` (judgment); review `medium`.
*Depends on:* the line through thread 4 (`20261126-postgres_manifest`).
*Look-ahead:* thread 9 makes the datastores' policy verdicts phrase tags fed to this builder: shape the builder to take a policy's phrase tag as it takes an act's.
*Size:* medium.
*Review:* fixed (opus, medium), 5 fixes (scribeWriteAct's policied branch, doc blocks one fact a sentence, a test's impossible birth refusal, two test nits). `demandTagsOfAsk`'s removal holds. Left: the throwers header's "a new refusal gets a new thrower" → the later 18-thrower ruling; "tag" meaning two things → Open Matters; `FlagActs` beside its tables (stands).
*Status:* filed 2026-11-26 at a1b017830; PR #942 out of draft. Equivalence run in scratch: 984,960 write combinations, 0 mismatches. `Throwers.taggedRefusal` replaces `gateIssue`, `bornAtNotStored`, `lifetokNotStored`, `policiedRefusalOf`; `ListActs` added; `demandTagsOfAsk` removed (subsumed by `writtenTagsOf`).

### 9. policy_tags — policy verdicts come back as phrase tags

> "go ahead woth it all, great news, and yes policy tags"

*Gloss.* *Orchestrator:* each datastore returns a policy's verdict as a tag naming its `PolicyPhrases` element (`{ ok: false, phrasetag }`, or the shape thread 8's builder settles) rather than a message string; the base class builds the message and the error through thread 8's builder. Touches `notes/vault-adapter-contract.md`, `shapes-manifest.ts`'s policies type and its check, `MemoryDatastore`, `IdbDatastore`, Postgres's `vault-functions.ts` (the SQL no longer filled with `PolicyPhrases`' messages) and Convex's `things.ts`. A contract change for adapter authors: the changeset says so.
*Levels:* worker `thread-worker-400k` (four adapters); review `medium`.
*Depends on:* thread 8.
*Look-ahead:* none.
*Size:* medium.
*Review:* fixed (opus, medium), 1 fix (`policyFailureOf`'s doc block). Convex and idb verified to follow through `ManifestTags.writeTagsOf`; the host's message verified unchanged. Nothing left.
*Status:* filed 2026-11-26 at 376ba8af9 (rebased onto thread 8 at a1b017830); PR #943 out of draft. The verdict is `{ ok: true } | { ok: false, refusaltag }`; MemoryDatastore, IdbDatastore and Convex needed no edit (they build through `ManifestTags`).

### 6. actual_words — "stored" sorted into actual, ante and stored

> "I asked because I think agents are taking an ambiguity: the "stored" record is not "the one that was stored", it is "the one that the store now holds". That means you always get the ground truth of the data store, and it's the same rule for every read or write. The best term instead, I propose, is "actual record" rather than "stored record"."
>
> "Record: what do you think of proposed or asked for the value in the ask, ante or prior for what is in the data store at the start, and actual for what is returned?"

*Gloss.* *Orchestrator:* also the stale eslint config comments naming the deleted `storage/classifier.ts` (safebyok-indexeddb's and the dojo demo's; thread 3); a documentarian pass over the sprint's files (thread 2's review: "What a ..." first lines, steps listed in doc blocks, the listing copy check's doc block, `refusedroot` → `refusedrootckey`, two-behaviour test titles, a leftover `const manifest = raw`); the local `written` → `isWritten` in every datastore (STYLE's boolean rule; thread 3's review); `isWritable`/`isBirthWritable`'s doc blocks for the datastores that share them. A manual sweep of the remaining uses of "stored" (about 500 bare uses at the start of the sprint) in `packages/safebyok/src` and the three adapters, sorting each into actual, ante, proposed or stored (at rest) by the design's *Words* table; renames of identifiers that carry the word in the wrong sense; and VOCABULARY.md rows for **actual**, **ante**, **manifest** and **proposed**. No behaviour changes.
*Levels:* style pass `opus`; review `medium`.
*Depends on:* threads 3, 4 and 5 (they rewrite the same files); *Orchestrator:* now thread 9, the top of the line.
*Orchestrator:* the documentarian pass, the eslint comments and the other tidying items move to thread 10, after thread 7, so thread 6 is the "stored" sweep, the VOCABULARY rows, and the renames `written` → `isWritten`, `refusedroot` → `refusedrootckey` (and `PolicyTag` → `PolicyRefusaltag` if the Coach takes that Rec).
*Look-ahead:* thread 7 renames "damaged" in the same prose.
*Size:* medium, mechanical but judgment per use.
*Status:* ready at bc4adb0dd, PR #944; in review (sonnet, medium, opus style pass). Bare "stored" 540 → 309; `Refusaltag` values `BornAtMoved`, `LifetokMoved` (phrases reworded); `PerKindChecks.banktok`, `checkedLeaseOf`, `cheatPlant`; the deviceDB's "stored lease" kept as at-rest.

### 7. incompatible_row — the refusal kind renamed

> "Agree on renaming damaged row. incompat_row or incompatible_row? 16 chars is a lot."

*Gloss.* The name is `incompatible_row` (the Coach, 2026-11-26, Open Matters: "change all damaged_row checks to incompatible_row. I agree this is incompatible_row"). A new refusal kind in safebyok-big's errors (broadening big, as CLAUDE.md allows), used by the new core and its adapters in place of `damaged_row`, with `damaged_rows`, `DamagedThing` and VOCABULARY.md's *damaged* row renamed to match; `damaged_whisper` stays, since a whisper that will not unseal is damage. Big's own use of `damaged_row` stays. A public refusal kind changes: the changeset says so.
*Levels:* worker `sonnet`; review `low`.
*Depends on:* thread 6.
*Look-ahead:* none.
*Size:* small-medium, mechanical.

### 10. sprint_tidy — the sprint's doc blocks and leftovers

*Orchestrator:* no Coach text of its own; gathered from the reviews. A documentarian pass over the files the sprint changed (thread 2's review: "What a ..." first lines, steps listed in doc blocks, the listing copy check's doc block, two-behaviour test titles, a leftover `const manifest = raw`; `isWritable`/`isBirthWritable`'s doc blocks for the datastores that share them); the stale eslint config comments naming the deleted `storage/classifier.ts` (safebyok-indexeddb's and the dojo demo's); the Postgres header's privilege sentence and the README's "beside the old ones"; the battery's damaged-bank case made real for Postgres and Convex (thread 5's review: it is hollow there). Also from thread 6's report: "store" as noun and verb ("the store's limits", "the deviceDB stores"; the exported `StoreLimits` named, not renamed, without a ruling), and `notes/` where it says "stored" for actual or ante (`vault-adapter-contract.md`, `wontfix.md`, `storage-policies.md`). No behaviour change but the battery case.
*Levels:* worker `thread-worker`; review `low`.
*Depends on:* thread 7.
*Look-ahead:* none.
*Size:* small-medium.

## Line

*Orchestrator:* now `1 → 2 → 3 → 5 → 4 → 8 → 9 → 6 → 7 → 10`, the sprint PR on top. Was `1 → 2 → 3 → 4 → 5 → 6 → 7`. Threads 3, 4 and 5 run side by side from thread 2's tip and are restacked into the line before thread 6 is cut. *Orchestrator:* thread 5 rebased onto thread 3 (`1 → 2 → 3 → 5`), so only thread 4 needs restacking: `1 → 2 → 3 → 4 → 5` or `… → 3 → 5 → 4`, whichever conflicts less (both touch `safebyok/storage`'s exports). **A Closer Look** (`.claude/skills/sprint/closer-look.md`) runs once threads 3, 4 and 5 have all filed, before thread 6 is cut (the Coach, 2026-11-26).

## For the Coach

* Threads 1 and 2 land red in `safebyok-indexeddb`, `safebyok-postgres` and `safebyok-convex`; merge the line through thread 5 together (the Coach, 2026-11-26: "green light for red PRs.").

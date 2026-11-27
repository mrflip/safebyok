# vault_manifest: resolutions

Every matter the Coach ruled during the sprint, swept out of the doc's *Resolved* tab on 2026-11-27, each as the bullet put it: the matter, the orchestrator's recommendation (Rec), the Coach's answer word for word, the date, where it was asked and where the work went. "Coach (empty: took the Rec)" means the answer chip was left empty and the Rec stood. Newest batch first; within a batch, in the order the doc held them. All dates are 2026-11-26.

Doc: https://claude.ai/artifact/NJ79cHNaiWKs2MNcRPegmD (*Resolved* tab).

## Batch 8 (newest, 2026-11-27, in chat)

* **Closer Look E1: a write under a storage policy lands over a gate whose wayins fail their checks.** Asked: is "a write over an incompatible row refuses" a guarantee of the new core? If no, a wontfix row. Coach, in chat: "It is not a guarantee". 2026-11-27, Closer Look E1; a row in `notes/wontfix.md`, on #948.

## Batch 7

* **TOP: The graphql port loosened the core's datastore contract.** #947 rebuilt manifests from the server's answers and loosened the core to accept them; the explorer then proposed the manifest on the wire. Coach, in chat: "GraphQL is a VaultDB exactly inasmuch as it presents exactly the VaultDB interface. ... GraphQLVaultDB does not do any of the things an AdapterVaultDB does: it doesn't have to." Then: "yes, let's stick with the non-transforming pipe. I encourage such light consistency checks as you judge; it doesn't have to be blind, only transparent." And: "Do logical commits over the stack as reasonable: you can have the prs red as we have now; but let's not put this big a change through a write-rewrite within itself." 2026-11-26, #947; thread 11 redone in place (#947 force-pushed): GraphQLVaultDB implements VaultDB and forwards answers, checked by shape and scope; the core's contract untouched; the first attempt kept at tag 20261126-graphql_manifest-pipe-prerewrite.

## Batch 6

* **StoreLimits uses "store" as a noun.** Rename StoreLimits and kin to DatastoreLimits; Rec a later thread, not this sprint. Coach (empty: took the Rec). 2026-11-26, #946; left for a later thread (plan's For the Coach).
* **notes/storage-policies.md describes big alone.** Rec a new-core note after this sprint. Coach: "Take over the file, this is one of the last pieces before big goes away". 2026-11-26, #946; thread 12 (policies_note) rewrites the file for the new core, in this sprint.

## Batch 5

* **"Tag" now means two things.** Refusaltag, PolicyTag and the refusaltag field name a phrase, beside the manifest's comparison tags; Rec keep refusaltag, rename PolicyTag to PolicyRefusaltag. Coach, in chat: "I'd like to keep PolicyTag -- its refusals are named for it, just as the Phrase is named for the Refusaltag". 2026-11-26, #942 review; no change.
* **TOP: The adapter_port line and this line collide.** adapter_port (#932, #935, #936, #938) edits thing-classifier.ts, which this line deletes; Rec merge this line first and restack adapter_port onto it. Coach, in chat (against the Rec): "stack yours on theirs, you have a better handle on what's modern. Revert or integrate as makes sense, their run was less supervised". 2026-11-26, base-sync; this line is restacked onto adapter_port's top, its crossed-refusal work integrated into the manifest or reverted.

## Batch 4

* **A refused storage-policy write reports the real bank state.** A policied refusal is a scribed act, carrying the step's real banktok, tracked and read_tc rather than void ones; Rec keep. Coach (empty: took the Rec). 2026-11-26, #934; stands as built.
* **A self-contradicting listing manifest reads as an outage.** It answers `storage_unavailable` before three-way can say `storage_issue`; Rec leave the order. Coach (empty: took the Rec). 2026-11-26, #937; stands as built.
* **Postgres hosts drop the old SQL functions to upgrade.** The changeset's snippet drops every `safebyok_a010501_r000_*` function; no version bump before 1.0; Rec accept. Coach (empty: took the Rec). 2026-11-26, #940; stands as built.
* **TOP: Adopt the split act tables.** Decomposition B: a revision grid, match and stale acts by op, presence and flag, get acts, a broken-manifest check; the write predicate stays a hand copy; Rec yes, before thread 6. Coach (empty: took the Rec); in chat: "go ahead woth it all, great news". 2026-11-26, side quest; thread 8 (act_tables) builds it.
* **A refusal tag and one error builder for policied refusals.** Replaces the three policied throwers and `policiedRefusalOf`; Rec yes, with the act tables. Coach (empty: took the Rec). 2026-11-26, side quest; thread 8.
* **Move more throwers onto the builder.** 18 of 39 could; Rec not in this sprint, rule once the builder is seen. Coach (empty: took the Rec). 2026-11-26, side quest; waits for a later ruling.
* **Policy verdicts as phrase tags from the datastore.** A contract and SQL change; Rec not now. Coach, in chat: "and yes policy tags" (against the Rec; the chip's empty proceed read as the chat's yes). 2026-11-26, side quest; thread 9 (policy_tags) builds it.

## Batch 3

* **One consistency check per verb.** Thread 1 wrote `demandGetConsistency` and `demandWriteConsistency` in place of one `demandThreeWayConsistency`; Rec keep one per verb. Coach: "oK but have them call into a shared function for the shared tests". 2026-11-26, #934; directed to thread 2, which refactors thread 1's two onto the shared function.
* **The ancestor's address, checked when it is read.** The one exception to address checks in three-way, since the shell is built from the ancestor first; Rec accept. Coach (empty: took the Rec). 2026-11-26, #934; stands as built.
* **An incompatible row above a void get.** Refuses `damaged_row` where it answered the shell; Rec accept. Coach: "change all damaged_row checks to incompatible_row. I agree this is incompatible_row". 2026-11-26, #934; thread 7 renames every `damaged_row` check.

## Batch 2

* **The address check, in three-way, widened.** The ancestor and a listing's children join the primary-key rows in three-way; a watch's bank filter stays. Coach, in chat: "green light for the other two as well". 2026-11-26, design; threads 1 and 2 build it.
* **`StoragePolicy` for your `PolicyTag`.** Key the policy verdicts by the existing `EX.StoragePolicy`. Coach, in chat: "green light for the other two as well". 2026-11-26, design; thread 1 builds it.

## Batch 1 (oldest)

* **Refusal name.** `incompat_row` or `incompatible_row` for the renamed `damaged_row`; Rec `incompatible_row`. Coach: "`incompatible_row`". 2026-11-26, thread 7; written into the plan's thread 7.
* **Red until thread 5.** Threads 1 and 2 break the IndexedDB, Postgres and Convex packages until threads 3-5 port them; Rec accept, and merge the line through thread 5 at once. Coach (empty: took the Rec; and in chat: "green light for red PRs."). 2026-11-26, plan; the ground rule stands.
* **`lifepath_eq`, not `lifeseq_eq`.** The tag spells the field it compares, the lifepath; the live half shows in `presence`. Coach (empty: took the Rec). 2026-11-26, design; thread 1 builds it.
* **`MemoryDatastore`, not `MemoryVaultStore`.** VOCABULARY.md has no `store` noun. Coach (empty: took the Rec). 2026-11-26, design; thread 1 builds it.
* **The manifest carries `banktok`, not the bank row.** Matches the Answer; a bank row failing its checks gives its own lifetok, already unspecified in wontfix. Coach (empty: took the Rec). 2026-11-26, design; thread 1 builds it.

## The orchestrator's calls

Calls left to the orchestrator: the Coach did not rule on these; the orchestrator decided them and listed them in the doc's *Cleanup* tab, *Your calls* table, for the Coach to overrule. Matter, call, where it landed.

| Matter | The orchestrator's call | Landed in |
| --- | --- | --- |
| The refusal when an answer fails to copy its manifest | `unexpected_error`, not `storage_issue`: only our own code can fail it (`#impossible-is-a-broken-system`) | thread 2 |
| The demos' localStorage vaultDB needed the new write call | Pulled forward into thread 1, to keep the demos green | thread 1 (#934) |
| A datastore that leaves `banktok` out of its manifest went unnoticed (answered void) | Refuse `storage_issue` where the key is missing; a bank row's malformed lifetok still answers void, as `notes/wontfix.md` has it | thread 2 |
| Export names the review questioned | Keep `check*Observations` (your word for what a datastore records) and `MemoryDatastore.getThing` (mirrors the SQL); rename `checkedBanktokOf` → `banktokOrVoidOf`; keep `lifepath_eq` boolean, as you ruled | thread 2 |
| Manifest types written as `type` with a bullet list | `interface`s with a doc block per member (STYLE); two types moved into `src/shapes/` | thread 2 |
| The security note said a write over an incompatible row succeeds where revision, life and liveness match | Added: and where its format and lifeseq match too (the review tightened the memory datastore's write rule to copy Postgres's) | thread 1 (#934) |
| VOCABULARY.md lacks manifest, ante, incompatible; its *actual* is stale | Already in thread 6's brief | thread 6 |
| A bank lifetok that is present but malformed (thread 2 narrowed my directive) | Accept: only a missing banktok refuses storage_issue; a malformed one answers void, as a damaged bank row did before (wontfix) | thread 2 (#937) |
| Four answers that change in broken states only (listing/birth/world/stats banktok void; missing banktok; unexpected_error; a child's address checked after its kind) | Accept: a working vaultDB answers as before | thread 2 (#937) |
| TrackedRows exported top level from safebyok/storage | Accept: a shape, beside its siblings | thread 2 (#937) |
| Thread 2 compacted four times | Threads 4 and 5 run on the larger-context worker; reviewer told to look harder | plan |
| Stale eslint config comments naming the deleted storage/classifier.ts (IndexedDB and dojo) | Swept with the words pass | thread 6 |
| A damaged bank row's banktok vanishes across a transport that drops undefined, reading as a missing key | The tag maker returns null instead, so every datastore sends the key; the contract's workaround line goes | thread 5 |
| Thread 2's doc-block and naming leftovers ("What a ..." first lines, steps listed, refusedroot, test titles) | A documentarian pass over the sprint's files, with the words sweep | thread 6 |
| Postgres judged storage policies only when a write kept the gate live ("stored.am <> proposed.am OR ..."); now over any live gate | Accept: matches the TypeScript and the contract; a delete carries no policies, so no valid ask answers differently | thread 4 (#940) |
| A Postgres write function that writes nothing where the tables say write: was unexpected_error ("StoredNothing"), now storage_issue from three-way | Accept: it is the datastore disagreeing with itself, which three-way names storage_issue; broken state only | thread 4 (#940) |
| Convex's read_tc stays stamped by the client before each call (the contract's first choice is the datastore's own stamp) | Keep, as adapter_port thread E chose: a Convex query's clock is frozen at its start and a result may be served from cache, so a server stamp could be older than the read it dates; the reviewer checks the reasoning | thread 5 (#941) |
| Convex refuses a field its table lacks, so the battery's damaged-bank plant (a stray "auth" field) now drops it, as Postgres's plant does | Keep for now; the reviewer weighs whether that case then tests nothing for Convex and Postgres, and should damage the bank another way | thread 5 (#941) |
| A Convex component and client disagreeing on whether it wrote: was unexpected_error ("StoredOutOfStep"), now storage_issue from three-way | Accept, as for Postgres: broken state only | thread 5 (#941) |
| A written manifest's tags aren't checked against written (presence live + revtok birth + written passes as replaced) | Add the check to three-way: broken state only, where the address check already went | thread 6 (or the act-tables thread) |
| Table the datastore's write predicate too? | No: isWritable stays the hand copy of Postgres's WHERE; a table is looser for an ask that skipped checkedWriteAsk | no change |
| A policy verdict's message must now be one of PolicyPhrases (so the refusal builder can find its tag); only a broken datastore notices | Keep: thread 9 replaces the message with the tag itself | thread 8 (#942), cleared by thread 9 |
| A policy verdict's field is named refusaltag (not tag or policytag) | Keep: the policied manifest already names the same value refusaltag | thread 9 (#943) |
| The PolicyPhrase type thread 8 exported is removed | Keep the removal: never released, nothing uses it | thread 9 (#943) |
| The deviceDB's "stored lease" (World's #followStored, #peekStored), the proving's stored wayin, PasskeyStored/NoPasskeyStored | Keep: each means a record at rest, the sense "stored" keeps | thread 6 (#944), no change |
| "store" as noun and verb ("the store's limits", "the deviceDB stores"), and notes/ saying "stored" for actual or ante | Sweep in thread 10; the exported StoreLimits named there, not renamed without a ruling | thread 10 |
| Thread 6 used ante and actual for the deviceDB's lease stow too (stowLease, Lease.stow), where VOCABULARY's rows name only a vaultDB step | Widen the two VOCABULARY rows to cover the deviceDB's stow ("the same rule for every read or write"), rather than two vocabularies for one operation | thread 10 |
| The local isWritten against the manifest's tag written (and Postgres's written boolean) | Keep both: the tag is a datastore contract field; renaming it touches every datastore and the SQL for a glance's worth | thread 6 (#944), no change |
| VOCABULARY's incompatible row drops the old damaged row's "never indicates format drift": an incompatible row may be of another format, or a test's plant | Confirm: before 1.0 an old-format row fails today's checks and reads as incompatible (the write predicate's fmt clause exists for it); "incompatible" was chosen to say so | thread 7 (#945), no change |
| The stored tag am: 'd' keeps its letter (VOCABULARY now says d is for incompatible) | Keep: a stored tag shared with big; a new letter is a format change for nothing | thread 7 (#945), no change |

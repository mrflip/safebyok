# Sprint bank_world: the plan

* **Date**: 2026-11-12. **Issued by**: the Coach, with `threads.md`, `design.md` and `rulings.md`
  beside this file (carried verbatim from the base checkout in the first `plan:` commit).
* **Mode**: YOLO.
* **Default levels**: review `medium` (revised: `/code-review low` returned `(none)` where `medium`
  found real defects; a thread's "`low`" below now means a `medium` code review with a light hand on
  the rest); worker `opus` (agent default effort); reviewer `sonnet`
  (agent default effort); style pass `sonnet`. Threads that differ say so below.
* **At once**: 3 threads.
* **Status** (2026-11-12, later): 8a to 10 merged. Ready to merge, out of draft: 8d #679 → 12 #681 →
  16 #682 (filed at 43f699a1e, review fixed; #682 the top). T #680 reviewed twice and reworked to the
  Coach's justify ruling; filing waits on the timing table's thresholds. Documentarian, as two PRs
  stacked on #682, side by side: core (three groups) and adapters with React (two). A Closer Look at
  43f699a1e is running; threads do not wait on it or its triage (the Coach). G #678 (draft, to the
  top at wrapup). Then
  17. Sprint doc: https://claude.ai/artifact/NWm2C8wNdM6WYz6kWRVcgB

The Coach's text for each thread is `threads.md`, *The threads*, verbatim, in this directory; it is
not copied again here. What follows is the gloss.

## Read first

Beyond CLAUDE.md, and only what a thread's kind needs (the handoff quotes what it can):

* `design.md`: every thread *Names* and *Scopes*; storage threads (3, 4, 5, 13, 14, 15) *Stored
  rows* and *BankDB*; model threads (6, 8, 8b, 10) *The models*; a thread touching a lease, stamp
  or ctx (8, 8b, 9) *Keys, stamps and each ctx*.
* `notes/answer-contract.md`, *Adapter contract*, for the storage threads.
* `notes/guarantees.md`, *The guarantees*, before changing a file it names (CLAUDE.md).

## Ground rules

`threads.md`, *Ground rules*, 1 to 14, bind every thread; a handoff quotes the ones that bear on
it. The Coach added four at the invocation, and the orchestrator one:

15. **What rotates when.** A gate verb (`replacePassphrase`, `addPasskey`, `revokePasskey`) changes
    the gate row's `revision_tok` only; `gate_tok` and `bank_tok` are kept (`design.md`, *Which
    token changes when*). The Coach is not perfectly sure of the rest, which is why rule 6 says to
    read a failing test against that table. **No lock counter, epoch or generation of any kind, and
    no reasoning about, test of, or handling for a crossing between a lock and a gate update.** A
    reviewer or worker who finds one writes a line under *Open matters* and moves on.
16. **The net result is a simpler, lighter codebase.** Each report gives `src/` lines added and
    removed for its package(s). A thread that adds more than it removes, outside 3 to 5 and the
    scaffolds of rule 11, says why.
17. **A refusal's kind is a contract only where a host switches on it**: `stale_write` and
    `wrong_passphrase` today. Elsewhere, where two refusals could apply, the one that needs no extra
    code wins: no code chooses between them and no test pins which.
18. **Reviewers look hard, and report plainly** (revised on the Coach's word, 2026-11-12: "I do
    want them to be aggressive, but we mustn't let an opus high be led a merry muckle by a sonnet
    medium's neuroses"). Be aggressive about what is wrong in what the thread built: a defect on a
    real code path, a broken guarantee, the ctx table not followed, a contract misread. Weigh a
    worry about a race or an edge case by how likely a real path reaches it, and send it to *Open
    matters* rather than into rework: a reviewer's worry does not set a builder chasing a case no
    caller reaches. Through threads 3 to 12 the tree carries two contracts and scaffolds on
    purpose; they are not findings.
19. *Revised 2026-11-12 for thread 13:* the Coach: "doing the postgres adapter will likely be clarifying for some of the recent questions you had". The argument that moved it: a real database settles the contract questions now open (a cascade in one transaction, the gate policy as a stored function, `tidyGone` by scope, the life pair as two predicates) before 8b builds the models on that contract. Thread 13 starts from main now, reports as a contract probe too, and takes 4b's battery when it lands; 14 and 15 still wait as below.
    **Adapters wait for the contract to settle** (orchestrator). Threads 13 to 15 are cut once
    thread 9 files, from the line's tip, so they are written once, against the contract thread 8
    proved and with thread 9's names, and run beside 10 to 12 in other files. This follows R7's own
    argument ("the models prove the contract before three adapters are written to it"), and spares
    porting 8's corrections and 9's renames into adapters cut earlier.
20. **A PR may land red, or with skips, where that schedules better** (the Coach, 2026-11-12: "I
    can merge a set of stacked prs that are intermediate red leading to a mergeable green"). A red
    PR's body and report say what is red or skipped and which thread mends it; the line ends green.
    A worker proves its own change with the package suites it touches, and names any red it leaves.
21. **A stacked thread is cut from its base's ready tip**, not its filed one (orchestrator,
    following rule 20). Where the base's review then adds commits, the orchestrator rebases the
    stacked branch onto the reviewed tip (`git rebase --onto`) before filing it; a conflict goes to
    a thread-worker. Agents may force-push sprint branches with a lease, and move PRs in and out of
    draft (the Coach, 2026-11-12).
22. **A push need not wait on `pnpm justify`; `ready` does. A restack of more than two PRs goes
    through the `restacker` skill, justified once at the tip** (the Coach, 2026-11-12; now also
    in the `/sprint` skill, `wrapup.md` and `thread-worker.md`, on this sprint's branch).
24. **Damaged rows inside the datastore are out of scope** (the Coach, 2026-11-12): "we can't
    write code if we can't trust the datastore. make sure there's an actual path to the error
    being hypothesized." A finding, a test or a guard about a stored row that fails its own checks
    needs a verb that could have written it; otherwise it is not built, and a reviewer does not
    raise it.
25. **The frequency ladder** (the Coach, 2026-11-12): "a bank create/delete ends everything, a
    gate modification happens thousands of times less often than a vault modification, a vault
    operation much less often than a box modification, and a box modification much less often
    than a read." Keep reads cheap; let a gate verb be heavy (a full in-database re-check is
    fine); let `buildBank`/`delBank` be blunt; add no work to the hot end for symmetry's sake.
23. **Bank-world drafts of the contract notes** (the Coach suggested, 2026-11-12):
    `guarantees-bank.md` and `deliver-contract-bank.md` in this directory describe the target.
    A worker or reviewer judging bank-world code reads them beside today's `notes/`; the thread
    that makes one true (8b for guarantees, 10 for deliver-contract) promotes it into `notes/`.
    `notes/answer-contract.md` gets no draft: threads 3 and 4 are writing its bank and gate tables
    in place.

## The threads

```text
1 ── 2 ──┬── 3 ── 4 ── 5 ──┐
         └── 6 ── 7 ───────┴─(restack)─ 8 ── 8b ── 9 ──┬── 10 ── 11 ── 12 ──┐
                                                       ├── 13 ─────────────┤
                                                       ├── 14 ─────────────┼─(restack)─ 16 ── 17
                                                       └── 15 ─────────────┘
```

### 1 `banklabel`

Touches every package, the demo, e2e, SQL, Convex, GraphQL. **Levels**: worker `sonnet`; review
`low`. **After**: `origin/main`. **Look-ahead**: everything after builds on the new order; the
scopepath order (`user_id` first) is what a search misses, so the worker greps for each scope
shape, scopepath builder and SQL key by hand. Pre-1.0: schemas and the Convex component are edited
in place, no migration (CLAUDE.md). **Size**: L but mechanical.

*Review:* `fixed` (sonnet, low; [#657](https://github.com/mrflip/safebyok/pull/657)). One commit: two `Bank.make` examples in `notes/configuration.md` and a doc block in `notes/gallant-docblocks.md` still put `banklabel` first. Nothing left. Style pass skipped as low value on a rename.

### 2 `device_row`

The deviceDB's bank row is the device row; `device_id` is `device_tok`. **Levels**: worker
`sonnet`; review `low`. **After**: 1. **Look-ahead**: thread 6 removes the `device_tok` option
from `Bank.make`; here it is only renamed. `ctx-bytes.test.ts` changes on purpose (the header).
**Size**: M, mechanical.

*Review:* `fixed` (sonnet, low; [#658](https://github.com/mrflip/safebyok/pull/658)). Style realignment after the longer `device_tok`; the vacate's `#forgetOwnBank` is `#forgetOwnDevice`; VOCABULARY's deviceDB entry and the `device_tok` docs. Left, minor: the `useDeviceTok` and `infoOf` doc wording (a documentarian pass, if the Coach wants one); the old `bank-v001` IndexedDB database, as the changeset says (Cleanup).

### 3 `bankdb_shapes`

Shapes, asks, answers (`parent`), classifier for bank, gate and vault asks, in the core beside
`VaultDB`'s; `notes/answer-contract.md` tables. **Levels**: worker `opus`; review `medium`.
**After**: 2; beside 6. **Look-ahead**: thread 4's adapter base classifies with this; 13 to 15
mirror the gate verbs' policy table inside their databases, so the classifier's policy rows should
read one-for-one against `design.md`, *The gate verbs' policy*. Rule 17 applies: where two
refusals could hold, take the one that falls out. **Size**: M.

*Review:* `fixed` (sonnet, medium; [#660](https://github.com/mrflip/safebyok/pull/660)). Policy rows and row-above refusals one for one with design.md; one padding fix. Left: two `vaultRow` cases share a title until 16; the thread file's *Decisions* line on gate verbs and a missing main gate says `damaged_row` where code and BE4 say `ahead`/`void` (rule 17; the code stands); doc blocks for a documentarian. Filed rebased onto main at `7d7ee80b6`.

### 4 `bankdb_adapter`

`BankDB`, `AdapterBankDB`, `MemoryBankDB`, the battery (copy then edit, rule 10), the wire
validators and exports. **Levels**: worker `opus`; review `medium`. **After**: 3. **Look-ahead**:
the `do*` list it reports goes into the progress document for 5 and 13 to 15. **Size**: M-L.

*Review:* `fixed` (sonnet, medium; [#663](https://github.com/mrflip/safebyok/pull/663)). `MemoryBankDB.doTidyGone` swept vault rows under a damaged bank row; fixed with a test. The four safety hatches judged sound. Left: cascade notices and other-life box rows, stated in answer-contract by 4b; the BX barrel kept; doc blocks for the documentarian. Filed at `28d353f26`, on main.

### 4b `bankdb_battery`

*Orchestrator, split from 4 after thread 3 compacted four times on a smaller thread:* the battery
an adapter runs to show it conforms, copied from `tests/test-helpers/vault-db-battery*` then edited
(rule 10), run against `MemoryBankDB`, mending what it finds in 4's code. **Levels**: worker `opus`;
review `low`. **After**: 4. **Look-ahead**: 5 and 13 to 15 run it. **Size**: M.

### 5 `bankdb_idb`

`IdbBankDB` beside `IdbVaultDB` (copy then edit). **Levels**: worker `sonnet`; review `low`.
**After**: 4b. *Orchestrator:* also the Coach's two IndexedDB rulings (progress document): every
database the library opens is named `safebyok-…`, and the device row records the npm package
version when it is ensured. **Size**: S-M.

### 5b `device_shelf`

*Orchestrator, split from 5:* the core's device database (`packages/safebyok/src/storage/idb-device-db.ts`,
`consts.ts`): its IndexedDB name starts `safebyok-` (the Coach); the device row records the npm
package version when `device.ensureBank()` ensures it, refreshed when an ensure finds another (the
Coach: "on hello, when peekOrStow'ing the device id, to also write the npm package version"); a
layout version bumped wherever thread 1's key reorder left one naming an old shape. **Levels**:
worker `sonnet`; review `medium`. **After**: 8c (8a and 8b change these files). **Size**: S.
*Orchestrator, 2026-11-12 (new session):* started from 8c's ready tip beside 9 (it was on the frontier
once 8c was ready). It also takes the Coach's ruling on #668: nothing beyond the host's `dbName` scopes
a database's name; `safebyok:<store>-v…` with no `dbName`, `safebyok-<dbName>:<store>-v…` with one, for
the bank and device databases together.
*Review:* `fixed` ([#675](https://github.com/mrflip/safebyok/pull/675), medium). The Coach's ruling carried out in review: `PackageVersion` is hand-kept, its drift test the tripwire, the sync script dropped. Fixed two tests that guarded nothing, a changeset overclaim, a name. Left: the device row is put on every ensure where the changeset says "when it finds another version" (17's one-note read); four nits gone at 16 (`IdbVaultDB`'s names and bell). In the line it goes between 8c and 9 at the restack (Cleanup, *Finally*).

### 6 `device_owner`

`Device` split out of `Bank` on today's storage; `safebyok-react`'s provider makes a Device.
**Levels**: worker `opus`; review `medium` (touches `notes/guarantees.md`'s host-function
paragraph; the reviewer's guarantees check covers it). **After**: 2; beside 3 to 5.
**Look-ahead**: thread 8 has the Device ask `ensureBank` and launch `build_bank`; the one open
gating lives on the Device from here. A move, not a redesign (the Coach). **Size**: M-L.

*Review:* `fixed` (sonnet, medium; [#661](https://github.com/mrflip/safebyok/pull/661)). Host-function guarantee holds; three style/docs fixes. Left: the changeset's silence on the lost forced re-list and stale `Bank.make` words (both to thread 7 as two-liners); `BankAnnouncement`/`BankPanic` names and a documentarian pass (Open Matters); four races carried (Cleanup). Filed rebased onto main at `85ce9dd5b`.

### 7 `plain_del`

`vault.del()` asks nobody; `vault.hello()` is `vault.beginWatch()`. **Levels**: worker `opus`;
review `low`. **After**: 6. **Size**: S. Net removal expected.

*Review:* `fixed` (sonnet, low; [#662](https://github.com/mrflip/safebyok/pull/662)). Three words-and-whitespace fixes; nothing significant. Left: the plain confirm focuses Delete first (thread 12); doc blocks for the documentarian pass; carried edges (Cleanup). Filed at `e19e54483`, on #661 at `682c0bdce`.

### 8 `bank_gate`

The switch, items 1 to 7 of `threads.md` § 8. **Split** (`threads.md` asks for a green cut if the
gloss finds one): items 8 (the new tests) and 9 (`notes/guarantees.md`, VOCABULARY.md) are thread
8b. Items 1 to 7 are already more than one context comfortably holds. *Revised under rule 20:*
item 1 (re-pointing the test helpers through the Vault's scaffold calls) is dropped. Thread 8
skips, by name, the suites that reach the unlock, the wayin prompts and the lease through a Vault,
and 8b re-points them once, at the bank and `bank.maingate`, so the helpers are rewritten once,
not twice. The Vault's scaffold calls stay, for `safebyok-react` alone, which stays green. **Levels**: worker `opus`, effort `high`; review `medium`, the reviewer
handed an explicit checklist: each `cipherCtx` against the ctx table, `notes/guarantees.md`, the
token table, and plain correctness, with races to *Open matters* (rules 15, 18). **After**: 5 and 7,
restacked into one line (`wrapup.md`, *Restack*). **Look-ahead**: 9 renames what 8 writes
(`vaultKey` stays `vaultKey` here); 10 removes the per-thing lifecycle, so 8 leaves the scaffolds
of rule 11 and does not tidy them. Any correction 8 makes to the BankDB contract is recorded in its
report and the progress document for 13 to 15. **Size**: XL.

### 8 is cut into 8a, 8b, 8c and 8d

*Orchestrator, 2026-11-12, revising the two entries below:* an opus planner read the code and cut
thread 8 in three, with the former 8b becoming 8d: `thread-8-cut.md` in this directory is the cut,
and each handoff quotes it. The line is red from 8a's tip to 8c's (rule 20).
* **8a `bank_keys`**: stamps, ctx, lease (`fmt` 7003), `Gate` as a value, the deviceDB's lease key.
  **Levels**: worker `opus`; review `medium`, checking each ctx against the ruled table.
  **After**: 7, filed. It needs nothing of 4 or 5.
* **8b `bank_switch`**: the models onto `bankDB`; lease and unlock to the bank; `build_bank`,
  `unlock_bank`; the vault listing by `ensureBank`; the fixture builders moved once; `Storable`'s
  `vault_tok` down (pulled forward from 10). **Levels**: worker `opus`, effort `high`; review
  `medium`. **After**: 8a and 4, restacked into one line.
  *Orchestrator, after 8b's first worker stopped at its release valve with only the renames
  (`bank_locked`, one thrower, `Device*` announcement types):* the rest of 8b goes in three legs
  on the same branch and PR (#667), each a fresh worker continuing from the thread file's ten-step
  plan: leg 1 steps 1 to 4 (shapes, Storable's `vault_tok`, Gate and Bank Storables, the lease to
  the bank, `ensureVault`); leg 2 steps 5 to 8 (`Device.ensureBank`, listing delivery, Vault
  stripped, gating); leg 3 steps 9 and 10 (fixtures, skips, React, VOCABULARY). One review at the end.
  *Orchestrator, after leg 1 (steps 1 and 2 only, two compactions at 200k, +92/-70 src):* legs now
  go to `thread-worker-400k` (the Coach's agent, a 400k window); leg 2 takes steps 3 to 5 as far as
  it gets, and the legs continue until step 10, each from the thread file's *Next leg* note.
* **8c `bank_prompts`**: the gate's prompts and verbs, `del_bank`, `autolock`, a bank tombstone
  delivered; unskips 8b's skips; React compiles. **Levels**: worker `opus`; review `medium`.
  **After**: 8b.
* **8d `bank_gate_tests`**: the former 8b below. **After**: 8c. *Orchestrator:* after 9, so its new tests and the guarantees it promotes use the bank-key names (9 and 8d both edit `notes/guarantees.md` and VOCABULARY). *Orchestrator, 2026-11-12 (new session):* after 10, stacked on its ready tip, not beside it: 10 is the critical path (10, 11, 12, 16, 17), 8d's new bank tests are better written over 10's lifecycle than rebased across it, and the line needs no restack between them. 8d is judged then against 11: 8c already rewrote `vault-gate.test.ts` over the bank, so 11's re-pointing may fold into 8d. *Revised:* the promotion of `guarantees-bank.md` (and G3's "(VaultDB)") moved to thread G, now; 8d brings the note up to date with 10's lifecycle, from 10's and G's reports. *Orchestrator:* cut from 10's ready tip with 11 folded in; ready as #679 (tests +475/−387; src +26/−7 for the Coach's autolock ruling: `Lease.expiresAt`/`tryExpiresAt`, `Bank.autolock` holds no lease row); TODO entries for remake and a bank-level vacate. One compaction. In review. Left to 12: the scaffold cases in `vault.test.ts`, `readme-recipes.test.ts` and README lines, VOCABULARY's *locked* rows.

### 8b `bank_gate_tests` (now 8d)

The suites thread 8 skipped, re-pointed at the bank and `bank.maingate` (much of what thread 11
would have done; 11 is judged again once 8b files). Then `threads.md` § 8, items 8 and 9: new tests for building and deleting a bank, one lock over two
vaults, a bank's tombstone delivered, `ensureVault` on a locked bank; `notes/guarantees.md` (the
table of files, G1, G3, G4, G9) and VOCABULARY.md. **Levels**: worker `opus`; review `low`.
**After**: 8. **Size**: M.

### 9 `bankkey_rename`

**Levels**: worker `sonnet`; review `medium`, reading each purpose string. **After**: 8b. *Orchestrator:* ready as #674 (+89/−89 src in safebyok; only safebyok-graphql among the adapters spells the fields; no `fmt` moved, a YOLO call); in review.
*Review:* `fixed` (sonnet, medium; [#674](https://github.com/mrflip/safebyok/pull/674)). Every code hunk a pure name swap; five doc and changeset fixes (doc blocks reading "the bank's bankKey", `@example` ctx stamps, three missed "vault key"s, VOCABULARY's passkeyKey row, the changeset's `fmt` reason). Left: `Bank.unlock`/`delPrompt`/`ensureUnlocked` refresh without `VX.Promptly` (a two-line directive to 10); the ride-along untested (Cleanup); G3's "(VaultDB)" (8d); VOCABULARY's *wayin, as stored* row (17).
**Look-ahead**: 13 to 15 are cut after this, so it renames only what is in its base. **Size**: M,
mechanical.

### 10 `one_enabled`

**Levels**: worker `opus`; review `medium`. **After**: 9. **Look-ahead**: should remove more than
it adds (the Coach). **Size**: L. *Orchestrator:* ready as #677 (src +515/−517; two compactions on the 400k window, at ~366k and again 13 minutes later); in review. Its calls on a gate of another `gate_tok`, the default `onLifecycle` and an ended bank's snapshot are Open Matters rows.
*Review:* `fixed` (sonnet, medium; [#677](https://github.com/mrflip/safebyok/pull/677)). One tell per lock and unlock, and nothing after a sweep or vacate, both confirmed against the code; two comments fixed. Left: a Vault's box watch stops across a new life (12); `onLifecycle` vacating the device (Open Matters); exported `putOpts`/`delOpts` without `vault_tok`, public `tellBadNews`/`announce`, prototype getters (left); doc-block and test-title style (the documentarian run before 17).
*Orchestrator:* the Coach ruled on #667 (Open Matters): **one tell per lock and unlock**. Today
`bank.lock()` tells the device for the bank, then again as its vaults align, so for one tell a vault
reads unlocked under a locked bank; 8c had filed, so it lands here with the lifecycle (no liminal
state). The proof story that pins two paints pins one.
*Orchestrator:* `Storable`'s `vault_tok` moving down to `Vault` and `Box` landed in 8b (dff295ea6);
struck from this thread.

### 11 `bank_level_tests`

*Orchestrator, 2026-11-12:* folded into 8d, cut from 10's ready tip with 11's text verbatim.

**Levels**: worker `sonnet`; review `low`. **After**: 10. **Size**: M, likely shrunk by 8b
(revised under rule 20); folded into 10 or dropped if 8b leaves little.

### 12 `react_bank`

*Orchestrator, from 10:* a Vault keeps one object through its lives, and its box watch is not restarted at a new life: React re-asks `vault.boxListing` and calls `vault.beginWatch()` again when the snapshot's `vault_tok` changes. `device.sweep()`/`vacate()` are the only lifecycle calls; rename a thing's `alignLock()` to `lock()` once the `Vault.lock()` scaffold goes.

**Levels**: worker `opus` (400k); review `medium`. **After**: 10 (11 folded into 8d), cut from its filed tip beside 8d; its core-scaffold deletion is its last commit, so the restack onto 8d stays small. *Orchestrator:* ready as #681 (react +204/−153, demo +57/−62, core +19/−62; two compactions); in review, with a YOLO directive: the align duty goes back to `alignLock()` (internal), since `lock()` on a Vault would compile in a host and silently lock nothing. 8c's four React questions decided in its report. 8d filed onto main (2e16465aa). *Review:* `fixed` (sonnet, medium; [#681](https://github.com/mrflip/safebyok/pull/681)). `alignLock()` restored and `@internal` (a host's `vault.lock()` no longer compiles); function declarations; provider, `useVaultFor`, `CreateVaultButton`, two providers all judged sound. Left: an async `isBankStored`, doc blocks and two titles (the documentarian), `alertText` repeated, an `@example`. 12's thread file still describes the `lock()` rename in *For the Coach* and *Deviations*; the review and this entry supersede it. The report itemizes the React cost
(state, effects, branches, added and removed). **Size**: L.

### 13 `bankdb_postgres`, 14 `bankdb_convex`, 15 `bankdb_graphql`

**Levels**: worker `opus`; review `medium`. **After**: 9 (rule 19), each from the line's tip, beside
10 to 12. **Look-ahead**: the `do*` list from 4 and any contract correction from 8, from the
progress document. **Size**: M-L each.

*Orchestrator, after 13 (no contract correction):* 14 starts now from 4b's filed branch, on
`thread-worker-400k`, with 13 as its template (the Coach's text: "after thread 4, whenever there
is room"). 15 waits on 13's filing: graphql's e2e runs over the Postgres functions.

### BP `bank_parent` (added 2026-11-12)

The Coach: "have bank's parent be 'main', just to be type uniform". *Orchestrator:* where a bank-level
answer or notice carries `parent: null` (delBank's answer, a bank or gate row's notice), it carries
`'main'`; core shapes, MemoryBankDB, the four adapters, GraphQL's delBank answer gains `parent`, the
battery. A refusal's null parent (no row fetched) stays. **Levels**: worker `sonnet`
(`thread-worker`); review `medium`. **After**: 14, on top of the storage line. Models pick it up in 8b/8c.
**Size**: S.

### G `guarantees_bank` (added 2026-11-12)

The Coach (Coach notes): the bank-* drafts are "for swapping in atop the notes/ versions when you wish. They were written prospectively, though, so I might have a sonnet merge them as you go, with the code overriding both." *Orchestrator:* `guarantees-bank.md` merged into `notes/guarantees.md` now, the code at 9's tip overriding both; what the draft anticipated of thread 10 is not claimed, and listed for 8d. Thread 10 leaves `notes/guarantees.md` alone and reports the lines it falsifies. `deliver-contract-bank.md` stays with 10. **Levels**: worker `sonnet`; review `medium` (sonnet), checking each claim against the code. **After**: 9 (stacked on #674), beside 10. **Size**: S-M, docs. *Orchestrator, on the Coach's word (2026-11-12):* G is the line's living guarantees note: it stays a draft, nothing stacks on it (the Coach: "if it is going to be at the end, other branches should not stack on it"), later threads report the lines they falsify instead of editing it, and at the wrapup it is updated once, squashed, and placed at the top of the line just below the squashed plan. *Orchestrator:* ready as #678 (docs only, so no review, per the skill); then rebased onto 10's ready tip (#677) and a second leg brings the note up to 10's lifecycle, so 8d edits no guarantees. Found: `Bank.autolock` holds the lease row (with its key handle) from `DeviceDB.tryPeek` (TOP row, Open Matters). The draft is promoted and removed from this directory, as is `deliver-contract-bank.md` (10 promoted it). *Orchestrator:* lines later threads falsify, for the wrapup update: 12 reported `vault.lock` and `ensureUnlocked` still named; 16 reported line 124 ("not to the host's VaultDB") and line 206 ("`bank_key_wayin_wrapped` (VaultDB)"), both now BankDB.

### T `sprint_tools` (added 2026-11-12)

The Coach's tooling asks, as one PR stacked on #676: a CLAUDE.md line sizing every Agent call's model, `thread-reviewer` pinned to sonnet; reviewers prove only what their fixes touch; draft PRs skip CI and workers take them out of draft before their last justify, rebased at their stack position; a base-sync agent that moves the base checkout onto the line plus a squashed plan commit, reconciling its uncommitted changes against a snapshot; the doc's *Progress* tab shrinks to a lead. **Levels**: worker `opus`; review `medium` (sonnet) for the workflow and agent. **Size**: M.

### 16 `vaultdb_out`

**Levels**: worker `sonnet`; review `low`. **After**: 12 to 15, restacked into one line.
**Size**: M, removal.
*Orchestrator:* pulled forward into 15 (#671): the e2e Postgres helpers' vault tableset (`Tableset`, `SqlOf`, `vaultDBOver`, `freshVaultDB`, `vaultRowsOf`); `useFileDatabase()` takes no argument; safebyok-graphql no longer touches the vault adapter. Struck here. Owed here from 14 and 13's reviews: drop the vault tables then rename Convex's `safebyok_bank_*` tables without `bank_` (move `capacity`, `watchScope` out of `validators.ts` first); prune `refusals.ts`'s `gate_issue` crossing; move (not copy) the Postgres vault channel and watch tests to the bank file.

### 17 `bank_docs`

**Levels**: worker `opus`; review `none` unless its diff carries code. **After**: 16.
`notes/security.md` through its `sonnet` subagent. *Orchestrator:* before it, the Coach asked
(2026-11-12) for one `documentarian` run over the files the line changed, as its own PR, instead
of each review leaving narrated doc blocks behind. Also owed here: the Coach's put-off ruling on
whether a wayin change keeps making other devices prove again (asked at the sprint's end). *Orchestrator:* also one cascade instead of three (the Coach's questions, 2026-11-12; the orchestrator's recommendation, name pending the Coach): Storable gets a protected `children` (Bank: its vault listing; Vault: its box listing; others none) and one internal cascade, children first and then `this.align()`, which Vault and Box override only to drop what they hold once delisted. `Bank.#alignAll`, `Listing.lock()` and `alignLock()` collapse into it. `align()` stays self-only: it runs on every record a thing receives. `lock()` is the bank's alone; no compatibility layer before a public release.
**Size**: M.

## For the Coach

* **Your hand edits in the base checkout** (`packages/safebyok/src/models/box.ts`: `#dropExposed`
  renamed `#doUnexpose`; two lines in `TODO.md`) are uncommitted on `20261111-pushto100`, whose
  work has merged. The sprint has not touched them; thread 1 rewrites box.ts's neighbourhood.
* **Owed at the end**: whether a wayin change goes on making other devices prove again.
* **No release until the line is whole.**

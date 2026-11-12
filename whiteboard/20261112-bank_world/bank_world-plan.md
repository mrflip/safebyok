# Sprint bank_world: the plan

* **Date**: 2026-11-12. **Issued by**: the Coach, with `threads.md`, `design.md` and `rulings.md`
  beside this file (carried verbatim from the base checkout in the first `plan:` commit).
* **Mode**: YOLO.
* **Default levels**: review `medium` (revised: `/code-review low` returned `(none)` where `medium`
  found real defects; a thread's "`low`" below now means a `medium` code review with a light hand on
  the rest); worker `opus` (agent default effort); reviewer `sonnet`
  (agent default effort); style pass `sonnet`. Threads that differ say so below.
* **At once**: 3 threads.
* **Status**: thread 1 building. Sprint doc: https://claude.ai/artifact/NWm2C8wNdM6WYz6kWRVcgB

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
19. **Adapters wait for the contract to settle** (orchestrator). Threads 13 to 15 are cut once
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
* **8c `bank_prompts`**: the gate's prompts and verbs, `del_bank`, `autolock`, a bank tombstone
  delivered; unskips 8b's skips; React compiles. **Levels**: worker `opus`; review `medium`.
  **After**: 8b.
* **8d `bank_gate_tests`**: the former 8b below. **After**: 8c.

### 8b `bank_gate_tests` (now 8d)

The suites thread 8 skipped, re-pointed at the bank and `bank.maingate` (much of what thread 11
would have done; 11 is judged again once 8b files). Then `threads.md` § 8, items 8 and 9: new tests for building and deleting a bank, one lock over two
vaults, a bank's tombstone delivered, `ensureVault` on a locked bank; `notes/guarantees.md` (the
table of files, G1, G3, G4, G9) and VOCABULARY.md. **Levels**: worker `opus`; review `low`.
**After**: 8. **Size**: M.

### 9 `bankkey_rename`

**Levels**: worker `sonnet`; review `medium`, reading each purpose string. **After**: 8b.
**Look-ahead**: 13 to 15 are cut after this, so it renames only what is in its base. **Size**: M,
mechanical.

### 10 `one_enabled`

**Levels**: worker `opus`; review `medium`. **After**: 9. **Look-ahead**: should remove more than
it adds (the Coach). **Size**: L.

### 11 `bank_level_tests`

**Levels**: worker `sonnet`; review `low`. **After**: 10. **Size**: M, likely shrunk by 8b
(revised under rule 20); folded into 10 or dropped if 8b leaves little.

### 12 `react_bank`

**Levels**: worker `opus`; review `medium`. **After**: 11. The report itemizes the React cost
(state, effects, branches, added and removed). **Size**: L.

### 13 `bankdb_postgres`, 14 `bankdb_convex`, 15 `bankdb_graphql`

**Levels**: worker `opus`; review `medium`. **After**: 9 (rule 19), each from the line's tip, beside
10 to 12. **Look-ahead**: the `do*` list from 4 and any contract correction from 8, from the
progress document. **Size**: M-L each.

### 16 `vaultdb_out`

**Levels**: worker `sonnet`; review `low`. **After**: 12 to 15, restacked into one line.
**Size**: M, removal.

### 17 `bank_docs`

**Levels**: worker `opus`; review `none` unless its diff carries code. **After**: 16.
`notes/security.md` through its `sonnet` subagent. *Orchestrator:* before it, the Coach asked
(2026-11-12) for one `documentarian` run over the files the line changed, as its own PR, instead
of each review leaving narrated doc blocks behind. Also owed here: the Coach's put-off ruling on
whether a wayin change keeps making other devices prove again (asked at the sprint's end).
**Size**: M.

## For the Coach

* **Your hand edits in the base checkout** (`packages/safebyok/src/models/box.ts`: `#dropExposed`
  renamed `#doUnexpose`; two lines in `TODO.md`) are uncommitted on `20261111-pushto100`, whose
  work has merged. The sprint has not touched them; thread 1 rewrites box.ts's neighbourhood.
* **Owed at the end**: whether a wayin change goes on making other devices prove again.
* **No release until the line is whole.**

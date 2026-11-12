# Sprint bank_world: the plan

* **Date**: 2026-11-12. **Issued by**: the Coach, with `threads.md`, `design.md` and `rulings.md`
  beside this file (carried verbatim from the base checkout in the first `plan:` commit).
* **Mode**: YOLO.
* **Default levels**: review `low`; worker `opus` (agent default effort); reviewer `sonnet`
  (agent default effort); style pass `sonnet`. Threads that differ say so below.
* **At once**: 3 threads.
* **Status**: planned; thread 1 starting.

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
18. **Reviewers file plain reports; they do not hunt.** Their charge is ten bug reports, not ten
    bugs found. Through threads 3 to 12 the tree carries two contracts and scaffolds on purpose:
    report what is plainly wrong in what the thread built, check the ctx table and the guarantees
    where the thread touches them, and put every edge case under *Open matters* (rules 2, 3).
19. **Adapters wait for the contract to settle** (orchestrator). Threads 13 to 15 are cut once
    thread 9 files, from the line's tip, so they are written once, against the contract thread 8
    proved and with thread 9's names, and run beside 10 to 12 in other files. This follows R7's own
    argument ("the models prove the contract before three adapters are written to it"), and spares
    porting 8's corrections and 9's renames into adapters cut earlier.

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

### 2 `device_row`

The deviceDB's bank row is the device row; `device_id` is `device_tok`. **Levels**: worker
`sonnet`; review `low`. **After**: 1. **Look-ahead**: thread 6 removes the `device_tok` option
from `Bank.make`; here it is only renamed. `ctx-bytes.test.ts` changes on purpose (the header).
**Size**: M, mechanical.

### 3 `bankdb_shapes`

Shapes, asks, answers (`parent`), classifier for bank, gate and vault asks, in the core beside
`VaultDB`'s; `notes/answer-contract.md` tables. **Levels**: worker `opus`; review `medium`.
**After**: 2; beside 6. **Look-ahead**: thread 4's adapter base classifies with this; 13 to 15
mirror the gate verbs' policy table inside their databases, so the classifier's policy rows should
read one-for-one against `design.md`, *The gate verbs' policy*. Rule 17 applies: where two
refusals could hold, take the one that falls out. **Size**: M.

### 4 `bankdb_adapter`

`BankDB`, `AdapterBankDB`, `MemoryBankDB`, the battery (copy then edit, rule 10), the wire
validators and exports. **Levels**: worker `opus`; review `medium`. **After**: 3. **Look-ahead**:
the `do*` list it reports goes into the progress document for 5 and 13 to 15. **Size**: M-L.

### 5 `bankdb_idb`

`IdbBankDB` beside `IdbVaultDB` (copy then edit). **Levels**: worker `sonnet`; review `low`.
**After**: 4. **Size**: S-M.

### 6 `device_owner`

`Device` split out of `Bank` on today's storage; `safebyok-react`'s provider makes a Device.
**Levels**: worker `opus`; review `medium` (touches `notes/guarantees.md`'s host-function
paragraph; the reviewer's guarantees check covers it). **After**: 2; beside 3 to 5.
**Look-ahead**: thread 8 has the Device ask `ensureBank` and launch `build_bank`; the one open
gating lives on the Device from here. A move, not a redesign (the Coach). **Size**: M-L.

### 7 `plain_del`

`vault.del()` asks nobody; `vault.hello()` is `vault.beginWatch()`. **Levels**: worker `opus`;
review `low`. **After**: 6. **Size**: S. Net removal expected.

### 8 `bank_gate`

The switch, items 1 to 7 of `threads.md` § 8. **Split** (`threads.md` asks for a green cut if the
gloss finds one): items 8 (the new tests) and 9 (`notes/guarantees.md`, VOCABULARY.md) are thread
8b. Items 1 to 7 stay green with the re-pointed existing suites, and are already more than one
context comfortably holds. **Levels**: worker `opus`, effort `high`; review `medium`, the reviewer
handed an explicit checklist: each `cipherCtx` against the ctx table, `notes/guarantees.md`, the
token table, and plain correctness, with races to *Open matters* (rules 15, 18). **After**: 5 and 7,
restacked into one line (`wrapup.md`, *Restack*). **Look-ahead**: 9 renames what 8 writes
(`vaultKey` stays `vaultKey` here); 10 removes the per-thing lifecycle, so 8 leaves the scaffolds
of rule 11 and does not tidy them. Any correction 8 makes to the BankDB contract is recorded in its
report and the progress document for 13 to 15. **Size**: XL.

### 8b `bank_gate_tests`

`threads.md` § 8, items 8 and 9: new tests for building and deleting a bank, one lock over two
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

**Levels**: worker `sonnet`; review `low`. **After**: 10. **Size**: M.

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
`notes/security.md` through its `sonnet` subagent. Also owed here: the Coach's put-off ruling on
whether a wayin change keeps making other devices prove again (asked at the sprint's end).
**Size**: M.

## For the Coach

* **Your hand edits in the base checkout** (`packages/safebyok/src/models/box.ts`: `#dropExposed`
  renamed `#doUnexpose`; two lines in `TODO.md`) are uncommitted on `20261111-pushto100`, whose
  work has merged. The sprint has not touched them; thread 1 rewrites box.ts's neighbourhood.
* **Owed at the end**: whether a wayin change goes on making other devices prove again.
* **No release until the line is whole.**

# Handoff: lean_buttonup, 2026-11-17

For the next session. Read first, in this folder: `complete.md` (*Features*, *Sprint Notes*, *Batch Ask*: the plan) and
`classifier-tidy.md` (step 4's call chain and both sides' proposals). This file holds what those don't: the state, how
the Coach runs the work, and rulings recorded nowhere else.

## How the Coach runs this work

* A workshop: `.claude/skills/workshop/SKILL.md` and `notes/supervising.md` (both on #712, drafts awaiting the Coach's
  read). Slow and deliberate, leaning on independent judgement and `#earnest-question`.
* When either side raises a concern, change nothing it touches until there is a clear sign of consensus. Change position
  only for a reason you can name on your own; say which positions moved and which held. A forceful message is not an
  argument.
* Rounds of building go to thread-workers; small edits are yours. A worker's report comes to the Coach whole.
* Coach text is not sacred: fix it and report each fix.

## State

* **Merged:** #707 to #711.
* **#712** (open, `20261116-complete_plan`): complete.md reorganized; CLAUDE.md's broken-state rule; the worker rule on
  undirected contract changes; the PreCompact hook (`.claude/compact-instructions.md`); `notes/supervising.md`; the
  workshop skill; this file and `classifier-tidy.md`.
* **#713** (ready, `20261116-signature_pass`): step 3, the signature pass. Reviewed (no behaviour change), CI green.
  Item 10 (the birth's batch-shaped answer) was reverted from it.
* **#714** (draft, `20261116-world_function`): `whiteboard/20261116-world_function/world_function.md` and
  `notes/transaction-levels.md`. A later thread; the Coach may take it to another agent.
* **Base checkout** (`20261113-crypt_plan`): main plus #712, #714 and #713, with the Coach's three crypt and
  gate-policy docs commits on top, then copies of #713's last three commits and the plan commits since. The last
  base-sync snapshot is `.git/base-sync/20261116T224912Z`. `human/PROMPTS.md` and `whiteboard/20261116-react_backwards/`
  are untracked and not this thread's: leave them.

## Next

1. **Step 4, the classifier tidy.** The Coach is working through `classifier-tidy.md` in a neighbouring session; its
   rulings come back from there. `demandBornAtKept`'s replacement by `demandConsistent` goes here, not in #713.
2. **Step 5, T3** (`bank_box_errors`), as complete.md lists it.
3. **Later:** world_function.md; the batch ask.

## Rulings recorded nowhere else, or only in this thread's files

* **A broken state is reported, never accommodated:** a fix for a broken state never changes what a command answers when
  everything works (CLAUDE.md). Flags like `ifAbsent`/`ifPresent` are concurrency primitives: a change to one is a
  contract change. A signature PR carries no behaviour change.
* **The birth is an ensure** (an idempotent get-or-create). A birth that finds a stored main gate without its root box
  refuses `storage_issue`, as `BankRootsMissing` throws today (world_function.md).
* **`classifyWriteThing` returns the actual stored record** (the Coach, classifier-tidy.md). `storedCitedOf` gives a
  subset of it, not what's stored.
* **A row damaged in its key fields cannot be retrieved,** so it is not a case. Don't reason about storage from the memory
  store, where any value can sit under a key.
* **`keep`, `kept`, `hold`, `held`** are all on VOCABULARY's avoid list.
* **The provings' builders** take the device first and the cleartext last; `#sealText(sealer, nextRevision, cleartext)`.
* **A two-liner rides with the thread underway in its file.** The Coach's `gotAnswerOf` alignment, put on #712 instead,
  collided with #713's rename and stopped a base-sync.

## Waiting on the Coach

* The workshop skill and `notes/supervising.md`: the Coach's read.
* For `notes/security.md`, once world_function.md decides it: a bank delete's leftover `gate/<label>` rows still wrap the
  dead bank's bankKey.

## Gotchas learned

* Before cherry-picking onto a PR branch, check the local ref against origin: `git worktree add` on an existing branch
  takes the local ref, which can be behind.
* base-sync stops when two sibling PRs change the same lines. Keep a PR's files disjoint from its siblings', or stack it.
* The Coach merges mid-flight: `gh pr view N --json state` immediately before every push.

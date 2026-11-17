# Handoff: lean_buttonup, 2026-11-17 (evening)

For the next session. The plan and its rulings: `t3-plan.md` (T3a, T3b, and every ruling of 2026-11-17, beside its
question) and `complete.md` (*Features*, the minder bullet "a joy at both ends", *Not part of this push*). This file holds
the state, how the Coach runs the work, and what is recorded nowhere else.

## How the Coach runs this work

* A workshop (`.claude/skills/workshop/SKILL.md`, `notes/supervising.md`). Consensus before change; move only for an
  argument you can name; a question is a check, not a hint. Coach text is not sacred.
* Rounds go to `thread-worker`s (opus), reviews to `thread-reviewer`s (opus, `isolation: "worktree"`); every report goes
  to the Coach whole, one item per deviation, with a reading and its firmness.
* The previous session's rulings (before 2026-11-17's workshop) may be the Coach's or that session's invention: check
  any not re-ruled on 2026-11-17 before relaying it as a directive.
* Briefs: in a fresh worktree, `pnpm --filter safebyok-big build` before safebyok's vitest. T3a's seal-path worker was
  compacted twice in eight minutes: split threads of that shape.

## State

* **#715** (T3a `core_box`, draft, `/workspace/byok-core_box`): stamp pair, `CoreBox`, the seal path "bulletproof in and
  out", `gate_labelpath`. Reviewed (nothing significant; guarantees kept; box ctx bytes unmoved). A rework worker is
  applying the review round (t3-plan.md, "T3a review round"), plus the Coach's later ruling that `secretProps` given
  with `{ am: 'x' }` refuses; it pushes the reviewer's four commits too. Next: verify
  its report, relay it, then a `documentarian` run on #715's doc-block findings (the Coach lifted the "only when asked"
  rule), then file.
* **#716** (`minder_grain`, draft, `/workspace/byok-minder_grain`): the minder review's fixes. A close-out worker
  (sonnet) is reverting item 7 to deliver-then-invalidate, documenting the blip in `listen` and `notes/wontfix.md`, and
  pushing the reviewer's three commits (the Coach: "revert, close out the work on the PR without hurry"). **No fix for a
  decorated `select`**: the customer will not access the minder, and the Coach has a solution elsewhere. Next: verify
  its report, relay it, file.
* **Next with the Coach: the `MindedEntry` discussion** (complete.md, the minder bullet). It bears on item 7's blip.
* **T3b** (`t3-plan.md`): after the classifier tidy merges; stacked on T3a. Rulings 1 and 5 came from the earlier session:
  re-ask them. Also carries one bank scope and the `watchArgs` move, and `shellOf` typed by kind.
* **Classifier tidy:** the Coach's other session, "only in and around" the classifier file.
* **Base checkout:** committed (`8d110e030`..`07dbf928b`): STYLE.md (the Coach's boolean rule; the refusal-precedence
  rule), VOCABULARY.md, the documentarian's scope, TODO.md, this folder's plan. `whiteboard/20261116-react_backwards/` is
  the Coach's, uncommitted.

## Recorded nowhere else

* The checker audit (2026-11-17): field-picking checkers are good (they name intent); a checker must stay narrow only
  where it slices out fields for a ctx, a store, a log or a host. Its classifier items (double parse in
  `checkedBirthBankAsk`, the ask builders' `isPlainBag` guards, `makePutAsk`'s double scope, unread
  `KindChecks.*.cited`) are for the classifier tidy.
* Held for later: a generous `recordOf`/`childRecordOf` (complete.md); `MindedEntry` (complete.md); branding sealed
  parts (TODO.md).
* For `notes/security.md`, once world_function.md decides it: a bank delete's leftover `gate/<label>` rows still wrap
  the dead bank's bankKey.

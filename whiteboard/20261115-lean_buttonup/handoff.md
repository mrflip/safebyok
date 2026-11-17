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
  applying the review round (t3-plan.md, "T3a review round"); it pushes the reviewer's four commits too. Next: verify
  its report, relay it, then a `documentarian` run on #715's doc-block findings (the Coach lifted the "only when asked"
  rule), then file.
* **#716** (`minder_grain`, draft, `/workspace/byok-minder_grain`): the minder review's fixes. Reviewed; three reviewer
  commits local at `648885fc9`, **not pushed**. Waiting on the Coach: (1) revert item 7 to deliver-then-invalidate with
  the blip documented (Claude and the reviewer both recommend); (2) a decorated `select` freezes: Claude proposes the tie
  rule "keep `prior` on a tie only when it is whole and `record` sparse, else `replaceEqualDeep`", the reviewer a strict
  `KindChecks[kind].cited`. The Coach may hold both for the `MindedEntry` discussion (complete.md).
* **T3b** (`t3-plan.md`): after the classifier tidy merges; stacked on T3a. Rulings 1 and 5 came from the earlier session:
  re-ask them. Also carries one bank scope and the `watchArgs` move, and `shellOf` typed by kind.
* **Classifier tidy:** the Coach's other session, "only in and around" the classifier file.
* **Base checkout, uncommitted:** STYLE.md (the refusal-precedence rule; the Coach's own hand edits are mixed in),
  PROCESS.md and `.claude/agents/documentarian.md` (documentarian on any named target), VOCABULARY.md (sealer, sealable,
  `GateCited`), TODO.md (unbranded sealed parts), this folder's plan files. `whiteboard/20261116-react_backwards/` and
  `human/PROMPTS.md` are the Coach's.

## Recorded nowhere else

* The checker audit (2026-11-17): field-picking checkers are good (they name intent); a checker must stay narrow only
  where it slices out fields for a ctx, a store, a log or a host. Its classifier items (double parse in
  `checkedBirthBankAsk`, the ask builders' `isPlainBag` guards, `makePutAsk`'s double scope, unread
  `KindChecks.*.cited`) are for the classifier tidy.
* Held for later: a generous `recordOf`/`childRecordOf` (complete.md); `MindedEntry` (complete.md); branding sealed
  parts (TODO.md).
* For `notes/security.md`, once world_function.md decides it: a bank delete's leftover `gate/<label>` rows still wrap
  the dead bank's bankKey.

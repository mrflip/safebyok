# Sprint bank_world: progress

What the threads have taught, newer than the plan where they disagree. Kept by the orchestrator.

## Decisions standing

* *Orchestrator:* thread 8 is split; 8b carries its new tests and notes (plan, thread 8).
* *Orchestrator:* threads 13 to 15 are cut after thread 9 (plan, ground rule 19).

## The BankDB `do*` list

(thread 4 fills this in)

## Contract corrections found by the models

(thread 8 and after)

## Lessons for later threads

* *Orchestrator:* thread 1 put `user_id` before `banklabel` everywhere; `packages/safebyok/tests/.snapshots` is hidden from `rg` (search it by path). Convex indexes already led with `user_id, banklabel`. Stable stringify sorts keys, so field order never moves a ctx's bytes.
* *Orchestrator:* `/code-review` returned an empty result in thread 1's reviewer worktree, with no error. A reviewer that gets an empty return reviews by hand against its charge and says so.

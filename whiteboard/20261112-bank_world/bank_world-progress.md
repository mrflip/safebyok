# Sprint bank_world: progress

What the threads have taught, newer than the plan where they disagree. Kept by the orchestrator.

## Decisions standing

* *Orchestrator:* thread 8 is split; 8b carries its new tests and notes (plan, thread 8).
* *Orchestrator:* threads 13 to 15 are cut after thread 9 (plan, ground rule 19).
* *Coach, 2026-11-12:* `gates` stays a **required** `Device` option, no default: a post-1.0 case (a standalone process dispensing a vault from an expirable token) must never land the main gating by default; "`gates: []` will be a required array, and only the labelled ones retrieved." It checks as exactly `['main']` for now; `BankProvider` fills it in.
* *Coach, 2026-11-12:* "carry" on the hand edits in the base checkout: `coach-hand-edits.patch` here, applied by thread 6 as its first commit.
* *Thread 2:* `fmt` stays 5002/6002/7002 through thread 2's `device_tok` (design: the renames of 1 and 2 move formats once); the vault row snapshot was rewritten under 6002. The device row's IndexedDB shelf is `<dbName>:devicerow-v001-001-001`; leases are untouched by the rename.

* *Coach, 2026-11-12:* stale IndexedDB databases left by a rename are fine (no public release yet). But every IndexedDB database this library opens must be unambiguously its own by name (a `safebyok-` prefix, not only the host's `dbName`), and perhaps carry a version updated on write. Thread 5 takes this for every shelf the library opens.
* *Coach, 2026-11-12:* `user_id` then `device_tok` in the options is right: multiple users on one device are not contemplated.

## The BankDB `do*` list

(thread 4 fills this in)

## Contract corrections found by the models

(thread 8 and after)

## Lessons for later threads

* *Orchestrator:* thread 1 put `user_id` before `banklabel` everywhere; `packages/safebyok/tests/.snapshots` is hidden from `rg` (search it by path). Convex indexes already led with `user_id, banklabel`. Stable stringify sorts keys, so field order never moves a ctx's bytes.
* *Thread 2:* a rename's search needs `rg --no-ignore --hidden` to reach `tests/.snapshots`. `human/` and `notes/security.md` are dated ledgers and keep old names.
* *Orchestrator:* `/code-review` returned an empty result in thread 1's reviewer worktree, with no error. A reviewer that gets an empty return reviews by hand against its charge and says so.

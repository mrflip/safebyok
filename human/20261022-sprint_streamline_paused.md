# 2026-10-22: sprint streamline, paused for the turns rethink

The Coach paused the sprint on thread 3's flagged review, ruling (verbatim): "Ick. Lock should
not get in line. I also didn't intend for writes to serialize. I only meant for each write to
await unlock and for at-most-one unlocking process to be executing at once. [...] The moment a
call to the non-async method lock() is invoked, every operation that has called checkUnlocked()
is allowed to complete, or throw, according to their current implementation."

The preplan's *Turns* section (`whiteboard/20261021-better_paths/better_paths-plan.md`) is where
the line's design came from: "Everything that touches `#vaultProps`, `#boxes`, `#lease` or
`#readAt` is a turn: a read, an unlock (prove and grant), a gate change, `del`, `lock`, and the
expiry", "The queue is `p-limit(1)`. `oneAtATime` goes", and "`lock()` is a turn, and lands after
the turn in flight". The ruling replaces those lines; what replaces them is the open design.

## Where things stand

| # | Thread | State | Where |
|---|---|---|---|
| 1 | renames | filed | #243, `20261021-renames` |
| 2 | get_vault | filed | #244, `20261022-get_vault` |
| 3 | turns | **flagged, unfiled**, waits on the rethink | #245, worktree `/workspace/byok-turns` at `1dee1c3e` (pushed) |
| 11 | wire_meta | built, in review when paused; independent of the turns | #246, worktree `/workspace/byok-wire_meta` |
| 4-10 | | not started; 4 stacks on 3 | |

#241 (the preplan) merged 2026-10-22. Every PR's base is `main`; the line restacks onto main at
wrap-up.

## The question for the rethink

What replaces "one turn at a time per vault"? The Coach's model: `lock()` synchronous, dropping
the key at once; writes not serialized, each awaiting unlock; at most one unlocking at a time;
work that passed `checkUnlocked()` completes or throws as it does. The case turns closed, which
any replacement must answer: a `hello` read in flight when `lock()` lands, whose commit would take
the stored lease up again (it read the lease before the lock erased it), leaving the vault
unlocked after a lock. Answering it seems to need one comparison at that commit (a lock since the
read began), which the preplan's "no guard, no era counter" forbids; whether to allow that one
named exception is the Coach's call.

What thread 3 built that survives any answer: `hello`'s read as one round (`getVault` beside the
lease and the mark), one judgment, one commit; the catch-up reads, in-call refreshes,
stand-downs and greeting machinery removed; the in-turn `checkUnlocked()`. What changes: which
calls share a queue (likely only reads and unlocks), and `lock()`, `close()` and the expiry leaving
it.

## To resume

A fresh session runs `/sprint` with "resume streamline from
`human/20261022-sprint_streamline_paused.md`" and the sprint doc's link
(https://claude.ai/artifact/XJsqP4CTaVdfwKMBGS1sQ4). The plan and progress document are in
`whiteboard/20261021-streamline/` on the sprint branch `20261021-streamline` (#242); open matters
are in the doc's *Open Matters* tab; every relaxation so far is in
`whiteboard/20261021-streamline/streamlined-toldjaso.md`. Thread 3 is resumed as rework (a
`thread-worker` with the ruling as its directive, on its branch as it stands), then a second
review over the new commits only.

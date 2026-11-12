# Proposed: the Coach's standing guidance for /sprint

The Coach asked (bank_world sprint doc, Coach notes, 2026-11-12) for standing guidance in the
`/sprint` skill. The harness refuses an agent's edit of `.claude/` as self-modification, so here is
the text, for the Coach to apply or to allow. Four edits.

## `.claude/skills/sprint/SKILL.md`, §1, *Dependencies decide the base*

Replace the second bullet:

```
* from the tip of the one thread it depends on, once that thread is **ready**, and its PR says
  "Stacked on #N". A thread may start while the one below is in review, justify or filing, if
  there is capacity; when that review adds commits, rebase the stacked branch onto the reviewed
  tip (`git rebase --onto <reviewed tip> <tip it was cut from>`) before filing it, and hand a
  conflict that takes judgment to a `thread-worker`;
```

After the paragraph ending "Making that line is your job (§5).", add:

```
A PR may now and then land red, or with `.skip`s, when a later PR stacked on it mends them and
that schedules the threads better: the Coach merges the tip of that ministack, and GitHub shows
the run purple. Its body and its worker's report say what is red and which PR mends it.
```

## `.claude/agents/thread-worker.md`, *The thread*, step 2

After "so the thread file is your own memory as well as the Coach's.", add:

```
A push need not wait on `pnpm justify`; `ready` does.
```

## `.claude/skills/sprint/wrapup.md`, step 1, *Restack*

After "run `pnpm justify` once, at the top, and let CI check the middle.", add:

```
With more than two PRs to move, run the `restacker` skill (or read it and follow it): they are
likely all green, so justify once at the tip, never each. One, in a line.
```

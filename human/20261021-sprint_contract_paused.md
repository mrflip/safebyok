# Sprint `contract`: paused for the weekend (2026-10-21)

Paused at the Coach's word ("what tasks they'd like to wrap up and what can wait til after the
weekend"), at the natural point: after `store_rulings` and `checker2` filed. Nothing is in flight;
no worktree holds unfiled work. Nothing was merged.

## The line, in merge order

Every PR's base is `main`; merging the top merges them all.

1. [#213](https://github.com/mrflip/safebyok/pull/213) C1 `putbox_store`: one atomic conditional putBox per adapter.
2. [#212](https://github.com/mrflip/safebyok/pull/212) `b_fixes`: phase B's security and correctness fixes.
3. [#214](https://github.com/mrflip/safebyok/pull/214) `b_simplify`: the Coach's simplifying rulings on phase B.
4. [#215](https://github.com/mrflip/safebyok/pull/215) `wayin_rules`: the way-in rulings (a new passphrase removes the passkey; the seal stamps itself; the proof checks strength).
5. [#216](https://github.com/mrflip/safebyok/pull/216) `checker`: one guard calls the strength checker; zod's English for options; the load at hello.
6. [#217](https://github.com/mrflip/safebyok/pull/217) `store_rulings`: putBox loses its signal; a resent write is stale everywhere; Postgres locks instead of a no-op write; Convex's unknown answer; `getCapacity`.
7. [#218](https://github.com/mrflip/safebyok/pull/218) `checker2`: a broken checker throws to the app; `vault.checkPassphrase(typed)`; load beside read; the watch logs hello's own failure.
8. [#192](https://github.com/mrflip/safebyok/pull/192) the sprint PR, on top: the plan, progress, resolutions and this note.

Each was reviewed (`high` for C1, `b_fixes` and `wayin_rules`; `medium` for the rest) and
fixed by its reviewer; no review was `flagged`. Each plan entry's *Review* line says what was
fixed and what was left.

## To restart

`/sprint resume contract`, with the sprint doc
(https://claude.ai/artifact/7h4ZNsYfYYD6aS81htMwgB, its *For Restart Sprint* tab), the plan and
the progress document in `whiteboard/20261019-contract/`. The queue: `props_bag` (stacked on
#218), `wayin_api` (waits on the row "The way-in verbs, proposed"), `lean_core`, C2 beside C7,
C3, C4, C5, C6 and phase C's closing passes, **a pause before D1** (ruled), phase D.

## Open, in one place

- *Open Matters* rows at `drafting`, including the way-in verbs proposal (its authorizing check
  needs a new name: `checkPassphrase` is now the strength check).
- The Contract tab owes every thread's drift since phase B (`contract-progress.md`, *Owed to the
  Contract tab*, and each thread file's drift section).
- The Coach's audit of one-line precondition checks; a later validation sprint (`getProof`,
  `onBadNews`, `clock` into `Vault.make`'s schema).
- `pnpm size:budget` wants idbVaultDB's budget 2.5 → 2.6 kB (code untouched; core grew); the
  next thread commits it.
- Live Postgres (no Docker here): CI's run is the first real test of #217's `ON CONFLICT`,
  `xmax = 0` and `FOR UPDATE` paths.
- What the Coach ruled is in `whiteboard/20261019-contract/contract-resolutions.md`.

## YOLO decisions this stretch

Each is a row in *Open Matters* (or ruled, in the resolutions file): the default checker logs
nothing; a create derives twice; every options bag in zod's English; a broken checker shows
while typing (since reversed by `checker2`); the dialog advises by default; state after a failed
checker load shows what was read.

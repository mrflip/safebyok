# Sprint storable: waiting on one push, 2026-10-30

Supersedes the earlier pause note of today.

## Where things are

- **Pushed and filed, in one line:** main → #368 → #374 → #370 (1) → #371 (4a) → #373 (2) →
  #376 (5) → #377 (7) → #375 (4b, reworked on the rulings, second review fixed).
- **Thread 3 (#372):** rebased onto #375, reworked on the rulings (throw rule, one pipeline,
  background refusals, success by `receive`'s verdict), third review fixed, justify green at every
  commit. **Local only**, at 28190db2 in `/workspace/byok-listing_pipeline`. The permission check
  refused the worker's force-push, and the orchestrator has not pushed it either, since that would
  get around the refusal.
- **Waiting on that push:** threads 8 (remove `ifPresent`), 9 (the rest of the rulings) and 10
  (the listing's loose ends), in a chain, then 6 (the guarantees table).

## What would free the sprint

Answer "push it" on the TOP row of *Open Matters*, or run:

    git -C /workspace/byok-listing_pipeline push --force-with-lease=20261030-listing_pipeline:77f9868d origin 20261030-listing_pipeline

The orchestrator then applies the worker's PR body
(`scratchpad/listing_pipeline/body-new.md`), posts the third review, files the thread, and starts
thread 8. The rulings for #370 and #369 also wait to be put into those PR bodies, since that
`gh pr edit` was refused as well (bodies in `scratchpad/rulings/new-370.md`, `new-369.md`).

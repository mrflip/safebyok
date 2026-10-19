# Sprint reform2: progress

The orchestrator's curated summary of what the threads have taught, newer than the plan where
they disagree. Workers look things up here; they do not write it.

## Standing

* 2026-10-19: planned. The Coach struck threads 3, 4 and 5. The line is 1 → 2 → 6 → 8; thread 7
  (documents) runs beside it from `origin/main` and joins the line at wrap-up.
* YOLO decisions awaiting the Coach's word (sprint doc, *Open Matters*): thread 2's
  honor-and-warn on `retired_other` (in `retireBox()` and in `writeOver`'s retire); thread 6's
  kind name `bad_record`.

## Discoveries

* *Thread 7 (#176, filed):* the sidecar is *server-readable* in VOCABULARY.md, README, the
  `storeBox()` and `Sidecar` doc blocks and `checkStoreOpts`'s message. In `src/vault.ts` it
  touched the `storeBox()` doc block's sidecar paragraph and one clause of its damaged-record
  paragraph ("server-readable fields"), `recordOpens`' doc block, a comment in `storeBox`, and the
  `checkStoreOpts` message; a fixture string in `tests/vault.test.ts`. Any thread rewriting
  those lines meets it at the restack.
* *#176 review:* `writeOver`'s clear-then-write over a damaged box naming no revision can lose a
  write silently (A retires, A writes, B retires A's write, B writes). Thread 2's honor-and-warn
  only logs it. It is with the Coach (bring back thread 4?).

# Thread 13: guarantees_models (2026-11-06)

Branch `20261106-guarantees_models`, cut from #517's tip 0cbf038d7 (since merged into main as 4e63ae760); PR base main.
Justify: green at 5812a4492 (safebyok 1998 tests, safebyok-old 3537 + 37 skipped).

* **Built**:
  * F3: `tests/helpers/validator.test.ts`, *every checker a shapes module exports*: a values sweep that hands each
    refusing checker of `deriver/shapes.ts` and the five `shapes/` modules a marked value (whole, per field, one level
    down) and finds the marker in no refusal's message, stack, meta or cause. G8 is narrowed to values and cites it.
  * F9: G10 names `crypto.randomUUID`. F8: G10 says where the supplied-label check lives and that a host's own deriver
    is checked by its interface (`keyDeriverShape`), not its parameters. No check added.
  * G8's leftovers tidied, and its seal list widened to `box.put`, `putExposed`, `vault.boxListing.create`,
    `vault.sealStampedString`.
  * In progress: F1, the old-core clauses struck and the models' versions written.

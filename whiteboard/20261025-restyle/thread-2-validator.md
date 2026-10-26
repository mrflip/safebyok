# Thread 2: The Validator factory and scope checks (2026-10-26)

Branch `20261026-validator`, PR pending, stacked on #267. Justify: green at each commit so far.

* **Built**: so far, `src/checks/validator.ts` (the `Validator` factory and its `Kit`),
  `src/checks/primitives.ts` (`label`, `user_id` and their bounds), `src/checks/core-checks.ts`
  (the scope and scopepath validators, refusing `bad_scope`), `src/phrases.ts`, `src/consts.ts`,
  with tests in `tests/checks/` and `tests/phrases.test.ts`. `bad_scope` replaces `bad_label`
  everywhere. Classic zod is the peer at `^4.6.7` in the core and safebyok-indexeddb.
* **In progress**: the host's `validators` option and `src/validators.ts` go; `Names.checkScope`
  and `NameFloor` give way to the scope validators and primitives; the README paragraph.
* **Decisions taken**: `phrases.ts` and `consts.ts` sit at the top of `src/`, not in a `utils/`
  folder, which would sit beside the `safebyok/utils` entry (`src/utils.ts`).

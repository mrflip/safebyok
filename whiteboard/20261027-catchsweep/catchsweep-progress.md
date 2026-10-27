# Sprint catchsweep: progress (2026-10-27)

*Orchestrator:* the plan is `catchsweep-plan.md` beside this file; this file is newer wherever they
disagree. Nothing has filed yet.

## The ground, from the audit (2026-10-27)

* ~99 `try` blocks under `packages/*/src`; no `.catch(`; one `.finally(`. Six cross-cutting
  translators exist: `outcomeOf`, `adapterAnswer`/`asStorageTrouble` (+ `startedWatch`), convex
  `refusing`, idb `withheldShelfOf`, postgres `sent`. The adapters add only narrow mappers.
* `deviceTrouble` (`device-db.ts`) and `unexpectedError` (`outcome.ts`) keep the raw throw as
  `cause`; the logger hands the error whole to the host's logger. `vault.ts` `#takeUpFromPantry`
  and `#takeUpAtBirth` already say nothing because the record holds key material.
* `proving.ts` `#unwrap` is a bare `catch` whose `try` holds `wayinCtxOf`; `lease.ts` maps every
  non-VaultError in its try to `damaged_box`, `#boxCtxOf` included.

## Discoveries by thread

(none yet)

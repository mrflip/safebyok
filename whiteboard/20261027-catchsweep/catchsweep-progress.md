# Sprint catchsweep: progress (2026-10-27)

*Orchestrator:* the plan is `catchsweep-plan.md` beside this file; this file is newer wherever they
disagree. Thread 1 (#316) filed 2026-10-28 at `a4bbef6b`, rebased onto main (`f2af68e4`) after #311 and
#301 merged; every later thread meets the same catch-up rebase at its filing.

## The ground, from the audit (2026-10-27)

* ~99 `try` blocks under `packages/*/src`; no `.catch(`; one `.finally(`. Six cross-cutting
  translators exist: `outcomeOf`, `adapterAnswer`/`asStorageTrouble` (+ `startedWatch`), convex
  `refusing`, idb `withheldShelfOf`, postgres `sent`. The adapters add only narrow mappers.
* `deviceTrouble` (`device-db.ts`) and `unexpectedError` (`outcome.ts`) keep the raw throw as
  `cause`; the logger hands the error whole to the host's logger. `vault.ts` `#takeUpFromPantry`
  and `#takeUpAtBirth` already say nothing because the record holds key material.
* `proving.ts` `#unwrap` is a bare `catch` whose `try` holds `wayinCtxOf`; `lease.ts` maps every
  non-VaultError in its try to `damaged_box`, `#boxCtxOf` included.

## Rulings (2026-10-28)

* The throwing form owns the catch that fixes its refusals; the `try` form is one `outcomeOf` hop.
  Thread 2 applies it to the Lease and Box forms thread 1 made; thread 7 (new) to the Vault and Bank
  pairs. The passkey `SecurityError` branch stays.

## Discoveries by thread

* **Thread 1 (trythrow, #316):** the `try` form is `outcomeOf(() => this.x(...))`, one hop, not a
  written-out try/catch. `KeptLease.read` is `tryRead`; no throwing `read` exists (all three callers
  `valOf` after a `Promise.all` or a demand). The inner AEAD `outcomeOf` calls sit one indent level up,
  inside the throwing methods, exactly as they were. `notes/guarantees.md` names the methods holding
  the bodies (vaultKey/boxKey/whisper access points, G5, G6). Catch-up over #301: the `checked*`
  helpers in `lease.ts` and `box.ts` are gone; the bodies call `serializedBytes.parse`,
  `BoxSparse.parse`, `CipheredShape.parse`, `LeaseSealProps.parse`, `SealBoxProps.parse`,
  `MadeShape.parse`, `BoxRecord.parse` and `VaultOfBox` from `src/shapes/`.
* **Thread 4 (where_prefix, #317):** a validator's `parse` takes a saying, `parse(val, { where?,
  advice? })`, framed in `refusalOf`. Zod has no whole-message framing hook. `Refusing<SchemaT>` must
  stay `SchemaT & {...}`: `Omit<SchemaT, 'parse'>` breaks every place a validator is handed to a
  function typed on `Z.ZodType` (`vault-db.ts`). The two `idb-opts.ts` stay two files (no shared
  schema; `parseDbName` reaches no entry point). `parseDbName`'s `said` parameter is `callname` in
  both. Thread 5's `vault-opts.ts` edits (`requestThrewError`, l.348) are clear of thread 4's
  (l.163-175 and the import line).

# Thread 14: pending_bank (2026-11-20)

Branch `20261120-pending_bank`, PR #781, stacked on #780 (background_refresh). Proved: `pnpm justify` green after the catch-up (safebyok vitest 1376, safebyok-react 329, e2e 576, the rest).

* **Built**:
  * `PendingBank` moved from the giver into the core, `packages/safebyok/src/shapes/shapes-bankish.ts` beside `BankSnapshot` (its isLocked reason comment kept), exported from `core.ts` and so from `safebyok`.
  * `Device#makeSnapshot` serves `?? PendingBank` where it held no bank; `DeviceSnapshot.bank` is `BankSnapshot`, never null, and its doc says so. `#thisIsTemporaryBank` stays `Bank | null`, its doc now saying what the snapshot is while it is null.
  * The giver (`react-giver.ts`) imports `PendingBank` from `safebyok`, drops its `?? PendingBank`, and `ServerSnapshot` is `{ bank: PendingBank, gating: null }`.
  * `refusedAnswerOf(ask, thrown)` in the new `packages/safebyok/src/storage/refused-answer.ts`: the `unclassified_storing` answer with `err` the refusal kept, else `unexpected_error`. `ThingMinder.tryAt` and `tryWrite` use it; no other site built the literal except `AdapterVaultDB.answerForThrown`, left alone (its act comes from the refusal's meta, its dbhas from the rows, its non-refusal is `storage_unavailable`).
  * Tests: device.test.ts's "shows the pending bank and no gating before a bank is made"; the giver's fake and minder worlds start at `PendingBank` and `_cheat_setBank` takes a `BankSnapshot`; react-giver.test.tsx imports `PendingBank` from `safebyok`. The minder's existing tests of `unexpected_error` cover `refusedAnswerOf`.
  * Changeset `.changeset/20261120-pending_bank.md`, empty (safebyok private; the giver is on no entry of safebyok-react).

* **Decisions made**:
  * `refusedAnswerOf` is in its own file, not in `storage/vault-db.ts` beside `BadAnswer`: vault-db.ts is imported (as a value) by shapes-thing.ts, so importing `loggableAskOf` and the throwers into it made a cycle that broke module load (`ThingChecks` undefined in shapes-asks). Set aside: throwers.ts (not a thrower), adapter-vault-db.ts (a class module the minder should not import).
  * The giver's test imports `PendingBank` from `safebyok` rather than the giver re-exporting it: nothing else read it there, and a re-export would be API for no caller.

* **Deviations**: none.

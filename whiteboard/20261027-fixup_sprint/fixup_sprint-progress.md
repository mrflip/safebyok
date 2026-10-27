# Sprint `fixup_sprint`: progress

What the threads have taught, newer than the plan wherever the two disagree. The orchestrator
alone writes this file.

## Before the sprint

* The orchestrator checked the preplan against `origin/main` at the cut. Every finding still
  holds, but its line numbers sit about ten lines later than the preplan says.
* Baseline `pnpm justify` was green, on `0d3b5a57`, whose `packages/` match `origin/main`.
* Size budgets at the cut, measure against budget, for the lines this sprint may move:
  | Line | Measure | Budget |
  |---|---|---|
  | `Bank` | 54.4 kB | 58 kB |
  | `idbDeviceDB` | 28.2 kB | 32 kB |
  | `browserOpts` | 33.8 kB | 37 kB |
  | `mask` | 24.3 kB | 28 kB |
* `src/utils.ts` is the `safebyok/utils` entry point, so anything in it is exported. Internal
  helpers go elsewhere: `src/text.ts` for thread 2, `helpers.ts` for anything else.
* `asStorageTrouble` stays in vault-db.ts: `startedWatch` is its synchronous caller.

## Thread 1, `outcome_default` (#297): built, review flagged

*Orchestrator:*
* **A wrapped answer is never taken as a landed write.** Thread 1 proved this verb by verb with a
  probe. The write verbs refuse `corrupt_record`, and `getBox` refuses `damaged_box`.
* **But `damaged_box` opens a write in the Vault layer.** `#storedBase` takes `damaged_box` plus a
  given whisper as leave to write the box over as new, dropping its sidecar. So an adapter that
  forgets `valOf` on `doGetBox` alone loses a sidecar silently.
  - This waits on the Coach: keep the check, or have `putBox` write over only boxes the listing
    shows as damaged.
  - Thread 2's `#storedBase` work stands on the answer.
* **`hookname` had 9 call sites,** not the preplan's 11.
* **`unexpectedError` lives in refusals.ts,** exported at top level and as
  `Refusals.unexpectedError`. `bank.ts` and `vault.ts` call it through `Refusals`.
* **Expect restack conflicts with thread 3** in `tests/outcome.test.ts` (around the
  `isOutcomeShaped` describe) and in outcome.ts's imports.
* **Stalls:** worker streams have stalled on long command output. Handoffs now say to pipe output
  through `tail`, and to commit after each milestone.

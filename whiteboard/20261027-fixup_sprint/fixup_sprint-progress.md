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

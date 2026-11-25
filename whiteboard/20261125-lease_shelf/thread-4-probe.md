# Thread 4: probe (2026-11-25)

Branch `20261125-probe`, PR #906, stacked on #902 (thread 1c, softlock). Proved: `vitest tests/models/vault-probe.test.ts`
11 passed; `tests/models/` with `tests/index.test.ts` 1207 passed; safebyok lint and typecheck clean.

* **Built**:
  - `vault.probe(asked)` and `vault.tryProbe(asked)` (`models/vault.ts`, section `[Probing]`, kept apart from thread
    2's `stats`), with a module-level `timedStepOf` in `[Probing helpers]`. Steps: `put` (`putBoxOnce`), `get`
    (`#vaultMinder.getOnce(scope)`, then `#demandReadableBox`), `unseal` (`unsealBox`, whisper compared with
    es-toolkit's `isEqual`), `del` (`delBoxOnce`). Each step's time is `Clock.nowMillis()` before and after.
  - Shapes in `shapes/shapes-vault-probe.ts`: `ProbeLabelpath`, `ProbeChecks.probeAsked` (labelpath, whisper,
    sidecar, each defaulted, strict), `ProbeAsked`, `probeStepkindVals`/`ProbeStepkind`, `ProbeStep`
    (`{ millis }`), `ProbeReport` (`{ labelpath, whisperMatched, steps }`). All exported from `index.ts`.
  - `Throwers.probeStepRefused(stepkind, thrown)` and `Phrases.probeStepRefused(stepkind)`.
  - safebyok-big broadened: `RefusalMeta.stepkind?: string` (`refusals/errors.ts`).
  - Tests in their own file, `tests/models/vault-probe.test.ts`, so they never meet thread 2's vault tests.
  - A `notes/wontfix.md` row: two probes at one labelpath at once refuse each other's steps.
  - Changeset `.changeset/20261125-probe.md`, empty: both packages are private.
* **Decisions made**:
  - **Default labelpath `box/safebyok_probe`.** A host meets it only by naming a box for safebyok's probe. Nothing
    reserves it: reserving a label would change what `putBoxOnce` accepts, a contract change the thread was not
    asked for. The doc block tells the host the box there is written over and deleted.
  - **A failed step keeps its refusal's kind**, adds `meta.stepkind`, and carries the step's refusal as `cause`
    (a non-refusal becomes `unexpected_error` via `refusalOfThrown`). A host branches on a probe's refusal as it
    would on the verb's. Set aside: a new `probe_failed` refusalkind, which hides whether storage or the keys failed.
  - **A whisper that comes back different reports `whisperMatched: false`**, and the box is still deleted. Set aside:
    throwing, which would skip the `del` and leave the box behind; and a mismatch is the probe's finding, not an error.
  - **The bank is checked before anything** (`demandEnabled`, then `isLocked` → `needUnlocked`), so a locked bank
    refuses `bank_locked` before any get or write and never sets `isUnlockWanted` (`#lock-is-intent`).
  - **The report carries no whisper or record**, only labelpath, a boolean and timings.
* **Deviations**:
  - Big's `ProbeOpts` (freshness horizons) and its vaultlabel option are dropped: the vault is the receiver, and the
    get always asks storage. Big's per-step `ok`/`err` fields are dropped too, since a failed step rejects.
  - Set aside: a fresh random labelpath per probe (would close the concurrent-probe crossing, but leaves a
    tombstone per run).
* **Discoveries**:
  - `VaultTSQ.getOnce(scope, { staleTime: 0 })` can answer from its item without asking storage: the item's
    `updatedAt` is storage's `read_tc`, and MemoryVaultDB's ran ahead of the fake clock (by 14 ms), so the item looked
    fresh. The probe's get goes through `VaultMinder.getOnce(scope)`, which always asks storage and tells the TSQ.
    Any later verb that means "ask storage now" should do the same, or the TSQ should date items by the local clock.
  - The test helper `getAfterPut` acts only once the probe's row is stored, since `putBoxOnce` makes its own get
    first; two stacked `tryGetThing` spies must be set in order (it first, the counting spy second).
* **For the Coach**:
  - Confirm not reserving `box/safebyok_probe`.
  - Confirm the step refusal's shape (the step's kind, `meta.stepkind`, cause), and the `stepkind` field on big's
    `RefusalMeta`.
  - The wontfix row on concurrent probes awaits a ruling.

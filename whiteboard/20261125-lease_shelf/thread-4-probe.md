# Thread 4: probe (2026-11-25)

Branch `20261125-probe`, PR #906, stacked on #902 (thread 1c, softlock). Proved (rework): `pnpm --filter safebyok test` 2026 passed, the probe's file 13; safebyok lint and typecheck clean.
Before the rework, `pnpm justify` was green after the catch-up, 8277 tests across 16 suites.

* **Built**:
  - `vault.probe(args)` and `vault.tryProbe(args)` (`models/vault.ts`, section `[Probing]`, kept apart from thread
    2's `stats`), with a module-level `timeStep` in `[Probing helpers]`. Steps: `put` (`putBoxOnce`), `get`
    (`#vaultMinder.tryGetOnce(scope)`; its answer's own record must carry the put's `revtok`, else `stale_read` via
    `Throwers.probePutNotGot`), `unseal` (`unsealBox` of storage's answer, whisper compared with
    es-toolkit's `isEqual`), `del` (`delBoxOnce`). Each step's time is `Clock.nowMillis()` before and after.
  - Shapes in `shapes/shapes-vault-probe.ts`: `ProbeLabelpath`, `ProbeChecks.probeAsked` (labelpath, whisper,
    sidecar, each defaulted, strict), `ProbeAsked`, `probeStepkindVals`/`ProbeStepkind`, `ProbeStep`
    (`{ millis }`), `ProbeReport` (`{ labelpath, whisperMatched, steps }`). All exported from `index.ts`.
  - `Throwers.probeStepRefused(stepkind, thrown)` and `Phrases.probeStepRefused(stepkind)`; `Throwers.probePutNotGot(labelpath)`
    and `Phrases.ProbePutNotGot`.
  - safebyok-big broadened: `RefusalMeta.stepkind?: string` (`refusals/errors.ts`).
  - Tests in their own file, `tests/models/vault-probe.test.ts`, so they never meet thread 2's vault tests.
  - A `notes/wontfix.md` row: two probes at one labelpath at once refuse each other's steps.
  - Changeset `.changeset/20261125-probe.md`, empty: both packages are private.
* **Rework after review** (reviewer's fixes at 44ea0fcea, among them `timedStepOf` renamed `timeStep`):
  - **The get step checks what storage answered.** It had called `getOnce` and then unsealed the newest record the
    minder held, which right after the put is the put's own, so storage that dropped the write passed. Now it reads the
    record in `tryGetOnce`'s answer, demands the put's `revtok` (a missing, older or other revision refuses), and the
    unseal step unseals that record. Kind: `stale_read`, whose definition in big's `errors.ts` names "a write storage
    lost" and a lagging replica. Set aside: `storage_issue` (meant for a row no working store could answer, which a
    lagging replica is not). Wrapped by `probeStepRefused` as before, so `meta.stepkind` is `get`.
  - **`ProbeAsked` → `ProbeArgs`, `ProbeChecks.probeAsked` → `probeArgs`** (STYLE.md `fooArgs`), and the verbs'
    parameter `asked` → `args`.
  - Tests: storage that answers the put ok but stores nothing, and storage that answers the revision before the put,
    each refuse `stale_read` at `get` (helper `loseProbePut`).
  - **Discovery: `whisperMatched: false` cannot come from storage.** The seal authenticates the revision, so a
    resealed record given the put's `revtok` fails the unseal as `damaged_whisper`, and any other revision now refuses
    at the get. The test of `whisperMatched: false` stubs `Vault.prototype.unsealBox`. The field stays (dropping it
    would change `ProbeReport`); whether to keep it is a question for the Coach.
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
  - Keep `ProbeReport.whisperMatched`, which storage can no longer make false (see the rework)? Recommend keeping it:
    a probe that says what it checked is plainer to a host than one whose silence means a match.

# Thread 7: with_whisper (2026-11-20)

Branch `20261120-with_whisper`, PR #774, stacked on #773 (thread 6, `20261120-snapshots`). Proved: `pnpm justify`
green after the rebase onto #773's restacked tip 872a14819 (`safebyok` 1342 tests, graphql 448, e2e 576, every package
green). The rebase's one conflict, in vault.test.ts's sparse-box `putBoxOnce` test, kept this thread's behaviour (the
box gotten whole, no `bad_record`) with #769's `bhnd` for a behind car; a second test of this thread's takes `bhnd` too.

* **Built** (`packages/safebyok/src/models/vault.ts`, tests in `tests/models/vault.test.ts`):
  * `vault.withWhisper(labelpath, fn)`: checks the labelpath and that `fn` is a function (`bad_record`, before any
    prompt), awaits `bank.ensureUnlocked()`, gets the box with `minder.get` (the cached car if timely, else fetched),
    refuses `absent_box` for a `gone` or `void` car (big's `boxAbsent` thrower, re-exported through
    `refusals/throwers.ts`), then `return await fn(await bank.unsealBox(car.newest))`. `fn` may be sync or async
    (`Helpers.Awaitable<ResultT>`). Its throw goes up as it came.
  * `#scopeAt(labelpath)`, shared by `#newestAt` and `withWhisper`.
  * Item 1 (thread 4's review): `#newestAt` uses the cached car only when it is `full` or `gone`, and otherwise
    `minder.get`s it, so `putBoxOnce(labelpath, {}, secrets)` over a box known only from a list keeps its stored
    sidecar. The old test "refuses a newest cached sparse when the patch gives no sidecar" became "given a labelpath
    cached sparse, gets the box whole and keeps its stored sidecar"; a new test keeps the refusal for a sparse box passed
    as `cited`.
  * Item 2: `notes/security.md` (through a sonnet subagent): the thread 4 line now says the Vault holds no lease and
    seals through the bank's own; a new with_whisper entry at the top of *Of Interest*.
  * Item 3 (W2): `notes/wontfix.md`, "Changing only a box's sidecar needs the bank unlocked and the whisper in hand",
    with the workaround through `withWhisper`.
  * Item 4: the comment above "a vault's minder, beside the bank's own writes" now credits `AdapterVaultDB` (every
    adapter built on it: memory, Postgres) with telling each watch of the bank, main gate and root box records a write
    answers with, before the answer reaches its caller (`VaultDB.watch`'s bullet).
  * From thread 6's review (orchestrator): `bankStageVals` (`shapes/shapes-bankish.ts`, exported from
    `safebyok/core`), the `as const` list `BankStage` derives from; a test in `bank.test.ts` checks every stage a bank
    shows is listed. (A `bankEndCauseVals` beside it went with `BankEndCause`, below.) The Bank's and the Device's `subscribe` doc
    blocks say a throwing listener is reported through `tellBadNews`.
  * The Coach's ruling (2026-11-20, "It waits and checks unlocked again before starting; the prior usually unlocks or
    deletes"), in `models/bank.ts` *Prompts*: `launchUnlockBankPrompt` (so `ensureUnlocked` and `withWhisper`), finding a
    gating of another kind open on its bank, awaits that gating's `whenConcluded` (an outcome, never a rejection), then
    `demandEnabled()` and resolves if the bank is unlocked; otherwise it launches or joins an `unlock_bank` gating as
    before. `#launchOrJoin` now joins only a gating of its own kind. No loop: should yet another gating of another kind
    open meanwhile, the launch refuses `already_asking`, as any launch does. Tests in `bank-prompts.test.ts`: a gate
    change that lands (resolves, no second gating), one dismissed (an `unlock_bank` gating of its own opens, both
    waiters resume on one `attemptUnlock`), and the device swept meanwhile (`disabled`). A `bank.sweep()` alone leaves
    the device's gating open, so that test sweeps the device.
  * Rework, the Coach's rulings on thread 6's snapshots (2026-11-20), a commit each:
    * **No last refusal** ("Who asked for the feature? ... Can we rip it out until v1 ships"): the device snapshot's
      `gating` is `{ gatingkind, gatingseq, isAttempting }`; `gating.lastRefusal`, the Gating's `#lastRefusal` and
      `refusalSnapshotOf` (`models/device.ts`) are gone, with their gating tests (two cases; the `isAttempting` case
      stays) and the device test's refusal lines (its no-cleartext check stays). A dialog shows the refusal its own
      `attempt…` call resolves with. `RefusalSnapshot` stays, for `BankSnapshot.lastErr`.
    * **endCause holds the error** ("Can the snapshot hold an error? It would be better"): `BankSnapshot.endCause` is
      `Errors.VaultError | null`, read from the `bank.endCause` getter in `#makeSnapshot` (still pure), so getter and
      snapshot agree; `BankEndCause` and `bankEndCauseVals` are gone, `bankStageVals` stays. Tests: the swept snapshot
      holds `bank.endCause`, a device-swept one `device.endCause`, and a swept bank's snapshot stays the same object,
      no subscriber told, across a `lock()` (which aligns) and its device's sweep, its cause still its own. A mutation
      (a copy of the error per snapshot) fails three of them.
    * `notes/security.md` (sonnet subagent): the snapshots entry, amended in place for both.
* **Decisions made**:
  * Unlock first, then get: the gloss's order, and a get after a long prompt is fresher than one before it. A box that
    is absent therefore prompts, then refuses `absent_box`; a host usually knows beforehand (its record hook's data is
    null).
  * `minder.get`, not `minder.at`, for the whisper: a stale cached whole box would silently hand `fn` an old whisper.
    `putBoxOnce` keeps using a cached car regardless of age, since a stale write refuses `stale_write` anyway.
  * A car left `bhnd` (behind) or `bare` after the get (a sparse record landing while the get waited: a crossing, out of
    bounds) is not handled specially: `unsealBox` refuses the sparse record (`bad_record`, from `BoxChecks.record`).
    Set aside: unsealing `car.fullest` (an older revision's whisper, silently), refusing `absent_box` (false), or
    getting again (a retry).
  * Nothing is zeroed: `lease.unseal` zeroes nothing, and strings cannot be zeroed. The unsealed box is a local.
  * vault.test.ts checks `fn`'s throw by identity with Vitest's `rejects` (the review replaced a hand-rolled
    `rejectionOf`); `Outcome.outcomeOf` would wrap a non-VaultError.
* **For the Coach**: the Wh1 recommendation (`absent_box` for never stored and for deleted) is built, taken in YOLO.
* **Discoveries**:
  * `bank.sweep()` does not dismiss the device's open gating (only `device.sweep()` does), so prompts waiting on a
    gating of a swept bank wait until someone dismisses it or an attempt refuses `disabled`. Unchanged here.
  * es-toolkit's `isEqual` compares two Errors by `name` and `message` alone, so `#align` would keep an old snapshot
    over a different error with the same message. Harmless today: a bank's end cause never changes once set (its own
    sweep's, or its device's, which its own sweep then adopts). Left as is.

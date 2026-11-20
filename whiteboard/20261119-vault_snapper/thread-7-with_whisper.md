# Thread 7: with_whisper (2026-11-20)

Branch `20261120-with_whisper`, PR #774, stacked on #773 (thread 6, `20261120-snapshots`). Proved: `pnpm justify`
green after the overlapping-gatings rework, caught up as cut at fed1e8dc9 (`safebyok` 1347 tests, big 2946, graphql
448, e2e 576, every package green). The rebase's one conflict, in vault.test.ts's sparse-box `putBoxOnce` test, kept this thread's behaviour (the
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
      holds `bank.endCause` (a device-swept one `device.endCause`), and stays the same object across a `lock()` and its
      device's sweep.
    * `notes/security.md` (sonnet subagent): the snapshots entry, amended in place for both.
  * Rework, the Coach's ruling on thread 5's overlapping gatings (2026-11-20, "an unlock checks right after waiting and
    doesn't prompt"):
    * `bank.attemptUnlock` (`models/bank.ts` *Re-entry points*), finding a gating of another kind open on its bank,
      awaits its `whenConcluded`, then resolves ok through `attemptWithoutGating(this, cleartexts, () =>
      Promise.resolve(this))` if the bank is unlocked (cleartexts spent unchecked, a disabled bank refused at the door),
      and otherwise goes on to `#handIn` as before: it answers an `unlock_bank` gating open by then (one a prompt that
      waited out the same gating opened), or unlocks directly. The same wait-then-check as `launchUnlockBankPrompt`; no
      loop. Five tests in `bank-prompts.test.ts`'s `attemptUnlock` block: a gate change that lands (resolves ok, an
      unusable passkey answer unused and zeroed), a dismissed one then a right and a wrong passphrase directly, a
      waiting `ensureUnlocked` whose unlock gating the attempt answers, and a device swept meanwhile (`disabled`, no key
      derived). With the change reverted, three fail; the two dismissed-then-direct cases state the outcome, and pass
      either way.
    * `notes/wontfix.md`, "A direct gate change, a lock or a sweep beside an open gating": the direct
      `attemptReplacePassphrase`/`attemptAddPasskey`/`attemptRevokePasskey` beside an open gating, and any crossing of
      `lock()` or a sweep with an open gating or an attempt in flight, as built, promised nowhere.
    * `notes/security.md` (sonnet subagent): the with_whisper entry, amended in place: an ok outcome there means only
      that the bank is unlocked.
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
  * es-toolkit's `isEqual` compares two Errors by `name` and `message` alone; harmless, as a bank's end cause never
    changes once set.

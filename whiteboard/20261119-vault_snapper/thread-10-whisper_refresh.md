# Thread 10: whisper_refresh (2026-11-20)

Branch `20261120-whisper_refresh`, PR #PRNUM, stacked on #776. Proved: `pnpm --filter safebyok test` (29 files, 1364 tests), lint and typecheck; `pnpm --filter safebyok-react test` (25 files, 314 tests) and lint.

* **Built**:
  * `ThingMinder.refresh(scoped, opts)` (`packages/safebyok/src/minding/thing-minder.ts`, *Reading*): a get in the background,
    returning at once. It is `this.get(...)` with a `.catch`: a timely car asks nothing, and a get made meanwhile shares the fetch
    (TanStack's dedupe). Its refusal goes to the bank's `tellBadNews`; under `silenceErrors` only an `unexpected_error` does. Bad
    options or a scope of another bank throw `bad_record` synchronously, asking nothing; a minder not started (or a get resuming
    after goodbye) refuses `disabled` through the same catch, so it is dropped under `silenceErrors`.
  * `MinderRefreshOpts` / `MinderChecks.minderRefreshOpts` (`shapes-minder.ts`): `staleTime` and `silenceErrors`, strict; exported
    from `src/index.ts`.
  * `vault.withWhisper` (`models/vault.ts`) calls `this.#minder.refresh(scope, { silenceErrors: true })` after checking its args and
    before `bank.ensureUnlocked()`. After the unlock it reads as before: `minder.get`, `absent_box` for `gone`/`void`, else unseal.
  * Tests: `ThingMinder.refresh` in `tests/minding/thing-minder/thing-minder-reads.test.ts` (fetches and caches, asks nothing when
    timely, shares with a get, tells its refusal, drops a storage refusal and `disabled` under `silenceErrors`, still tells an
    `unexpected_error`, a table of bad args); three `withWhisper` cases in `tests/models/vault.test.ts` (one box get, made before the
    unlock lands; a storage refusal from the early get tells no bad news, and the box is got again after the unlock; the prompt still
    comes before `absent_box`). Each new vault case was checked to fail with the refresh line commented out.
  * The rename from thread 9's review: `makeKnockKnockWorld` is `buildKnockKnockWorld` (it is async), its own commit.
* **Decisions made**:
  * **A new public verb, not a flag on `get` or `tryAt`.** `get` returns a promise its caller awaits, so a flag that changes how it
    fails reads wrong. `tryAt(scope, { ifStale: 'refresh' })` already starts a background get, but swallows every refusal (it lands
    as `lastErr` for the next `tryAt`), unexpected ones included; a `silenceErrors` flag on `tryAt` would read as silencing `tryAt`'s
    own answer. `refresh` is one plain function for one verb.
  * **Without the flag, `refresh` tells every refusal to bad news.** The ruling's flag implies an unflagged mode; telling everything is
    the one where the flag means what its name says. No caller uses it yet.
  * **`tryAt`'s `#backgroundRefresh` is left alone** (still `.catch(noop)`). Routing it through `refresh` would start telling its
    unexpected errors to bad news: a change to `tryAt`'s contract nobody asked for. So the class has two background gets, each
    with its own error story.
* **Discoveries**:
  * When the bank is already unlocked, the refresh and `withWhisper`'s own get share one fetch. If that fetch fails with an
    `unexpected_error`, it is told to bad news by the refresh *and* thrown by `withWhisper`: reported twice. Avoiding it would need a
    branch (skip the refresh when unlocked) or a handle on the refresh; I left it, per simple before failsafe. Expected refusals are
    thrown once, by `withWhisper`.
  * `tests/models/vault.test.ts` runs under `TH.useFakeClock()`: `TH.wakeupAtNextTick` never resolves there, and `TH.eventually`
    only works if true on its first look. The new cases use `vi.advanceTimersByTimeAsync(0)` to let the background get settle.
* **For the Coach**:
  * **Double report** (above): an unexpected error from a shared fetch reaches bad news and the caller both. Recommendation: accept.

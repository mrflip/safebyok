# Thread 13: background_refresh (2026-11-20)

Branch `20261120-background_refresh`, PR #780, stacked on #779 (vault_try). Proved: `pnpm --filter safebyok` vitest 1377, tsc and eslint clean; `pnpm justify` green after the catch-up (safebyok 1377, safebyok-react, e2e 576, the rest).

* **Built**:
  * `ThingMinder.backgroundRefresh(scoped, opts = {})` (`packages/safebyok/src/minding/thing-minder.ts`) is the one public background get: `void this.tryGet(scoped, opts)`. `tryGet` validates, checks readiness and scope, and resolves an outcome that never rejects, so it throws nothing and tells nothing. A refusal stays in TanStack's query state, which `#answerOfTSQ` reads as `lastErr`.
  * `tryAt`'s `ifStale: 'refresh'` calls it with `{ staleTime: opts.staleTime }`: `tryGet` validates strictly, and `ifStale` is not a get option.
  * `vault.withWhisper` calls `this.#minder.backgroundRefresh(scope)`; its reason comment stays.
  * Gone: `ThingMinder.refresh`, `#backgroundRefresh`, `MinderRefreshOpts`, `MinderChecks.minderRefreshOpts`, the index.ts re-export, `silenceErrors`, the `describe("ThingMinder.refresh")` tests and vault.test's "tells no bad news of a storage refusal met during the unlock" (it spied on the adapter's private `doGetThing`).
  * Tests: a `ThingMinder.backgroundRefresh` describe: returns at once and caches the car; asks nothing while timely; shares its fetch with a get; a storage refusal is neither thrown nor told and shows as `lastErr` in the next `tryAt`; misuse (another bank's scope, unknown option, negative staleTime) neither throws nor asks the vaultDB. The `tryAt` tests of `ifStale: 'refresh'` stand.
  * Changeset `.changeset/20261120-background_refresh.md` (empty: safebyok is private).

* **Decisions made**:
  * The suggested body, `void this.tryGet(...)`, was plain enough; nothing simpler.
  * `opts` defaults to `{}`, as `tryGet`'s does.

* **Deviations**:
  * Thread 7's changeset `20261120-whisper_refresh.md` still describes `minder.refresh` and `silenceErrors`; I left it, since it is empty and this changeset supersedes it. Strike its sentences if the Coach wants the file true.

* **Discoveries**:
  * An `unexpected_error` met by `withWhisper`'s early get is now told to no one, where `refresh` told it to the bank's bad news. The later `get` after the unlock meets it again and throws it to the caller.
  * `safebyok-big` must be built (`pnpm --filter safebyok-big build`) before the new core's tests run in a fresh worktree.

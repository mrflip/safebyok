# Thread 1c: softlock (2026-11-25)

Branch `20261125-softlock`, PR #902, stacked on #900 (thread 0, connect). Proved: `pnpm --filter safebyok test` 1992
passed, lint and typecheck clean; `safebyok-react-lean` typecheck clean, 339 tests passed; `pnpm justify`
green after the catch-up onto #900's tip, 8245 tests across 16 suites.

* **Built**:
  - **Options** (`shapes/shapes-bankish.ts` DeviceOpts, `models/device.ts`): `softlockMinutes` (10), `janitorMinutes`
    (10), `gateStaleMinutes` (720), each `VX.positiveMinutes.optional()`, kept as `device.softlockMillis`,
    `janitorMillis`, `gateStaleMillis` beside `leaseMillis`. `softlockMillisOf` caps the softlock at
    `floor(leaseMillis / 20)` and zeroes it under a minute. Defaults exported from `core.ts`
    (`DefaultSoftlockMillis`, `DefaultJanitorMillis`, `DefaultGateStaleMillis`). `GiverConfig` (react-lean) is
    `Omit<DeviceOpts, ...>`, so it carries them unchanged, and the provider spreads them into `Device.make`.
  - **Softlock** (`models/world.ts`): `world.isSoftlocked` is true when there is no lease (locked), or when
    `Clock.nowMillis() >= leaseEndsAt - softlockMillis`. Bank and Gate forward it. `ensureUnlocked` returns at once
    only when not softlocked; otherwise it opens the shared wait, so `isUnlockWanted` shows at stage `unlocked`, and
    the unlock's renewal settles it through `#attachLease`. Gate verbs, seals and `withUnlockedWhisper` keep
    `isLocked`.
  - **Janitor** (`models/world.ts`, section *The janitor*): one `setInterval` per world, started in
    `#connectSignedIn` (renamed from `#connectMinder`: connected and signed in), cleared in `disconnect`. `#tidy`
    locks once `now >= leaseEndsAt`, and when `#isGateStale(now)` calls `#refreshRoots`
    (`vaultMinder.tryGetWorldOnce()`, which always asks the vaultDB). Throws and refusals go to `tellBadNews`. The
    period is clamped to `2 ** 31 - 1` ms, since a browser fires a longer delay at once.
  - **Expiry in one place**: every read of the lease's end goes through `world.leaseEndsAt` (the janitor's and
    `isSoftlocked`'s): 1b repoints that getter.
  - **Seal finishes** (`models/lease.ts`): the trailing `demandEnabled()` after `cipherBytes` in `#sealText` is gone;
    `#openSealed` keeps its check. Lease doc and the two in-flight tests changed.
  - **`#lock-is-intent`** comments at `lock` in World, Gate, Bank and Device, and the best-effort comment on the
    janitor.
  - **Notes**: a `notes/security.md` entry (by a sonnet subagent); `notes/wontfix.md`'s disconnect row widened to the
    janitor's re-read; VOCABULARY's lease entry names the softlock; an empty changeset.
  - **Tests**: `tests/models/device.test.ts` (defaults, the cap, refusals), `tests/models/world.test.ts` (*a world's
    softlock*, *a world's janitor*), all on fake timers.

* **Decisions made**:
  - A gate this world has no car for is not stale: nothing to re-read against.
  - Staleness is `now - readAtOf(car.read_tc)`, the Coach's "last read" (each tab judges for itself).
  - The stale-gate refresh is `tryGetWorldOnce`, which re-reads bank and root box with the gate: one round trip, and
    the only verb that bypasses the cache. A per-Thing `tryGetOnce` of the gate alone was set aside: two code paths
    for no saving.
  - `isSoftlocked` is not in the snapshot (out of scope); the snapshot's `isUnlockWanted` already shows the wait.

* **Deviations**:
  - The Lease class doc now reads "refuses every seal not yet under way, and every unseal, even one in flight": the
    directed text ("refuses every unseal, even one in flight") would have dropped that a new seal still refuses.
  - `#lock-is-intent` is cited, but this worktree's CLAUDE.md does not yet carry the tag (the base checkout's does).

* **Discoveries**:
  - `read_tc` comes from uuid's v7, which never mints one earlier than the last it minted, whatever the clock says.
    Under fake timers reset to `T0`, read_tcs run ahead of the clock, so a staleness test must first set the clock
    past every read_tc minted (`setClockPastEveryReadTc` in world.test.ts). In a browser, a clock stepped backward
    makes the gate look fresh until the clock catches up.
  - `TH.makeDevice` connects and signs in, so every test device runs a janitor; with the 10-minute default and real
    timers in a few files, nothing fired in the suite.

* **For the Coach**:
  - Autolock is now at janitor granularity (10 min by default), and later where a background tab's timers are
    throttled; security.md says so.

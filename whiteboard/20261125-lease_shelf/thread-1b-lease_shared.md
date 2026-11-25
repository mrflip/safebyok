# Thread 1b: lease_shared (2026-11-25)

Branch `20261125-lease_shared`, PR #TBD, stacked on #908 (8, on #907 1d, #903 1a, #902 1c, #900 0). Proved:
`pnpm --filter safebyok test` 2143 passed; `pnpm --filter safebyok-react-lean test` 339 passed; both typecheck and
lint clean. `pnpm justify` not yet run.

* **Built**:
  * First commit (thread 8's review): `World#connectSignedIn` is `#startWatch`; `#tidyConnected()` takes no argument.
  * `Device.make` takes `deviceDB` (`DeviceOpts.deviceDB?: DeviceDB`, checked by the new duck check
    `DeviceDBChecks.deviceDB` / `isDeviceDB` in `shapes-device-db.ts`, phrase `DeviceDBExpected`). Without one, each
    device makes a `MemoryDeviceDB` of its own, so the world has one code path and no null branch; that is "each tab
    keeps its own lease, as today" (and thread 5 can store the device token there too). Hidden on the device like
    `vaultDB` (`device.deviceDB`).
  * `Lease`: `nextEndingAt(ends_at)` (a softlock's next revision, a new Lease over `makeNextRecord`, same keys) and
    `stow(deviceDB)` (stows `#record`); both refuse once evicted. The keys never leave `Lease` but through these.
  * `World`, section `[Following the stored lease]`: `#followStored` (peek; if newer by `BaseThing.cmp`, `#takeUp`;
    then `#softlockPastGate`), `#isNewerThanLease`, `#takeUp` (attach `Lease.make(stored)` where `#canUnlock`: live,
    `now < ends_at`, the main gate's labelpath and lifeseq; else `#dropLease`), `#softlockPastGate`, `#peekStored`,
    `#stowLease`, `#stowTombstoneOf`. `#followStored` runs on `connect`, on every root's news while connected (which
    covers sign-in, from a shelf or the fetch), and at each ring (`#startListening` in `connect`, `#stopListening` in
    `disconnect`). It does nothing until the roots are live.
  * `#attachAndStow` for grants (both friends) and softlocks; `#attachLease` (no stow) for take-ups; `#dropLease`
    (no stow) for disconnect and a newer tombstone; `lock()` = `#dropLease` + `#stowTombstoneOf`. `disable()` now
    calls `lock()` before `disconnect()`. `#attachLease` settles the unlock wait only where the new lease is not
    softlocked (so a softlock, or taking up a softlocked record, resumes no waiter).
  * `leaseEndsAt` reads `this.#lease?.ends_at`.
  * Gate: `WorldGateFriend.renewal` is `leaseFollowed(gateScope)`, async; the Scaffolding fallback is gone. A grant
    (unlock and birth alike) follows the stored record, or the world's lease where that is newer or nothing is
    stored, or the shell. Type `LeaseShellScope` (shapes-gateish, exported from core) names what `Lease.shellOf` takes.
  * `#hearRoot` softlocks synchronously (no peek) before following the stored lease.
  * react-lean: `GiverConfig` no longer omits `deviceDB`; the provider's doc says unmount locks this tab alone.
  * Docs: VOCABULARY *lease* and *connect, disconnect*; `notes/guarantees-drift.md` (G4, G9); `notes/security.md`
    (sonnet subagent); `notes/wontfix.md`: the disconnect row widened to a take-up across a disconnect, the two-tabs
    row given the softlock reason; the form-verb row's disconnect bullet.
  * Tests: `tests/models/world.test.ts` *a lease shared by the tabs of one deviceDB* (16 cases: sign-in and reload
    take-up, unlock and lock following, renewal, next life after a lock, expired not taken up, older record ignored,
    softlock everywhere / not when the end is sooner / on take-up, disconnect alone, disable and autolock lock all,
    refused stow and peek, no deviceDB); `lease.test.ts` for `nextEndingAt` and `stow`; device tests for the option.
* **Decisions made**:
  * **YOLO (awaiting the Coach, the Closer Look's E1): a disconnect drops this tab's lease alone, stowing nothing.**
    It lives in one line of `World.disconnect` (`this.#dropLease()`, with a comment); the other ruling is
    `this.lock()` there, plus the tests *drops the lease in a tab that disconnects alone* and the connect test in
    `device.test.ts`. Connect, like sign-in, takes up the stored lease (a local peek, no backing-store fetch).
  * **The softlock runs synchronously at a root's news, and a grant follows the newer of the stored record and the
    world's lease.** Otherwise a gate verb in this tab races itself: its own gate news softlocks the old lease (rev
    n+1) while its grant, following the stored rev n, also writes rev n+1, and the first stow wins on disk, leaving the
    other tabs softlocked. With both, the grant is rev n+2 (pinned by gate.test.ts *renews ... across a gate verb*,
    which sees revseqs `[1, 2]`).
  * **A softlock writes only where it brings `ends_at` nearer** (`now + softlockMillis < ends_at`): that is the
    Coach's "the softlock is a max", and it stops every later root news re-softlocking (the lease's `gate_revseq`
    cannot move without a new proof, since `gate_revtok` is in the wrapped stamp).
  * **A newer stored record replaces this tab's lease uniformly:** by its Lease where it can unlock, else by none (a
    tombstone, or a live record past its end or of another gate life). So a softlock with `softlockMillis` 0 reaches
    other tabs as a lock.
  * **Following is a connected world's job**: a world never connected neither listens nor takes up; its own lock,
    grants and softlocks still stow.
  * **The world peeks records itself** (`deviceDB.peekLease` in World) and hands them to `Lease.make` or as a grant's
    `followed`: plainest call chain; recorded as G9 drift. Set aside: `Lease.peek(deviceDB, gate)` answering
    `Lease | tombstone | null`, which would leave unattached Leases (with keys) to drop at the grant and at a take-up
    refused.
  * No scope filter on a ring: every ring costs one local peek, and rings are rare.
  * The listener starts in `connect`, not beside `#startWatch` in `signin`: it needs no signed-in user, and
    `#followStored` waits for live roots. No janitor retry of a failed `listen`.
* **Deviations**:
  * Design item 4's "a row citing a newer revision than the gate held refreshes the world's gate" is not built (the
    gloss left it out); the watch or the janitor's staleness re-read brings the gate.
  * A birth's grant also follows the stored record (the design had it follow the shell): one rule for every grant.
* **Discoveries**:
  * `TH.eventually` hangs under `TH.useFakeClock` (its `setTimeout` is faked); world tests use a local
    `settle()` = `vi.advanceTimersByTimeAsync(0)`, which drains long microtask chains.
  * Every tab softlocks on the same gate change and stows the same revision; the losers keep their own lease (same
    rank, `ends_at` a few ms apart). Recorded in wontfix's two-tabs row.
* **For thread 6 (lifecycle)**: the one-line hooks are commented in `world.ts`: `#takeUp` ("an unlock, or a lock,
  taken up from another tab"), `#softlockPastGate` ("a softlock"), and the janitor's autolock is `#lockPastLeaseEnd`.
* **For thread 5 (devicetok)**: `device.deviceDB` is always set (a `MemoryDeviceDB` when the host gives none).
* **For the Coach**: E1 above (disconnect drops one tab's copy, vs. locks all tabs).
* **Looked up in the plan/progress**: 1b's plan entry, the progress notes for 0, 1c, 1a; design items 1-10.

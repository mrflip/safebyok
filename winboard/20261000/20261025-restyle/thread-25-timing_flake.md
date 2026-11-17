# Thread 25: the timing-check case that timed out (2026-10-28)

Branch `20261028-timing_flake`, PR [#349](https://github.com/mrflip/safebyok/pull/349), on main. Justify: green but for
`safebyok-convex`, which is main's own red (below). Root 289; core 3500 / 37 skipped; react 312;
indexeddb 167 / 11; postgres 322 / 15; graphql 345 / 15; fastkey 49; demo 230 / 17; e2e 107 / 116;
lint everywhere, typecheck of every package but convex, size budgets: green.

A follow-up after the sprint closed, from the Coach's empty answer (take the Rec) on "A core timing
test times out under load, now in a normal run too": `test-helpers.test.ts`, the
`vaultDBTimingChecks` case "misses that late device where nothing holds a round trip: what the
turnstile is for", hitting its 5000 ms timeout.

* **Built**:
  * **The cause: real timers, about 1,800 of them, one after another.** The case runs eight
    `vaultDBTimingChecks` checks (`SplitLosses`) over a `RoundTripVaultDB` whose backend answers
    `overTheWire`: each round trip awaits `TH.wakeupAtNextTick()`, a `setTimeout(0)`. The second
    device makes six prelude round trips before each write (`slowSecond`), and unwired, nothing
    holds a round trip, so every check holds and `raceEveryWay` runs every schedule of every
    check to its end. Counted: 1,766 zero-delay timers (round trips, and the staggered schedules'
    ticks) and 136 watchdog timers, which are cleared. Node clamps a `setTimeout(0)` to 1 ms, and
    on this VM one costs 2 to 3 ms (500 in a row: 1.1 to 1.4 s). So the case is wall-clock bound
    at 3 to 4.7 s of its 5 s, and is slowest on an *idle* machine: busy cores fire timers sooner.
    No ordering bug, unlike thread 24's: the time was spent waiting on the clock.
  * **The fix** (test only): `onFakeClock(work)`, beside `checksOver` in the test file's
    *Unguarded adapters* section, runs `work` with `setTimeout` and `clearTimeout` faked
    (`vi.useFakeTimers`, `loopLimit` 100,000) and drives them with `vi.runAllTimersAsync()`,
    which fires the earliest timer, then yields a `setImmediate` so every microtask runs, and so
    on. Zero-delay timers fire in the order they were set, as on a real clock; a race's watchdog
    (`WaitedTooLongMillis`, `ScheduleHungMillis`) falls due only when nothing else is pending,
    that is, when an adapter has hung. It waits out both the work and the timer loop
    (`Promise.allSettled`), so a failing check rejects as itself with nothing left running, and
    puts real timers back in a `finally`. The case wraps its loop in it. Nothing in `src/` or in
    the published `safebyok/testing` changed: a real adapter's race must keep real time.
  * **Changeset** `.changeset/20261028-timing_flake.md`, empty.

* **Reproduction and the runs after**:

  | Runs of the case | Before | After |
  | --- | --- | --- |
  | Alone, in sequence, idle | 34 runs: 1 or 2 timed out (the first 12 included a 5,020 ms failure); most 4.5 to 4.75 s | 20 runs, all passed, 46 to 195 ms |
  | 8 at once beside 8 CPU-bound loops | 8 passed, 2.9 to 3.0 s | |
  | 16 at once beside 24 CPU-bound loops | 16 passed, 2.1 to 2.3 s | 16 passed, 86 to 292 ms |
  | Beside 24 timer-driven loops and 4 direct-I/O writers | 4 passed, 2.7 to 2.95 s | |
  | Six full core suites at once | 6 passed, 2.85 to 3.0 s | 6 passed, 24 to 54 ms |

  Load sped the case up here rather than slowing it: the margin it lost was the idle machine's
  timer latency, which the other sessions' justify runs in the reports may well have added to.

* **Decisions taken**:
  * **A fake clock, not a cheaper macrotask.** A `setImmediate` or `MessageChannel` wire would be
    fast too, but the staggered schedules start the second move after `ticks(n)` of
    `setTimeout(0)`: a wire on another queue would put a varying number of its round trips
    inside one tick, and so change, and unfix, which interleavings the stagger tries. The fake
    clock keeps both on one queue.
  * **Checked that it tries the same interleavings.** A scratch probe (not committed) ran 12
    checks (`SplitLosses`, `apartNewBoxes`, `apartReplaceAndDel`, `readBesideRemake`,
    `seenAcrossDevices`) over 5 adapters (check-then-write over the wire; it with `slowSecond`;
    it unwired as well; check-then-write under a shared lock, unwired; in one step) on each
    clock: 60 of 60 verdicts identical, down to the schedule each failing check names
    ("one held before its round trip 2 while two moved", "two held before its round trip 8…").
  * **Only this case.** Its siblings over the same wire are within a wider margin: the
    `slowSecond` wired loop 233 to 1,455 ms a case, "lets the writes of different boxes…"
    1,115 ms, `readBesideRemake` 307 ms. Four others wait out real watchdogs on purpose, about
    2 s each with 10 s timeouts. `onFakeClock` would take any of them unchanged.

* **Discoveries**:
  * **Main is red** in `safebyok-convex` since #315 met the rename: `tests/convex-vault-db.test.ts`
    line 265 calls `getVault` where `TH.expectBad` wants an Outcome (typecheck), and "makes any other
    failure storage_unavailable…" fails ([CI on #332's merge](https://github.com/mrflip/safebyok/actions/runs/40640975789)).
    [#348](https://github.com/mrflip/safebyok/pull/348) (`20261028-convex_red`) mends it; this
    branch leaves it alone, and will be green once #348 has merged and it has been rebased.
  * Nothing looked up in the sprint's plan or progress: the handoff was enough.

* **For the Coach**:
  * **Put the wire's other cases on the fake clock too?** Rec: not now; only if one flakes. Each
    is a one-line wrap.

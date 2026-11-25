# Thread 8: janitor (2026-11-25)

Branch `20261125-janitor`, PR #908, stacked on #903 (1a, on #902 and #900). Proved: `pnpm --filter safebyok test`
2090 passed, lint and typecheck clean; `safebyok-react-lean` tests 339 passed.

* **Built**:
  * `World`'s janitor (`world.ts`, `[The janitor]`) starts at `signin` and stops only in `disable`, not in
    `disconnect`. A tick is `#lockPastLeaseEnd`, then, while connected, `#tidyConnected`: a watch that is not running
    (`vaultMinder.isWatching` false) is started again through `#connectSignedIn` (its throw is bad news, as at
    sign-in), and a stale gate re-reads the roots as before. `#startJanitor` does nothing on a disabled device, so a
    sign-in after `disable` starts no timer. The timer is `unref`'d where the runtime has it.
  * The `#lock-is-intent` comment ("autolock is a best-effort time, not a deadline") now sits at `#lockPastLeaseEnd`.
  * `#isGateStale` reads `this.gate?.read_at`: World no longer imports `readAtOf`, nor reads the minder's car.
  * World imports `MaxTimerMillis` from `shapes-vault-tsq.ts`; its own copy is gone.
  * `World.connect`'s doc block: a later call, or the janitor's next tick, starts a failed watch again.
  * `VaultTSQ.connect` invalidates `[...bank, 'list']`, every listing, and no item.
  * Doc blocks of `device.janitorMillis` and `DeviceOpts.janitorMinutes` say what a tick does while connected.
  * `notes/security.md`: an amendment line under 1c's softlock entry (autolock now runs while disconnected too).
* **Decisions made**:
  * **No new `readAt` getter.** The Thing already has `read_at` (epoch ms, VOCABULARY.md's **read_at** entry), so
    the janitor uses `world.gate.read_at`; a car getter would have had no caller. `root-shelf.ts` is unchanged: it
    shelves the `read_tc` itself, which goes back in as an event's `read_tc` on the next load, so it never decodes it.
    The gate's `read_at` and the car's `read_tc` both move only on news; they differ only where an older whole record
    is news (the car's moves to it, the Thing's stays with the newest revision), which for staleness is the better.
  * The tick's watch retry goes through `#connectSignedIn` (kept, not renamed): the watch now starts from one method,
    from `connect`, `signin` and the janitor. 1b's device-database listener can start beside it there.
  * The janitor reads `isWatching` before retrying, though `VaultMinder.connect` does nothing while watching: one
    branch more, but the tick says what it is for.
  * `unref` carries an `eslint-disable-line @typescript-eslint/no-unnecessary-condition`: Node's types are in scope
    for src/ (tests share its tsconfig), so TS sees `unref` as always there; in a browser the timer is a number.
* **Deviations**: none from the gloss but the getter above. The janitor stays in World, in its own section (E4).
* **Discoveries**:
  * No test outside `vault-tsq.test.ts` pinned item invalidation on reconnect. The flagged test ("leaves no item or
    listing fresh while disconnected, or while its VaultMinder is not watching") passed on connect's invalidation,
    not on `staleTime`; it now stops and starts the minder's watch under a connected vault TSQ, then disconnects.
    A new test shows an item invalidated once its listing, refetched, tells of a newer revision.
  * Only listings are invalidated on reconnect, and only an observed listing refetches: an item whose box moved
    while disconnected stays fresh until something lists its parent (the Coach: a later trigger for the listing).
* **For the Coach**: nothing blocking.

# lease_shelf: progress

Curated by the orchestrator. Newer than the plan where they disagree.

## Thread 0 `connect` (#900, ready, in review)
- The watch runs while the device is both connected and signed in, from `#connectMinder`, reached from either
  `World.connect` or `signin`. **The janitor (1c) and the device-database listener (1b) start there and are cleared
  in `World.disconnect`, next to the minder.**
- Disconnect order: `lock()` (evicts the lease), then the vaults' vault TSQ stops listening, then the minder stops
  watching. It never throws, disables nothing, and leaves `ensureUnlocked` waiters waiting.
- Freshness while disconnected goes through the vault TSQ's `staleTime` (0 unless minded and `'here'`), not
  `agekind`: `'here'` also means whole for a put (`Vault #donorAt`). `VaultTSQ.connect` invalidates the bank's
  queries.
- Nothing can disable a world now: `World.endCause` returns the device's `#endCause`, which is never set. The
  `'swept'` stage has no way in.
- A watch that throws at sign-in is now bad news, not stage `'failed'` (awaiting the Coach).
- *Orchestrator:* a review flagged that a reconnect did not refresh the roots; I fixed it under YOLO, and the Coach
  overruled: "All that matters is when it was read ... it's a janitorial concern. That is concurrency machinery and
  does not belong." The second rework takes the fetch back out. Freshness is 1c's janitor, by read time.
- `device.disable()` ends a device for good (vacate will call it); the stage is `'disabled'`. It throws big's
  `deviceDisabled()`, whose phrase still says "sweep or vacate".
- While not connected, the vault TSQ does not hear the device's own `putBoxOnce`/`delBoxOnce`: a non-React host
  must call `connect()`.

## Thread 1c `softlock` (#902, ready, in review)
- Options kept as `device.softlockMillis`, `janitorMillis`, `gateStaleMillis`; softlock capped at `floor(leaseMillis/20)`.
- `isSoftlocked` on World, Bank, Gate; `ensureUnlocked` consults it.
- The janitor starts in `#connectSignedIn` (renamed from `#connectMinder`) and is cleared in disconnect. It locks
  past the lease's end, and re-reads the roots through `tryGetWorldOnce` when the gate's read is older than
  `gateStaleMinutes`.
- **Every read of the lease's end goes through `world.leaseEndsAt`: 1b repoints that one getter.**
- `read_tc` is uuid v7, monotonic: tests set the clock past every read_tc (`setClockPastEveryReadTc`).

## Thread 1a `device_db` (#903, ready, in review)
- `safebyok/storage`: abstract `DeviceDB` (`peekLease(scope)`, `stowLease(row)` answering the row stored after,
  `listen(listener)` answering an unlisten; a listener hears a `BankScope` only), `MemoryDeviceDB`, and the row types
  `LeaseRow`, `LiveLeaseRow`, `LeaseTombstone`, `LeaseRecord`. `safebyok/browser`: `IdbDeviceDB`/`idbDeviceDB`;
  `browserOpts()` hands the new one. The IndexedDB database is named `lease`.
- Test builders `liveLeaseRowOf`, `leaseTombstoneOf` in `tests/test-helpers/devicedb-world.ts`.
- No `isDeviceDB` duck check: 1b adds one only if the Device needs it.
- Refusals: damaged row `damaged_lease`; failing store `storage_unavailable` (`Throwers.deviceDBFailed`, name only, G8).
- **Planning lesson:** 1a compacted twice, ten minutes apart. 1b is larger: it goes to `thread-worker-400k`, and its
  handoff quotes only what it needs.

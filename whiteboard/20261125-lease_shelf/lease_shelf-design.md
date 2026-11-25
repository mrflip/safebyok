# lease_shelf: one lease per device, shared by every tab, kept across reloads

Status: draft, awaiting the Coach's go on *To confirm*.

## Rulings (the Coach, 2026-11-25)

1. An unlock follows to other tabs at once.
2. A sign-out or lock in one tab ends it in all: "an explicit signout not a userid null glitch".
3. "Newer gate revision should move lease expiry time to now+softlock time (next promptable action will ask for
   password, and otherwise expire very soon)".
4. "Each proof should renew the lease (except for del bank, natch). Lease is same on all tabs."
5. "An unlock crossing a lock unlocks once the attempt has started (I.e hit enter, hit lock, kdf finishes, unlocked is
   correct.)" Lock is an intent, not a crisis (CLAUDE.md `#lock-is-intent`).
6. "Mutations should check before entering a critical path, and if cleared to start they should complete."
7. Startup options `janitorMinutes` (10), `gateStaleMinutes` (720), `softlockMinutes` (10: clamped to 5% of the lease
   time, zeroed under one minute). The World runs a recurring timer on the janitor period: past the lease's expiry it
   locks (best effort, not a deadline); past `gateStaleMinutes` it force-refreshes the world. `ensureUnlocked` consults
   `isSoftlocked`, not `isLocked`.

## Threads

The line: #899 -> 0 `connect` -> 1a `device_db` -> 1c `softlock` -> 1b `lease_shared`. 1a is cut from #899 and runs
beside 0. 1c is cut from 0 once 0 is ready, and runs beside 1a. 1b is cut last, stacked on both.

* **1a `device_db`** (Design 1, and the stored row of 2): the device database and the stored lease row. Nothing wires
  it into the Device.
* **1c `softlock`** (Design 5, 6, 7, and the three options): softlock, `isSoftlocked` in `ensureUnlocked`, the janitor,
  gate staleness, the seal under way that finishes, and the comments at `lock`. All of it works on today's in-memory
  `leaseEndsAt`.
* **1b `lease_shared`** (Design 2 to 4, 9, 10): the Device takes the device database; the lease is stowed, taken up
  and tombstoned across tabs; a gate change softlocks; `ends_at` moves into the stored row.

## Design

1. **DeviceDB, lease verbs only.** Port big's `storage/device-db.ts`, `memory-device-db.ts` and `idb-device-db.ts`
   into the new core (notes/transition.md, *Using what big has*), carrying the new lease record: `peekLease(scope)`,
   `stowLease(record)`, `forgetLease(scope)`, and `listen(listener)`. Every stow and forget rings the bell (a
   BroadcastChannel in IndexedDB, as `safebyok-idb-lean` does for the vaultDB). `IdbDeviceDB` on `safebyok/browser`,
   `MemoryDeviceDB` on `safebyok/storage`; two Devices sharing one MemoryDeviceDB model two tabs in tests. `Device.make`
   honors `deviceDB` again. Without one, each tab keeps its own lease, as today.
2. **The lease record gains `ends_at` and `gate_revseq`, and is stored like a Thing.** It has a lifeseq that ticks and
   tocks as a Thing's does (VOCABULARY.md *lifenum*: even for a live life, odd for a tombstone). A grant after a lock
   starts the next, even life. A lock writes the tombstone, the next odd life, rather than deleting the row. A renewal
   or a softlock is a new revision (`revseq + 1`) in the same life. A grant or renewal sets
   `ends_at = now + leaseMillis`. Every proof already renews through `unlockByProving`; birth grants. VOCABULARY.md's
   *lease record* ("which nothing stores") changes to match.
3. **Each tab's lease is what is on disk.** Every write to the row rings. A tab hearing the bell peeks the row and
   compares it with what it holds by `BaseThing.cmp` (life, then revision). A newer live row is taken up, evicting the
   tab's own lease. A newer tombstone evicts it. An older row is ignored, so a late stow can never bring back a locked
   lease. An unlock crossing a lock attaches, as it does today, and its stow starts the next life.
4. **A gate change softlocks the lease.** On hearing a gate revision newer than the lease's `gate_revseq`, the world
   writes a new revision with `ends_at = min(ends_at, now + softlockMillis)`. The softlock is a maximum: with a
   20-minute softlock and 10 minutes left on the lease, nothing changes. Taking up a row that cites an older revision
   than the gate held softlocks it the same way. A row citing a newer revision than the gate held refreshes the world's
   gate.
5. **Softlock.** `softlockMillis = min(softlockMinutes, 5% of leaseMillis)`, or 0 if that is under a minute.
   `isSoftlocked` is true when the world is locked, or when `now >= ends_at - softlockMillis`. `ensureUnlocked` waits
   while `isSoftlocked`, so an active session renews before its lease runs out.
6. **The janitor.** A `setInterval` on the janitor period, started at `signin` and cleared by the world's disconnect. Each
   tick: if `ends_at` has passed, `lock()`; if this tab last read the gate more than `gateStaleMinutes` ago, refresh
   the world from the vaultDB, bypassing the cache.
7. **Two checks only (`#lock-is-intent`).** An operation checks unlocked and enabled before its critical path, and
   before it returns an unsealed value. Drop the trailing `this.demandEnabled()` in `Lease.#sealText`, so a seal under
   way finishes. Keep the one in `#openSealed`, before the cleartext is returned. The lease's doc "refuses every seal
   and unseal, even one in flight" becomes "refuses every unseal, even one in flight". Comments at `World.lock`,
   `Gate.lock`, `Bank.lock` and `Device.lock` cite `#lock-is-intent`.
8. **No sign-out across tabs.** Ending a session in other tabs is the host's job (the Coach, 2026-11-25). A lock still
   reaches every tab, because it forgets the lease row (3). Vacate and bank deletion come with the ends thread.
9. **Options.** The three options are added to `DeviceOpts`; the provider passes them through as it does today.
   `safebyok-react-lean`'s `GiverConfig` stops omitting `deviceDB`, a one-line React change.
10. **Notes.** `notes/security.md`, through a sonnet subagent: the lease (a non-extractable leaseKey and the bankKey
    wrapped under it) is persisted in IndexedDB; a seal under way completes after a lock; autolock is best effort.
    `notes/wontfix.md` rows: a seal under way across a sweep; two tabs stowing at once (the last stow wins, and both
    leases are valid).

## Thread 0, beneath this one: connect() and disconnect() replace sweep

The Coach, 2026-11-25: "get rid of sweep, replace with disconnect", then "yes, do it the right way:
connect()/disconnect()". Like a QueryClient's `mount()`/`unmount()`, the pair can be undone: an effect's cleanup is
the inverse of its setup, so StrictMode's double mount, Fast Refresh and `<Activity>` all work. Only vacate and delete,
not yet built, end a device for good. Today `sweep` is called only on that unmount path: nothing in `src` passes it an
end cause.

1. **`device.connect()`** starts what the device keeps running: the VaultMinder's vaultDB watch for now, and the janitor
   and the device-database listener once thread 1 adds them. The watch runs while the device is both connected and
   signed in, whichever comes first. Calling it twice is the same as calling it once.
2. **`device.disconnect()`** cascades: an owner disconnects what it possesses, then itself. The World first evicts and
   drops its lease. Then its vaults, the VaultTSQ and the VaultMinder disconnect (the minder unwatches). It never
   throws, and calling it twice is the same as calling it once. A disconnected device is not disabled. Its verbs still
   work, and `connect()` resumes it. Anyone waiting in `ensureUnlocked` stays waiting, and a later unlock satisfies
   them. While unwatched, nothing may claim freshness: a Thing that is no longer watched is no longer `agekind: 'here'`.
3. **One front door.** `sweep` goes from Device, World, Bank, Gate, Lease, Vault, VaultMinder, VaultTSQ and
   `HostedVault`. A method that only forwarded up to the World (`Bank.sweep`, `Gate.sweep`) is removed, not renamed.
   The lease needs no verb of its own beyond `evict`.
4. **The VaultTSQ** stops hearing the minder, which is all its `sweep` does today. The QueryClient is not told: it may
   be the host's, and what we leave in it is sealed records under our keys. A later device on the same client
   registers its query defaults again, replacing ours.
5. **The provider** (`safebyok-react-lean`) keeps its `useState` device and adds
   `useEffect(() => { device.connect(); return () => { device.disconnect() } }, [device])`. `Device.make` must start
   nothing; work starts in `connect` and `signin`.
6. **What still disables.** `isEnabled` and `demandEnabled` stay as guards. If nothing can disable a world once sweep
   is gone, the thread says so instead of inventing a caller. Vacate and delete will set it.

## Settled (the Coach, 2026-11-25)

a. Gate staleness is measured from when this tab last read the gate (its `read_tc`), not from `written_at`. Each tab
   judges its own: N tabs make N world reads every 12 hours.
b. Yes: each tab's lease corresponds to what is on disk (2, 3), and a softlock only ever lowers `ends_at` (4).
c. No sign-out across tabs (8).
d. Withdrawn: nothing checks for a sweep by name. The lease checks `isEnabled` and that it is not evicted, at the two
   points in (7).

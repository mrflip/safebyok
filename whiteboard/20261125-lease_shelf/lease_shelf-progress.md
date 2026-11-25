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
- *Orchestrator:* review flagged that a reconnect did not refresh the bank, main gate and root box. YOLO: a connect
  after sign-in calls `vaultMinder.tryGetWorldOnce()` and tells what it throws as bad news (rework underway).
- While not connected, the vault TSQ does not hear the device's own `putBoxOnce`/`delBoxOnce`: a non-React host
  must call `connect()`.

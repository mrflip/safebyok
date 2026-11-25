# Thread 0: connect() and disconnect() replace sweep (2026-11-25)

Branch `20261125-connect`, PR #900, a draft on `main` (stacked on #899, now merged). Proved after the rework:
`safebyok` 1998 tests, `safebyok-react-lean` 339, typecheck and lint clean in each (the knockknock and envman demos
were proved before the last rework, which touches neither). The first build was proved with `pnpm justify` after the catch-up.

* **Built**:
  - `VaultMinder.connect()`/`disconnect()`/`isWatching` (`src/minding/vault-minder.ts`): the constructor no longer
    watches. `connect` watches once (`#unwatchWrapped ??= vaultDB.watch(...)`) and throws what the watch throws;
    `disconnect` clears, then calls the stop.
  - `VaultTSQ.connect()`/`disconnect()` (`src/minding/vault-tsq.ts`): connect listens to the minder and invalidates the
    bank's whole key head (`bankQueryKeyOf(scope)`, `cancelRefetch: false`); disconnect unlistens. An item's staleTime is
    `Infinity` only while minded (listening and the minder watching) and `agekind: 'here'`; a listing's, only while
    minded. Otherwise 0.
  - `World.connect()`/`disconnect()` (`src/models/world.ts`, section `[Locking and connecting]`): `#isConnected`
    replaces `#endCause`. Connect: the minder, then each hosted vault. Disconnect: `lock()` (evicts and drops the lease),
    then each vault, then the minder; a throw from the minder's stop goes to `tellBadNews`. `signin` connects the minder
    when connected; `hostVault` connects a vault when connected. A watch that throws goes to `tellBadNews`.
  - `Device.connect()`/`disconnect()` forward to the World and return the device. `Vault.connect`/`disconnect` forward
    to its vault TSQ. `HostedVault` is `{ connect, disconnect }`.
  - The giver's provider (`safebyok-react-lean/src/giver/react-giver.tsx`) adds the effect the Coach gave.
  - **Rework, the Coach's directive**: `Device.disable()` ends the device for good: it sets `#endCause` to big's
    `deviceDisabled()`, then `World.disable()` (internal) rejects the `ensureUnlocked` wait with it and disconnects
    (which locks). Idempotent, never throws. `World.connect` does nothing once disabled, so no watch restarts.
    The stage is `'disabled'`, renamed from `'swept'` (core, both demos, VOCABULARY's stage row). The disabled-path tests
    return on `disable()`: World (snapshot, subscribers), Bank (end cause, put refused before the vaultDB, hostVault
    refused), Gate (end cause, unseal refused), the `ensureUnlocked` waiter rejections, Vault (make refused, put,
    withWhisper, withUnlockedWhisper, seal, tombstone, unseal refused, watch stopped), and G2 zeroing on a disabled
    unlock (gate-forms "refuses once its device is disabled, deriving no key, and zeroes a passkey answer"). The lease's
    disabled tests stay on their fake gate.
  - Removed: `sweep` on Device, World, Bank, Gate, Lease, Vault, VaultMinder, VaultTSQ; `Phrases.BankSwept`,
    `Throwers.bankSwept`, `WorldChecks.endCause`.
  - Docs: VOCABULARY rows for bank, device, lease, land and world, and a new **connect**, **disconnect** row. In
    `notes/wontfix.md`, the form-verb row is now "A lock, a disconnect or a second form verb while a form verb runs"
    (the knockknock test that cites it follows), and the row "A bank's sweep stops its device's vault TSQ" is deleted:
    a disconnect is the device's, and a connect resumes the vault TSQ, so its case no longer exists. A new row, "A get,
    a put or a notice that lands across a disconnect", awaits a ruling.

* **Decisions made**:
  - The World keeps the connected state, since it owns the minder and the hosted vaults; Device only forwards. The watch
    starts before the vaults hear, so the connect's invalidation refetches under a watching minder.
  - `Device.make` starts nothing, verified: nothing is watched until the device is both connected and signed in (device
    test "watches nothing until connected, even once signed in").
  - `World.endCause` is `this.#device.endCause`; only `device.disable()` sets it (rework).
  - `disable()` uses safebyok-big's `deviceDisabled()` thrower (already re-exported through `export *`), whose phrase,
    `DeviceLetGo`, reads "This device was let go, by a sweep or a vacate, ...". A thrower of the same name here fails
    lint (`import-x/export`), and CLAUDE.md says re-export rather than redefine. Set aside: a new-core phrase and a
    differently named thrower.
  - `VaultTSQ.connect` invalidates the bank's items and listings, so what was cached while unminded is fetched again on
    reconnect. A second connect does nothing. This is an addition the handoff did not name.

* **Set aside**: a connect that gets the bank's three roots again (`#refreshRoots` through `tryGetWorldOnce`) was built
  and removed on the Coach's ruling (2026-11-25): freshness after a reconnect is by read time, a janitorial concern (thread
  1c), not startup or concurrency machinery. `connect()` starts what the device keeps running and fetches nothing.

* **Deviations**:
  - **Freshness through staleTime, not agekind.** The handoff's words: "a Thing that is no longer watched is no longer
    `agekind: 'here'`". I left agekind alone and made the vault TSQ's staleTime 0 while unminded instead, because
    agekind 'here' also drives `Vault #donorAt` (a pickle against a citable donor): it says the record is whole, not
    that it is fresh. Changing it on unwatch would change what a put writes. Set aside: rewriting each car's agekind on
    disconnect (touches every Thing, and the write path), and a minder-side "unwatched" flag read by the agerank code (a
    new state in the minder for what the TSQ's staleTime already says).
  - **A watch that throws** at sign-in used to fail the bank (stage `'failed'`, `lastErr` set); now it goes to
    `onBadNews`, and the bank comes up (`'unborn'` in the test). The watch is no longer part of sign-in, so it cannot
    fail it. Only a broken vaultDB sees this. The react-lean test that failed sign-in through a throwing watch now fails
    it through `tryGetWorld` rejecting.
  - The disabled-path tests deleted in the first build return on `disable()` (rework, above).

* **Discoveries**:
  - For thread 1: the plan says the janitor is "started at `signin` and cleared by the world's disconnect". With this
    shape, start it where `#connectMinder` runs (connected and signed in, from either `connect` or `signin`) and clear it
    in `World.disconnect` beside the minder; the device-database listener joins the same two places.
  - StrictMode mounts, unmounts and mounts again: the giver test sees one watch at the end, the minder watching.

* **For the Coach**:
  - The refusal a disabled device throws names "a sweep or a vacate" (big's `DeviceLetGo`); a new-core phrase would say
    "disabled".
  - After `disable()`, the device's own `signin`, `judgeStrength` and `birthGating` do not check the end cause
    themselves; a sign-in after it reaches the world, which refuses as it hosts the vault, and shows `'disabled'`.
  - Freshness through staleTime rather than agekind (above).
  - The invalidation on connect (above).
  - The watch-throw change from `'failed'` to bad news (above).
  - The new wontfix row on what lands across a disconnect.

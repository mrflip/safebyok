# Thread 0: connect() and disconnect() replace sweep (2026-11-25)

Branch `20261125-connect`, PR #900 (stacked on #899, now merged; based on `main`). Proved: `safebyok` 1978 tests,
`safebyok-react-lean` 339, the knockknock (26) and envman (24) demos, typecheck and lint clean in each; `pnpm justify`
after the catch-up, per the PR's **Tests:** line.

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
  - Nothing can disable a world once sweep is gone (handoff item 6): `World.endCause` is `this.#device.endCause`, and
    Device's `#endCause` is never set. `isEnabled`/`demandEnabled` stay as guards; I invented no caller. The `'swept'`
    stage stays exported in `bankStageVals`, unreachable, and the demos keep their `case 'swept':`.
  - `VaultTSQ.connect` invalidates the bank's items and listings, so what was cached while unminded is fetched again on
    reconnect. A second connect does nothing. This is an addition the handoff did not name.

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
  - **Tests deleted**, with no way left into a disabled world: the swept refusals of World, Bank, Gate and Vault, and
    "refuses a swept bank, deriving no key, and zeroes a passkey answer" (G2 zeroing on a disabled unlock). The lease's
    disabled tests are kept, against a local fake gate whose end can be set (`endableGateOf`, `tests/models/lease.test.ts`).

* **Discoveries**:
  - For thread 1: the plan says the janitor is "started at `signin` and cleared by the world's disconnect". With this
    shape, start it where `#connectMinder` runs (connected and signed in, from either `connect` or `signin`) and clear it
    in `World.disconnect` beside the minder; the device-database listener joins the same two places.
  - StrictMode mounts, unmounts and mounts again: the giver test sees one watch at the end, the minder watching.

* **For the Coach**:
  - The `'swept'` stage: rename or drop it when vacate and delete arrive.
  - The deleted disabled-path tests, G2 zeroing on a disabled unlock among them: they return with the ends.
  - Freshness through staleTime rather than agekind (above).
  - The invalidation on connect (above).
  - The watch-throw change from `'failed'` to bad news (above).
  - The new wontfix row on what lands across a disconnect.

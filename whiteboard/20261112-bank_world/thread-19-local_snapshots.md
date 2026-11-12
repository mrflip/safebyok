# Thread 19: local_snapshots (2026-11-12)

Branch `20261112-local_snapshots`, PR #686, stacked on #685 (thread 18, align_children). Justify: green
(safebyok 2966, react 263, demo 99, e2e 549, the adapters all pass).

* **Built**: each Storable's snapshot shows its own state only.
  * `DeviceSnapshot.bank` (the bank's snapshot) is now `bank_tok: string | null`, naming the bank `device.bank`
    returns. The device still subscribes to its bank listing, and now remakes its snapshot in
    `dismissGatingAtDiscard` too (see Discoveries).
  * `BankSnapshot` loses `maingate` and `vaults`; the Bank no longer subscribes to its gate and vault listings
    (the subscriptions and their `isLocked` guard are gone from its constructor).
  * A listing's snapshot is `readonly string[]`, the label of each present thing in listing order, frozen, the
    same array until one comes or goes (`isEqual` on the labels). A new abstract `labelOf(scope)` on Listing,
    one line in each of the four listings. `#enlist` no longer subscribes the listing to its thing.
  * `Storable.subscribeOwn` is gone: with no subclass widening `subscribe`, it had no callers.
  * React: `useBankSnapshot` subscribes to the bank itself; `useVault` subscribes to the device (bank, err),
    the bank's vault listing (presence) and the vault (its `vault_tok`, for the watch of a new life);
    `useBoxes` returns boxlabels. `subscribeToNothing` is exported from `hooks.ts` (not from the package).
  * Stopgaps, logged in TODO.md *Roadmapped* for the React rework: the demo's `WaysIn` and the dev
    inspector's vaultlabel picker each run their own `useSyncExternalStore`, over the main gate and over
    `bank.vaultListing`.
  * README: the core's line saying a box's snapshot has no `isLocked` (it has) is corrected.

* **Decisions taken**:
  * The device's "which bank" is `bank_tok`, plain data, not the live Bank: STYLE keeps methods out of
    snapshots, and `device.bank` already hands over the object.
  * The listing snapshot is labels, not scopes or scopepaths: the smallest thing that names membership within
    the thing above, and what every reader so far wanted.
  * The proof's "React host in miniature" became a component per store: device (stage, bank or none, asking),
    bank (lock word), vault listing (vaultlabels), box listing (boxlabels), plus a gate component (revision) in
    the watch test, which had asserted "hears the new gate" through the device's composed render. A
    `mountPage(device, bank)` helper mounts the first three and checks them together.

* **Deviations**: none from the plan. One behaviour added: the other-life fix below.

* **Discoveries**:
  * **A bank of another life adopted with no gating open never told the device.** `Bank.adopt` of a row of
    another `bank_tok` while still present leaves the bank listing's membership unchanged, so the device's
    snapshot kept the old `bank_tok` while `device.bank` was null. It was stale before this thread too when the
    bank was already locked (nothing in the composed snapshot changed). Fixed by a `#remakeSnapshot()` in
    `Device.dismissGatingAtDiscard`, the one call `Bank.adopt` already makes at discard. Test: bank-gate.test
    "tells the device's listeners once a bank of another life replaces the bank listed, with no gating open".
    The method's name now undersells it; renames were out of scope.
  * The double device paint after a gate verb (`ready (asking X)` twice) came from the bank's composed snapshot
    changing with `maingate`; it is gone.

* **Tests changed or removed** (the Coach asked for each, by file and title). All but the one added test restate a composed-snapshot assertion for the local shape:
  * safebyok `index.test.ts`: "exports each type its exported signatures name" (`DeviceSnapshot['bank_tok']`).
  * `device.test.ts`: "builds a bank over empty storage through a build_bank gating, and readies it";
    "lists every stored vault as locked, without asking"; "refuses while storage is unavailable, and leaves the
    device without a bank until a call succeeds"; "hands the listed vault a deleted vault's tombstone through the
    watch, ..."; "lists a vault built on another device, through the watch it starts" (listens to the vault
    listing in place of the bank); "vacates the device when any vault's call is refused for a revoked identity".
  * `bank-ending.test.ts`: "a sweep leaves cached leases for the next bank to unlock with"; "a vacate disables
    the device and vacates every vault and lease it has on this device".
  * `bank.test.ts`: "puts a vault in a bank unlocked by asking, then returns the same vault without asking
    again"; "stores a vault not yet stored in a locked bank, asking nobody, the bank left locked".
  * `bank-gate.test.ts`: "deletes the bank, its gate, ... leaving the device no bank"; "refuses a bank of another
    life stored since the last fetch, ..." (one assertion added); **added**: "tells the device's listeners once a
    bank of another life replaces the bank listed, with no gating open".
  * `box-listing-create.test.ts`: "creates two boxes, each listed under its own boxlabel"; "makes a box present
    and puts it in the snapshot".
  * `box-listing-rows.test.ts`: the describe "its snapshot is what its boxes show" (five tests: "shows the same
    sidecar as `box.sidecar`", "shows a box created from a dna as the record it put", "shows a sparse box as
    present, not full, with no sidecar", "shows the box's new sidecar after a put", "remakes its rows at a lock
    and an unlock, ...") is restated as "its snapshot is the boxlabels of its present boxes", three tests.
  * `listing.test.ts`: "has present things only, each as the thing's own snapshot" → "has the boxlabel of each
    present thing only"; "is the same array until one thing's snapshot changes, ..." → "is the same array
    through a thing's own change, telling no listener"; "follows a change made by a box's own put, notifying
    once" removed (box-listing-rows has its restatement); "includes a box once it is reborn, ..." restated.
  * `proof.test.ts`: all nine tests, for the component per store above.
  * safebyok-react `hooks.test.tsx`: the `BoxPage` helper joins boxlabels; no test's title or expectation moved.

* **For the Coach**: whether `bank_tok` is the right "which bank" on the device's snapshot; whether the
  discard remake belongs in `dismissGatingAtDiscard` or in a call of its own.

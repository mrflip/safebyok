# Thread 13: proof (2026-11-03)

Branch `20261103-proof`, PR #PRNUM, stacked on #460. Justify: green; safebyok 4765 passed, 37 skipped; `proof.test.ts` 9.

* **Built**: `packages/safebyok/tests/models/proof.test.ts`, every step asserting what components paint.
  `mountComponent` is `useSyncExternalStore` in miniature: `expectRenders` takes the exact paints since the last
  call, and fails on a listener told with no new snapshot or a snapshot that moved with none told. No React dep:
  the core has none, and the strings a view makes read better than a DOM.
  * The whole life: hello, build, seal, unseal, expose, lock, a closed dialog, a wrong passphrase, unlock, delete,
    rebuild over the tombstone, a fresh Bank picking up the lease and opening what the last page sealed.
  * Rows beside it: replace the passphrase; add, unlock by, and revoke a passkey; `tidy` inside and past autolock;
    `bank.vacate`; the store out of reach; a second device; StrictMode, empty and over a cached vault.
  * Nothing stuck. All the steps asked for pass, and none is `.todo`.

* **What the proof found, and the fix**:
  1. **Exposes information.** `vault.lock()` left a box's snapshot alone, so a component showing `box.whisper`
     over the box's store was never told, and the whisper stayed on screen past the lock. `BoxSnapshot` gains
     `lockState`; `#attachLease` calls a new `listing.settleThings()` so an unlock tells the boxes too. This
     overturns a `box.test.ts` row titled "a lock leaves the snapshot and its listeners alone": see *For the Coach*.
  2. **StrictMode.** A `hello` from a swept bank landing late painted the fresh listing `refused` (or, landing
     second, turned a `ready` bank `refused`). `bank.hello` holds the listing it began on and touches the bank's
     stage only if that is still the bank's: the one identity comparison asked for. Its caller still hears
     `disabled`. `bank.test.ts`'s row that pinned the flicker now pins `made`.
  3. **`Vault.takeWorld` stripped the gate.** Checked and confirmed: a box answer whose vault row is newer left the
     vault `isFull: false` and `vault.gate` refusing `bad_option`. It only shows where no notice came first. The
     Coach: "fix". It now parses `VS.vaultRow` and receives the row whole; `vault-boxes.test.ts` has the row. A later
     thread was to fix this for good: this may be all it needs.

* **The other two cold reads**:
  * `ensureUnlocked` calling `ensureTimely` first: confirmed that an unlocked, stale vault with the store out of
    reach refuses `storage_error`. I reordered it, then the Coach ruled it right ("ensure timely is to make sure the
    vault is recent enough to know if it deserves a lease"), so it is back. The proof pins it: it refuses, and
    `vault.isUnlocked` stays true.
  * A box added elsewhere with no watch: confirmed, and not a bug. With a watch it paints; with none, the host's next
    `vault.hello()` lists it, and a second-device step pins that. A host on a store with no watch needs a timer.

* **Decisions taken**:
  * Separate `it`s after the main sequence, so a sticking one would not hide the rest.
  * `lockState` on the box's snapshot, not `exposed` reading false while locked: `exposed` is pinned as surviving a
    lock, and the field matches `VaultSnapshot`.
  * A repaint with the same text is right where the snapshot's identity moved: a gate change moves `revision_tok`,
    so `['ready: main unlocked']` paints again. Likewise `made: no vaults` after a sweep, whose fresh listing has its
    own empty array. Both are harmless, and neither is coalesced.

* **Deviations**: a second device, the store out of reach, and `bank.vacate` are rows the handoff did not ask for. The
  demo needs them, and they are what checked the cold reads. `models-invariants.md` *Public* says `bank.vacate` leaves
  the bank ready; the code, per thread 12, leaves it `made`, and the proof follows the code.

* **Discoveries** (pinned by the proof, for whoever writes the demo):
  * Delete paints `main locked` then `no vaults`: the lock lands before the tombstone. A delete from another device
    paints only `no vaults`.
  * A fresh hello paints `made: main locked` before `ready: main locked`: the list fills before the stage moves, so a
    host gates on `stage`.
  * After a revoke, a passkey touch refuses `absent_wayin`, which is not correctable, so the dialog settles.
    `gating.passkeyHeader` is null by then, so a dialog should not offer it.
  * A passkey's answer is spent by an attempt, its bytes zeroed: ask again for each one.

* **Crossings, for `crossings.md`** (read from the code, not run):
  * A `hello` in flight crossing `bank.vacate` lands on the same listing, so it can mark the bank `ready` and list the
    vaults again, locked, after a sign-out. It exposes only locked rows and holds no lease.

* **What the demo needs next**:
  1. `Bank`, `Vault`, `Box`, `Gating` and their snapshot types exported from `src/index.ts`; none are yet.
  2. `safebyok-react`'s provider, hooks and modals moved off the old `Bank`, onto what this test does.
     `requestCleartext` opens the modal, which hands clears to `gating.attempt` and closes on `gating.whenSettled`.
  3. A real `strengthChecker` passed to the bank: the default refuses every passphrase.
  4. A timer calling `bank.tidy()`: nothing autolocks a page left open otherwise. And on a store with no watch, a
     timer calling `vault.hello()`.
  5. An effect that ignores a swept `hello`'s `disabled`, as a cancelled effect does.
  6. A vault component keyed on `vault_tok`, and shown only while the bank's snapshot lists it: a rebirth is a new
     instance, `vault.boxListing` throws `vault_gone` on a tombstone, and a vacated vault's own snapshot stays
     `present: true`.
  7. Something for "has a passkey": `VaultSnapshot` does not say, so a revoke button reads `vault.gate` in render,
     which refuses on a sparse vault. Vaults a hello lists are full, so this works today, but a `has_passkey` on the
     snapshot would be plainer.

* **For the Coach**:
  * **`lockState` on `BoxSnapshot`** overturns a pinned row, and each box now repaints on every lock and unlock, with
    the box list too. The alternative is a host subscribing a reveal to the vault as well, which leaves a whisper on
    screen for any host that forgets. I recommend keeping it.
  * Your rulings on doc blocks and on the specs' trees applied here: new doc blocks are one or two lines; the spec's
    "a lease in force → done" lost to your ruling on `ensureTimely`.

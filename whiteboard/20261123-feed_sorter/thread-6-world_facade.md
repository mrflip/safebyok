# Thread 6: world_facade, the World with behaviour unchanged (2026-11-24)

Branch `20261124-world_facade`, PR #872, stacked on #871 (`20261124-things_ring`). Thread A of `world-design.md`.
Proved: `safebyok` typecheck and lint clean, tests 1875 passed and the seven `vault-minder` tests red on purpose
(listen 4, writes 2, staleness 1), no others; `safebyok-idb-lean` 113, `safebyok-postgres` 354, `safebyok-react-lean`
320, each typecheck and lint clean. `pnpm justify` after the catch-up: see the PR's **Tests:** line.

* **Built**:
  - `World` (`packages/safebyok/src/models/world.ts`), made by `World.make({ device })` in Device's constructor, reached
    as `device.world` (a getter: a spread of the device still shows banklabel, token and leaseMillis alone). It holds
    the lease (private), the unlock wait (`ensureUnlocked`, `dismissUnlock`, `isUnlockWanted`), the end cause,
    `isEnabled`, `demandEnabled`, `lock`, `sweep(endCause?)`, `seal`, `unseal`, `leaseEndsAt`, `leaseLoggable`,
    `isLocked`, `isUnlocked`, `hostVault` and the vaults it sweeps, and the bank snapshot (`getSnapshot`, `subscribe`)
    with the stand-ins (`showStandIn(snapshot)`, `showBank()`, both Internal, called by Device). `hello(sortedVaultDB)`
    takes the SortedVaultDB at sign-in, beside the two minders' `hello`; `sortedVaultDB` reads it back.
  - `world.makeGate(record, bankStamp)` calls `Gate.make(record, { device, bankStamp }, friend)`. The friend
    (`WorldGateFriend`, shapes-gateish) is `leaseGateOf(bankStamp)`, `renewal()` (the held lease's `born_at` or null)
    and `attachLease(lease)`. The gate keeps it private; its `#unlockByProving` builds the lease against
    `friend.leaseGateOf(this.#bankStamp)` with `friend.renewal()`, then `friend.attachLease`.
  - `LeaseGate` is an interface; the world supplies a `WorldLeaseGate` per lease, its `bankStamp` the gate's pinned
    stamp, frozen; `lock`, `isEnabled`, `demandEnabled` read the world. `lease.ts`, `proving.ts` untouched.
  - `Bank` and `Gate` delegate every moved member to the world in a line each; `Bank` no longer keeps a snapshot or
    subscribes to its gate. A gate subscribes to its world and tells its own subscribers of each world change, so
    `gate.subscribe` hears what it heard before. Device subscribes to the world once; `device.lock()` is `world.lock()`.
* **Decisions made**:
  - **A birth holds its lease until the bank exists.** `BirthGatingFriend` is now `leaseByProving(gate, proving)`
    and `attachBank(bank, lease)`; `birthBank` seals the root box under the lease directly, hands lease and bank on
    together, and evicts the lease on any refusal. Set aside: attaching at once (the design's table), which on a
    device that has a bank evicts that bank's lease at a refused re-birth, locking it, and changes the eviction
    count `gating.test` states. Cost: a `Lease` is a local in `birthBank` (recorded in `notes/security.md`).
  - **`gate.sweep(endCause)` is `world.sweep(endCause)`**, as the handoff's one-line delegation and the bank-wide
    isEnabled ruling say: it now ends the bank too, and a bare gate sweep's message is `BankSwept`'s.
    `Throwers.gateSwept` and `Phrases.GateSwept` went, unused. Set aside: a gate-local end cause kept beside the
    world's, which keeps the old answer at the cost of a second end cause.
  - **`device.sweep()` sweeps the world only while the device has a bank**, as it swept "the bank, if it has one":
    a bankless device swept still births after (a device.test promise). It still stops the SortedVaultDB's watch.
  - **`device.maskedView()` shows the world's lease only while the device has a bank**, as before.
  - `Bank`'s private getter over the BankMinder's roots was `#world`; it is `#roots` now, to free the name.
* **Deviations**:
  - **The gate keeps its pinned `bankStamp`** (handoff item 3 said it reads through the world). In thread A the
    world has no source for a bank's stamp before `#attachWorld` makes the Bank: a birth's gate, and every gate a
    test makes alone, carry a stamp no world can answer. The gate holds no reference to its bank. The design puts
    "the gate's bankStamp from the world" in B1.
  - `Gate.make` takes a required third argument, the friend: its signature changes for any caller.
* **Discoveries**:
  - Every Gate and Bank on one device now shares one lease. Tests that made a second bank on the born device to act
    "elsewhere" now make it on a second device over the same vaultDB.
  - No import-cycle remedy was needed: world.ts uses `Gate` only inside `makeGate`, and Device and the shapes only by type.
* **Tests changed** (promise before, after):
  - `gate.test` "gate.sweep(endCause)": was "drops its lease, disables the gate for good ... `bank.isEnabled` true";
    now "drops its world's lease, disables the gate and its bank for good", `bank.endCause` is the cause given.
  - `bank.test` "Bank.make": was "locked as its gate is" on the born (unlocked) device; now "locked as its device's
    world is", the device locked first.
  - `device.test` "shows its own bank still when another bank is made over the same vaultDB": was "another bank's
    lock tells the device nothing"; now making it tells nothing, and its lock locks the shared world while
    `device.bank` and the snapshot stay the device's.
  - `gate-forms.test` `bankAndElsewhere` (three "stale_write ... leaving the bank locked" tests): "elsewhere" was a
    second Bank on the same device, now the bank of a second device; promises unchanged.
  - Call shape only: `Gate.make(record, opts)` became `device.world.makeGate(record, bankStamp)` in gate, bank and
    proving tests and `TH.makeStoredBank`; gate.test adds a refusal for a missing friend.
* **For the Coach**: the open matters in the PR body: a gate's sweep ending the bank; the gate keeping its stamp;
  `Gate.make`'s friend; the birth's lease in `birthGating`'s body.

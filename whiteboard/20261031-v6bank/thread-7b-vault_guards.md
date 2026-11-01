# Thread 7b: gate-epoch voiding (2026-11-01)

Branch `20261101-vault_guards`, PR #442, stacked on #438. Justify: green, core 5,253 passed, 37 skipped.

Built to the Coach's direction of 2026-11-01, relayed by the orchestrator: the plainest thing that
keeps the promise; a race met is reported, not handled; no counter, mutex or guard added or removed.
The rollback guard stays unbuilt: held, not rejected.

* **Built**, in two commits so either drops cleanly:
  * `939b7385`, the lease. `gate_epoch` on the vault record (`vaultSparse`, starting at `FirstGateEpoch`,
    1) and in `leaseStamp`. `Lease.grant` stamps the vault's. `Lease.isInForce` is false, and
    `sealWith`/`unsealWith` drop the keys and refuse 'gate_moved', once `lease.gate_epoch` differs from
    `vault.gate_epoch`. `Lease.get` erases a kept lease under any other epoch and answers null: the
    reload case. `Vault.gate_epoch` reads `central`, so a put refused voids nothing. `GateStaging` moves
    the epoch by one; a host's patch cannot. Each `Gate.with...` answers a `GateChange`, the proving
    beside the props, and `#sendGate` re-grants from it once the put lands. README.md:844's three
    loosened pins go.
  * `c94cba9c`, the lock. `Vault.adopt` compares, as `Box.adopt` does with `isOwnSend`: an epoch moved
    by anything but the vault's own staged change calls `lock()` on a vault unlocked. Tests in
    `tests/models/vault-voiding.test.ts`, `lease.test.ts`, one box across a move in `vault-life.test.ts`.
  * VOCABULARY's *Made under* rewritten, for both surfaces: the old one still has `VaultMadeUnder`.
    `notes/guarantees.md` G4 amended; a `notes/security.md` entry made.
* **Decisions taken**:
  * **Where the epoch binds.** In `leaseStamp`, so in `vault_key_lease_wrapped` alone (`cipherCtx([held,
    granted], ...)`). An epoch edited in the deviceDB fails the unwrap, 'damaged_lease'. Not in
    `vaultStamp`: boxes and wayins outlive a gate, as the vaultKey does.
  * **One rule at `Lease.get`: any other epoch is erased**, older or newer. A newer one means the vault
    in hand is behind; leaving it would need a warning and a reason to keep it, and costs only a
    passphrase. The old surface's rule was no erase on a judgment (`notes/security.md` says so of
    `src/`): the Coach may prefer that; see Open matters in the PR.
  * **A vault locked hears a move and does nothing**: no decline. An unlock gating open proves against
    the gate of its moment, each attempt fetching first. A record kept on the device waits for the next
    `Lease.get`.
  * **Own change stays unlocked**, as README.md:844 says. The old lease is left in place through the
    put, refusing by itself, then displaced by `#setLease`: no flicker, no state to manage.
* **Set aside, and why**:
  * The epoch carried in `leaseGrantOpts`, with `Lease.grant` refusing a proof whose epoch is not the
    vault's, and `isOvertaken` checks in `#unlockBy`. It closed the proof-racing-a-move window below.
    Built first, then dropped on the Coach's direction: 40 call sites and a wrapped `#unlockBy` for a
    race. Kept at `refs/wip/7b-epoch-in-opts` locally until this thread files.
  * Erasing on a move by a conditional `Lease.get` chore, sparing another tab's fresh lease; a
    `#voidLeaseOfGateBefore` splitting own from remote: machinery for races. `lock()` is the whole thing.
  * The epoch on `Gate` or `Proving`: a revoke holds only the old gate's proving; churn for nothing.
  * `demandInForce` so a voided `takeUpLease` hears 'gate_moved': it says 'vault_locked', as before.
* **Races met, reported and unhandled** (all fail closed but the first):
  1. A proof of the old gate running on a locked vault when a move is heard grants, on landing, a lease
     stamped with the new epoch: an old passphrase typed in that moment unlocks that one session. The
     window is one key derivation; it is in `notes/security.md`.
  2. A grant mid-flight when a move is heard: the lease is taken up, void, refusing 'gate_moved'; the
     vault reads unlocked until `ensureUnlocked` re-proves.
  3. A box's seal during this device's own change, between the put and the new lease: 'gate_moved'.
  4. A tab's `lock()` on hearing a move erases by scope, so another tab's fresh lease of the new gate;
     that tab's next session asks again. Likewise a stale tab's `Lease.get`.
* **Discoveries**:
  * **The premise was wrong.** No received-gate-change lock existed in the models: `Vault` had no
    `adopt`; its doc blocks said a held lease stays in force, and `tests/loosened` pinned that against
    README.md:844. True only of the old `src/vault.ts`. `c94cba9c` is that path, built new.
  * Voiding does not need the highest epoch; `highest_gate_epochs` stays unread.
  * Own-change re-grant makes a lease from a proving of the gate before: it opens the same vaultKey.
  * The `sonnet` note-taker found entries in `notes/security.md` of the old surface saying a lease
    of another epoch is never erased (about lines 353, 377, 501, 512). They describe `src/`, not
    `models/`; none was changed.
* **For the Coach**: the two commits are separable. Dropping `c94cba9c` leaves a vault reading unlocked
  whose lease refuses after a move elsewhere. Dropping both restores the loosened behaviour and its pins.

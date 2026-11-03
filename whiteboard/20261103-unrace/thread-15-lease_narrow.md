# Thread 15: lease_narrow (2026-11-03)

Branch `20261103-lease_narrow`, stacked on [#460](https://github.com/mrflip/safebyok/pull/460). Justify: green; safebyok 4758 passed, 37 skipped.

* **Built**: the lease friend is out of the public surface of `Vault` and `Lease`.
  * `lease.ts`: `lease.friend` is `#friend`. New `lease.isMadeFor(friend)`, a boolean over a friend the caller already holds, for the vault's refusal.
  * `vault.ts`: `leaseFriend()` is `#leaseFriend()`; `_cheat_leaseFriend()` is for tests, and carries an `eslint-disable-line unicorn/prefer-private-class-fields`, as `memory-device-db.ts`'s cheats do.
  * A birth moved: `VaultListing.#runBirth` and `recordOfBirth` are now the Vault's public static `launchBirth(listing, scope, prior)`, its private static `#runBirth`, and a module-private `recordOfBirth`. `buildVault` still checks the scope and the slot, then calls `launchBirth`. The birth's lease is now `vault.#unlockByProof(passphraseProving)`, the same two lines as an unlock's.
  * Tests: a row in `vault-unlock.test.ts` walks every field and getter of a vault and an attached lease, symbols and prototypes too, plus `Object.keys` and `JSON.stringify`, for the friend, the cached row and its handle. Another reads `src/` for callers of `_cheat_leaseFriend`. `lease.test.ts` gains a row on `isMadeFor`.
  * `notes/security.md`: the lease_seams entry on the friend is amended in place, per the file's header, by a `sonnet` subagent. `notes/guarantees.md`: G9 says where the friend lives; its table's `gate.ts` row names the birth's new home.
* **Decisions taken**:
  * **The birth takes no proving from its caller.** The handoff leaned to a public `vault.unlockByProof(proving)`. Set aside: whatever is passed as a proving is handed the friend by `buildLease(friend)`, so a duck or a subclass is a new door, and closing it wants `instanceof` plus something for subclasses. A static inside the class reaches `#unlockByProof`, and the only proving it sees is the one its own gating made. No symbol, WeakMap or registration.
  * **`#attachLease` keeps its refusal of a lease of another instance**, through `isMadeFor`. Nothing in `src/` can trip it now, as a lease attaches through its own friend and no friend goes out; only the cheat can. Kept because the handoff kept it, and because deleting it orphans `Phrases.LeaseOfOtherHolder` outside `models/`. See *For the Coach*.
  * `launchBirth` parses `prior` with `MSX.revision`, being an export; `Gating.launch` already parses the scope.
* **Deviations**: the birth's route above. Doc blocks follow the Coach's ruling of today: those I wrote or moved are one line under 120 characters, and the ones I did not otherwise change stay for thread 17.
* **Discoveries**:
  * **The friend was not the only route to the row.** `vault.world.deviceDB.peek({ ...vault.scope, vault_tok: vault.vault_tok })` answers the same row with the same handle, and so do `listing.world.deviceDB` and `bank.deviceDB`. So this narrows the Vault's and Lease's API; it does not put the row out of a host's reach. The host supplies the deviceDB, and a same-origin script can open the store regardless. Recorded in `notes/security.md`; not changed here.
  * **Left open by JavaScript**: `_cheat_leaseFriend` is callable by a host, by name; and a script patching `Proving.prototype.buildLease`, `Lease.grant` or `Lease.peek` captures the friend from the vault's own calls.
  * The `declineAtLock`, `declineAtDiscard`, `gating.vault` and `listing.releaseGating()` matter: this neither helps nor hinders. `Gating.launch` is called as before, and none of them reaches a friend.
  * `Vault.launchBirth` being public lets a host skip `buildVault`'s slot check. That costs nothing: the put with `ifPresent: 'get'` answers the vault stored, locked.
* **For the Coach**:
  * **The cheat is a door by name.** The handoff asked for it; the ruling says nothing but a Vault and its Lease should reach the friend. Six test sites use it, beside the new row that compares against it. They could capture the friend with a spy on `Proving.prototype.buildLease` instead, and the cheat could go.
  * **The `isMadeFor` refusal** is unreachable but for the cheat; if the cheat goes, it and `isMadeFor` should go too, and its phrase with them.
  * **`world.deviceDB`** as above.

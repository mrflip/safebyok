# Thread 21: small_rulings (2026-11-03)

Branch `20261103-small_rulings`, PR #464, stacked on #463. Justify: green; core 4780 passed, 37 skipped; `tests/models` 1153,
`proof.test.ts` among them. Size budgets unmoved; empty changeset.

* **Built**, one commit per item:
  1. `_cheat_leaseFriend`, `lease.isMadeFor`, `leaseOfOtherHolder`, `Phrases.LeaseOfOtherHolder` and `#attachLease`'s check are gone,
     with the `src/`-scanning row. G9 and `notes/security.md` corrected. `makeBornVaultAndFriend` (`test-helpers/vault-world.ts`)
     catches the friend of a birth's `buildLease` with a spy, for the five sites left.
  2. `Listing.isRefusalOfRow`, widened in `VaultListing` by `vault_gone` and `vault_mismatch`, replaces `recordOfRefusal`. A refused
     gate verb's row reaches the Vault before the throw: tombstoned, or the other life in its slot. Two rows in `vault-gate.test.ts`,
     not the one asked for, as `vault_mismatch` is half of the change.
  3. A section in `whiteboard/20261102-unrace/crossings.md`; six rows in `halpimonfire.test.ts` (seven with the `it.each`), all
     staged, none skipped.
  4. `bank.sweep` nulls `#lastHello` first; `MSX.vaultRow` makes `takeWorld` refuse `bad_record`. A row each.

* **The Coach's question: "The point is to be unreachable right? Will we still have good coverage?"** Yes to both. A `Lease` calls
  only its own friend's `attachLease`, and the friend now lives in `Vault.#friend` and `Lease.#friend`, both private, so a lease
  can't be offered to a vault it wasn't built on. Failing tests of 18 mutants of `#attachLease`, `Lease.attach`, the friend and
  `#renewLease`, each run over `tests/models`:

  | Mutant | Before | Removal alone | Tip |
  | --- | --- | --- | --- |
  | no `isForgotten` check in attach | 1 | 1 | 1 |
  | no `demandReadyToAttach` | 1 | 1 | 3 |
  | unattached lease not vacated | 1 | 1 | 1 |
  | displaced lease not evicted | 1 | 1 | 1 |
  | attach holds nothing | 116 | 116 | 119 |
  | attach caches nothing | 32 | 32 | 34 |
  | refused cache untold | 1 | 1 | 2 |
  | attach doesn't settle / settle its boxes | 11 / 1 | 11 / 1 | 11 / 1 |
  | `Lease.attach` a no-op | 122 | 122 | 127 |
  | a peeked lease re-caches | 1 | 1 | 1 |
  | friend peeks / uncaches another scope | 14 / 48 | 14 / 48 | 14 / 49 |
  | friend's `lock` a no-op | 1 | 1 | 1 |
  | `#renewLease` skips `isForgotten` | 1 | 1 | 2 |
  | friend remade each call | 233 | **0** | **0** |
  | (the check itself, `isMadeFor`) | 1, 2 | gone | gone |

  **Lost:** the two rows on the removed check, and the proof that a vault has one friend for its life. That mutant died by the
  hundreds only through `isMadeFor`; nothing depends on the identity now, so its survival is no gap. Many of these die by one row
  alone, as they did before: no thinner than it was. The `vault.test.ts` friend rows stand, on the friend a real birth used.

* **Decisions taken**: the friend is caught at birth, not at an unlock, so catching it moves no lock state. `#leaseFriend`'s `??=`
  stays, its doc block now "made once". `crossingGrant` in `halpimonfire` spies `Lease.grant`, as `Proving.prototype.buildLease`
  unbound trips `unbound-method`.

* **Deviations**: an extra `vault_mismatch` row in item 2, said above. `Phrases` is outside `models/`, as the ruling names it.

* **Discoveries**:
  * **The handoff's third case doesn't reject a gate change.** A tombstone or a sweep crossing the renewal's `buildLease` drops the
    held lease, so `#renewLease` sees it forgotten, vacates the new one and the verb *resolves*, over a vault gone or let go.
    `demandReadyToAttach` is met after a store only in a **birth**: `vault_gone` or `disabled`. Pinned both ways, and `crossings.md`
    says so.
  * Crossing, a sentence: a sweep during the renewal's `buildLease` erases the cached row, through `#vacateUnattached`, where a sweep
    otherwise leaves it; the next session asks for a proof.
  * The "crypto failure" row is a mock of `buildLease`: a real one can't be staged without machinery. No row was skipped.

* **For the Coach**: whether `#leaseFriend`'s memo should go, now nothing needs its identity (recommend: leave it, it parses the stamp
  once).

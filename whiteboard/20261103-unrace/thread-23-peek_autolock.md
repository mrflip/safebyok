# Thread 23: peek_autolock (2026-11-03)

Branch `20261103-peek_autolock`, PR #467, stacked on #466. Justify: green; core 4790 passed, 37 skipped; size budgets unmoved;
empty changeset.

* **Built**:
  1. `Lease.peek` (`src/models/lease.ts`) forgets a row past autolock on the branch that already forgets a row of another epoch or
     stamp: `uncacheForgotten`, then null. `isPastAutolock` is one comparison, `clock.now() - proved_at > leaseMillis`. No new state,
     no timer, no throw: a caller sees what it sees with no row, so `ensureUnlocked` asks for a proof, or refuses `vault_locked` with no
     dialog. A refused erase warns, as `uncacheForgotten` already does on that branch.
  2. Autolock stated as a best-effort reminder, not a guarantee: `bank.autolock`'s and `Lease.peek`'s doc lines, `notes/guarantees.md`
     G4, and the `tidy_host` entry of `notes/security.md`, amended through a `sonnet` subagent.
  3. The specs: the tombstone clause (of its own `vault_tok` it stays in its slot; of another it replaces the vault) in
     `newdesign-models.md` and `newdesign-proof.md`'s hello tree, and `lease.peek`'s row past autolock in both.
* **Decisions taken.**
  * **The friend carries the duration.** `LeaseFriend` gains `leaseMillis`, bound in `Vault.#makeFriend` as `world.leaseMillis`, or
    `DefaultLeaseMillis` where the world names none. Set aside: a friend verb answering the row's staleness, as the lease would hand
    its record's `proved_at` out to a callback, and the friend already has the `clock`; and anything on `peekLease`, whose shape stays.
    `leaseFriend` and `vaultListingOpts` share one private `leaseMillis` checker.
  * **The boundary matches `bank.autolock`.** A row proved exactly the duration ago still opens, as `leasesProvedBefore` is strict:
    `proved_at < now - leaseMillis`. An autolock of Infinity never trips it.
  * **The order stands.** A damaged row still throws `damaged_lease` first; the age of a row that fails its check means nothing.
* **Test rows.** `lease.test.ts`: exactly the duration opens what the grant sealed; one past reads as null and is uncached; a refused
  erase warns and answers null; Infinity. `vault-unlock.test.ts`: both sides of the world's `leaseMillis` and of `DefaultLeaseMillis`,
  replacing "makes no check of a cached lease's age". `bank.test.ts`: a fresh Bank asks for a proof past autolock with no
  `bank.autolock` call, and without scanning; with no dialog it refuses as with no row; just inside opens, asking nothing; a refused
  erase still asks, with no bad news and no panic. `proof.test.ts`: the late page asks with its host never calling autolock, by what a
  component renders; a later page's host call after `hello` still erases. Mutations bit: dropping the check (8 rows), `>=` for `>` (4),
  another default (1).
* **Crossings, as sentences.** A proof in another tab caching a fresh row between this peek's read and its erase has that fresh row
  erased, which costs the next session a proof: the same as the branch this joins. No guard, by the Coach's ruling.
* **Discoveries.** A row of another life in a listed vault's slot is still no row to `deviceDB.peek` (thread 22), so `Lease.peek` never
  meets it. `peek` now reads the host's `clock`; a clock that throws arrives as `tryPeek`'s bad Outcome, then bad news, then a proof.

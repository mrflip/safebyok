# Thread 4b: bankdb_battery (2026-11-12)

Branch `20261112-bankdb_battery`, PR [#666](https://github.com/mrflip/safebyok/pull/666), on main (thread 4, #663, has merged). Justify: green
(safebyok 3359, e2e 504, every package passing).

* **Built**: `describeBankDBBattery(name, opts)`, the battery every bankDB runs, in
  `packages/safebyok/tests/test-helpers/bank-db-battery*.ts`. It started as a verbatim copy of
  `vault-db-battery*.ts` (commit 47ff8ee36), so `git diff 47ff8ee36 -- tests/test-helpers` shows
  what changed between the two batteries. The files:
  * `-gets`: ensureBank, getVault, listBoxes and getBox.
  * `-puts`: buildBank, putVault, putBox, the policy matrix, and the gate verbs. The gate verbs
    are GV1–GV6 row by row, Rule 15 (only the gate row's revision_tok moves), and stale_write.
    An `AboveAsks` table covers P2–P4 over the gate and vault verbs.
  * `-dels`: delBox, delVault and delBank, with their cascades, and tidyGone.
  * `-races`: two clients at once, slipping a call in front of `doPutGate`, watch, and a call
    that fails.
  * `-identity`: a stranger is refused every verb.
  * `-flaws`: now "a row of a later fmt".

  New helpers are in `bankdb-world.ts`: `vaultScopeOf`, `boxscopeOf`, `vaultAt`, `boxAt`, and an
  `*AskOf` for each of the vault and box asks. `tests/storage/memory-bank-db.test.ts` runs the
  battery against MemoryBankDB: 192 cases, all green, with no change to src.
* **Decisions taken**:
  * The entry point takes a factory, `makeBankDB`, and the `_cheat_rowsOf` hook, as the vault
    battery does. The optional hooks are carried over: `makeTwin`, `makeCappedBankDB`,
    `makeBankDBFor`, `_cheat_failNextCall`, `_cheat_adapterOf`, `watches` and
    `boxNoticesCarryVault`. I read "a factory and nothing else" as "no world object passed in",
    since the rows hook is what lets an adapter's own rows be planted.
  * `refusalkind` is pinned only for stale_write (Rule 17). Every other refusal asserts
    `ok: false` and the act; one the classifier never saw is `act: 'unclassified_storing'`.
* **Deviations**:
  * Under the Coach's real-path rule (2026-11-12), the battery tests only rows a verb, or a later
    version of the package, can write. Dropped for that reason:
    * the bad-label cases for ensureBank and listBoxes;
    * a foreign gate row over a live bank;
    * a damaged bank row under tidyGone;
    * the vault battery's box row of "another vault_tok". In the bank world that row is simply
      no row, and the gets and dels cases already cover it.

    `-flaws` became "a row of a later fmt": a newer client's rows, which the store must hold and
    every verb that reads one must refuse.
  * Commit c51980e54 reverts thread 4's review change to `MemoryBankDB.doTidyGone` and its test,
    back to the plain sweep (directive 2, the Coach).
  * `notes/answer-contract.md`, *The bank adapter*, gains two sentences (directive 1, item 3):
    a cascade notifies no watcher; and a box row under another life pair is no row, which an
    `ifAbsent` put must check.
* **Discoveries**:
  * `bankAt(seq, bank_tok)` gives every bank_tok the same revision_tok. A rival bank must spread
    `Rival` over it, or the classifier reads the ask as retcon.
  * `BX.shellVaultOf` carries `bank_tok: VoidLifeTok`. A del expecting a void vault row must set
    the live bank's bank_tok on the shell, or it reads as bank_reborn.
  * For threads 5 and 13–15: the cap cases run only when `makeCappedBankDB` is given, the identity
    cases only with `makeBankDBFor`, and the watch cases only when `watches` is true.
* **For the Coach**:
  * **tidyGone under a later-fmt bank row.** After the revert, an older client's tidyGone over a
    bank row that a newer client wrote fails `bankRow`. It then reads bank_tok as null and deletes
    every vault row of the bank, and with them their box rows. That path is real: two versions of
    the package share one store. Should a later fmt count as a real path? If yes, restore a guard
    for a bank row that is present but fails to parse, and pin it under "a row of a later fmt". I
    recommend yes.
  * **MemoryBankDB skips the identity cases.** It has no `makeBankDBFor`, so they first run with
    thread 5 or a later adapter. I recommend leaving it so.

# Thread 14: bankdb_convex (2026-11-12)

Branch `20261112-bankdb_convex`, PR [#670](https://github.com/mrflip/safebyok/pull/670), stacked on [#666](https://github.com/mrflip/safebyok/pull/666) (thread 4b, the bankDB battery).
Justify: green (safebyok-convex 508, of which the bankDB battery and own cases 190; e2e 519, the
Convex pairing 184 over a ConvexReactClient).

* **Built**: `ConvexBankDB` in `packages/safebyok-convex`, beside `ConvexVaultDB`, which stays until thread 16.
  * `src/component/schema.ts`: five new tables, `safebyok_banks`, `safebyok_gates`, `safebyok_bank_vaults`,
    `safebyok_bank_boxes`, `safebyok_bank_tallies`. Named apart from the vaultDB's three because one component has
    one schema. A box row and a tally are keyed by the life pair: `by_box` is `user_id, banklabel, vaultlabel,
    bank_tok, vault_tok, boxlabel`.
  * `src/component/banks.ts`: one function per `do*` call (`ensureBank`, `buildBank`, `putGate`, `delBank`, `getVault`,
    `putVault`, `delVault`, `listBoxes`, `getBox`, `putBox`, `delBox`, `tidyGone`, `watchRows`).
  * `src/component/bank-tallies.ts`: the vault tallies with `bank_tok` in a life, plus the cascade budget and `countBoxes`.
  * `src/component/bank-validators.ts`: Convex validators. Asks are `v.any()`.
  * `src/bank-server.ts`: `SafebyokBankComponent`, the host wrapper (`api.safebyokBank`), re-exported from `./server`.
  * `src/convex-bank-db.ts`: the client.
  * README rewritten for the bankDB. e2e: `e2e/tests/convex/convex-bank-db.test.ts` replaces the vault pairing.
* **Decisions taken**:
  * Copy, then edit (rule 10). Commit `9d46d2327` copies the vault files verbatim to bank names, so
    `git diff 9d46d2327 -- packages/safebyok-convex/src` shows bank against vault.
  * **A write answers with the rows it fetched, not the outcome.** Each mutation parses its ask, fetches,
    classifies with the core's classifier, and writes on a write act. It returns `{ ...fetched, wrote }`. The
    client classifies the same rows and throws `unexpected_error` if `isWriteAct(act) !== wrote`. So a classifier
    refusal (damaged_row, storage_issue, gate_issue) is thrown on the client with its full rows and meta. Nothing
    crosses as a ConvexError except `identity_revoked` (wrapper) and the ask's own `bad_record`. I set aside the
    vault's way, where the component returns the outcome and the client validates it: it needs a validator per
    Stored shape and loses the rows of a crossed refusal.
  * **The gate verbs' policy runs in `putGate` as the core's own code** (`BX.classifyStoredGate`), in the mutation.
  * **Ladder**: reads are one query; a box write fetches its vault row, never the bank row.
  * **Asks are `v.any()`** on the wire. The component parses each with the core's checker before it reads a row.
  * **delBank's answer** (the thread's question): **no**, not for a large bank. A Convex transaction reads at most
    16 MiB and writes 16,000 documents, and a bank holds any number of vaults, each up to 8,000 rows / 7 MiB. So
    `delBank` writes the tombstone, then deletes gates, vaults, tallies, then boxes by scope, unconditionally. It
    stops once a budget of half each limit is spent. What is left is unreachable: gate and vault rows under the old
    `bank_tok` read as none, and box rows are keyed by their life pair. `tidyGone` deletes them.
  * **tidyGone is budgeted too, and reads no live box row.** It reads the bank row, the vault rows and the tallies.
    It deletes vault rows whose `bank_tok` is not the live bank's. Then it walks the stray parts of the box index:
    the vaultlabel gaps between live (or damaged) vault rows, and, beside each live life, `bank_tok <`/`>`, and
    `vault_tok <`/`>` under its `bank_tok`. Each call progresses by a budget; the count comes from live lives'
    tallies, or a count of the rows where none is kept.
    I set aside walking the whole bank range: kept rows would eat the budget and strays past them never get reached.
  * Per-life limits and `roomless` → `vault_full` are kept as in the vault component. `delVault` deletes the whole
    life in its mutation, and `listBoxes` reads it in one query. The client builds the `vault_full` outcome
    (`doPutBox`).
  * Watch: `watchRows` returns the bank row, gate rows (bank scope only), vault rows, and the box rows of live
    lives only. The client diffs. A deleted row is never heard, so `delBank` is heard as the tombstone alone.
    Gate and vault notices carry the bank row; box notices carry the vault row.
* **Deviations**:
  * Took thread 13's commit `73b58de4b` by cherry-pick (the battery split and `BW`), so the two land identically.
    Convex does not need the split (each bankDB gets its own deployment), but `BW` is used.
  * A vault row that fails its checks: `tidyGone` leaves its vaultlabel's box rows alone, as memory does, but
    does not count them (rule 24).
* **Discoveries**:
  * `Tidied` is `{ totalCount }` only, so a host cannot tell whether a budgeted `tidyGone` left rows. The README
    says to call it now and then.
  * anyApi answers any property, so a vault module passes the bank api name check under test. A real host's
    module cannot.
  * src lines (rule 16): against the verbatim copy, +752 / −362 over 10 files. Against 4b, +1297 / −6.
* **For the Coach**: the open matters are in the PR body: Tidied's count, a scheduled sweep, and table names.

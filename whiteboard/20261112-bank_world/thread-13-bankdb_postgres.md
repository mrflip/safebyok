# Thread 13: bankdb_postgres (2026-11-12)

Branch `20261112-bankdb_postgres`, PR [#669](https://github.com/mrflip/safebyok/pull/669), stacked on [#666](https://github.com/mrflip/safebyok/pull/666) (thread 4b, the bankDB battery). Justify: green
(safebyok-postgres 433 over PGlite; e2e on a real Postgres: battery, races and graphql 350).

* **Built**: `PostgresBankDB` in `packages/safebyok-postgres`, beside `PostgresVaultDB`, which stays for
  safebyok-graphql until thread 16.
  * `bank-tables.ts`: `safebyok_banks`, `safebyok_gates`, `safebyok_vaults` (with `bank_tok`, no gate column),
    `safebyok_boxes`. Each child row has a foreign key to its bank row. A box row's key is the whole address
    with its life pair: `(user_id, banklabel, vaultlabel, bank_tok, vault_tok, boxlabel)`. RLS is on for all four.
  * `bank-functions.ts`: `safebyok_birth_bank`, `revise_bank` (build over a tombstone, and delBank), `put_gate`,
    `birth_vault`, `revise_vault`, `birth_box`, `revise_box`, and `safebyok_tell`. Each stores only through one
    conditional UPDATE or INSERT ... ON CONFLICT, and answers one row (ok, act, rows, presence). When it stores
    nothing it answers the rows as they stand, and the core classifier answers from them.
  * `bank-queries.ts`: each read is one statement fetching the row and the row above.
  * `postgres-bank-db.ts`: the adapter. Its `classify*` overrides trust `ok`, and a `!ok` the classifier calls a
    write throws `unexpected_error`.
  * The shipped `bank-tables.sql` and `bank-functions.sql`; the README is rewritten for the bankDB.
  * Tests: `tests/bank-helpers.ts`, `postgres-bank-db.test.ts` (the 4b battery plus constructor and refusals),
    `bank-functions.test.ts` (the functions called past the adapter), `bank-tables.test.ts`.
  * e2e: `tests/postgres/` runs the bankDB battery, two watch cases and the two races on the bank tables.
    `useFileDatabase('vault')` gives graphql's e2e the vault tables.
* **Decisions taken**:
  * Copy, then edit. Commit `storage: copy the vaultDB's adapter...` is a verbatim copy, so diffing from it
    shows bank against vault. The vault originals stay untouched.
  * The box FK goes to the bank, not the vault, as the thread's text has it for each child row. A box under an
    ended vault life is a stray for tidyGone either way, and the blunt cascade deletes by scope.
  * `revise_bank` flips the bank row with one UPDATE, then bluntly deletes every gate, vault and box row at the
    scope, unconditionally. It does this on both delBank and a build over a tombstone. **The ladder decided
    this**: bank cascades can be blunt.
  * The adapter never deletes a bank row. So the FK's key-share lock never meets a conflicting lock, and child
    inserts never wait on a bank write.
  * Reads stay one indexed statement, and box writes fetch only the vault row. **Ladder**: no work goes to the
    hot end. A box write never reads the bank row. The vault row's `bank_tok` stands in for it.
  * The whole gate policy runs in `put_gate`'s WHERE clause. **Ladder**: gate verbs may be heavy.
  * Plants skip the FK checks through `SET LOCAL session_replication_role = replica`. That needs a superuser:
    PGlite runs as one, and so does the e2e role.
  * The vault and box writes that race delBank leave strays. These go to tidyGone and the next build, with no
    lock. A race gets a row, not a fix.
* **Deviations**:
  * Pulled forward into 4b's `bank-db-battery-puts.ts`: "refuses a record whose registered_at is not the stored
    one, under each verb" made two bankDBs in one case. An adapter that empties a shared store per bankDB
    wiped the first. It is split into two cases, one bankDB each.
  * `safebyok/testing` exports the bankDB world as `TH.BW` (`bankdb-world.ts`), since many names clash with
    the vault world's.
  * The Coach's ruling on c8: no guard for tidyGone under a later-fmt bank row. I dropped `bank.fmt = 3001`
    from `DeleteEndedVaultsSql`. The vault-fmt checks stay, as they concern child rows.
* **Discoveries**:
  * The vault and bank SQL share function names (`safebyok_tell`, `safebyok_birth_vault`, ...), so one database
    holds one set. The changeset says a host drops the old set.
  * `birth_box` returns `boxcount` counted before its insert.
  * Over 8000 bytes, a notice drops `parent`, then `row`.
* **Contract answers** (the five questions):
  1. The cascade fits one function call, in one transaction. A cascade notifies only the bank tombstone, which
     agrees with 4b's answer-contract.
  2. Every policy row fits a WHERE clause. `doPutGate` hands the function the record, the expected row and the
     verb, which is enough. The function fetches the bank row itself. No fix needed.
  3. tidyGone needs no `bank_tok`. `DeleteEndedVaultsSql` reads the bank row at the ask's `(user_id, banklabel)`
     in the same statement, through a correlated NOT EXISTS. It keeps a vault row only when that bank row is live
     with the vault's `bank_tok`. `DeleteEndedBoxesSql` then reads each box's vault row the same way. Both run in
     one transaction.
  4. The life pair is in the box PK. So an ifAbsent put inserts beside a stray of another life pair, never over
     it. It counts only its own life's rows (`bank-functions.test.ts`).
  5. Every read fetches the row above in the same statement. Every write fetches it inside its function, in the
     same transaction.
* **For the Coach**: the open questions are in the PR body. The name clash means one set per database. Plants need a
  superuser. Vault birth checks the bank row without a lock, so a race with delBank leaves a stray vault for tidyGone.

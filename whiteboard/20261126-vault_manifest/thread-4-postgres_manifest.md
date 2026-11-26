# Thread 4: postgres_manifest (2026-11-26)

Branch `20261126-postgres_manifest`, PR (draft, number in the report), stacked on [#937](https://github.com/mrflip/safebyok/pull/937). Proved so far:
`safebyok-postgres` 168 of 168 tests (the battery over PGlite and what only Postgres can show), typecheck and lint
clean; `safebyok`'s storage tests 374 of 374, typecheck and lint clean. `pnpm justify` not yet run.

* **Built**:
  - `vault-functions.ts`: each write function `write_<kind>(proposed_record, cited_record, if_absent, if_present[, policies])`
    returns `(tags, actual, world, root)`. The `UPDATE`'s alias is `ante`; its `WHERE` gains the flag clause
    (`CASE WHEN (ante.am = 'a') THEN (if_present = 'repl') ELSE (if_absent = 'add') END`; the `INSERT` gains
    `if_absent = 'add'`), and the gate's policy clause is `policies_met(policies_of('gate', policies, cited_record,
    proposed_record, to_jsonb(ante)))`. Written, `tags := written_tags_of(...)`, constants the `WHERE` pinned; unwritten,
    the row read back (alias `ante`) is `actual` and `tags := write_tags_of(..., actual, ..., false)`.
    `birth_roots` returns `(tags, bank, gate, root)` with `birth_tags_of` over no ante roots (written) or the three read
    back. New pure functions, each a copy of its ManifestTags/GatePolicies TypeScript with the copied function named
    beside it: `presence_of`, `revtok_cmp_of`, `write_tags_of`, `written_tags_of`, `birth_tags_of`,
    `replace_passphrase_refusal`, `add_passkey_refusal`, `revoke_passkey_refusal` (each returns its refusal's message or
    null), `policy_verdict_of`, `policies_of`, `policies_met`. The old `*_ok` policy functions are gone. `lifeseq_ok`'s
    and `lifepath_kept`'s parameters are renamed `ante_*`.
  - `vault-queries.ts`: each statement returns the verb's manifest columns: `tags`, `actual`, `ancestor` (get and write,
    in a `CASE WHEN (actual IS NULL)`, so the subquery runs only where read), `children`, `banktok`
    (`COALESCE(world->'bank'->>'lifetok', <void>)`), `tracked`, `read_tc` (`bankObservedSqlOf`). Stats returns `box`
    and `gate`; TypeScript adds `max: storeLimitsOf()`.
  - `postgres-vault-db.ts`: `mayWrite`, `writtenActOf`, `FetchedThing`, `#fetchThing` and the TS re-run of the act tables
    after a refusal are gone; every `do*` is one `#queryRow` (stats spreads the limits in). `writeParamsOf(ask)` is
    exported from the module (not the package) for the tests.
  - `refusals.ts`/`phrases.ts`: `storedNothing` and `Phrases.StoredNothing` are gone, and `phrases.ts` with them.
  - `safebyok`: `PolicyPhrases` (`storage/policies.ts`), the six policy messages, exported from `safebyok/storage`;
    `GatePolicies` returns them, and `VaultFunctionsSql` fills its messages from them (`sqlTextOf`). `isWritable`'s doc
    names the `ante` row and the flag clause.
  - Tests: a table of 20 writes called past the adapter, written and not, over every kind and each policy's pass and
    refusals, each comparing the SQL's `tags` with `ManifestTags.writeTagsOf(ask, ante, written)`. The battery proves
    the unwritten tags already (AdapterVaultDB makes them again); only this proves the written constants.
  - Changeset (minor, safebyok-postgres): drop the `safebyok_a010501_r000_*` functions before rerunning; a SQL snippet
    that does so, checked on PGlite.
  - `notes/security.md`: an amendment to the 2026-11-15 vaultdb_battery entry, through a sonnet subagent (513e4bebf).

* **Decisions made**:
  - Tags read the raw row as JSON (`ante->'revseq'`, `ante->>'am'`), as ManifestTags' `fieldOf` does, so one function
    serves every kind and each clause can be checked by eye against its TypeScript. `modelkind` is an argument where
    the TypeScript reads `ask.modelkind` (lifetok, policies).
  - Written tags are a function of their own (`written_tags_of`), not inline per kind: one copy, beside `write_tags_of`.
    Its `revseq_cmp: 'eq'` rests on the ask's check `record.revseq = cited.revseq + 1` (the `WHERE` pins
    `ante.revseq = proposed.revseq - 1`); I added no `ante.revseq = cited.revseq` clause, to keep the predicate clause
    for clause with memory's.
  - The write function computes tags and actual; the wrapper query adds the ancestor and the bank's observations, as it
    added them before.
  - The ancestor is `CASE`d in the statement, not dropped in TypeScript, so the subquery runs only where read.

* **Deviations**:
  - **The policy clause judges every write over a live gate**, where it judged only one that kept liveness
    (`(stored.am <> proposed.am) OR gate_policies_ok(...)`). It now matches `ManifestTags.policiesOf`, memory's
    `isWritable` and the contract ("for a gate over a live gate"). A del ask carries no policies (`isDelFixed`), so no
    validated ask answers differently.
  - **Missing-key strictness.** The refusal functions fail a policy where a key is missing (`IS DISTINCT FROM 'null'`,
    `COALESCE(..., false)`), where `isEqual(undefined, undefined)` in TypeScript would pass. Rows (table CHECKs) and asks
    (`testimonyMissing`, wayin shapes) never lack them, so the two agree on everything our code writes.
  - **A changed broken-state answer**: a write function that wrote nothing where the act tables find a write refuses
    `storage_issue` (three-way's `writtenOfOtherAct`), where it refused `unexpected_error` with `StoredNothing`.
  - `vault-functions.ts`'s header said safebyok "is private and a published package never imports it at runtime", but
    `postgres-vault-db.ts` already did; the file now imports `PolicyPhrases` at runtime, and the sentence is cut.
  - The ancestor test called past the adapter now expects none where a Thing is stored at the scope.

* **Discoveries**:
  - Postgres 18's `RETURNING WITH (NEW AS written)` lets the `UPDATE` alias be `ante` in the `WHERE` and the written row
    be named in the `RETURNING`.
  - A `LANGUAGE sql` function's body is checked at `CREATE`, so the helpers are ordered callee first.
  - Thread 5 (Convex): the tag functions here and `write_tags_of`'s clause order are the copy to check against; the flag
    clause is now part of the predicate.

* **Approaches set aside**:
  - Tags over typed table columns (`ante.revseq`): one function per kind, or a long list of plain-value arguments, and
    harder to compare with `fieldOf`.
  - Reading the ante row in a CTE before the `UPDATE` and making written tags of it: the snapshot read could describe
    another row than the one the `UPDATE` rechecked after waiting on a concurrent writer.
  - Using `cited` as a stand-in for the written ante row in `write_tags_of`: the cited born_at is not pinned.

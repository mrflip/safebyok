# Thread 6: bad_record (2026-10-19)

Branch `20261019-bad_record`, PR #PRNUM, stacked on [#178](https://github.com/mrflip/safebyok/pull/178). Justify: green (core 2225 passed, 35 skipped; indexeddb 142; postgres 257; react 228; scripts 258). No size line over its limit.

* **Built**:
  * `bad_record` in `VaultErrorKindVals` and `VaultErrorFamilyForKind` (`misuse`), beside `bad_option` (`packages/safebyok/src/errors.ts`), with an `@example` and its test in `tests/errors.test.ts`.
  * `checkOutgoing` (`src/vault-db.ts`) throws it; message unchanged. The two record-versus-expectation checks (`updateVaultProps`' `vault_id`, `updateBox`' `vault_key_epoch`) throw it too. Doc blocks of the five write verbs say so.
  * README refusals table row; `bad_option`'s row loses "a record handed to a VaultDB write". `validators.ts`' check table and VAULTDB.md 3.8 and 5.1 name the new kind. VAULTDB.md 3.4 now says Postgres compares through `Expectations.retirementOf` too (the #178 review's tidy).
  * Tests: `describeVaultDB`'s malformed-record case now covers every write verb (`fetchOrCreateVaultProps`, `updateVaultProps`, `updateBox`, `retireBox`, `retireVault`) as `bad_record`; `vault-db.test.ts`'s `RefusedWrites` rows, including thread 2's `revision_tok` rows, moved over; one react test that a hello refused as `bad_record` reaches the boundary.
  * Changeset `20261019-bad_record.md`, `safebyok` minor.
* **Decisions taken**:
  * `bad_record` is the name as written, pending the Coach's word.
  * The two mismatch checks (record against expectation) are outgoing-record misuse, so `bad_record`; `retireDamagedVault` refusing a sound vault stays `bad_option` (it takes a scope, no record).
  * The Postgres README's route recipe (`That is not a vault verb.`), the GraphQL resolvers and schema-mismatch refusals, and the demo's outage wrapper name `bad_option` for a verb name, a server's misconfiguration or a schema mismatch, not an outgoing record: left as they are.
  * `safebyok-react` has no source change: its boundary reads `isVaultCondition`, a family test, so the new misuse kind is treated as `bad_option` is. Its changeset is not bumped for that.
* **Discoveries**: nothing in `packages/`, `demos/` or `e2e/` caught `bad_option` for an outgoing record beyond the core's own tests.

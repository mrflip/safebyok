# Thread 2: vault_db_new (2026-11-03)

Branch `20261103-vault_db_new`, PR [#450](https://github.com/mrflip/safebyok/pull/450), off main. Justify: green; safebyok 4826 passed, 37 skipped, of which 41 are `tests/storage/vault-db-new.test.ts`.

* **Built**: in `packages/safebyok/src/storage/`, `vault-db-new.ts` (the abstract `VaultDB`: every verb, `try*` of each, all invariants), `memory-vault-db.ts` (`MemoryVaultDB`: generic hooks only), `vault-db-shapes.ts` (checkers and revision helpers, nothing from `models/`), `vault-db-refusals.ts` (throwing factories). The verbs: `getBank`, `getVault`, `getBox`, `putVault`, `putBox`, `replacePassphrase`, `addPasskey`, `revokePasskey`, `delBox`, `delVault`, `tidyGone`, `watch`. A subclass writes `doGetBank`, `doGetVault`, `doGetBox`, `doPutVault`, `doPutBox`, `doDelVault`, `doDelBox`, `doTidyGone`, and may write `doWatch`.
* **Decisions taken** (where the specs disagree or say nothing):
  * `prior` is `{revision_tok, revision_seq}`, sentinel `NeverStored`, from the spec's Proposal. `getBox` is unversioned; `getVault` goes by scope alone.
  * A live row under another `vault_tok` is `vault_empty` (vaultdb-invariants, authoritative), not gating's `vault_mismatch`. `dbhas` null; the world is a sentinel carrying the asked tok.
  * `getVault`'s fail acts are `vault_empty` and `vault_gone`. `getBox` refuses kind `absent_box` with `meta.act` `void` or `gone`: the one place act and kind differ.
  * `delVault` answers act `deleted`, not the spec's `ok`, which collides with the field.
  * The cascade tombstones boxes (V7) rather than gating's "removes"; damaged box rows wait for `tidyGone`.
  * `ifPresent` is decided atomically inside the store's put hook, through `PutTerms.mayReplaceLive`. Set aside: a preflight `doGetVault` in the base and then the conditional put, which needs judging at both ends. `Storable`'s part is thread 6's.
  * `putVault` keeps `repl`, struck in the spec, as the gate verbs use it and thread 6's stopgap calls it until thread 10.
  * The revision check runs before camped: a moved row refuses `stale_write`. `stale_write` over a damaged row refuses `damaged_record`, with no damaged `dbhas`.
  * `gate_issue` covers another wayin in the params and a disagreeing `registered_at`. The other wayin is admitted by the checker as `unk.optional()` so the base can say so; a strict gate would have called it `invalid_input`.
  * Every answer carries `req_params` (safe metadata, empty if any of it fails) and `meta: {call}`; the spec leaves `meta` undefined. Thread 6 replaces `answer.scope` with `req_params`.
  * Omitted: `tidyGone`'s `storage_error` carrying `val`; `getCapacity` (struck). `vault_full`'s capacity bytes are `{used: 0, max: Infinity}` in memory. The gate verbs read through `doGetVault`, which fetches the boxes as well.
  * `revokePasskey` over a row holding no passkey answers `revoked` with the row as stored, and moves neither the revision nor `gate_epoch` (the Coach's default on the sprint doc, "we can switch if it's an issue"; it did not fight the code: `wayinOf` answers null and `#moveGate` returns before the put). This settles against the VG* rows' "any ok" moving the revision. The integrity checks still run first, so params at an old revision refuse `stale_write` even with nothing to revoke.
  * `watch` delivers on a microtask, from a structured clone. A store with no watch gets a no-op.
* **Deviations**:
  * The handoff says nothing reaches `src/index.ts`, but the spec's refusal names had to be `VaultError` kinds: `errors.ts` gains `camped`, `vault_empty`, `storage_error`, `damaged_record`, `invalid_input`, `gate_issue` in the exported `refusalKindVals` and `RefusalFamilyForKind`, and `RefusalMeta` gains `call`, `act`, `world`, `dbhas`, `req_params`. So README rows, `errors.test.ts` rows, and a `minor` changeset rather than `--empty`.
  * The factories live in `vault-db-refusals.ts`, not `refusals.ts`, which `src/index.ts` re-exports.
* **Discoveries**: `epochMillis` refuses anything under `FarPast` (1981), so sentinels carry `FarPast`, not 0. Labels are lowercase and at least two characters.
* **For the Coach**:
  * Two suppressions, both `eslint-disable-line unicorn/prefer-private-class-fields` on `MemoryVaultDB`'s `_cheat_vaultRowsOf` and `_cheat_boxRowsOf`, as `tests/test-helpers/models-world.ts` does.
  * One crossing, no defense added: two gate verbs from the same revision both pass `#moveGate`'s `doGetVault`, and the store's conditional `doPutVault` lets one land while the other refuses `stale_write`.
  * After thread 10, strike `repl` from the public `putVault`, leaving it to `#moveGate`.

# Thread 20: the tests that name a refusal kind

For whoever strips the tests (group (e) of `thread-20-kind-promises.md`). Counted on 2026-11-06 at
`c74195a12` with `rg -o "'<kind>'"` per file, outside `tests/test-helpers*`: a loose count of quoted
occurrences, so it includes bulk-list columns, a `Checkers('bad_scope', ...)` argument, and an act
value spelt like a kind (`declined`). Each site wants a read before it changes.

* **Strip** (incidental): `bad_option`, `bad_scope`, `bad_record`, `unexpected_error`, `gate_issue`,
  `disabled`, `insecure_context`, `record_conflict`, `vault_empty`, `vault_mismatch`, `gating_landed`,
  `attempt_in_flight`. Assert that it refuses, kind-less, and keep the title's behaviour.
* **Unsure** (left, listed): `already_asking`, `locked_while_asking`, and `vault_gone` outside a verb
  on a vault already known deleted (the Coach's case, which strips).
* **Keep** (contract): the rest.
* **Keep, definitional**: where the kind is the member's subject, not a situation's outcome. A
  validator made with a kind throws that kind (`helpers/validator.test.ts`'s `Checkers` and
  `refusingAs` cases); `refusals/*.test.ts` test the refusal machinery itself (`errors`, `outcome`,
  `host-error-sanitizer`, `throwers`). The incidental count in those rows is mostly definitional:
  only a guard's own refusal there (a story that is none, a bag that is no object) strips.

The helpers have no kind-less matcher: `expectRefusal`, `expectBad` and `expectSyncRefusal` each
require a `refusalkind`. The smallest addition is to make that argument optional (`refusalkind?:`),
checking only `instanceOf(VaultError)` when it is left out, in `tests/test-helpers/refusals.ts`.

Incidental total: 569 quoted occurrences in 47 of the 52 files that name a kind.

| file | incidental | strip | unsure | keep |
| --- | --- | --- | --- | --- |
| `helpers/crypto.test.ts` | 12 | unexpected_error 12 |  |  |
| `helpers/logger.test.ts` | 0 |  |  | stale_write 1 |
| `helpers/passphrase-strength.test.ts` | 8 | unexpected_error 5, bad_option 3 |  | storage_unavailable 1 |
| `helpers/validator.test.ts` | 106 | bad_scope 35, bad_record 35, bad_option 32, record_conflict 3, vault_mismatch 1 |  | damaged_row 1 |
| `loosened/lease.test.ts` | 2 | unexpected_error 2 |  |  |
| `loosened/vault.test.ts` | 2 | bad_record 2 |  | damaged_row 2 |
| `models/bank-ending.test.ts` | 3 | disabled 2, bad_option 1 | locked_while_asking 1 | storage_unavailable 3, identity_revoked 3, declined 2 |
| `models/bank.test.ts` | 9 | unexpected_error 4, bad_option 4, record_conflict 1 | already_asking 2 | identity_revoked 7, damaged_row 7, storage_unavailable 6, absent_box 2, weak_passphrase 1, declined 1 |
| `models/box-listing-create.test.ts` | 14 | bad_option 11, bad_scope 3 |  | camped 4, vault_locked 2, stale_write 1 |
| `models/box-listing-rows.test.ts` | 0 |  |  | stale_write 16, absent_box 12 |
| `models/box-listing.test.ts` | 19 | bad_option 11, disabled 4, bad_scope 3, bad_record 1 |  | absent_box 5, vault_locked 4 |
| `models/box-putting.test.ts` | 8 | bad_option 8 |  | stale_write 5, camped 2 |
| `models/box-seal.test.ts` | 0 |  |  | vault_locked 3, damaged_box 2 |
| `models/box-whisper-states.test.ts` | 8 | bad_option 8 |  | vault_locked 6 |
| `models/box-whisper.test.ts` | 5 | bad_option 5 |  | vault_locked 2, damaged_box 2 |
| `models/box.test.ts` | 17 | record_conflict 9, bad_option 8 |  |  |
| `models/gate.test.ts` | 6 | bad_record 3, bad_option 3 |  |  |
| `models/gating.test.ts` | 19 | unexpected_error 9, gating_landed 4, bad_option 4, attempt_in_flight 2 | already_asking 4, locked_while_asking 6, vault_gone 3 | declined 8, wrong_passphrase 5, storage_unavailable 3, absent_wayin 3, weak_passphrase 1 |
| `models/halpimonfire.test.ts` | 7 | disabled 6, unexpected_error 1 | vault_gone 4 | vault_locked 8, storage_unavailable 1 |
| `models/lease.test.ts` | 22 | unexpected_error 14, bad_option 8 |  | damaged_box 8, vault_locked 7, damaged_lease 7 |
| `models/listing-delivering.test.ts` | 21 | record_conflict 16, disabled 2, unexpected_error 1, bad_scope 1, bad_option 1 |  | storage_unavailable 4, stale_write 4, camped 2, absent_box 1 |
| `models/listing-verbs.test.ts` | 14 | bad_option 9, record_conflict 5 |  | stale_write 11, storage_unavailable 2, camped 2 |
| `models/listing.test.ts` | 2 | record_conflict 1, bad_option 1 |  | storage_unavailable 1 |
| `models/proof.test.ts` | 4 | disabled 3, bad_option 1 | vault_gone 2 | storage_unavailable 5, wrong_passphrase 2, declined 2, vault_locked 1, absent_wayin 1 |
| `models/proving.test.ts` | 35 | bad_option 18, unexpected_error 17 |  | wrong_passphrase 2, wrong_passkey 2, weak_passphrase 2, newer_format 2, absent_wayin 2 |
| `models/storable-ops.test.ts` | 5 | record_conflict 4, bad_option 1 |  | vault_locked 3, storage_unavailable 3, absent_box 1 |
| `models/storable-receiving.test.ts` | 8 | record_conflict 8 |  |  |
| `models/storable.test.ts` | 11 | bad_option 5, record_conflict 4, disabled 2 |  | vault_locked 4 |
| `models/vault-boxes-putting.test.ts` | 12 | bad_option 10, bad_scope 2 |  | stale_write 9, absent_box 6, vault_locked 4, damaged_row 2, camped 2 |
| `models/vault-boxes.test.ts` | 7 | bad_scope 4, vault_mismatch 2, bad_option 1 | vault_gone 7 | damaged_row 7, absent_box 7, vault_locked 5, stale_write 2 |
| `models/vault-gate.test.ts` | 10 | vault_mismatch 4, bad_option 3, gating_landed 2, disabled 1 | locked_while_asking 4, vault_gone 5 | stale_write 12, wrong_passphrase 8, weak_passphrase 1, storage_unavailable 1, same_passphrase 1, declined 1 |
| `models/vault-lease.test.ts` | 24 | disabled 24 |  | declined 2, storage_unavailable 1 |
| `models/vault-life.test.ts` | 0 |  |  | wrong_passphrase 4, vault_locked 4, declined 4, absent_wayin 2 |
| `models/vault-listing.test.ts` | 22 | disabled 14, bad_scope 4, bad_option 3, unexpected_error 1 | vault_gone 4 | damaged_row 2, storage_unavailable 1, stale_write 1 |
| `models/vault-unlock.test.ts` | 7 | unexpected_error 4, bad_option 2, disabled 1 |  | declined 11, vault_locked 4, damaged_lease 3, wrong_passphrase 1, storage_unavailable 1, damaged_box 1 |
| `models/vault.test.ts` | 10 | bad_option 7, unexpected_error 3 | vault_gone 2 | damaged_row 1 |
| `models/wayin.test.ts` | 3 | bad_record 3 |  |  |
| `refusals/errors.test.ts` | 4 | unexpected_error 1, bad_scope 1, bad_record 1, bad_option 1 |  | storage_unavailable 10, vault_full 6, identity_revoked 6, vault_locked 3, stale_write 2, damaged_box 1, box_too_large 1, absent_box 1 |
| `refusals/host-error-sanitizer.test.ts` | 6 | unexpected_error 4, bad_option 2 |  | storage_unavailable 4 |
| `refusals/outcome.test.ts` | 5 | unexpected_error 4, vault_mismatch 1 |  | storage_unavailable 5, vault_locked 3, absent_box 2, stale_write 1 |
| `refusals/throwers.test.ts` | 1 | unexpected_error 1 |  | storage_unavailable 1 |
| `shapes/shapes-core.test.ts` | 16 | bad_option 10, bad_scope 6 |  |  |
| `shapes/shapes-gateish.test.ts` | 7 | bad_option 7 |  |  |
| `shapes/shapes-storage.test.ts` | 1 | bad_record 1 |  |  |
| `shapes/shapes-vaultish-box.test.ts` | 13 | bad_option 12, bad_record 1 |  |  |
| `shapes/shapes-vaultish-listing.test.ts` | 17 | bad_option 17 |  |  |
| `shapes/shapes-vaultish-records.test.ts` | 10 | bad_record 8, unexpected_error 2 |  | stale_write 1 |
| `storage/device-db-new.test.ts` | 8 | bad_option 8 |  | storage_unavailable 8 |
| `storage/vault-db-new-dels.test.ts` | 0 |  |  | damaged_row 6, stale_write 2, newer_format 2 |
| `storage/vault-db-new-puts.test.ts` | 13 | gate_issue 4, bad_option 4, vault_mismatch 2, unexpected_error 2, vault_empty 1 | vault_gone 3 | stale_write 9, camped 9, declined 5, damaged_row 3, newer_format 2, vault_full 1, box_too_large 1, absent_box 1 |
| `storage/vault-db-new.test.ts` | 5 | vault_empty 3, vault_mismatch 1, bad_option 1 | vault_gone 2 | storage_unavailable 4, damaged_row 3, newer_format 1, camped 1, absent_box 1 |
| `utils.test.ts` | 1 | bad_option 1 |  |  |

# Thread 4: the rows it closes (for the orchestrator's sweep)

Who reads this: the orchestrator sweeping the Gripefest doc. Every G### in thread 4's *Closes*
list, plus the two the Coach added mid-thread, each **closed** (and where it settled) or **not**.

| Row | Status | Where it settled |
|---|---|---|
| G140 | closed | `decipherOrCatchUp` (vault.ts): a reborn vault's box reads `vault_locked`; tests in *a stale session cannot reach into a vault reborn elsewhere* |
| G137 | closed | `catchUp`: a failed catch-up throws `stale_write` with its cause; `syncing: false` |
| G134 | closed | `watchRefresh` warns once per streak, `log`s on recovery; the catch-up's own message |
| G136 | closed | serialized `refresh`; test *refreshes, one at a time* |
| G139 | closed, as built | only `store()` retries: VAULTDB.md *Who does what*, store/changePassphrase doc blocks |
| G117 | closed | one kind, `stale_write`, for erase-wins and retry-exhausted (messages differ); `vault_locked` on a relock: README errors table |
| G120 | closed | `newer_format` (errors.ts, vault-db.ts); "sound vault" stays `bad_option` |
| G121 | closed, by doc | the listing stays shape-only: `VaultSnapshot.boxes` doc, README *Damaged lockboxes* |
| G141 | closed, by doc | no conflict hook; `store()` is the handler: VAULTDB.md *Who does what*, `WriteRetryBaseMillis` doc |
| G499 | closed, by doc | the same line: the vault never clears damage on its own (stays NOT YET if the Coach prefers the shelf) |
| G498 | closed | `DamagedLockbox.revision_id`; one conditional write over it |
| G122 | closed | `instanceof VaultDB` in `parseVaultDB` |
| G116 | closed | `destroy()` looks first on a handle that saw no vault; its doc says a retry destroys the vault the snapshot shows |
| G145 | closed, by doc | VAULTDB.md 3.5, `eraseDamagedVault` doc, README |
| G146 | closed, by doc | VAULTDB.md 3.5 (typed backends), README (localVaultDB's non-JSON bundle) |
| G147 | closed | test: a synchronously throwing `readBundle` still maps to `damaged_bundle` |
| G148 | closed, by doc | `RefusalPolicy.heed`'s doc block |
| G144 | closed, by doc | VAULTDB.md *Who does what*: your bug is `storage_unavailable`, its cause yours |
| G142 | closed, by doc | README *Your own storage adapter*: refresh cost grows with the vault; measure first |
| G143 | closed, as built | `ensureRoomFor`'s doc block already says it |
| G063 | closed | `isUnderHeldKey`: an unheld epoch lists damaged; no count field |
| G514 | closed | `raiseMarkAfter`, and the remembered unlock after a change, logged not thrown |
| G513 | closed, by doc | README *A vault rolled back*: the `eraseMark` recipe is the one way out, by design |
| G522 | closed, by doc | README *When the user signs out*: the three left as the safe direction |
| G212 | closed | `VaultSnapshot.syncing` |
| G489 | closed | `notes/security.md`: "or its ways in changed" |
| G333 | not closed here | struck: thread 7 (#129) built it |
| G119 | closed, both parts | `whenIdentityRevoked` removed; `openBox`'s `shutSince` re-check |
| G516 | first bullet closed | `rolled_back` locks, `RefusalPolicy.decide`; the rest of the row stays with the Coach |

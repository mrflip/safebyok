# Thread 9: types_ab (2026-11-06)

Branch `20261106-types_ab`, PR #557, stacked on #553 (`20261106-checkers_once`). Justify: green at 830d60c1b; later commits typecheck, lint and test green.

* **Built** (each its own commit):
  * *Directive 2, second survey.* shapes-vaultish no longer re-exports shapes-storage's record forms (am, revision, times, vaulted, sparseBase, boxRecord/boxSparse, vaultRecord/vaultSparse/vaultRow, the formats, Revision/Times/BoxRecord/BoxSparse/VaultRecord/VaultSparse, VoidRevisionSeq): one definition, one import path, `SX`. The wayin record checks are `SX.passphraseWayinRecord` / `SX.passkeyWayinRecord`, the GX rename alias gone. `StrengthChecker` has one import path (helpers/passphrase-strength), GX's re-export gone. Bank's constructor keeps what `VX.bankOpts.parse` returns (and `onBadNews` is now `fn<BadNewsHandler>()` so the parse types it). `maxMillisSinceRefresh` was already checked once (`storableOpts` is gone; `listingOpts` checks it): nothing to do.
  * *Directive 3, thread 8's review.* VaultDB's `listBoxes`, `getBox`, `watch` refuse `bad_scope` (tests added). `GX.guardedLogger` is the one Checker for a guarded logger, used by `leaseFriend` and `vaultWorld` (test added). `isListing`, `isVaultDB`, `isDeviceDB` are one-liners over a private `answersTrueTo(val, tag)` in consts.ts, each a type predicate. VOCABULARY.md *Shapes* gains a **dated** row for `LeaseDated`.
  * *Directive 1, exports.* index.ts exports `AnyGating`, `PassphraseCleartext`, `PassphraseVerdict`, `KeyDeriver`, `StrengthChecker`, `VaultLogger`, `DeviceDB` (type; directive 4 makes it the class) and, pulled forward under the same rule, `VaultDB`, `RefusalKind`, `RefusalFamily`. New `tests/index.test.ts` asserts each at the type level. Changeset `.changeset/20261106-types_ab.md` (minor).
* **Decisions taken**:
  * *Refusal kind of the record forms.* VX had re-kinded the sparse forms and the bases `bad_record` while passing the full records through as SX's `bad_option`. With one definition the models now get `bad_option` from all of them, which matches errors.ts ("one handed in is `bad_option`"); one model test changed (`listing.build(dna)` refuses `bad_option`, as `listing.put` of a bad record already did). Switching SX's record Checkers to `bad_record` instead was tried and broke three model tests that expect `bad_option` for a record handed in, so it was set aside. `Vault.takeWorld` keeps `damaged_row` with `SX.vaultRow.refusingAs('damaged_row')` at its call (rule 14: a renamed call, no logic).
  * *`bad_scope` for the queries*: a query is a scope's duck extended by `vault_tok`, and STYLE.md *Validation* has anything taking a scope's duck parse it in a `bad_scope` call. DeviceDB's `leaseQuery` (in a `bad_option` call) is left as it is: see Discoveries.
  * *Brand tests*: `isGuarded` stays apart, since it also takes a function; the three named share one shape.
* **Discoveries**:
  * The survey script (`scratchpad/types_ab/surface.cjs`, a TS-checker walk of index.ts's exports) lists many more unexported names that public members reach (`BankScope` from `Bank.scope`, `BankStage`, `LockState`, `Sidecar`, `BoxPutOpts`, `BoxPatch`, `TimelyOpts`, `GatingKind`, ...); most hang off friend methods of the model classes. Not exported here: an open matter.
  * `tests/shapes/shapes-vaultish-records.test.ts` and `-box.test.ts` now test `SX.*` checks under a VX file name.
  * DeviceDB's `peek` and `cache` parse a `leaseQuery` (a `vaultQuery` nested in a `bad_option` call), so a bad scope there refuses `bad_option`, unlike the VaultDB.
* **For the Coach**:
  * The guarantees: gating.ts was touched only for imports (`SX.passphraseWayinRecord` in place of `GX.`); checked against notes/guarantees.md *The guarantees* G1, G2, G8, G9: no passphrase, key or refusal path changes.

Still to do: the typing rows (ground rule 6), directives 4 (export DeviceDB/MemoryDeviceDB) and 5 (a load's VaultError passes as it came).

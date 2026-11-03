# Sprint unrace: done, 2026-11-03

The goal was an end-to-end demonstration of the design draft, and it is met: `packages/safebyok/tests/models/proof.test.ts` is green and reviewed, over `src/models/` and `src/storage/`. Nothing is exported from `src/index.ts`; moving the demo over is `whiteboard/20261102-newdesign/e2e-milestones.md`. Threads 1 to 15, 17 and 21 to 24 filed, 16 cancelled at your word, 18 to 20 moved to the next sprint. Your rulings and my calls are in `whiteboard/20261103-unrace/unrace-resolutions.md`; the next sprint starts from `whiteboard/20261102-newdesign/unrace-nextplan.md`.

## PRs in merge order

Merged by you: #449, #453, #450, #454, #452, #451, #455, #456, #457, #458, #459, #460, #462, #461.

Open, as one line, each stacked on the one before, every base `main`: #463 doc_strip (five commits, squashed at your word), #464 small_rulings, #465 tidy_host, #466 cleanup, #467 peek_autolock, the PR of branch `20261103-newdesign` (thread 24), #448 this sprint's PR. Merging #448 merges them all.

## On main already

* **Red commits inside the merged line:** `bc7cb25e` in #449, tests red over its next four commits through `b03a61e2`; `80e48ab6` in #455. I told you I would leave them. Each PR's top is green.
* **Autolock's reach:** `notes/guarantees.md` G4 lists fewer erasers of an expired row than the code has (any `lock()`, `bank.vacate`, a tombstone's adopt). Safe side; left, as it moves with `notes/security.md`.

## YOLO decisions

All 50 are under *Calls left to the orchestrator* in the resolutions file.

## Reported, for the record

* **A worker edited `notes/security.md` with `sed`,** not through its subagent, once. You were told at the time.
* **`/code-review low` returned nothing** on several runs; those reviews were done by hand and say so.
* **Lint suppressions in the line:** `require-await` on `listing.build`; `prefer-private-class-fields` on the `_cheat_` methods of `MemoryVaultDB`, `MemoryDeviceDB` and `bank-world.ts`.
* **`notes/wontfix.md`** now points at commit `e135d0352` for a deleted file, so it needs `20261102-invariants` or `20261102-unrace` kept.

## Still open from the sprint's Cleanup

The findings are a `sonnet` agent's, checked against the code at the line's top. `notes/security.md` wasn't read for them.

- Remove RefusalMeta.staged_revision from errors.ts when the old code goes (#449): still in `errors.ts:178`, the only source use; old code (`src/vault.ts` etc.) still ships.
- Fold #449's red checkpoint commit (bcdcc8ac) into a neighbour: could not settle; the line's version `bc7cb25e` still says box, listing and storable tests "move in the commits after", so it may still be red; I did not run it.
- Exported names in vault-db-new out of Naming (VaultFetched, BoxFetched, RowOfVault, RowOfBox, passkeyAddParams): not renamed, still in `storage/vault-db-new.ts:44-60`, `:217`; moved to next sprint: Nextplan's standalone thread names them. VOCABULARY rows for act, world, dbhas, am, camped did land (`VOCABULARY.md:155,157`).
- vault-db-shapes.ts and device-db-shapes.ts could share their scope checkers: not shared; `device-db-shapes.ts` builds its own objects from `FX`; moved to next sprint: Nextplan's standalone thread names it.
- Two more suppressions: prefer-private-class-fields on MemoryDeviceDB's cheat methods (#452): the disables stand at `storage/memory-device-db.ts:46,49`; a report item for the done note, not code.
- Thread 10: the gating attempt passes Promptly; ensureUnlocked and #unlockByProof don't yet (#453): attempts do (`gating.ts:189,215`, `vault.ts:119,134`); `ensureUnlocked` still calls `ensureTimely()` with the default (`vault.ts:197`) and `#unlockByProof` (`vault.ts:209`) asks nothing.
- Thread 12: hydrate asks the world for timeliness, then listing.fetch asks again (#453): still so; `Storable.hydrate` (`storable.ts:254`) then `fetch` (`storable.ts:239`).
- Rename TimelyOpts to the spec's maxMillis, and drop FetchOpts' ignored maxMillisSinceRefresh (#453; thread 14): not done; `TimelyOpts` still in `models-shapes.ts` and `models/box.ts`; moved to next sprint: Nextplan's standalone thread names it.
- One name for a row of a newer format: damaged_records says format_mismatch while getBox/getVault refuse newer_format (#454): still differs (`vault-db-shapes.ts:28` vs `vault-db-refusals.ts:45`); Nextplan removes `damagekind` altogether.
- Thread 12: a bank.hello after goodbye refuses until its fresh listing (#455): superseded, not landed; `Bank.goodbye` is gone and `bank.sweep` swaps a fresh listing at once (`bank.ts:193`); Nextplan: a vacated or swept bank is done, no hello afterward.
- Thread 9 keeps vault.boxListing and listing.boxListingOf, pulled forward with no watch; thread 11 keeps the #renewLease wiring (#455): a note for the done note; both stand (`vault.ts:435`, `vault-listing.ts:159`, `vault.ts:277`).
- Rename boxListingOf to makeBoxListing (#455; thread 14): not renamed, still `vault-listing.ts:159`; moved to next sprint: Nextplan's standalone thread names it.
- Thread 12 or 13 adds the vault snapshot's boxes and trouble, if the proof needs them (#457): not added (`VaultSnapshot`, `vault.ts:25`); thread 13's file does not say whether the proof needed them: could not settle.
- Thread 14: wontfix row for a delete with a refused erase and no onPanic; guarantees.md lines naming spendAnswer; VOCABULARY.md and README's change-passphrase passages; the enter-key rule in security.md (#459): partly landed; the wontfix row (`wontfix.md:80`) and the guarantees lines (`guarantees.md:145,147,214`) did; the README and VOCABULARY.md change-passphrase passages were left on purpose (thread 14's file: they describe the shipped core); the security.md enter-key rule I did not read (commit `bc6f3cee` says it is there).
- Thread 14: move the checks and types at the top of models files into the shapes files: not done; types still sit at the top of `models/listing.ts`, `vault.ts`, `vault-listing.ts`, `proving.ts`; moved to next sprint: Nextplan's standalone thread names it.
- Thread 14: rename timelyAnte to ensureTimelyAnte (with security.md through its subagent); drop Vault's dead ensureReadyToDel, demandReadyToDel and tryDel's unread opts; one list for putVaultOpts and ifPresentVals; the tryPutRow cast (#459): none done; `timelyAnte` still at `gating.ts:214`, `ensureReadyToDel` at `storable.ts:224`, `putVaultOpts` at `vault-db-shapes.ts:96`; moved to next sprint: Nextplan's standalone thread names all four.
- Thread 14: security.md's "no unguarded delete through the Vault" reads stronger than listing.del(vault); thread 11's file says a tombstone at #landGate refuses bad_option, now vault_gone (#459): half settled; thread 14's file says the security.md delete entry was corrected (not read by me), but `thread-11-gate_changes.md:29` still says bad_option, so the second half is not done.
- One more suppression: prefer-private-class-fields on _cheat_refuseGets in bank-world.ts (#460): the disable stands at `tests/test-helpers/bank-world.ts:25`; a report item for the done note, not code.
- Left from #460's review, for a later pass (ensureVault on a damaged row asks before it refuses; await bank.tidy() can resolve before a listed vault's row is erased; a lease row failing its check escapes bank.vacate): a note, not a task; I did not check each of the three.
- Thread 19 finishes or strikes the Vault.takeWorld fix #462 pulled forward; thread 14's sweep knows BoxSnapshot gained lockState: thread 19 moved to next sprint (Nextplan: the plan's thread 19); `takeWorld` already takes a row whole (`vault.ts:81`), but thread 19 has not finished or struck it.
- Add has_passkey to VaultSnapshot when the demo moves over, as a revoke button now reads vault.gate in render (#462): not added; moved to next sprint: `e2e-milestones.md` item 7 names it.
- The sprint's done note carries what the demo needs next (exports from src/index.ts, safebyok-react moved over, a real strengthChecker, timers for bank.tidy and vault.hello): the content is in `e2e-milestones.md` items 1 to 4, and the done note itself is not written yet.
- For the demo, from #462's review: render boxes only from vault.boxListing; a reveal re-renders after its own expose: moved to next sprint: `e2e-milestones.md` item 8 names it.
- Thread 20: a row asserting listing.openGating is set straight after listing.buildVault(Dna) (#461): no such test (`rg openGating` in tests finds only `.to.be.null`); thread 20 moved to next sprint, but the plan's thread 20 text and Nextplan do not name this row.
- Next sprint, from #464's review: a box verb refused vault_mismatch hands the other life's row to Vault.takeWorld, which drops it, until a fetch; a gate verb refused vault_empty delivers nothing, until a fetch: not named in Nextplan or `unrace-closerlook.md` (`rg` for vault_empty and "other life" finds nothing); needs adding there.

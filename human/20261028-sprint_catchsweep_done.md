# Sprint catchsweep: done (2026-10-28)

Written by the orchestrator at the close. Issued by the Coach on 2026-10-27 as error-handling cleanup
threads off #311: every `try`/`catch` under `packages/*/src` flattened to one catch per throwing body,
`tryVerbFoo`/`verbFoo` pairs named for what they resolve, one sanitizer for host throws, the VaultDB's
adapter hooks adapted once, no function named `read` or `write`, `Saying` → `Story` exported from its
shape, and the renames the rulings brought (`HostErrorSanitizer`, `storageTroubleOf`). Ten threads, ten
PRs, thirty rulings; the rulings are in `whiteboard/20261027-catchsweep/catchsweep-resolutions.md`, the
threads' reviews under each entry of `catchsweep-plan.md`, the discoveries in `catchsweep-progress.md`.

## PRs, in merge order

Merged 2026-10-28 01:56 (one line, #321 on top):
1. #316 trythrow (thread 1): the body of each Lease and Box try pair lives in the throwing method.
2. #317 where_prefix (thread 4), stacked on #316: one place for a Validator to say where.
3. #324 one_sanitizer (thread 5), stacked on #317: the host-threw sanitizers become one.
4. #321 store_trynames (thread 6), stacked on #324: VaultDB and DeviceDB verbs named `tryVerbFoo`/`verbFoo`.

Merged 2026-10-28 02:56 (one line, #328 on top):
5. #327 vault_bank_flip (thread 7), rebased onto main: the Vault's and Bank's try pairs in the one-catch form.
6. #330 db_hooks (thread 3), stacked on #327: hooks adapted once through `VaultDB.#hooks`; `vaultDBOf` passes the host's errors through (ruling).
7. #328 read_names (thread 8), stacked on #330: no operation named read or write; `GetBoxAnswer.got`, `doDelUnparsed(scopepath, isSound)`.

Open, the last line (each PR's base `main`; merging the top merges all):
8. #333 host_error_sanitizer (thread 10), on main `f84d61bb`: `sanitizer.ts` → `host-error-sanitizer.ts` / `HostErrorSanitizer`; `asStorageTrouble` → `storageTroubleOf`, #330's release note amended.
9. #331 saying_story (thread 9), stacked on #333: `Story`, exported with `Refusing`, `ConsistencyRefusal`, `Merged` and the three consistency functions; STYLE.md's shapes rule, `Stored-` clause and Get lead verb; VOCABULARY's story row.
10. #325 aead_narrow (thread 2), stacked on #331: each AEAD and device-store catch holds one call, no cause; the new refusal kind `crypto_failed`; the device store's error name kept; bank.ts's `refusalOf` folded onto outcome.ts's.
11. #314, this sprint PR, squashed on #325: the plan, progress, resolutions and `human/` notes. The top.

No YOLO decisions: the sprint ran in normal mode; every call the orchestrator made without a ruling is
in the resolutions file under *Orchestrator's calls*.

## Still open

Rows in the sprint doc's Open Matters, for the Coach:
* `listedKindOf` runs before the sanitizer at two logging sites (explained; Rec: leave, or a small PR).
* `notes/security.md`: do identifier-only renames need an amended marker, or does the header state the exemption?

From the Cleanup tab's *Finally*, carried here (none blocks a merge):
* Delete the local tags the filings left in the shared repo once their PRs merge: `20261028-saying_story-prerebase`, `20261028-aead_narrow-prerebase` (the merged threads' `prerebase-store_trynames` and `prerebase-where_prefix` are deleted).
* A follow-up thread: `crypto_failed` and the ctx-before-the-try rule at the sibling WebCrypto sites (`Proving.wrappedWith`, `makeVaultKey` in `sealWayins`, `sealLeaseRecord`, `importWrappingKeyBytes`, `deriveWrappingKey`, `PasskeyProving.seal`), with `Box.seal`'s doc naming `crypto_failed`.
* The redact the Coach named ("We will at some soon point add redact"): one helper beside `thrownNameOf` serving `deviceTrouble` and `cryptoFailed`; widen the `leaseBound: ciphered.ok` comment when lease.ts is next touched.
* Documentarian runs, when the Coach asks: `vault-db.ts`/`device-db.ts` (try-twin examples), `outcome.ts` (`storageTroubleOf`'s block), `host-error-sanitizer.ts`, `safebyok-graphql`'s `vault-resolvers.ts` (`hostThrew`'s block and name), `safebyok-convex` prose and the "unreadable" test titles after thread 8.
* A mechanical sweep PR renaming the ~70 test locals that hold a try form under the throwing verb's name (from #321's review).
* `ConsistencyRefusalShape.message`'s bare `custom(...)` where `fn<...>()` would say `FunctionExpected`; README *Validators* for the consistency exports and `parse(val, story?)`; a type-level pin of `src/index.ts`'s `export type` names.
* Small leftovers recorded in reviews: #311's (`toolsOf` on null, `tools`/`provingTools` doc blocks), #317's (`checkBankVaultOpts` message untested; `optionsCheck`'s `said` parameter), #327's (`clearCachedVault`'s direct store calls; `lock()`/`hello()` tearing down through an Outcome), `.changeset/20261022-lease_box.md`'s `{ read, box_stored }`, two `notes/guarantees.md` lines over the prose wrap.
* The `safebyok-react` misuse-dialog test flaked once each in three full justify runs; its fix is #320.

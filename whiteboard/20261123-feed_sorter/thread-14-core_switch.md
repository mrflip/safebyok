# Thread 14: core_switch (2026-11-24)

Branch `20261124-core_switch`, PR #880, cut from #879's `feab0508d` (thread 13, `fingerpaint`). Proved: `safebyok` 7 failed (the seven `vault-minder` tests named in the handoff: listen 4, writes 2, staleness 1), 2162 passed; lint and typecheck clean in every package; by hand, `safebyok-react-lean` 320, `safebyok-idb-lean` 115, `safebyok-postgres` 356, `demo-dojo` 111, `demo-envman` 24, `demo-knockknock` 26, all passed. Test titles whose promise moved, before and after: `thread-14-core_switch-tests.md` beside this file (for the reviewer).

* **Built**:
  * **Device** (`src/models/device.ts`): `Device.make` takes `opts.queryClient`, a host's own, or makes one (`new QueryClient()`, no I/O). Getter `tsqClient` answers it, the same one from `make` on. `#doSignin` makes the VaultTSQ over it right after `SortedVaultDB.make`, with nothing awaited between. The VaultTSQ's `onBadNews` goes to `tellBadNews`. Getter `vaultTSQ` refuses `absent_vault` before `signin`, and `disabled` (`signinUnanswered`) until it is made. `queryCacheOpts` leaves `DeviceOpts`, and `queryClient` replaces it (validated with `isQueryClient`).
  * **VaultTSQ** (`src/minding/vault-tsq.ts`, `shapes-vault-tsq.ts`): takes an optional `onBadNews`, which is handed to the SortedVaultDB as its listener's.
  * **Vault** (`src/models/vault.ts`), made as `Vault.make(bank, vaultTSQ)`, members:
    * `bank`;
    * `sweep()`, which sweeps the VaultTSQ;
    * `tryPutBoxOnce`/`putBoxOnce` and `tryDelBoxOnce`/`delBoxOnce`, which answer the `Box` (an `Outcome<Box>` for the try forms). They seal, then write through `sortedVaultDB.tryPutOnce`/`tryDelOnce`, citing `Thing.sparseOf(donor)`. The donor is the given record, or the Box's `pickle()` when its `agekind` is `here`, else its `citable`; with no Box, it comes from `vaultTSQ.getOnce`;
    * `sealBox`/`trySealBox`/`unsealBox`/`tryUnsealBox`, moved from Bank;
    * `forceTimelyUnlocked`, `withWhisper` and `withUnlockedWhisper`, which read through `vaultTSQ.getOnce` and unseal the Box's `pickle()`.
    * `Vault.minder` is gone. The try form is the body, and the thrower is `valOf` of it (try-or-throw rule: the answer is rich).
  * **Sealing**: `sealBox`/`unsealBox` and their try forms are on Vault, with `#demandOwnBox`, and gone from Bank. Each body is the same call as before: `this.#world.seal(BaseBox, donorProps, publicProps, secretProps)` (vault.ts, was bank.ts) and `this.#world.unseal(BaseBox, box)`. No line of `lease.ts` or `proving.ts` changes. `ctx-bytes.test.ts` has one call-site edit (`bank.device.vault!.sealBox`), and its expected bytes are unchanged.
  * **Sign-in** asks through the SortedVaultDB: `tryGetOnce` of the root box, and where it answers `gotvoid` with no world, `tryGetOnce` of `bank`. A refusal throws its error into the existing catch. Roots answered not all live throw `bankRootsMissing`, as `demandRootsLive` did. (`tryBirthBank` was already the SortedVaultDB's, via the world.)
  * **Checks moved**:
    * vault.ts's go to `src/shapes/shapes-vault.ts` (`VaultChecks`);
    * the SortedVaultDB's, with its option, listener and once-verb types and `isSortedVaultDB`, go to `src/shapes/shapes-sorted-vault-db.ts` (`SortedVaultDBChecks`). Importers repointed: storage.ts, world.ts, minder.ts, vault-tsq.ts, shapes-vault-tsq.ts.
  * **Checks stayed**: Bank's and Device's. Their checks name model classes, which the shapes cannot import without a cycle.
  * **Security**: `notes/security.md` has a new entry (a host's own QueryClient holds box records as stored) and an amendment line on the lean_gate seal entry (sealing moved to Vault, construction unchanged), written by a `sonnet` subagent.
* **Scaffolding**:
  * **Scaffolding: `vaultTsqClient` stays the old VaultMinder's client**, so that what a host sees through react-lean is unchanged. Removed by the thread that moves react-lean's hooks onto the VaultTSQ, which repoints it (or deletes it, with the old minders).
  * **Scaffolding: the cached start.**
    * The persisters still restore into the two old minders.
    * `Device.#receiveRestored` hands the SortedVaultDB the roots, as before, and now every box record in the old VaultMinder's QueryCache too. Each goes in as an `item` event with sourcelabel `persister`, so the Things hold them.
    * A record that fails its checks is told to `onBadNews`, and the rest still land.
    * Nothing persisted enters the host's tree: the VaultTSQ fills it only from a Thing, on a host's query. A test asserts `tsqClient` is empty after the restore.
    * Removed by the LocalBridge thread.
  * **Scaffolding: the bank hosts a goodbye adapter** (`bank.hostVault({ sweep })`), which empties the old minder at a sweep. Removed with the old minders.
  * **Scaffolding: sign-in's two gets.** Removed by the lifecycle thread's one-get sign-in.
* **Decisions made**:
  * Things hold stored records only. The Box's `pickle()` is what react-lean and tests read. No lease touches a Thing.
  * `Vault.make` takes no argument check (it had none before).
  * `withUnlockedWhisper` gets through `vaultTSQ.getOnce`, where staleness is by agekind (`here` never stale). On a refused get, it unseals the Box it holds, as it unsealed the cached item before.
* **Deviations**:
  * **`vaultTsqClient` was not repointed.** I tried returning a client that holds the VaultTSQ: 6 react-lean tests failed (useBox options, delBoxOnce null, minder defaults, refusal keep, list stale, useDraft stale_write). The hooks rely on the old minder client's query defaults. So the new client is `tsqClient`, beside it.
  * **Vault's doc sentence on rejecting another bank's box is gone.** The AdapterVaultDB's classifier refuses another scope's row, so the sentence promised nothing Vault does.
  * **The seven red tests**: one mechanical edit, in `vault-minder-writes.test.ts`, where `bank.sealBox` became `bank.device.vault!.sealBox` (2 lines). It still fails, as before.
  * **SortedVaultDB types moved with its checks**, so the shapes file holds what the checks name.
* **Discoveries**:
  * The device now hears a SortedVaultDB's bad news three times (BankMinder, VaultMinder, VaultTSQ), where it heard it twice. This lasts until the old minders go.
  * The `persisters` option does not reach the host's client: a host persisting it does so with its own code (the security entry says so).
  * VOCABULARY.md *timely* still says `queryCacheOpts` sets the staleTime. That is drift, left for the Coach.
* **For the Coach**: the open matters in the PR body. Edits outside the core, each the minimum (react-lean only, no demo edits):
  * `react-giver.tsx`: `vault.minder.get` became `vault.bank.device.minder.get`; `putBoxOnceAt` and `delBoxOnce` answer `box.pickle()`, cast to `LiveOf<BoxRecord>` and `TombstoneOf<BoxRecord>`.
  * `use-draft.ts`: the same, `.pickle()` cast to `LiveOf<BoxRecord>`, and `vault.bank.device.minder.deadAt`.
  * `record-hooks.test.tsx`: one `.pickle() as BoxRecord`.

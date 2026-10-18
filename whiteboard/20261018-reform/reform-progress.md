# Sprint progress: reform

The orchestrator's curated summary of what the threads have taught. Newer than the plan where they
disagree. Workers look things up here; they do not write here (each keeps its
`thread-<N>-<label>.md`).

## From planning (2026-10-18)

* *Orchestrator:* the name map was checked against `packages/safebyok/src` at `origin/main`
  `2946a499`. Every old name in it exists; four gaps are settled in the plan's *Amendments*
  (`wayinkind`, `takeUpLease`/`takeUpVaultKey`, `readBox`, `useBox`).
* *Orchestrator:* the retry machinery (`retryStale`, `retryDelayMillis`, `MaxWriteAttempts`,
  `boxStood`, `'erased'`, `clearsFirst`) all lives in `src/vault.ts`; nothing outside it names
  them.
* *Orchestrator:* `openVault` is named in some fifteen core source files, most of them in doc
  blocks and refusal messages; `OpenVaultOpts` in `browser.ts`, `index.ts`, `vault.ts`.
* *Orchestrator:* `Vault` is already an exported type (`src/vault.ts:196`).
* *Orchestrator:* size headroom is ample (about 3.5 kB on every core entry), so no thread raises
  a budget.
* *Orchestrator:* open PRs #138 (KeyDeriver class: `vault.ts`, `envelope.ts`, `types.ts`,
  `VOCABULARY.md`) and #156 (react passphrase-modal tests) collide with the reform and are not
  in this line.

## Decisions and discoveries by thread

### Thread 1, vocabulary (#159)

* VOCABULARY.md is the dictionary for threads 3 to 10: its *Old names* table covers every row of
  the name map, the plan's amendments, and these derived names (YOLO, rows in *Open Matters*):
  camelCase `vaultKeyWayinWrapped`, `vaultKeyLeaseWrapped`, `revisionTok`; public
  `reentryWindowMillis` → `leaseMillis` (thread 6) and the `unlockId` option → `wayinId`
  (thread 3); internal `EnvelopeHeader` → `WayinHeader`, `EnvelopeStamp` → `WayinStamp`,
  `absentUnlock` → `absentWayin`, `publicJsonOf` → `sidecarJsonOf`, `EraseDamagedVaultOpts` →
  `RetireDamagedVaultOpts`.
* The ctx section of VOCABULARY.md is *Ingredients and contexts*; `wayinKey` is a role name, not a
  sixth key.
* `prior_vault_key.vault_key_wrapped` keeps its name: the map renames only the field on a wayin.
* *Orchestrator:* thread 7's storage-side names (YOLO): Postgres `safebyok_bundles` →
  `safebyok_vaults`, `bundle_id` → by the same stem (judge: likely `vault_id` already exists;
  the worker checks), `BundleColumns` → `VaultPropsColumns`; GraphQL `SafebyokVaultBundle` →
  `SafebyokVaultProps`, `SafebyokBundleExpectationInput` → `SafebyokVaultPropsExpectationInput`,
  `SafebyokUnlockEnvelope` → `SafebyokWayin` (thread 3); Convex `safebyokReadBundle` /
  `CreateBundle` / `UpdateBundle` → `safebyokReadVaultProps` / `FetchOrCreateVaultProps` /
  `UpdateVaultProps`, `*BundleDoc` → `*VaultPropsDoc`; core internals `UnreadBundle` →
  `UnreadVaultProps`, `bundleMeets` → `vaultPropsMeets`.
* A case-insensitive `\bbundle` grep also hits the JavaScript-build sense (PROCESS.md *Size
  budgets*, STYLE.md "the bundler", tsdown). Not survivors; a PR says so.

### Thread 2, no_retry (#160)

* `store()` makes one attempt; on `stale_write` it catches up once (`refreshOnStale`) and throws
  through the named step **`refuseStaleStore(err)`** in `vault.ts`. Thread 9: `created_elsewhere`
  is not this path (it is `settleUnlock`'s), but the "refuse, caught up" message shape is the model.
  For a create met by a rival, the test "a store of a box that did not exist, and is created
  meanwhile elsewhere, is refused as stale: theirs stands" shows the shape.
* A stale store whose catch-up relocks the device throws `vault_locked`, not `stale_write` (kept;
  YOLO row).
* Thread 7's `store` → `storeBox` touches the `store()` doc block, `writeOver`,
  `refuseStaleStore` and the messages that say "store again".
* The core README now has *Two devices storing at once* under *Conditions*; `VAULTDB.md`
  (*Who does what*, 4.3) and the convex README no longer say "last writer wins" or "retry".
* `twoDeviceWorld` (test helper) lost its `hereOpts` parameter.
* Size: `everything` 34.86 → 34.72 kB, `openVault` 27.56 → 27.45 kB.
* Three old entries in `notes/security.md` still describe the retry; the file's header forbids
  touching them (row for the Coach; thread 10 if allowed).

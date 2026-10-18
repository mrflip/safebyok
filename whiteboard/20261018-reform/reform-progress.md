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

### Thread 3, wayin (#161)

* *Orchestrator:* ruling A (YOLO): ctx bytes follow renamed stored fields and the bumped tag; see
  the plan's ground rules. Where each ctx is built: wayin `binding()` in `envelope.ts` →
  `cipherBinding(format, applabel, user_id, vaultlabel, vault_id, registered_at, purpose, header)`,
  also a passkey's HKDF `info`; lockbox `boxBinding` in `vault.ts` (`LockboxFormat` + the whole
  lockbox header, holding `public_json` and `revision_id`); lease `localBinding` in `vault.ts`
  (`'safebyok-unlock-v1'` first, purpose `'vault_key_local_wrapped'` last).
* `OlderBundleFormats` in `vault-db.ts` lists retired tags so an old record reads as damaged, not
  `newer_format`: each tag-bumping thread adds the tag it retires there (an allowed grep survivor).
* `gh pr ready` was refused once for a worker by the permission classifier; the orchestrator takes
  a PR out of draft when that happens.
* Built (worker): `envelope.ts` → `wayin.ts`; vault record `safebyok-vault-v3`; `OlderBundleFormats`
  holds `'safebyok-vault-v2'` (a test shows v2 reads `damaged_bundle`); tests that stood for "a
  future format" moved from `-v3` to `-v4`. Public option `{ wayinlabel }` on
  `addPassphrase`/`addPasskey` and in the validators bag. Postgres column `unlocks` → `wayins`:
  `VaultTablesSql` creates only what is missing, so the changeset gives hosts the `ALTER TABLE`.
  Derived names: `FirstWayinlabel`, `PurposeForWayinkind`, `parseWayinId`, `parseWayinlabel`,
  `wayinIdShape`, `reviseWayins`, `ensureRoomForWayin`, `wayinSummaries`, `wayinList`,
  `TH.wayinOf`, `TH.passkeyWayinOf`, fake ids `wayin-<label>`.
* The `Wayin` module and the `Wayin` type collide on import: `vault.ts` and `wayin.test.ts` write
  the list's type as `VaultBundle['wayins']`.
* The device-unlock noun ("remembered unlocks", the `unlocks` map in `device-db.ts`) still
  matches `\bunlocks\b`: thread 6 retires it.
* Grep survivors judged allowed: `envelopeBinding` (thread 4), VOCABULARY.md's *Old names*,
  `prior_vault_key.vault_key_wrapped`, `safebyok-vault-v2` in `OlderBundleFormats` and its test,
  HTTP/JS `method`, the verb "unlocks", old `notes/security.md` entries (header forbids edits).

### Thread 4, ctx (#162)

* `packages/safebyok/tests/ctx-bytes.test.ts` pins every ctx's bytes as hand-written literals
  (readable JSON text; `cipherCtx`'s own encoding as hex): the wayin's passphrase and passkey ctx
  (and the passkey HKDF `info`), the lockbox's two wraps, the lease's wrap. **Threads 5, 6 and 7
  move these bytes on purpose and update the literals in the same commit as the tag or field
  rename**; a test failing anywhere else means a byte moved that should not have.
* *Orchestrator:* the fixture's header (fixed in review) says each literal pins the ctx's shape and
  order; `vault_id`, `revision_id`, `salt_b64`, `registered_at`, `written_at`, `unlock_epoch` and
  `ask_passphrase_at` are read off the record. The thread file says only the first three: the test
  is right.
* The closures are reached without new exports: the wayin through `Wayin.sealPassphrase` /
  `sealPasskey`, the lockbox through a stored box opened with the vaultKey from
  `Wayin.openWithPassphrase`, the lease through `deviceDB.readUnlock` (thread 6 renames it).
* Names: `cipherCtx`, `CipherCtxPart`, `ctx` parameters, `wayinCtx` (built by private
  `wayinCtxOf`), `boxCtx`, `leaseCtx`. Neither `cipherCtx` nor `CipherCtxPart` is exported from a
  package's `src/index.ts`. `cipherCtx`'s `bad_option` message says "cipher ctx".
* "binding" survives legitimately in React/host bindings, fastkey's native Argon2 binding, and
  eslint configs: later greps should not flag those.

### Thread 5, sidecar (#163)

* Lockbox format `safebyok-lockbox-v5`; `public_json` → `sidecar_json` (Postgres column too:
  the changeset gives `ALTER TABLE safebyok_lockboxes RENAME COLUMN public_json TO sidecar_json`
  and the Convex clear-tables line).
* **No lockbox older-formats list exists, and none is needed:** a lockbox in any format other than
  the current one already lists as damaged, never `newer_format`. Tests cover v4.
* The lockbox ctx header is key-sorted JSON: `sidecar_json` sorts after `revision_id`. In thread
  7, `revision_tok` sorts where `revision_id` does, so only the field name changes in the
  ctx-bytes literal.
* `ctx-bytes.test.ts`'s first test (how `cipherCtx` encodes, as text and hex) passes the string
  `'safebyok-lockbox-v4'` as an arbitrary input; it is not the lockbox's ctx. Thread 10's grep
  will meet it: an allowed survivor, or change text and hex together.
* The option parse stays in one place: `checkStoreOpts` with `sidecarJsonOf` in `vault.ts`.
* The security note was folded into the existing 2026-10-16 lockbox entry (the header's rule for
  a fact that entry already covers).

### Thread 6, lease (#164)

* Lease format `safebyok-lease-v1`; `leaseCtx` purpose `vault_key_lease_wrapped`; the lease
  literal in `ctx-bytes.test.ts` moved, nothing else.
* **No IndexedDB store rename**: lease and device mark share the `records` store of
  `<dbName>:device_db` (from `safebyok/idb`), told apart by ckey. The ckey kind is now `lease^`
  (was `unlock^`); `idbDeviceDB`'s sweep of unknown ckeys drops an old lease at the next
  `readLease`/`eraseLease`, keeping the mark (test in `tests/idb.test.ts`). A host DeviceDB
  returning an old record sees the vault erase it and warn once.
* `takeUpLease` (reads the lease at open) is one function with a contract in its doc block: thread
  8's `hello()` calls it. `takeUpVaultKey` adopts a proven vaultKey and grants a lease.
* Public: `Ckeys.lease`, `Ckeys.isLease`, `TH.leaseOf` (in `safebyok/testing`), `leaseMillis`,
  `leaseHours`, `LeaseHours`, `MaxLeaseHours`, DeviceDB `readLease`/`writeLease`/`eraseLease`,
  `LeaseExpectation`.
* The security note was folded into the 2026-10-15 entry "every field a record writes is bound".

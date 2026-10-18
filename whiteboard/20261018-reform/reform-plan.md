# Sprint plan: reform

Date: 2026-10-18. Mode: **YOLO** (the Coach's invocation; the preplan said normal). Review level:
medium. Threads at once: 2. Issued by: the Coach, from `reform-preplan.md` beside this file
(drafted by an agent from the design discussion; the Coach invites adjustment).

Sprint doc: https://claude.ai/code/artifact/b7fd117e-7a03-4f68-b2fa-b2c1e70e118b (*Open Matters*,
*Progress*, *Resolved*).

**Status:** thread 1 filed (#159); thread 2 in review (#160).

## Read first

* `whiteboard/20261018-reform/reform-preplan.md`: *Ground rules* and *The name map*, whole. The
  map is the sprint's spine; this plan's *Amendments* below override it where they differ.
* `VOCABULARY.md`, whole, as thread 1 leaves it (threads 3 on stand on thread 1, so it is in
  your worktree).
* `STYLE.md`, *Naming* and *Tests*; *Validation* before touching an entrypoint.
* `PROCESS.md`, *Threads*, *The history we keep*, and *Releases* (changesets).
* `packages/safebyok/src/types.ts`, whole: every stored record lives there.
* The design doc (linked in the preplan) is background only, not a spec. Workers need not read it.

## Ground rules

The preplan's *Ground rules* hold, with these additions:

* **One format-tag bump per record per sprint.** The line merges as one, so no in-between stored
  shape ever ships. The vault record goes to `safebyok-vault-v3` in thread 3, the lockbox to
  `safebyok-lockbox-v5` in thread 5, and the lease is born `safebyok-lease-v1` in thread 6. A
  later thread renaming a field on one of these records adds no second bump, and its changeset
  says the field was renamed.
* **VOCABULARY.md lives in the line.** Thread 1 sits at the bottom of the line (the orchestrator
  restacks thread 2 onto it before thread 3 is cut). A rename thread that finds the vocabulary
  lacking a name stops and asks (in YOLO the orchestrator answers), then adds the entry to
  VOCABULARY.md in its own PR. Nothing but sprint documents goes in the sprint PR.
* **The grep is spelt out.** Each rename thread's handoff names the patterns for its retirement
  grep over `packages/ demos/ e2e/ README.md notes/ VOCABULARY.md STYLE.md CLAUDE.md`, excluding
  `CHANGELOG.md` files (released history) and `.changeset/` files of earlier releases. The PR quotes the command
  and its empty result. A hit that is the verb (`unlock()`, "unlocks the vault") is not a
  survivor; say so in the PR if any were judged that way.
* **Size budgets**: no `--raise`. Headroom at planning: `openVault` 27.5 of 31 kB, `everything`
  34.7 of 38 kB, `VaultProvider` 4.6 of 6.8 kB. Thread 8 renames the `openVault` entry's import
  (its function is gone), no limit changed; thread 10 runs `pnpm size:budget --write`.
* **Open PRs that collide**: #138 (KeyDeriver class) rewrites `vault.ts`, `envelope.ts`,
  `types.ts`; #156 edits react's passphrase-modal tests. Neither is in this line. If the Coach
  merges one mid-sprint, the next restack takes it in (a conflict goes to a fresh worker).

## Amendments to the name map

Made in YOLO while planning; each is a row in *Open Matters*.

* Stored field `method` on a way in → `wayinkind` (the map renamed only its type, `WayinKind`).
* `rememberedUnlock` → `takeUpLease`; `takeUpUnlock` → `takeUpVaultKey` (the map sent both to
  `takeUpLease`).
* Thread 7's text says `viewBox`: the ruling and the map say `readBox`, which wins.
* `vault.use` → `useBox` (in the map, in no thread) joins thread 7.

## Order

Threads 1 and 2 start together from `origin/main`. When both have filed, the orchestrator rebases
2 onto 1 (disjoint files), so the line begins main → 1 → 2. Threads 3 to 10 then stack one on
the next: every rename rewrites `src/vault.ts`. Nothing else runs in parallel; the cap of 2
matters only at the start.

---

### 1. `vocabulary`

> Rewrite VOCABULARY.md for the reform. Keep its shape: the cast, each key by role, each
> encrypted form, each stored record. Replace every retired word with its new one per the name
> map in `whiteboard/20261018-reform/reform-preplan.md`, define `wayin`, `wayinKey`, `lease`,
> `leaseKey`, `ctx` (with its prefixed forms), `sidecar`, `vaultProps`, `retire`, `Proof`, and
> note the intended policy, a vault holding exactly one passphrase and at most one passkey, as
> not yet landed. Add a short *Old names* table (old → new, one line each) at the end, marked to be
> deleted at 1.0.0. Update STYLE.md where it names an old word (`Envelope.swak(...)` in its
> star-import example, `bag` where it meant the public bag). No code changes. Do not describe the
> prompt callback, the pantry, or the atomic create: they are not in this sprint.

*Gloss:* *Touches* `VOCABULARY.md`, `STYLE.md`, `CLAUDE.md` (*Conventions At A Glance*'s `Envelope.swak(...)` example and any old word in *Notable files*). Documents only: no review needed beyond the orchestrator's check; an empty changeset. *Model*: default. *Depends on*: nothing; cut from `origin/main`. *Look-ahead*: every rename thread reads it as its dictionary, so it carries the plan's *Amendments* too (`wayinkind` as the stored field; `useBox`; `readBox`), and every name in the map's New column, `revision_tok` and the `_tok` rule included. It defines only what lands this sprint; the one-passphrase policy is named as intended, not landed. *Size*: small. Sits at the bottom of the line.

*Review:* none, documents only. Filed as #159. Seven YOLO name calls from the worker are rows in *Open Matters*.

### 2. `no_retry`

> Remove the retry loop from `store()`. One attempt: read the box, seal, write with the versioned
> expectation; a `stale_write` refusal catches up with storage once and is thrown, its message
> saying that nothing was written, the vault now shows the box as storage holds it, and the app
> may store again. Delete `retryStale`, `retryDelayMillis`, `MaxWriteAttempts`, the jitter, the
> `'erased'` outcome and the `boxStood` bookkeeping: an erase elsewhere is simply a stale write.
> Keep the damaged-box handling and the `clearsFirst` path exactly as they are. Keep `erase()`
> unretried as it already is. Rewrite the `store()` doc block and the README's concurrency
> paragraph; delete the tests that count attempts or time the waits and add one that proves a
> stale store throws once, without waiting, with the snapshot caught up. Have a `sonnet` subagent
> record in `notes/security.md` that the retry was removed and why (a lost write must be visible
> in a secret store; the retry hid it and merged nothing).

*Gloss:* *Touches* `packages/safebyok/src/vault.ts` (store, `retryStale` and friends), `packages/safebyok/README.md` (the concurrency paragraph), `tests/vault.test.ts`, `notes/security.md` (through a `sonnet` subagent), a `minor` changeset (the retry is observable behaviour). Check react: `VaultProvider` or the demos may surface a stale write differently once it throws on the first conflict. *Model*: default. *Depends on*: nothing; cut from `origin/main`, rebased onto thread 1 by the orchestrator once both file. *Look-ahead*: thread 7 renames `store` to `storeBox` over this code; thread 9 copies its "one refusal, caught up" shape for `created_elsewhere`, so make the catch-up a small named step thread 9 can call, if the code allows it without contortion. *Size*: medium.

### 3. `wayin`

> Rename the envelope to the wayin, repo-wide, per the name map: types, the module and its file,
> the `unlocks` list and snapshot field, `unlock_id`, `unlocklabel`, the method/kind words,
> `UnlockProof` to `Proof`, `vault_key_wrapped` to `vault_key_wayin_wrapped`, `removeUnlock` to
> `retireWayin`. Bump the vault format tag to `safebyok-vault-v3`. Rename the refusal kinds
> `absent_unlock`, `damaged_unlock`, `last_unlock`, `too_many_unlocks` to their `_wayin(s)` forms,
> with their messages and the README table. `addPassphrase`, `addPasskey` and `changePassphrase` keep their names: `storeWayin` and the
> one-passphrase policy are deferred, so a vault still holds up to `MaxUnlocks` ways in. Leave `unlock()` and `lock()` as verbs: they stay.
> Leave every `*_epoch` untouched, `unlock_epoch` included.

*Gloss:* *Touches* core (`types.ts`, `envelope.ts` → `wayin.ts` via `git mv`, `vault.ts`, `vault-db.ts`, `errors.ts`, `refusals.ts`, `crypto.ts`, `names.ts`, `validators.ts`, `index.ts`), every adapter's record checks, schema and fixtures, react (`VaultProvider`, `PassphraseModal`, `PasskeyUnlockButton` keeps its name), demos, e2e, README, `notes/`. Includes `passphraseKey`/`passkeyKey` → `wayinKey` where the key acts on the vaultKey (the map's row; the preparing code keeps the specific names), and the stored field `method` → `wayinkind` (*Amendments*). `envelopeBinding` survives: thread 4 renames it. Also the public `unlockId` option → `wayinId`, GraphQL `SafebyokUnlockEnvelope` → `SafebyokWayin`, and the internals in the progress document's thread-1 notes. *Model*: default. *Depends on*: 2 (and 1, beneath it). *Grep*: `UnlockEnvelope|PassphraseEnvelope|PasskeyEnvelope|Envelope\.|envelope\.ts|envelope\.test|UnlockSummary|unlock_id|unlocklabel|UnlockMethod|UnlockProof|vault_key_wrapped|removeUnlock|absent_unlock|damaged_unlock|last_unlock|too_many_unlocks|safebyok-vault-v2|\bunlocks\b|\bmethod:` and, case-insensitive, `envelope` other than `envelopeBinding`. *Look-ahead*: threads 4 to 10 grep the same trees; leave no half-renamed doc block. *Size*: large, mechanical.

### 4. `ctx`

> Rename every cipher binding to a context: `cipherBinding` → `cipherCtx`, `CipherBindingPart` →
> `CipherCtxPart`, the `binding` parameters of `cipherBytes`, `decipherBytes`, `wrapKeyUnder`,
> `unwrapKeyUnder` → `ctx`, `envelopeBinding` → `wayinCtx`, the lockbox's → `boxCtx`,
> `localBinding` → `leaseCtx`. The bytes each produces are unchanged, byte for byte: add a test
> that pins each context's output against a fixture so the rename proves it changed nothing.
> Doc blocks say what a ctx is: the props and metadata the ciphertext's tag proves unchanged.

*Gloss:* *Touches* `crypto.ts`, `wayin.ts`, `lockbox.ts`, `vault.ts`, their tests, `notes/security.md` (a line through a `sonnet` subagent only if a note names the binding). The fixture test lands **first**, as its own commit against the pre-rename code, so it proves the rename changed no byte. `localBinding` → `leaseCtx` here, though the lease itself is thread 6's: the name is the ctx's. *Model*: `sonnet`. *Depends on*: 3. *Grep*: `cipherBinding|CipherBindingPart|envelopeBinding|localBinding|\bbinding\b|Binding\b` (case-insensitive `binding` in doc blocks too). *Size*: small.

### 5. `sidecar`

> Rename the public bag to the sidecar: `PublicBag` → `Sidecar`, `public_json` → `sidecar_json`,
> `store(..., { public })` → `{ sidecar }`, the `.public` field of a lockbox summary → `.sidecar`,
> `publicJsonOf` and friends. Bump the lockbox format tag to `safebyok-lockbox-v5`. The sidecar
> stays in `boxCtx` exactly as the bag was. README: the sidecar is the app's own plain data that
> rides beside the whisper, authenticated but not encrypted.

*Gloss:* *Touches* `lockbox.ts`, `types.ts`, `vault.ts`, `vault-db.ts`, `index.ts`, `safebyok-postgres` (`columns.ts`, `vault-tables.ts`, migrations or DDL), `safebyok-graphql` (`fields.ts`, schema), the convex component's schema, react `WhisperField`, demos, e2e, README. *Model*: default. *Depends on*: 4. *Grep*: `PublicBag|public_json|publicJson|publicJsonOf|\{ public \}|\.public\b|safebyok-lockbox-v4` and case-insensitive `public bag`. *Look-ahead*: thread 7 renames `store(..., { sidecar })` to `storeBox(..., { sidecar })`; keep the option's parse in one place. *Size*: medium.

### 6. `lease`

> Rename the device unlock to the lease: `DeviceUnlock` → `Lease` with format
> `safebyok-lease-v1`, `localUnlockKey`/`makeLocalUnlockKey`/`local_unlock_key` → `leaseKey`
> forms, `vault_key_local_wrapped` → `vault_key_lease_wrapped`, the DeviceDB verbs
> `readUnlock`/`writeUnlock`/`eraseUnlock` → `readLease`/`writeLease`/`eraseLease`,
> `UnlockExpectation` → `LeaseExpectation`, the internals `rememberDevice`/`rememberedUnlock` →
> `grantLease`/`takeUpLease`, and `forcePassphraseReentryHours` with its constants → `leaseHours`,
> `LeaseHours`, `MaxLeaseHours`. `askPassphraseAt` and `ask_passphrase_at` keep their names. The
> mark, `lock_generation`, `lockSoon()` and every lock timer are untouched. `safebyok-indexeddb`'s
> store names follow.

*Gloss:* *Touches* `types.ts`, `device-db.ts`, `crypto.ts`, `vault.ts`, `idb.ts`, `idb-opts.ts`, `options.ts`, `safebyok-indexeddb`, react (`leaseHours` prop), demos, README. Internals per *Amendments*: `rememberDevice` → `grantLease`, `rememberedUnlock` → `takeUpLease`, `takeUpUnlock` → `takeUpVaultKey`; the public field `reentryWindowMillis` → `leaseMillis`. Renaming an IndexedDB object store needs a database version bump; with no migration, the upgrade drops the old store and an existing device's lease is simply gone (the user proves once more). The changeset says so. *Model*: default. *Depends on*: 5. *Grep*: `DeviceUnlock|safebyok-unlock-v1|localUnlockKey|LocalUnlockKey|local_unlock_key|vault_key_local_wrapped|readUnlock|writeUnlock|eraseUnlock|UnlockExpectation|rememberDevice|rememberedUnlock|takeUpUnlock|ForcePassphraseReentryHours|forcePassphraseReentryHours|MaxReentryHours`, and case-insensitive `device unlock|remembered unlock`. *Look-ahead*: thread 8's `hello()` reads the lease through `takeUpLease`. *Size*: medium.

### 7. `vaultprops`

> Rename the bundle to the vault's props and erase to retire, repo-wide: `VaultBundle` →
> `VaultProps`, `BundleIdentity` → `VaultIdentity`, `BundleExpectation` → `VaultPropsExpectation`,
> `damaged_bundle` → `damaged_vault`; the VaultDB verbs `readBundle`/`createBundle`/`updateBundle`
> → `readVaultProps`/`fetchOrCreateVaultProps`/`updateVaultProps` (the semantics of
> `createBundle` are already fetch-or-create: the doc block now says so in those words);
> `eraseBox`/`eraseVault`/`eraseDamagedVault`/`EraseExpectation` → `retireBox`/`retireVault`/
> `retireDamagedVault`/`RetireExpectation`; on the vault, `store`/`read`/`erase`/`destroy` →
> `storeBox`/`viewBox`/`retireBox`/`retire`; `revision_id` → `revision_tok` everywhere it is
> stored, expected or compared. `retire` still means erased: no tombstone. Every adapter's
> abstract methods and tests follow; the convex component's function names follow.

*Gloss:* *Touches* everything that touches storage: core (`types.ts`, `vault-db.ts`, `expectations.ts`, `lockbox.ts`, `vault.ts`, `errors.ts`, `refusals.ts`), all four adapters (postgres, graphql, convex incl. its component function names, indexeddb's VaultDB), react, demos, e2e, README, `notes/security.md`. The vault's read verb is **`readBox`** (ruling; the text's `viewBox` is stale), and `vault.use` → `useBox` joins (*Amendments*). `revision_id` → `revision_tok` rides the v3/v5 bumps of threads 3 and 5: no second bump. `DeviceDB.destroy`, if any, is not in the map: leave it. Storage-side names per the progress document's thread-1 notes (`safebyok_vaults`, the `VaultProps` stem). *Model*: default. *Depends on*: 6. *Grep*: `VaultBundle|BundleIdentity|BundleExpectation|damaged_bundle|readBundle|createBundle|updateBundle|eraseBox|eraseVault|eraseDamagedVault|EraseExpectation|revision_id|revisionId|\.erase\(|\.destroy\(|\.use\(` and case-insensitive `\bbundle`. Judge `\.store\(` and `\.read\(` hits by receiver. *Look-ahead*: thread 8 wraps every one of these methods with an awaited `hello`. *Size*: large, mechanical; may run long, so commit and push as each package goes green.

### 8. `make_hello`

> Split `openVault(opts)` into `Vault.make(opts): Vault`, synchronous, which validates its options
> and builds the handle, and `vault.hello(): Promise<void>`, which reads storage and the lease,
> never prompts, and settles the snapshot to `absent`, `locked` or `unlocked`. `make` starts `hello`
> itself, safely: `hello()` is memoised, so `make`'s call and any later call share one promise,
> and a `hello` that failed may be called again. Its failure never surfaces as an unhandled
> rejection: `make` attaches a catch that records the refusal in the snapshot as `trouble:
> VaultError | null` (cleared by the next read that succeeds) with `syncing: false` and the state
> still `opening`, and logs it through the host's logger. An app that wants the rejection awaits
> `vault.hello()` itself; the React `VaultProvider` does, routing a misuse kind to the error
> boundary and a condition to the snapshot. Every other method awaits `hello` as its first step,
> so a call made before storage answered simply waits.
>
> The memo resets exactly when the snapshot stops being trustworthy. In flight: every caller
> shares the one promise. Rejected: the memo clears at once, so the next call reads afresh.
> Resolved: the memo holds, and a later `hello` is a no-op, until a refresh fails (from the
> subscription or inside a call, setting `trouble`), the vault shuts for untrusted storage
> (`identity_revoked`, `rolled_back`, `newer_format`), or the vault is retired; each clears the
> memo, and the next `hello` re-reads storage and the lease and clears `trouble` on success.
> `lock()` and `lockSoon()` do not reset it; `close()` does not either, every later call being
> `vault_closed`. `state` is always the last settled state, never regressed to `opening` by a
> failure. Tests cover each reset and each non-reset. No prompt callback: the modal and
> `unlock()` keep their shapes.

*Gloss:* *Touches* `vault.ts` (the open path, `refresh`, `takeUpLease`), `types.ts` (`MakeVaultOpts`, the snapshot's `trouble`), `index.ts`, `browser.ts` (it names `OpenVaultOpts`), every doc block naming `openVault` (some fifteen files in core), react `vault-provider.tsx`, demos, e2e, README quick start, and `.size-limit.json`'s `openVault` entry (point its import at `Vault`, rename the entry; no limit changed). `Vault` is today an exported type; `Vault.make` makes it a value too. Choose the shape that keeps both the type and the value under one name, and say which in the PR. A public-surface addition (`trouble` on the snapshot) needs the doc block and an `@example` test. *Model*: default. *Depends on*: 7. *Grep*: `openVault|OpenVaultOpts`. *Look-ahead*: thread 9's two-device test opens two vaults with `Vault.make`. *Size*: medium; the reset/non-reset test matrix is most of it.

### 9. `created_elsewhere`

> Add the refusal kind `created_elsewhere`. When the first `unlock(passphrase)` on an absent vault
> finds, from `fetchOrCreateVaultProps`, a vault with another `vault_id` than it drafted, and the
> given passphrase does not open that vault, throw `created_elsewhere` instead of
> `wrong_passphrase`: the message says a vault was just created for this label on another device,
> and to enter the passphrase chosen there. The vault settles `locked` on the standing props
> either way. The React `PassphraseModal` shows it as advice, not as a typo. README's refusals
> table gains the row.

*Gloss:* *Touches* `vault.ts` (`settleUnlock`), `errors.ts` (`VaultErrorKindVals`, the message), `refusals.ts` if kinds are classed there, react `passphrase-modal.tsx`, README's refusals table, tests (two devices in `tests/vault.test.ts` over one `localVaultDB`). Reuse thread 2's catch-up step for "settles locked on the standing props". *Model*: `sonnet`. *Depends on*: 8. *Size*: small.

### 10. `sweep`

> Finish the reform. Grep the repo (excluding `whiteboard/` and `winboard/`) for every retired
> word in the preplan's name map and remove what survived, including in `notes/`, `demos/`,
> `e2e/` and fixtures. Rewrite the README's vocabulary and architecture sections in the new cast.
> Delete VOCABULARY.md's *Old names* table only if the Coach says so in the sprint doc; otherwise
> leave it marked for 1.0.0. Run `pnpm size:budget --write` and report every line that moved.
> Have a `sonnet` subagent add a `notes/security.md` entry listing each stored-format tag that
> changed and that no migration exists. One changeset summarising the sprint for the release note.

*Gloss:* *Touches* docs and whatever the grep finds; `.size-limit.json` (`--write`), `notes/security.md` (through a `sonnet` subagent), one changeset summarising the sprint. The grep list is the union of threads 3 to 8's, handed over in full. The *Old names* table stays unless the Coach's word is in the doc's *Coach notes* or a ruled row. *Model*: `sonnet`. *Depends on*: 9. *Size*: small to medium.


## For the Coach

* Ruled 2026-10-18 (from the preplan): `damaged_vault` stays; `forcePassphraseReentryHours` →
  `leaseHours`; the vault's read verb is `readBox`; `Vault.make` starts `hello` as thread 8 says;
  `UnlockProof` → `Proof`.
* #138 and #156 collide with the reform (above); rows in *Open Matters*.
* The main checkout holds an untracked copy of `whiteboard/20261018-reform/`; this sprint's PR
  adds the same folder.
* Thread 10 deletes VOCABULARY.md's *Old names* table only on the Coach's word in the doc.

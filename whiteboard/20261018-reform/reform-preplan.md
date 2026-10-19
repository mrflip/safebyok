# Sprint preplan: the vocabulary reform, first cut

Date: 2026-10-18. Issued by: the Coach (drafted by the agent from the design discussion at
https://claude.ai/artifact/WLMv2sEsEE5dBmVRTj6FxP, "Design Space" tab). Mode: normal.
Review level: medium. Threads at once: 2 (most threads stack, see *Order*).

This sprint renames the cast, removes the store() retry loop, and lands the smaller model
changes already ruled. It does **not** touch the epochs, the soft lock, the pantry, the prompt
callback, the one-passphrase policy, the atomic create, or the cipher contexts' contents (see
*Deferred*).

## Ground rules

* **Nothing is removed from the epochs or the soft lock.** `unlock_epoch`, `vault_key_epoch`,
  `prior_vault_key`, `lock_generation`, the device mark, `lockSoon()` and the lock timers stay,
  with their names and semantics. `unlock_epoch` keeps its name even though it carries the
  `unlock` noun: that rename is parked with the other epoch questions.
* **A rename changes names, not constructions.** What goes into a cipher context, how a key is
  wrapped, what a format tag covers: unchanged. If a rename seems to need a construction change,
  stop and raise it.
* **The stored shape changes freely, with no migration.** We are before 1.0.0: a renamed stored
  field bumps the record's format tag (`safebyok-vault-v2` → `-v3`, `safebyok-lockbox-v4` →
  `-v5`, `safebyok-unlock-v1` → `safebyok-lease-v1`), an old record fails safe as absent or
  damaged, and the changeset says what a host will see. No shims, no reading of old shapes.
* **VOCABULARY.md leads.** Thread 1 rewrites it; every later thread uses only its names. A
  worker that needs a name the table lacks stops and asks rather than coining one.
* **Old names must not survive.** Each rename thread ends with a grep over `packages/`, `demos/`,
  `e2e/`, `README.md` and `notes/` for the names it retired, and the PR quotes the empty result.
  `whiteboard/` and `winboard/` are history and are not swept.
* **One rename per thread, repo-wide.** A thread renames its words everywhere at once: core,
  every adapter, react, demos, e2e, docs, tests, fixtures. Half-renamed trees never file.
* **Refusal kinds are a contract.** A renamed kind changes `VaultErrorKindVals`, every message
  that names it, the README table, and the react boundary. A new kind gets the full doc block
  and a test for its `@example`.
* **Size budgets.** Renames and a deletion should not raise any `.size-limit.json` line. No
  thread runs `--raise`; the last thread runs `pnpm size:budget --write` and reports the deltas.
* Each PR carries a changeset (`minor`, pre-1.0) naming the renamed exports and stored fields.

## Read first

* `VOCABULARY.md` as thread 1 leaves it (its *Old names* table is the sprint's spine).
* `STYLE.md`, *Naming* (smushed tags, `_tok`, underbar_case stored fields) and *Tests*.
* `PROCESS.md`, *Threads* and *Changesets*.
* `packages/safebyok/src/types.ts`, whole: every stored record lives there.
* The design doc is read-only background, not a spec: where it and this preplan differ, the
  preplan wins; where the preplan is silent, today's code wins.

## The name map

Old → new. Stored fields are underbar_case; code is camelCase; module namespaces Startcase.

| Area | Old | New |
|---|---|---|
| ways in | `UnlockEnvelope`, `PassphraseEnvelope`, `PasskeyEnvelope` | `Wayin`, `PassphraseWayin`, `PasskeyWayin` |
| | module `Envelope` (`src/envelope.ts`) | module `Wayin` (`src/wayin.ts`) |
| | `bundle.unlocks`, snapshot `unlocks`, `UnlockSummary` | `wayins`, `wayins`, `WayinSummary` |
| | `unlock_id`, `unlocklabel`, `UnlockMethod`, `UnlockMethodVals` | `wayin_id`, `wayinlabel`, `WayinKind`, `WayinKindVals` |
| | `UnlockProof` | `Proof` (the type the user presents; `PasskeyProof` stays) |
| | `passphraseKey` / `passkeyKey` once acting on the vaultKey | `wayinKey` (preparing code keeps the specific names) |
| | `vault_key_wrapped` on a way in | `vault_key_wayin_wrapped` |
| | `addPassphrase`, `addPasskey`, `changePassphrase` | unchanged this sprint (`storeWayin` is deferred) |
| | `removeUnlock` | `retireWayin` |
| | `MaxUnlocks` | unchanged this sprint |
| contexts | `cipherBinding`, `CipherBindingPart`, every `binding` parameter | `cipherCtx`, `CipherCtxPart`, `ctx` |
| | `envelopeBinding` | `wayinCtx` |
| | the lockbox's binding | `boxCtx` |
| | `localBinding` | `leaseCtx` |
| sidecar | `PublicBag`, `public_json`, `store(..., { public })`, `.public` on a summary | `Sidecar`, `sidecar_json`, `{ sidecar }`, `.sidecar` |
| lease | `DeviceUnlock` (format `safebyok-unlock-v1`) | `Lease` (format `safebyok-lease-v1`) |
| | `localUnlockKey`, `makeLocalUnlockKey`, `local_unlock_key` | `leaseKey`, `makeLeaseKey`, `lease_key` |
| | `vault_key_local_wrapped` | `vault_key_lease_wrapped` |
| | `deviceDB.readUnlock / writeUnlock / eraseUnlock`, `UnlockExpectation` | `readLease / writeLease / eraseLease`, `LeaseExpectation` |
| | `rememberDevice`, `rememberedUnlock`, `takeUpUnlock` (internal) | `grantLease`, `takeUpLease`, `takeUpLease` |
| | `ForcePassphraseReentryHours`, `forcePassphraseReentryHours`, `MaxReentryHours` | `LeaseHours`, `leaseHours`, `MaxLeaseHours` |
| | `askPassphraseAt`, `ask_passphrase_at` | unchanged |
| vault | `VaultBundle`, `BundleIdentity`, `BundleExpectation`, `damaged_bundle` | `VaultProps`, `VaultIdentity`, `VaultPropsExpectation`, `damaged_vault` |
| | `readBundle`, `createBundle`, `updateBundle` | `readVaultProps`, `fetchOrCreateVaultProps`, `updateVaultProps` |
| | `eraseBox`, `eraseVault`, `eraseDamagedVault`, `EraseExpectation` | `retireBox`, `retireVault`, `retireDamagedVault`, `RetireExpectation` |
| | `vault.store`, `vault.read`, `vault.erase`, `vault.destroy` | `storeBox`, `readBox`, `retireBox`, `retire` |
| | `vault.use(boxlabel, callback)` | `useBox` |
| | `openVault(opts)`, `OpenVaultOpts` | `Vault.make(opts)` + `vault.hello()`, `MakeVaultOpts` (thread 8) |
| | `revision_id` | `revision_tok` |
| refusals | `absent_unlock`, `damaged_unlock`, `last_unlock`, `too_many_unlocks` | `absent_wayin`, `damaged_wayin`, `last_wayin`, `too_many_wayins` |
| | (new) | `created_elsewhere` |
| unchanged | `vault_id`, `device_id`, `boxlabel`, `vaultlabel`, `applabel`, `user_id`, `readBox`, `listBoxes`, `kind`, `key_deriver_label`, `KeyDeriver`, `whisper`, `lockbox`, `lockboxKey`, `vaultKey`, `DeviceDB`, `DeviceMark`, `seen`, every `*_epoch`, `lock_generation`, `lockSoon` | |

## Order

Threads 1 and 2 are independent and run together from `origin/main`. Threads 3 through 10
stack in one line on thread 2, since every rename rewrites `src/vault.ts`: 3 on 2, 4 on 3, and
so on. Thread 1 is documents only and joins the line wherever it is filed. Thread 10 is last.

---

Next thread: 1, `vocabulary`

Rewrite VOCABULARY.md for the reform. Keep its shape: the cast, each key by role, each
encrypted form, each stored record. Replace every retired word with its new one per the name
map in `whiteboard/20261018-reform/reform-preplan.md`, define `wayin`, `wayinKey`, `lease`,
`leaseKey`, `ctx` (with its prefixed forms), `sidecar`, `vaultProps`, `retire`, `Proof`, and
note the intended policy, a vault holding exactly one passphrase and at most one passkey, as
not yet landed. Add a short *Old names* table (old → new, one line each) at the end, marked to be
deleted at 1.0.0. Update STYLE.md where it names an old word (`Envelope.swak(...)` in its
star-import example, `bag` where it meant the public bag). No code changes. Do not describe the
prompt callback, the pantry, or the atomic create: they are not in this sprint.

Gloss: touches `VOCABULARY.md`, `STYLE.md`, `CLAUDE.md` (its *Conventions At A Glance* example
and its *Notable files* line). Depends on nothing. Size: small. Look-ahead: every later thread
reads it; a worker who finds the table lacks a name they need reports it, and the orchestrator
amends the file in the sprint PR. Model: the default.

---

Next thread: 2, `no_retry`

Remove the retry loop from `store()`. One attempt: read the box, seal, write with the versioned
expectation; a `stale_write` refusal catches up with storage once and is thrown, its message
saying that nothing was written, the vault now shows the box as storage holds it, and the app
may store again. Delete `retryStale`, `retryDelayMillis`, `MaxWriteAttempts`, the jitter, the
`'erased'` outcome and the `boxStood` bookkeeping: an erase elsewhere is simply a stale write.
Keep the damaged-box handling and the `clearsFirst` path exactly as they are. Keep `erase()`
unretried as it already is. Rewrite the `store()` doc block and the README's concurrency
paragraph; delete the tests that count attempts or time the waits and add one that proves a
stale store throws once, without waiting, with the snapshot caught up. Have a `sonnet` subagent
record in `notes/security.md` that the retry was removed and why (a lost write must be visible
in a secret store; the retry hid it and merged nothing).

Gloss: touches `packages/safebyok/src/vault.ts` (store, retryStale and friends), `README.md`,
`tests/vault.test.ts`, `notes/security.md`, a changeset. Depends on nothing. Size: medium.
Look-ahead: thread 7 renames `store` to `storeBox` over this code; thread 9 reuses the
`created_elsewhere` pattern of "one refusal, caught up". Model: the default.

---

Next thread: 3, `wayin`

Rename the envelope to the wayin, repo-wide, per the name map: types, the module and its file,
the `unlocks` list and snapshot field, `unlock_id`, `unlocklabel`, the method/kind words,
`UnlockProof` to `Proof`, `vault_key_wrapped` to `vault_key_wayin_wrapped`, `removeUnlock` to
`retireWayin`. Bump the vault format tag to `safebyok-vault-v3`. Rename the refusal kinds
`absent_unlock`, `damaged_unlock`, `last_unlock`, `too_many_unlocks` to their `_wayin(s)` forms,
with their messages and the README table. `addPassphrase`, `addPasskey` and `changePassphrase` keep their names: `storeWayin` and the
one-passphrase policy are deferred, so a vault still holds up to `MaxUnlocks` ways in. Leave `unlock()` and `lock()` as verbs: they stay.
Leave every `*_epoch` untouched, `unlock_epoch` included.

Gloss: touches core (`types.ts`, `envelope.ts`→`wayin.ts`, `vault.ts`, `vault-db.ts`,
`errors.ts`, `refusals.ts`), every adapter's record checks and fixtures, react (`VaultProvider`,
`PassphraseModal`, `PasskeyUnlockButton`), demos, e2e, README, `notes/`. Depends on 2. Size:
large, mechanical. Model: the default (the stored-format bump and the refusal messages need
judgment).

---

Next thread: 4, `ctx`

Rename every cipher binding to a context: `cipherBinding` → `cipherCtx`, `CipherBindingPart` →
`CipherCtxPart`, the `binding` parameters of `cipherBytes`, `decipherBytes`, `wrapKeyUnder`,
`unwrapKeyUnder` → `ctx`, `envelopeBinding` → `wayinCtx`, the lockbox's → `boxCtx`,
`localBinding` → `leaseCtx`. The bytes each produces are unchanged, byte for byte: add a test
that pins each context's output against a fixture so the rename proves it changed nothing.
Doc blocks say what a ctx is: the props and metadata the ciphertext's tag proves unchanged.

Gloss: touches `crypto.ts`, `wayin.ts`, `lockbox.ts`, `vault.ts`, their tests, `notes/`.
Depends on 3. Size: small. Model: `sonnet` is enough if the fixture test is written first.

---

Next thread: 5, `sidecar`

Rename the public bag to the sidecar: `PublicBag` → `Sidecar`, `public_json` → `sidecar_json`,
`store(..., { public })` → `{ sidecar }`, the `.public` field of a lockbox summary → `.sidecar`,
`publicJsonOf` and friends. Bump the lockbox format tag to `safebyok-lockbox-v5`. The sidecar
stays in `boxCtx` exactly as the bag was. README: the sidecar is the app's own plain data that
rides beside the whisper, authenticated but not encrypted.

Gloss: touches `lockbox.ts`, `types.ts`, `vault.ts`, `vault-db.ts`, every adapter's column or
field (`safebyok-postgres` `columns.ts` and `vault-tables.ts`, `safebyok-graphql` `fields.ts`
and schema, convex component schema), react `WhisperField`, demos, e2e. Depends on 4. Size:
medium. Model: the default.

---

Next thread: 6, `lease`

Rename the device unlock to the lease: `DeviceUnlock` → `Lease` with format
`safebyok-lease-v1`, `localUnlockKey`/`makeLocalUnlockKey`/`local_unlock_key` → `leaseKey`
forms, `vault_key_local_wrapped` → `vault_key_lease_wrapped`, the DeviceDB verbs
`readUnlock`/`writeUnlock`/`eraseUnlock` → `readLease`/`writeLease`/`eraseLease`,
`UnlockExpectation` → `LeaseExpectation`, the internals `rememberDevice`/`rememberedUnlock` →
`grantLease`/`takeUpLease`, and `forcePassphraseReentryHours` with its constants → `leaseHours`,
`LeaseHours`, `MaxLeaseHours`. `askPassphraseAt` and `ask_passphrase_at` keep their names. The
mark, `lock_generation`, `lockSoon()` and every lock timer are untouched. `safebyok-indexeddb`'s
store names follow.

Gloss: touches `types.ts`, `device-db.ts`, `crypto.ts`, `vault.ts`, `idb.ts`,
`safebyok-indexeddb`, react (`leaseHours` prop), README. Depends on 5. Size: medium. Model:
the default.

---

Next thread: 7, `vaultprops`

Rename the bundle to the vault's props and erase to retire, repo-wide: `VaultBundle` →
`VaultProps`, `BundleIdentity` → `VaultIdentity`, `BundleExpectation` → `VaultPropsExpectation`,
`damaged_bundle` → `damaged_vault`; the VaultDB verbs `readBundle`/`createBundle`/`updateBundle`
→ `readVaultProps`/`fetchOrCreateVaultProps`/`updateVaultProps` (the semantics of
`createBundle` are already fetch-or-create: the doc block now says so in those words);
`eraseBox`/`eraseVault`/`eraseDamagedVault`/`EraseExpectation` → `retireBox`/`retireVault`/
`retireDamagedVault`/`RetireExpectation`; on the vault, `store`/`read`/`erase`/`destroy` →
`storeBox`/`viewBox`/`retireBox`/`retire`; `revision_id` → `revision_tok` everywhere it is
stored, expected or compared. `retire` still means erased: no tombstone. Every adapter's
abstract methods and tests follow; the convex component's function names follow.

Gloss: touches everything that touches storage: core, all four adapters, react, demos, e2e,
README, `notes/security.md`. Depends on 6. Size: large, mechanical. Model: the default.

---

Next thread: 8, `make_hello`

Split `openVault(opts)` into `Vault.make(opts): Vault`, synchronous, which validates its options
and builds the handle, and `vault.hello(): Promise<void>`, which reads storage and the lease,
never prompts, and settles the snapshot to `absent`, `locked` or `unlocked`. `make` starts `hello`
itself, safely: `hello()` is memoised, so `make`'s call and any later call share one promise,
and a `hello` that failed may be called again. Its failure never surfaces as an unhandled
rejection: `make` attaches a catch that records the refusal in the snapshot as `trouble:
VaultError | null` (cleared by the next read that succeeds) with `syncing: false` and the state
still `opening`, and logs it through the host's logger. An app that wants the rejection awaits
`vault.hello()` itself; the React `VaultProvider` does, routing a misuse kind to the error
boundary and a condition to the snapshot. Every other method awaits `hello` as its first step,
so a call made before storage answered simply waits.

The memo resets exactly when the snapshot stops being trustworthy. In flight: every caller
shares the one promise. Rejected: the memo clears at once, so the next call reads afresh.
Resolved: the memo holds, and a later `hello` is a no-op, until a refresh fails (from the
subscription or inside a call, setting `trouble`), the vault shuts for untrusted storage
(`identity_revoked`, `rolled_back`, `newer_format`), or the vault is retired; each clears the
memo, and the next `hello` re-reads storage and the lease and clears `trouble` on success.
`lock()` and `lockSoon()` do not reset it; `close()` does not either, every later call being
`vault_closed`. `state` is always the last settled state, never regressed to `opening` by a
failure. Tests cover each reset and each non-reset. No prompt callback: the modal and
`unlock()` keep their shapes.

Gloss: touches `vault.ts` (the open path, `refresh`, `rememberedUnlock` now `takeUpLease`),
`index.ts`, react `vault-provider.tsx`, demos, e2e, README quick start. Depends on 7. Size:
medium. Model: the default.

---

Next thread: 9, `created_elsewhere`

Add the refusal kind `created_elsewhere`. When the first `unlock(passphrase)` on an absent vault
finds, from `fetchOrCreateVaultProps`, a vault with another `vault_id` than it drafted, and the
given passphrase does not open that vault, throw `created_elsewhere` instead of
`wrong_passphrase`: the message says a vault was just created for this label on another device,
and to enter the passphrase chosen there. The vault settles `locked` on the standing props
either way. The React `PassphraseModal` shows it as advice, not as a typo. README's refusals
table gains the row.

Gloss: touches `vault.ts` (`settleUnlock`), `errors.ts`, react `passphrase-modal.tsx`,
README, tests (two devices in `tests/vault.test.ts` via `localVaultDB`). Depends on 8. Size:
small. Model: `sonnet`.

---

Next thread: 10, `sweep`

Finish the reform. Grep the repo (excluding `whiteboard/` and `winboard/`) for every retired
word in the preplan's name map and remove what survived, including in `notes/`, `demos/`,
`e2e/` and fixtures. Rewrite the README's vocabulary and architecture sections in the new cast.
Delete VOCABULARY.md's *Old names* table only if the Coach says so in the sprint doc; otherwise
leave it marked for 1.0.0. Run `pnpm size:budget --write` and report every line that moved.
Have a `sonnet` subagent add a `notes/security.md` entry listing each stored-format tag that
changed and that no migration exists. One changeset summarising the sprint for the release note.

Gloss: touches docs and whatever the grep finds. Depends on 9. Size: small to medium. Model:
`sonnet`, with the grep list spelled out in the handoff.

---

## For the Coach

Ruled 2026-10-18: `damaged_vault` stays; `forcePassphraseReentryHours` → `leaseHours`; the
vault's read verb is `readBox`, matching `storeBox`, `retireBox` and the VaultDB's `readBox`;
`Vault.make` starts `hello` as thread 8 says; `UnlockProof` → `Proof`. Nothing waits on a
ruling before thread 3 starts.

## Deferred (talked about, not in this sprint)

* **Nominated for the sprint after this one: the proof function in the methods.** `unlock`,
  `readBox` and `storeBox` take, or are configured with, a callback that asks the user for a
  proof when the vault needs one, so the app sees the data as always there. Its consequences
  (a dismissed prompt, one prompt at a time, the create branch, the `vault_locked` kind) are
  the design work of that sprint.
* The one-passphrase, at-most-one-passkey policy with `storeWayin`/`retireWayin`, pulled from
  this sprint so its UX (six flows: create alone, create with a passkey in one ceremony and one
  write, add a passkey later under fresh proof, replace or retire the passkey, recover a lost
  passphrase by passkey, a device where the passkey is absent) can be designed without holding
  the renames up.
* The prompt callback (`reqWayinFunc`) and its consequences for `unlock`, `viewBox`, `storeBox`.
* The pantry: DeviceDB keeps its name and shape.
* Every epoch question, `unlock_epoch`'s name included; vaultKey rotation.
* A `revision_counter` on lockboxes (agreed as a good idea; it earns its keep only with a
  consumer, which is lockbox rollback detection).
* An atomic create that carries the first lockboxes (`fetchOrCreateVaultProps(props, boxes)`),
  which needs a transactional batch on every adapter and is impossible on S3 without the
  one-document shape.
* Domain separation in the contexts: adding the record's format tag and the field's name to
  each ctx. A construction change, so it gets its own thread with a security note.
* Writing the Postgres adapter's writes as stored functions the customer may replace (NOTYET).
* A device proving to the backend that it registered a wayin (a signing key in the pantry).
* Tombstones for `retire`: not controversial, just unproven. The one proof so far is a
  revision counter surviving a retire and re-create at the same label; it costs every adapter a
  tombstone filter on each list and read.

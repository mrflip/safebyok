# Thread refusal_kinds: the mechanical pass over the core's refusal kinds and throwers (2026-11-05)

Branch `20261105-refusal_kinds`, off main at fa7ff8e5. Plan: `whiteboard/20261102-newdesign/refusal-kinds-plan.md`
(base checkout). No code added: every change is a literal kind, a thrower line, a phrase, or a test assertion.

## Built

* **Step 1 (8414cbcf)**: the fifteen kinds culled from `refusals/errors.ts`; `corrupt_record` folded into `record_conflict`.
* **Step 2 (47b6b818)**: merges, renames and re-kinds per the plan's table; `damaged_record` is `damaged_row`.
  Kinds: 53 before, 38 after the cull, 34 after the merges.
* **Step 3**: no `src` site outside `refusals/` threw inline (the earlier passes had already made throwers of them),
  so 0 src sites converted; the test helpers' three (models-world.ts `demandFakeUnlocked`, `demandUnlocked`,
  `unsealStampedString`) now call `unlockFirst`, `lockedError`, `unopenedWhisper`. The literals inside throwers.ts
  (21 strings and templates, `NoErrorGiven` and `StorageTroubleMessage` among them) are named phrases in two new
  sections at the foot of phrases.ts, words unchanged; `StorageTroubleMessage` is `Phrases.StorageUnavailable`.
  Throwers: 73 before, 73 after; none added, merged or renamed.
* **Step 4**: the plan's rules text, verbatim, heads throwers.ts; errors.ts and phrases.ts point there.
* **Step 5**: the reviewers' note in `.claude/agents/thread-reviewer.md` and `style-reviewer.md`.
* **Step 6**: changeset `.changeset/20261105-refusal_kinds.md`, safebyok minor.

## Decisions: bad_record, invalid_input and bad_scope, site by site

Changed:
* SX's VaultDB argument groups (8 `Checkers('invalid_input')`) to `bad_option`: arguments handed in.
* `seqNotNext` (a put past seq + 1) to `bad_option`.
* DeviceDB's `leaseSparse`, `leaseRow`, `deviceRecord` (`bad_record`) to `bad_option`: parsed at `cache` and
  `cacheDeviceRecord`, on the way in.
* `leaseQuery` `bad_scope` to `bad_option`: a plain shape check of a DeviceDB argument.
* `VX.boxRecord`, `VX.vaultRecord`: the `refusingAs('bad_record')` relabel dropped, the base already `bad_option`
  (`listing.put`'s record, on the way in).
* `VX.vaultRow` (takeWorld, vault.ts) and `VX.boxesListed` (boxListing.hello) to `damaged_row`: rows storage answered.
* `Listing.#demandRecordOfScope` (listing.ts) spec `bad_record` to `record_conflict`. It is a `verifyConsistent`
  spec, not a throw site, so it gets no thrower (the coordinator's ruling 4a).
* `otherVaultTok` (storable.ts) and `otherVaultTokAtBirth` (listing.ts) to `record_conflict`, per the Coach's note on
  the first; the second is the same check (a record under a vault_tok other than the world's) and its phrase tells the
  same two stories (remade, or storage mixed two vaults), so it follows.
* `delOfOtherLife` (vault-listing.ts) `stale_write` to `vault_remade`: a literal.
* Package-bug guards to `unexpected_error`: vault.ts `listingExpected`, `#demandLease`'s spec, proving.ts
  `ProvingOfOtherVault` and `LeaseOfOtherVault` specs, crypto.ts `unboundCipherCtx` (its doc block follows).
* `noProofToUnlock` (`vault_locked`) and `proofMissing` (`unexpected_error`) to `bad_option`.

Unchanged, serving both directions or re-parsed internally (report):
* `VX.boxSparse`, `VX.vaultSparse` (`bad_record`): `sparseOf` in a listing's build of an answer, and the del of a
  caller's duck.
* GX wayin headers, `wayinRecord`, `passphraseWayinRecord`, `passkeyWayinRecord`, `gateEpoch`, `gateProps`; lease.ts's
  `leaseStamp`, `leaseRecord`: each parses a stored record and one we built.
* `SX.boxSparse` sits in a way-in group (now `bad_option`) but is also `.parse`d on the way out at vault-db-new.ts
  `listedBoxesOf` and shapes-storage.ts `boxTombstoneOf`; both follow a boxRow safeParse that passed, so neither can
  refuse.
* Nested-only relabels (am, revision, times, vaulted, sparseBase, liveness, tombstone; shapes-core's primitives and
  prfSalt): never the outer parse, so never thrown.
* `validator.ts`'s `bad_record` defaults (`Checker`, `objCheck`, `refuseAs`): defaults, not sites; `bad_record` stays.

`bad_scope`: CX's `bankScope`, `vaultScope`, `boxscope` (`Checkers('bad_scope')`) serve both a plain `.parse` and
`parseConsistent`, one validator, so unchanged. Plain-shape uses: passphrase-strength.ts:80, proving.ts:128, bank.ts:86.
Consistency uses: vault-listing.ts:53, box-listing.ts:38, bank.ts:112. Moved to `bad_option`: `leaseQuery` only.

`gate_issue` (vault-db-new.ts, four sites): ~206, ~219, ~233 are parameter validation (a gate verb's params carry the
wrong wayin); ~246 (registered_at not the stored one) is an integrity check against the stored row. Unchanged.

## Report, not adjusted

* Throwers that branch: `absentBox` (on `dbhas === null`, for `act`), `storeFailed` (on `thrownNameOf`),
  `weakPassphrase(reason)` (the host's text as message), `causeOf` and `unexpectedError` (default the cause).
* `damaged_record` is also a stored `damagekind` value (shapes-enums.ts `damagekindVals`) and `damaged_records` an
  answer field: stored and answered shapes, not refusal kinds, so not renamed.
* notes/guarantees.md names kinds this pass removed: G10 `unknown_key_deriver` (now `newer_format`), G4/G8
  `corrupt_record`, `crypto_failed`. Not edited here.
* The plan said `bad_whisper` had no site: shapes-core's `whisper`/`whisperBag` declared it, nested inside
  `bad_option` validators, so never thrown; they now say `bad_option`.
* `validator.ts`'s `demandConsistent` and `verifyConsistent` throw `new VaultError(kind, ...)` with the caller's kind:
  a thrower would have to take the kind as an argument, so they stay.
* `passphrase-strength.ts:85`'s `HostErrorSanitizer.refusalFor(err, 'unexpected_error', ...)`: the dead copy of
  proving.ts's guard (no src caller of `guardStrengthChecker`); reported, not changed (coordinator 4d).
* `tests/test-helpers/bank-world.ts:45` throws `new VaultError(this.#refusalkind, ...)`, the kind the test's choice:
  no thrower takes one, so it stays.
* `listing.ts:303` (`demandEnabled`) calls the existing `disabledError`; the Coach's note asks for
  `boxBecameDisabled` there. Untouched (no thrower renamed in this pass): for the gallant pass on labels.
* `bad_record` cannot be culled: validators serve both ways, and validator.ts defaults to it.
* A host's ensureUnlocked on a bank made without `requestCleartext` now refuses `bad_option`, not `vault_locked`
  (`noProofToUnlock`): the vault tests' world has no dialog, so a dozen assertions moved.

## Rework after the Coach's rulings (2026-11-05), paused by the Coach's change of orders

Done, a commit each: step 0 (rebased onto origin/main, pushed); 1 (a vaultDB verb's record, which safebyok
prepares, refuses `unexpected_error` by `recordPreparedWrong`, apart from its options at `bad_option`); 2
(`vault_mismatch` kept, `delOfOtherLife` on it too, `vault_remade` culled); 3 (`provingOfOtherVault`,
`leaseOfOtherVault`, `stampOfOtherVault`; `listingExpected` and `unboundCipherCtx` already had their own); 4
(`Bank.make` requires `requestCleartext`; `noProofToUnlock` and `noRequestCleartext` deleted, lint having flagged
both guards as no-overlap conditions; tests that ran with no dialog now close one unanswered and see `declined`).
The changeset carries 1-4. Kinds now: 34 (main has 53).

Not done, held by the Coach: 5 (stored `damagekind` `damaged_record` to `damaged_row`), 6 (guarantees.md kind
names), 7 (no code change: before-and-after to be discussed first), 8 (the count of parses on package-built values).

* The superseded bullet above, "ensureUnlocked on a bank made without `requestCleartext` now refuses `bad_option`",
  no longer holds: no bank can be made without one.
* VOCABULARY.md:118 still cites the culled `gate_moved`; not changed.
* Step 4's refinement (validation at boundaries only): `Bank.make` parses `bankOpts` and `VaultListing`'s
  constructor parses `vaultListingOpts` (vault-listing.ts:37), both already there. Bank.make is the host's
  boundary; whether VaultListing's is one (the bank builds it) is for the Coach. Untouched.

Step 7, the current code only (packages/safebyok/src/refusals/throwers.ts):

    22   const causeOf = (cause: unknown): unknown => cause ?? new Error(Phrases.NoErrorGiven)
    36   export const storageUnavailable = (cause: unknown, message: string = Phrases.StorageUnavailable): VaultError => (
    37     new VaultError('storage_unavailable', message, { cause: causeOf(cause) })
    44   export const unexpectedError = (thrown: unknown): VaultError => (
    45     new VaultError('unexpected_error', Phrases.UnexpectedError, { cause: thrown ?? new Error(Phrases.NothingThrown) })
    165  export const weakPassphrase = (reason: string): VaultError => new VaultError('weak_passphrase', reason)
    226  export const absentBox = (world: SX.VaultRow, dbhas: SX.BoxRow | null): VaultError => (
    227    new VaultError('absent_box', Phrases.AbsentBox, { meta: { act: (dbhas === null) ? 'void' : 'gone', world, dbhas } })
    256  export const storeFailed = (call: string, thrown: unknown): VaultError => {
    257    const thrownName = thrownNameOf(thrown)
    258    const named = (thrownName === null) ? '' : Phrases.storeThrew(thrownName)
    259    return new VaultError('storage_unavailable', Phrases.storeFailed(call, named))

## Resumed (2026-11-05): steps 5, 6 and 8

The pause was lifted except for two groups, which stay held and untouched: the five package-bug guards and their
throwers (step 3 stands as committed), and the throwers that carry logic (`absentBox`, `storeFailed`,
`weakPassphrase`, `unexpectedError`). `causeOf` was folded into `storageUnavailable` by the coordinator (9cef6543).
Rebased onto origin/main again (5766597c) with no conflict.

* Step 5: the `damagekind` value `damaged_record` is `damaged_row` (shapes-enums.ts, shapes-storage.ts
  `damagekindOf`). No vault is written with it: VaultDB computes it as it lists a row it sets aside, so a host sees
  it only in a listing's `damaged_records`. The changeset says so. **`damaged_records` should follow, as
  `damaged_rows`** (its own thread: the exported `BankListed`/`VaultListed` types, `boxListing.damaged_records`,
  VOCABULARY's `am` row); not renamed here.
* Step 6, observed, not guessed:
  * guarantees.md G4: a lease record whose key fails `isLeaseKey` now reads as `damaged_lease`. `Lease.buildFromCache`'s
    `leaseRecord` check tells it as bad news, and no lease is used. Before, it read as `corrupt_record`.
  * G8: `crypto_failed` is dropped twice, as it has no successor. **Reported, not amended**: G8 still says "a WebCrypto
    failure is caught and replaced". Lease.sealWith's `makeBoxKey` and `wrapKeyUnder`, and `buildGranted`'s
    `makeLeaseKey` and `wrapKeyUnder`, are not caught today, so their error passes as thrown. G8 also still names
    old-design sites (`Lease.cipheredWith`, `Proving.#unwrap`, `deviceTrouble`, `device-db.ts`, `types.ts`).
  * G10: `unknown_key_deriver` is now `newer_format`.
  * VOCABULARY.md:
    * gone: the `damaged_wayin` clause, both `vault_behind` sentences, and the `gate_moved` clause (no site);
    * renamed: `damaged_vault` is now `damaged_row`.
* `vault-listing.ts:37`'s `VX.vaultListingOpts.parse(opts)` stays as it is.
**Step 8: 20 validator parses in src run on a value safebyok itself just built or already checked**, so only a bug in safebyok can fail them. Each is either a *build* (a literal assembled from package-made parts, parsed) or a *pick* (a parse of `this` or of a value already parsed, to take some of its fields). By kind: 9 `bad_option`, 9 `bad_record`, 1 `bad_scope`, 1 `damaged_row`.

- `storage/vault-db-new.ts:399`: `SX.boxSparse.parse(parsed.data)`, a pick from a boxRow just parsed. `bad_option`.
- `shapes/shapes-storage.ts:285` (`boxTombstoneOf`): `boxSparse.parse(parsed.data)`, a pick from a boxRow just parsed. `bad_option`.
- `models/box.ts`:
  - `:84`: `VX.boxSparse.parse(record)`, a pick from a checked BoxRecord. `bad_record`.
  - `:188`: `VX.boxSparse.parse(base)`, a pick. `bad_record`.
  - `:191`: `VX.boxRecord.parse({ ...sparse, sidecar, box_key_wrapped, whisper_ciphered })`, a build. `bad_option`.
- `models/box-listing.ts:51`: `VX.boxesListed.parse(listed)`, which re-parses what `vault-listing.ts:95` parsed one call earlier (`vault.hello`). `damaged_row`.
- `models/gating.ts`:
  - `:182`: `passphraseWayinRecord.parse(nextWayin.pickle())`, a build. `bad_record`.
  - `:188`: `passkeyWayinRecord.parse(passkeyWayin.pickle())`, a build. `bad_record`.
- `models/proving.ts`:
  - `:84`: `vaultStamp.parse(friend)`, a pick from a friend parsed on the line above. `bad_option`.
  - `:127`: `vaultScope.parse(checked)`, a pick. `bad_scope`.
- `models/vault.ts:254`: `GX.vaultStamp.parse(this)`, a pick from itself. `bad_option`.
- `models/lease.ts`:
  - `:35`: `leaseStamp.parse(this)`, a pick from itself. `bad_record`.
  - `:43`: `leaseRecord.parse(record)`, in the private constructor; both callers pass a record already parsed. `bad_record`.
  - `:44`: `leaseStamp.parse(record)`, a pick. `bad_record`.
  - `:46`: `vaultStamp.parse(friend)`, a pick from a friend its callers parsed. `bad_option`.
  - `:69`: `vaultStamp.parse(checked.data)` and `vaultStamp.parse(friend)`, two picks. `bad_option`.
  - `:80`: `vaultStamp.parse(friend)`, a pick (the friend was parsed on line 79). `bad_option`.
  - `:84`: `leaseRecord.parse({ ...granted, lease_key, vault_key_lease_wrapped })`, a build. `bad_record`.
  - `:139`: `sealedWhisper.parse({ box_key_wrapped, whisper_ciphered })`, a build from WebCrypto's output. `bad_record`.

Not counted, though close:
- **Builds that hold the host's clock** (`world.clock.now()`), which a bad clock can fail:
  - `vault-listing.ts:64` (`vaultStamp`, `bad_option`);
  - `lease.ts:81` (`leaseStamp`, `bad_record`);
  - `proving.ts:175` and `:183` (the wayin headers, `bad_record`; these also hold the host's key deriver label or passkey answer).
- **Constructors fed both by a build and by a stored record**: `gate.ts:29` and `wayin.ts:38`.
- **The four `preparedOf` parses in VaultDB**: they run on records the core prepared, but VaultDB's verbs are exported.
- **Argument checks at internal model entries** (`leaseGrantedArgs`, `provingLeaseArgs`, `leaseSealArgs`, `gateMakeArgs` and their kin): these check a caller, not a value just built.

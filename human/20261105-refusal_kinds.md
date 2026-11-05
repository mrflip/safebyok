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

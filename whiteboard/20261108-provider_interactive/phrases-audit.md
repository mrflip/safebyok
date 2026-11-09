# Audit: phrases, preconditions, validators (2026-11-09)

Read-only audit of `packages/safebyok/src`, at the Coach's request. Line numbers as of `da182d4b0`, approximate. Nothing here has been changed yet, but for the five phrases under *Already deleted*.

## Dead refusals

**Already deleted:** `VaultChangedInStorage`, `HelloOptionsAdvice`, `EnsureUnlockedOptionsAdvice`, `RenewPastLease`, `DemandOptionsAdvice`. They carried the Coach's FIXMEs, and lint refuses a FIXME.

**Used by nothing (21 left), in `helpers/phrases.ts`:**

- Records and options: `GateEpochAndGate`, `leaseHoursShape`, `VaultDBShape`, `DeviceDBShape`
- Bank and vault: `VaultScopeAdvice`, `VaultGoneWhileOpening`, `OtherDatabasesThanListed`, `VaultBehindWhileOpening`, `VaultObjectGone`, `VaultBehind`
- Ways in: `PassphraseKept`, `NoPasskeyToRemove`, `PasskeyBeforePassphrase`, `ProvingBeforePassphrase`
- Lifecycle: `GateMoved`
- Boxes and bad news: `BoxAbsent`, `NoWhisperToKeep`, `VaultGoneWhileGettingBox`, `VaultDeletedWhilePuttingBox`, `BoxStoredDamaged`, `WayinStoredDamaged`

**Test-only** (`tests/helpers/phrases.test.ts`): `BankScopepathShape`, `VaultScopepathShape`, `LeaseScopepathShape`, `BoxScopepathShape`, `vaultFullOfBoxes`.

**Throwers:** none is dead. `proofMissing` has one call site, and it is unreachable (below).

**Throwers made outside `throwers.ts`:** `noFieldsBound` and `puttingVeiledFields` in `dom/box-fields.ts`.

## Preconditions a validator should replace

1. `models/gating.ts:222`, `if (! passkeyClear) { throw proofMissing() }`. Unreachable: the refine at `shapes-gateish.ts:297` has required one of the two. It exists for TypeScript narrowing; a discriminated parse output removes it and the thrower.
2. `checkSuppliedSpecKept`, `deriver/basederiver.ts:35`. Hand-written `if`s against a static table, same kind as `keyDeriverSpec`. Refines would retire `reservedLabel` and `suppliedSpecChanged`.
3. `saltBytesOf`, `models/proving.ts:261`. `prfSalt` already does this kind of decode refine. Moving it makes a bad salt a damaged row rather than a refusal at unlock.
4. `Box.demandPuttable`, `models/box.ts:236`. A rule relating two arguments, which STYLE says belongs in one parse with a refine.
5. `demandNextSeq`, `storage/vault-db.ts:521`, four call sites. Compares two caller arguments after two separate parses of the same call.
6. `if (! consistent(...)) throw` at `models/proving.ts:78`, `:86` and `models/vault.ts:340`. `verifyConsistent` says the same in one line; `:78` must keep its NOVEL case.
7. `cipherCtx`, `helpers/crypto.ts:68`. Could be a `Checker`. Lowest priority: crypto path.

Looked at, and they should stay: `scopeOf`/`sparseOf`/`recordOf` (implement abstract methods), `samePassphrase` (own correctable kind), `passphraseKeyOf` (zeroes in `finally`), `checkSecureContext` (environment).

## Validators swallowing Zod's message

**Guesses, or sentences that misdirect:**

1. `DatabaseInVaultScope`, `shapes-core.ts:167`. Says "go in the second bag, its options", but `bank.ensureVault(scope)` has no second bag; the vaultDB goes to `Bank.make`. Stale; the doc block repeats it.
2. `prfSaltNotFresh` on `prfSalt`, `shapes-core.ts:57`, also used for the stored field. Says "A new passkey answers over a fresh salt", which is wrong for a stored wayin. The check is decoded length only.
3. `TokenMissing`, `shapes-core.ts:42`. Says "A token is minted by safebyok", while the same `Checkers` doc says a host's adapter may write one by hand.
4. `BoxPatchAdvice`, advice at `models/box.ts:235`. Appended to every `boxPatch` failure, such as a bad `revision_tok`.
5. `InstantTooEarly`, `InstantTooLate`, `primitives.ts:62`. Add "likely epoch seconds" or "microseconds": a guess, labelled as one, and useful.

**Reworded with nothing added:** `labelTooLong`, `userIdTooLong`, `InstantNotWhole`, `PassphraseNotText` (which also loses Zod's "received number").

**Right sentence, wrong form:** `passphrase-strength.ts:81`, `safeParse` then `strengthCheckerMisanswered()`, which STYLE bans.

**Sentences not in `phrases.ts`:** 'Expected a Wayin' (`gate.ts:10`), 'Expected NOVEL or a proving' (`proving.ts:30`), 'Expected a CryptoKey' and 'Expected an extractable CryptoKey' (`shapes-gateish.ts:276,281`), `BlankVerdict` and `DefaultVerdict` reasons (`passphrase-strength.ts`).

## The Coach's FIXMEs

* `VaultChangedInStorage`, "is this current?": no. Nothing used it. A gate verb's stale row is now `staleWrite` at `vault-db.ts:344`.
* `HelloOptionsAdvice`, `EnsureUnlockedOptionsAdvice`, `DemandOptionsAdvice`, "thrown by a zod validator?": not thrown by anything. `hello()` and `ensureUnlocked()` take no arguments, and `demandConsistentWith` does not exist. `STYLE.md:249-251` still mentions it.
* `RenewPastLease`, "a parameter that means the opposite of what it says?": no such parameter in the new core. In the old design, `renewMinutes` was minutes before the lease ended, so a larger value asked sooner, which is the reverse of what "renew" suggests. `TODO.md:397-402` still describes it as current.

# Thread 29: vault phrases (2026-10-28)

Branch `20261028-vault_phrases`, PR #352, on main at 1f22111b. A follow-up the Coach approved after the sprint closed, ahead of the gripeoween_vault sprint's #340. Justify: green at the tip (safebyok 3499 passed, 37 skipped; every package green). Reviewed (medium); the reviewer's three commits and two of mine after it are on the branch.

* **Built**: each `VaultError` sentence still written inline in `packages/safebyok/src/vault.ts` moved into `packages/safebyok/src/phrases.ts`. That is 24 sentences, every one word for word, checked by script against the removed lines (by me for 21, and by the reviewer for those and its three). A sentence written in single quotes now has double quotes, as STYLE.md *Strings* asks for prose. They sit in five new sections after `[Bank and vault]`:
  * `[Vault: ways in]`: `PassphraseKept`, `NoPasskeyToRemove`, `PasskeyBeforePassphrase`, `ProvingBeforePassphrase` (the `absent_vault` from the proving demand), and `VaultChangedInStorage` (`#gatePutRefusal`'s `stale_write`).
  * `[Vault: lifecycle]`: `VaultLocked`, `VaultRemade`, `GateMoved`, `GatingLanded`.
  * `[Vault: options]` (the reviewer's, cfaa0fbc, with `RenewPastLease` moved in by dd0928a0, as it is a `bad_option` refusal of an `ensureUnlocked()` option): `HelloOptionsAdvice`, `EnsureUnlockedOptionsAdvice`, `RenewPastLease`, `DemandOptionsAdvice`.
  * `[Vault: boxes]`: `BoxAbsent`, `NoWhisperToKeep`, `BoxDamagedBeyondNaming`, `whisperTooLarge(maxWhisperBytes)`, `vaultFullOfBoxes(maxBoxes)`, `noRoomForBox(maxVaultBytes)` (parameters renamed by the reviewer, eab5765b), `VaultGoneWhileGettingBox` (`#boxGetRefusal`'s `vault_gone`, and the Vault object is gone), and `VaultDeletedWhilePuttingBox` (`putOver`'s `stale_write`, and the Vault object is not gone). That last was `VaultGoneWhilePuttingBox` until 1da6478c renamed it.
  * `[Vault: bad news]`: `BoxStoredDamaged`, `WayinStoredDamaged`, `BadNewsHandlerThrew`.

  Call sites changed only in their string argument. The local error builders (`lockedError`, `remadeError`, `absentBox`, `noWhisper` and the rest) stay in vault.ts over the phrases, as bank.ts's did in #319. `tests/phrases.test.ts`'s "names each limit it is given" test now covers the three new functions. The changeset is empty: phrases.ts is not exported, and no host sees a change.
* **Decisions taken**:
  * A constant is PascalCase, named for the condition. A sentence that names a limit is a lowerCamel function of that limit, like `labelTooLong`.
  * `VaultObjectGone` and `VaultBehind` stay in `[Bank and vault]`, where #319 put them.
  * The bad-news `VaultError`s (`damaged_box`, `damaged_wayin`, and the `bad_option` trouble from `#handlerThrew`) moved too. None is thrown, but each is a VaultError's message.
  * The `BoxDamaged` name was avoided because vault.ts already imports a type by that name.
* **Header**: phrases.ts's header said it held the bank's sentences and a Vault object's gone and behind ones. It now says it holds "the sentences of bank.ts's and vault.ts's own refusals and a vault's bad news (a refusal they pass on from another module, refusals.ts or gating.ts, keeps its words there)". The reviewer reworded it in 458bee01: mine had named refusals.ts alone, though vault.ts also throws gating.ts's `gateMadeElsewhereError`.
* **Left alone, on purpose**:
  * vault.ts's logger lines (`this.#logger.warn`/`log`/`error`, about eight). They are neither thrown nor a VaultError's message, and the handoff named only refusals.
  * `verdict.reason` (the strength checker's own text).
  * Sentences in other modules a Vault object passes on: gating.ts's `gateMadeElsewhereError`, refusals.ts, proving and wayin.
  * STYLE.md (thread 27's) says "Every sentence a check says lives in `phrases.ts`". That is still true, and does not mention the lifecycle refusals.
* **Left for #340 or a later wording pass** (review findings that predate this thread, which moves words and does not change them):
  * Two recoveries for one remade vault. `VaultDeletedWhilePuttingBox` says "Read the vault again (hello)", where `VaultGoneWhileGettingBox` and `VaultRemade` say `bank.ensureVault`.
  * `VaultChangedInStorage` says "Read the vault again" without naming the call.
  * `VaultGoneWhileGettingBox` nearly repeats `VaultObjectGone`, both `vault_gone` from the same object, so they can drift.
  * No test ties a builder to its phrase (that `lockedError()`'s message is `Phrases.VaultLocked`). The move was checked by script; such a test would only guard later drift.
* **For #340's rebase**: each hunk in vault.ts is one line, the string argument of a `new VaultError(...)`. A conflict resolves by keeping #340's line with the literal swapped for `Phrases.<Name>`. A sentence #340 rewords should be reworded in phrases.ts instead.
* **Secret material**: no moved sentence interpolates anything but the vault's configured limits (`maxWhisperBytes`, `maxBoxes`, `maxVaultBytes`).

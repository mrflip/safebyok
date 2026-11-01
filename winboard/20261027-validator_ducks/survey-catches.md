# Survey: catch sites and the call chains above them

Read-only survey of `packages/safebyok/src` at branch `20261027-validator_ducks` (2026-10-27). Every
line number is in that tree. Abbreviations: **oO** = `outcomeOf`, **AA** = `adapterAnswer`,
**#bO** = a class's `#badOutcome`, **dAW** = `vault.#demandAfterWait`, **heed** =
`RefusalPolicy.heed` (unwraps each VaultDB Outcome and throws its `err` once `#heedRefusal` has heard
it), **guarded** = `deviceTroubleAsConditions` (device-db.ts:193, itself a `deviceOutcomeOf`).

## 0. Summary and ranking

Most catches carry meaning: secret zeroing, damaged_* from storage, state cleanup, host-callback
guards that keep the passphrase out of errors, and the demand-after-wait ordering that the
consistency model requires. Few are pure duplication. These are the candidates, ranked by lines saved:

| # | Site | Verdict | Lines saved | What a host sees, before -> after |
|---|------|---------|-------------|-----------------------------------|
| 1 | vault-db.ts:875-890 `staleChecked`/`fullChecked` corrupt branches, :901 + :909 `unsaidVaultRecord` (+ doc lines in refusals.ts:58-60,76-78 and vault-db docs) | RELAX | ~12-15 | An adapter that throws `stale_write` with no `box_stored`/`vault_stored`, or `vault_full` with no capacity: `corrupt_record` -> the adapter's own `stale_write`/`vault_full`, its meta missing. Only a buggy adapter can get here, and the conformance suite (tests/test-helpers/vault-db-conformance.ts) catches that at dev time. The meta *checks* on what is present stay (box_stored and vault_stored are read back from storage). |
| 2 | Kind `invalid_box` end to end: vault-db.ts:416 `checked(BoxRecord, box, invalidBox)` + :923-924 `invalidBox`, vault.ts:1747-1749 the `invalid_box -> bad_record` branch, errors.ts kind/family/doc lines (~79-81, 114, 170) | RELAX (contract: needs a ruling) | ~12 | `VaultDB.putBox` handed a box this package would not build: `invalid_box` -> `bad_record` (as every other outgoing record already refuses). Via a vault this can only be our own bug: `Box.seal` already ran `checkedBoxRecord` (box.ts:370). |
| 2a | vault.ts:1747-1749 alone (keep the kind) | RELAX | 3 (+1 doc line at :1740, and errors.ts:80-81's "A vault reports the same as bad_record") | vault.putBox: `bad_record` "this is a bug" -> `invalid_box`. Both are misuse-family, and both are bug-only paths here. |
| 3 | vault-db.ts:949-951 `checkOutgoing` (a `bad_record` re-thrown as `bad_record` with a new message) | RELAX | ~6 (the helper, its `spared` param, and 6 call sites get shorter) | A host calling VaultDB directly with a malformed record or expectation: "Nothing was written: that vault record is not one this package builds..." -> the Validator's own `bad_record` message naming the failing field. From a vault this path is bug-only. |
| 4 | bank.ts:602-604 `#badOutcome` | REDUNDANT | ~5 | Identical: it is `outcomeOf`'s default `otherwise`. The five bank `tryX` bodies (220, 263, 278, 337, 375) become `return outcomeOf(async () => {...})`, line-neutral, and the helper goes. (Vault's `#badOutcome`, vault.ts:1805, is not redundant: it tells bad news.) |
| 5 | vault.ts:1491-1497 and 1514-1520: `Lease.make` try/catch in `#takeUpFromPantry`/`#takeUpAtBirth` | RELAX (refactor) | ~6 | Nothing changes for a host. A catch used as control flow: a non-throwing `Lease.makeOrNull`/`Lease.fits` check would replace two try/catches. Both handlers only warn, and must stay silent about the record. |
| 6 | proving.ts:528-536 `deriverThrewRefusal`: it keeps a condition-family kind thrown by a key deriver | QUESTION | ~4 | Deriver throws a condition VaultError (say `storage_unavailable` from a remote KDF): that kind -> `unexpected_error`. Decided by whether any deriver realistically throws a retryable condition. If none does, RELAX. |
| 7 | vault.ts:1360-1361 `#gateWriteRefusal`, last branch: a `stale_write` re-messaged only to drop its pointer to `meta.vault_stored` | QUESTION | 2 | "...Read the vault again before retrying." -> the VaultDB's `StaleVaultRecordMessage`, with `meta.vault_stored` (a checked vault record: wrapped keys and ciphertext) reaching the host through a Vault call. Decided by whether the Coach wants the stored record on a Vault refusal's meta. |
| 8 | lease.ts:187-195: the inner `outcomeOf` of the box-key sealing in `tryCipheredWith` | QUESTION | 2 | It only orders a bug-only crypto failure (wrapKey/encrypt under good keys) behind the post-wait demand. Without it, in a coincidence of bug plus vault moving on: `vault_gone` -> `unexpected_error`. The demand-after-wait rule says "a refusal included", so it stays unless the Coach exempts bug-only throws. |

Not recommended, though tempting:

* `readStoredVault` (vault-db.ts:1011-1018) keeps the kind (`damaged_vault -> damaged_vault`) but changes
  the message. Through a relay VaultDB it is the only thing that tells the user `delDamagedVault`
  removed nothing because the record cannot name its vault. Otherwise the user gets "delDamagedVault()
  clears it", from inside delDamagedVault. **KEEP.**
* `loadStrengthChecker`/`loadKeyDeriver` (passphrase-strength.ts:115, key-deriver-spec.ts:76) give
  the same kind (`unexpected_error`) and cause that `loadLibs`' `outcomeOf` default would give. They
  add only an actionable message for a realistic deploy failure (a chunk that will not fetch).
  **KEEP** (refusal-wording rule: specific, actionable).

## 1. Catch sites

Columns: site, enclosing function, catches, does, why.

### Boundary and utility guards

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| outcome.ts:47 | `outcomeOf` | any | VaultError as is, else `otherwise` (default `unexpected_error`) -> BadOutcome | the try-pair mechanism | KEEP |
| refusal-policy.ts:42 | `heed`/`heeding` | bad Outcome | awaits `onRefusal`, throws `err` | vault meets every storage refusal | KEEP |
| refusal-policy.ts:63 | `heard` | onRefusal throw | swallow | caller must hear the refusal itself | KEEP |
| device-db.ts:171 | `deviceOutcomeOf` | non-VaultError | `storage_blocked`/`storage_unavailable` with verb's message | device-store contract | KEEP |
| device-db.ts:193 | `guarded` | throw / non-Outcome / non-VaultError err | as above; non-Outcome -> `bad_option` | boundary on host's DeviceDB | KEEP (no-op over memory/idb stores, but a host's store is the reason) |
| vault-db.ts:852 | `adapterAnswer` | adapter hook throw | non-VaultError -> `storage_unavailable` | retry semantics vs `unexpected_error` | KEEP |
| vault-db.ts:709 | `startedWatch` | `doSubscribe` throw | -> `storage_unavailable` | as AA, for the sync hook | KEEP |
| vault-db.ts:718, :727 | `heedListener`, `heedRejection` | listener throw/reject | -> `listenerFailed` (log + reportToPlatform) | nobody to throw to | KEEP |
| vault-db.ts:569 | `subscribe`'s unsubscribe | adapter unsubscribe throw | log, swallow | teardown must not throw | KEEP |
| string-store.ts:35 | `callQuietly` | listener throw | log + report | nobody to throw to | KEEP |
| change-bell.ts:21 | `callEach` | listener throw | log + report | ditto | KEEP |
| logger.ts:136, :146 | `tell`, `dropRejection` | logger throw/reject | swallow | logging must not break the call | KEEP |
| report-error.ts:10 | `reportToPlatform` | reportError throw | swallow | last resort | KEEP |
| one-at-a-time.ts:21 | `runAlone` | (finally) | `running = null` | cleanup | KEEP |
| crypto.ts:47 | `fromB64OrNull` | base64 decode throw | null | predicate for salt shape (-> damaged_wayin, bad_option upstream) | KEEP |
| local-vault-db.ts:190 | `jsonOrText` | JSON.parse | return the text | damaged row reaches base-class checks (-> damaged_*) | KEEP |
| zxcvbn-strength-checker.ts:55 | `loadEstimator` | import failure | forget cached promise, rethrow | so the next hello retries | KEEP |

### Host callbacks that hear the passphrase (secret-leak prevention)

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| proving.ts:557 | `passphraseKeyOf` | deriver throw | `deriverThrewRefusal`: a condition kind is kept, else log + `unexpected_error`, no cause | the deriver heard the passphrase | KEEP (the kind-keeping branch: QUESTION, row 6) |
| proving.ts:567 | `passphraseKeyOf` | (finally) | zero key bytes | secret hygiene | KEEP |
| passphrase-strength.ts:96 | `guardStrengthChecker` | checker throw / throwing getter | `unexpected_error`, no cause | checker heard the passphrase | KEEP |
| vault-opts.ts:336 | `parseRequestCleartext` guard | dialog throw | log kind only, `unexpected_error`, no cause | dialog heard the passphrase | KEEP |
| vault-opts.ts:357 | `parseClock` | clock `now()` throw | `bad_option`, cause kept | boundary on a host callback (STYLE *Validation*) | KEEP |
| passphrase-strength.ts:115 | `loadStrengthChecker` | load throw | `unexpected_error` + actionable message | deploy failure is realistic | KEEP |
| key-deriver-spec.ts:76 | `loadKeyDeriver` | load throw | ditto | ditto | KEEP |

### Option and name prefixers (catch `bad_option`/`bad_scope`, re-throw the same kind with the call named)

| Site | Function | Verdict |
|------|----------|---------|
| idb-opts.ts:26 | `parseDbName` | KEEP (STYLE endorses: "a check of options catches its refusal only to prefix the call's name") |
| options.ts:21 | `optionsCheck` | KEEP |
| vault-opts.ts:174 | `checkMakeBankOpts` | KEEP |
| vault-opts.ts:186 | `checkBankVaultOpts` | KEEP |
| bank.ts:644 | `parseVaultBag` (`bad_scope`) | KEEP |

All five share one shape: `try { parse } catch { if (! isVaultError(err, K)) throw err; throw new
VaultError(K, prefix + err.message + suffix, meta) }`. A shared helper, or a message prefix
option on `Validator`, would save ~3 lines each (~12-15). That is a dedupe, not a removal; see §4.

### Box, lease, crypto (secret zeroing and damaged_*)

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| box.ts:267 | `Box.trySeal` | (oO default) | Outcome | try pair | KEEP |
| box.ts:274-289 | `Box.trySeal` | (finally) | zero whisper bytes | secret hygiene | KEEP |
| box.ts:313 | `tryExtractWhisper` | (oO default) | Outcome | try pair | KEEP |
| box.ts:320-326 | `tryExtractWhisper` | demand throw | zero deciphered bytes, rethrow | secret hygiene | KEEP |
| box.ts:328-334 | `tryExtractWhisper` | (finally) | zero bytes | secret hygiene | KEEP |
| box.ts:362 | `parseJsonOrNull` | JSON.parse | null, -> `damaged_box` at :331 | damaged box from storage | KEEP |
| lease.ts:179, :215, :246 | `tryCipheredWith`, `tryDecipherWith`, `trySealProps` | (oO default) | Outcome | try pairs | KEEP |
| lease.ts:181-197 | `tryCipheredWith` | (finally) | zero serialized | secret hygiene | KEEP |
| lease.ts:187 | `tryCipheredWith` inner oO | crypto throw | Outcome, thrown after the post-wait demand | demand-after-wait ordering | QUESTION (row 8) |
| lease.ts:223 | `tryDecipherWith` inner oO | WebCrypto OperationError | -> `damaged_box` (explicit refusal) | user-facing damaged_box | KEEP |
| lease.ts:227-232 | `tryDecipherWith` | demand throw | zero opened bytes, rethrow | secret hygiene | KEEP |
| lease.ts:261 | `#vaultKeyOrNull` | unwrap throw | null -> `#dropDamaged`: `damaged_lease` + `tryLock()` | a damaged lease locks and asks for a proof | KEEP |
| proving.ts:270 | `#unwrap` | unwrap throw | null -> demand -> `wrongProof()` (`wrong_passphrase`/`wrong_passkey`) | THE user-facing condition | KEEP |
| proving.ts:311-313, :382-384 | `PassphraseProving.seal`, `PasskeyProving.seal` | derive failure (oO default) | `demandAfterFailedSeal` then `valOf` | moved-on/landed refusal wins (consistency model) | KEEP |
| proving.ts:378-388 | `PasskeyProving.seal` | (finally) | zero PRF bytes | secret hygiene | KEEP |
| proving.ts:229-230 | `grantLease` | bad putLease Outcome | demand first, then `valOf` | a lock or decline meanwhile refuses as found | KEEP |

### VaultDB (vault-db.ts)

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| :273, :291, :307, :312, :331, :375, :414, :443, :465, :490, :530 | every public verb | (oO default) | non-VaultError -> `unexpected_error` | try-pair contract | KEEP |
| :937 | `checked` | `bad_record` from a schema | re-throw as `refused(...)`'s kind, cause kept | one schema, several kinds by direction | KEEP as mechanism; per use below |
| :971 via `checked` | `checkVaultRecord` | `bad_record` | `damaged_vault` | damaged row from storage | KEEP |
| :1041 via `checked` | `checkStoredBox` | `bad_record` | `damaged_box` | damaged row from storage | KEEP |
| :1060 via `checked` | `checkAnswer` | `bad_record` | `corrupt_record` (with "may have landed") | adapter answered off-protocol; says the write may have landed | KEEP |
| :949 via `checked` | `checkOutgoing` | `bad_record` | `bad_record`, new message | names what was spared | RELAX (row 3) |
| :416 via `checked` | `putBox` | `bad_record` | `invalid_box` | distinct kind for a direct caller | RELAX (row 2) |
| :865 | `withMissChecked` | `stale_write`, `vault_full` | check meta (`box_stored`, capacity), else `corrupt_record` | box_stored read back as a read is | KEEP the meta checks; RELAX the corrupt branches (row 1) |
| :897 | `withStaleVaultRecordChecked` | `stale_write` | check `vault_stored` via `checkVaultRecord` (-> `damaged_vault`/`newer_format`), else `corrupt_record` | vault_stored read back as a read is | KEEP the check; RELAX the corrupt branch (row 1) |
| :1012 | `readStoredVault` | relay's `damaged_vault` | `damaged_vault` "too damaged to name; nothing removed" | user-facing: delDamagedVault cannot act | KEEP |
| :1022 | `isSoundVaultRecord` | `damaged_vault` | false | catch used as a predicate | KEEP (or recast as safeParse + sameScope; ~3 lines, refactor only) |

### Gating (gating.ts)

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| :236-252 | `#run` | takeUp / host request throw | `#decline(badOutcome(err).err)` | a gating must settle; waiters hear why | KEEP |
| :261-265 | `#attempt` (check) | argument check throw | BadOutcome, gating left open | the dialog may correct it | KEEP |
| :268-276 | `#attempt` (chain) | chain throw | settle the gating unless `CorrectableKindVals` | the user can retry in the dialog | KEEP (logic in catch, but it is the user-facing contract) |
| :277 | `#attempt` | (finally) | `#attempting = false` | cleanup | KEEP |
| :408-409 | `#strengthUnder` | weak verdict (Outcome) | demand, landed check, then `valOf` | moved-on/landed wins over `weak_passphrase` | KEEP |
| :419-425 | `#grantAfterChange` | `grantLease` throw | device kinds: `ensureUnlocked` -> `unkeptUnlockError`, else warn + swallow; others rethrow | the change landed; do not refuse as though it did not | KEEP |

### Vault (vault.ts)

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| :290, :312, :354, :437, :468, :512, :542, :616, :651, :668, :710, :763 | every `tryX` | any | `#badOutcome` | try pair + bad news | KEEP |
| :1805 | `#badOutcome` | -- | non-VaultError -> `unexpected_error`; `#hearBadNews` | tells bad news; never logs (secret) | KEEP |
| :985 | `#readStorage` | `#takeStorage` throw | `#readRefused`, `#readAt = FarPast`, snapshot, rethrow | freshness state | KEEP |
| :1098 | `#raiseRecordAfter` | bad raise Outcome | warn, swallow | documented "never a refusal" | KEEP |
| :1128 | `#demandAfterWait` | untrusted-storage refusal | throw it as it came | heeding it moved the picture | KEEP |
| :1291-1296 | `#delVault` | heeded `delVault` (oO) | dAW then throw | consistency model | KEEP |
| :1306 | `#afterDel` | bad delLease Outcome | warn | deleted all the same | KEEP |
| :1326-1330 | `#putGate` | heeded `putVaultRecord` (oO) | dAW, `#gateWriteRefusal` | consistency model | KEEP |
| :1347-1358 | `#gateWriteRefusal` | `stale_write` with `vault_stored` | `vault_gone`/`vault_remade` + `#letGo`; `gate_made_elsewhere` + `#readAt`; else re-message `stale_write` | state + user-facing conditions | KEEP; last branch QUESTION (row 7) |
| :1404-1420 | `#heedRefusal` | (policy) | lock, revoke lease (warn on failure) | security | KEEP |
| :1491, :1514 | `#takeUpFromPantry`, `#takeUpAtBirth` | `Lease.make` throw (`corrupt_record`) | warn (nothing of the record), skip | key material; degrade to a prompt | KEEP behaviour; RELAX form (row 5) |
| :1626-1629 | `#readBox` | heeded `getBox` (oO) | dAW, `#boxReadRefusal` | consistency model | KEEP |
| :1645-1650 | `#boxReadRefusal` | `vault_mismatch` | `vault_gone` + `#letGo` | Vault object gone, as a refresh would find | KEEP |
| :1682-1685 | `#sealAndPutBox` | `#writeOver` (oO) | dAW then `valOf` | consistency model | KEEP |
| :1708-1712 | `#storedBase` | read Outcome | `damaged_box` + whisper given -> write over as new; else rethrow | user-facing remedy | KEEP |
| :1720-1724 | `#storedBase` | open Outcome | ditto | ditto | KEEP |
| :1744-1754 | `#writeOver` | heeded `putBox` throw | `invalid_box` -> `bad_record`; `vault_mismatch` -> `stale_write` | ... | `invalid_box` branch RELAX (row 2a); `vault_mismatch` QUESTION (§4) |
| :1787 | `#watchRefresh` | refresh throw | hear bad news, warn once, swallow | nobody to throw to | KEEP |
| :1833, :1843 | `#tellBadNews`, `#heedLateThrow` | host handler throw/reject | `#handlerThrew` (trouble, log, report) | handler must not break the call | KEEP |

### Bank (bank.ts)

| Site | Function | Catches | Does | Why | Verdict |
|------|----------|---------|------|-----|---------|
| :220, :263, :278, :337, :375 | `tryHello`, `tryEnsureVault`, `tryReopenVault`, `tryClearCachedVault`, `tryDelDamagedVault` | any | `#badOutcome` | try pair | KEEP the catch; the helper is REDUNDANT (row 4) |
| :379-385 | `tryDelDamagedVault` (inner) | `delDamagedVaultIn` throw | `stale_write` -> `#letGoOf`, rethrow | the listed refusal is stale; documented | KEEP |
| :509 | `#settleBirth` | `#bear` (oO default) | set view `refused`, tell bad news, throw | listing state + news | KEEP |
| :538-543 | `#bear` | `#bearFrom` throw | policy `lock` -> `#revokeLease`; rethrow | security: an untrusted birth revokes the lease | KEEP |
| :571 | `#revokeLease` | bad delLease Outcome | warn | the refusal is what the caller hears | KEEP |
| :602 | `#badOutcome` | -- | = oO default | -- | REDUNDANT (row 4) |
| :616 | `#tellBadNews` | onBadNews throw | log + report | handler must not break a birth | KEEP |
| :654-658 | `loadLibs` | both loads (oO default) | Outcome, checker's refusal first | parallel loads | KEEP |

## 2. Call chains

Read left to right, from the public entry down. Each layer says what it does with the error rising
through it. `->` means "calls".

**Box read.** `vault.tryGetBox` (#bO: news) -> `#getBoxUnlocked` -> `#readBox` (oO; dAW: moved-on
wins; `#boxReadRefusal`: `vault_mismatch -> vault_gone` + letGo) -> heed.getBox (onRefusal ->
`#heedRefusal`; throw) -> `VaultDB.getBox` (oO default) -> `checkStoredBox` (`checked`:
`bad_record -> damaged_box`) / AA(`doGetBox`: `-> storage_unavailable`).
*No layer maps twice.* `damaged_box` rises unchanged through heed, oO, dAW and #bO.

**Whisper.** `vault.tryGetWhisper` (#bO) -> as above, then `box.extractWhisper` = valOf(`tryExtractWhisper`
(oO; demand-catch zero; parseJsonOrNull -> `damaged_box`; finally zero) -> `lease.tryDecipherWith`
(oO; `#vaultKeyOrNull` -> `damaged_lease` + tryLock; inner oO(..., `damagedBox`); demand-catch zero)).
`useWhisper` -> valOf(`tryGetWhisper`).

**Box write.** `vault.tryPutBox` (#bO) -> `#sealAndPutBox` -> [`#storedBase` (oO(#readBox) + dAW;
`damaged_box` & whisper given -> new base; `tryExtractWhisper` + dAW, same)] -> `Box.trySeal` (oO;
finally zero) -> `lease.sealProps` = valOf(`trySealProps` (oO) -> valOf(`tryCipheredWith` (oO; finally
zero; inner oO sealing))) -> dAW -> oO(`#writeOver` (catch: `invalid_box -> bad_record`,
`vault_mismatch -> stale_write`)) -> heed.putBox -> `VaultDB.putBox` (oO; `checked(BoxRecord,
invalidBox)`; `withMissChecked` (`stale_write` box_stored checked / `corrupt_record`; `vault_full`
capacity checked / `corrupt_record`); AA(`doPutBox`); `checkWrittenBox` -> `corrupt_record`).
**Two layers of one chain fine-grain one bug-only failure:** Box.seal's `checkedBoxRecord`
(`bad_record`) -> VaultDB's `invalid_box` -> vault's `bad_record` again. Rows 2/2a.
**Three wrap/unwrap rounds without remapping** (trySealProps/tryCipheredWith/Box.trySeal).
They are harmless; they come from the try-pair rule.

**Box delete.** `vault.tryDelBox` (#bO) -> oO(heed.delBox) + dAW -> `VaultDB.delBox` (oO; `checkOutgoing`
`bad_record` re-message; AA; null -> `stale_write`; `checkAnswer` -> `corrupt_record`).

**Hello / refresh.** `vault.tryHello` / `tryRefresh` (#bO) -> `#helloWithin` -> `#refresh` (oneAtATime: finally) ->
`#readStorage` (catch: freshness state, rethrow) -> `#takeStorage` -> guarded deviceDB
(`deviceOutcomeOf`) / heed.getVault -> `VaultDB.getVault` (oO) -> `readVault` -> AA(`doGetVault`);
`checkAnswer` -> `corrupt_record`; `checkVaultRecord` (`newer_format`; `checked` -> `damaged_vault`).
The background `#watchRefresh` (catch: news, warn once, swallow) -> `#refresh` ... Birth: `Vault[bear]` ->
`#watchStorage` -> `VaultDB.subscribe` (`startedWatch` -> `storage_unavailable`; listener guards).

**Gatings.** `vault.tryEnsureUnlocked` / `tryPutWayin` / `tryDelWayin` / `tryDel` (#bO) -> `#ensureUnlocked`
/ `#gatingFor` (valOf(settled)) -> `RaisedGating.#run` (catch -> `#decline`) [-> host requestCleartext
via `parseRequestCleartext` guard (catch -> `unexpected_error`, no cause)] ; `#attempt` (check-catch
-> Outcome; chain-catch -> settle unless correctable; finally) -> chains:
`PassphraseProving.seal` (oO(`passphraseKeyOf` (catch -> `deriverThrewRefusal`; finally zero)) ->
`demandAfterFailedSeal` -> valOf); `PasskeyProving.seal` (finally zero; oO derive; same);
`proving.grantLease` (`#unwrap` catch -> `wrongProof`; putLease Outcome demanded, then valOf) <-
`#grantAfterChange` (catch: device kinds -> `unkeptUnlockError` | warn); `#strengthUnder` ->
`vault.tryCheckStrength` (#bO) -> `guardStrengthChecker` (catch -> `unexpected_error`);
`#putGate` (oO(heed.putVaultRecord) + dAW + `#gateWriteRefusal`) -> `VaultDB.putVaultRecord` (oO;
`checkOutgoing`; `withStaleVaultRecordChecked`; AA; `checkWrittenVaultRecord`); `#delVault`
(oO(heed.delVault) + dAW) -> `VaultDB.delVault` (oO; `checkOutgoing`; AA; `stale_write`;
`checkAnswer`); `#afterDel` (warn).
**Lock.** `vault.tryLock` (#bO) -> valOf(`#lockNow`) -> guarded `delLease`.

**Lease take-up.** `#ensureUnlocked` -> gating `#run` -> `tools.takeUp` -> `#takeUpFromPantry` (Lease.make
catch -> warn, false); birth -> `#takeUpAtBirth` (same).

**Bank birth.** `bank.tryEnsureVault` / `tryReopenVault` (#bO) -> `vaultPartsOf` (`checkBankVaultOpts`
prefix) / `#vaultScopeOf` (`parseVaultBag` prefix) -> `#ensureEntry` -> `#bearEntry` -> `#settleBirth`
(oO(#bear); view, news, throw) -> `#bear` (valOf(#initialize); catch: policy lock -> `#revokeLease`;
rethrow) -> `#bearFrom` -> guarded deviceDB / `VaultDB.ensureVault` (oO -> `ensuredVault`: `checkDraft`
-> `checkOutgoing`; AA; `checkAnswer`; `checkVaultRecord`) / `Vault[bear]` (-> startedWatch).

**Bank hello.** `bank.tryHello` (#bO) -> `#initialize` -> `#loadThenSettle` -> `loadLibs` (oO x2) ->
`loadStrengthChecker` (catch -> `unexpected_error`) -> zxcvbn `loadEstimator` (catch: forget, rethrow);
`loadKeyDeriver` (catch -> `unexpected_error`). `#initialize` resolves an Outcome. Its only throw
path is a bank listener throwing inside `#publish` (bank.ts:413-416, unguarded), which tryHello's
catch then meets.

**Damaged vault.** `bank.tryDelDamagedVault` (#bO; inner catch `stale_write` -> letGo, rethrow) /
`delDamagedVault` export (throws) -> `delDamagedVaultIn` -> `VaultDB.delDamagedVault` (oO;
`readStoredVault` (`damaged_vault` -> unnamed `damaged_vault`) -> AA(`doGetVault`); `checkAnswer`;
`isSoundVaultRecord` (catch -> false); `StoredVaultTok.safeParse` -> unnamed; `deletedVault`) /
guarded deviceDB.

**Options.** `Bank.make` -> `checkMakeBankOpts` (prefix), `parseClock` (catch -> `bad_option`),
`parseRequestCleartext`. `browserOpts` / `idbDeviceDB` / `inspectIdbDeviceDB` -> `parseDbName` (prefix).
`vault.hello` / `ensureUnlocked` / `putBox` / `demandConsistentWith`, `Box.seal` -> `optionsCheck`
(prefix).

## 3. Verdicts in brief

* **REDUNDANT:** bank `#badOutcome` (row 4). Nothing else is strictly redundant: every other catch
  either is the only layer that maps its error, or does state or secret work.
* **RELAX:** rows 1, 2 / 2a, 3, 5. All are bug-only or adapter-bug-only paths, where the kind or
  message is finer than any host branches on.
* **QUESTION:** rows 6, 7, 8; `#writeOver`'s `vault_mismatch -> stale_write` (§4); the unguarded bank
  `#publish` (§4).
* **KEEP:** everything else, for the reasons in §1's tables: damaged_* from storage, secret zeroing,
  host-callback guards that drop the passphrase, freshness and gating state, the demand-after-wait
  ordering, and nobody-to-throw-to listeners.

## 4. Also flagged

**Logic beyond aligning kind + context in a handler** (STYLE: handlers only align):

* vault-db.ts:865 `withMissChecked` / :897 `withStaleVaultRecordChecked`: each validates `meta`
  inside the catch. A stored record is checked there (`checkVaultRecord` can itself throw
  `damaged_vault`/`newer_format` from inside the handler), and `corrupt_record` is built when meta is
  missing. That is checking a storage boundary, which is legitimate, but it sits in a catch. A
  restructure (catch, then `return refusalChecked(err)` outside) would keep the handler pure. Row 1
  removes the `corrupt_record` part.
* proving.ts:528 `deriverThrewRefusal`: sifts the thrown value by family, and logs. Row 6.
* gating.ts:268-276 `#attempt`: branches on `CorrectableKindVals` to decide whether to settle. This
  is control flow on a refusal kind, and justified (the dialog contract).
* gating.ts:419-425 `#grantAfterChange`: branches on kind and call, warns or re-kinds. Justified:
  the change already landed.
* vault.ts:1347 `#gateWriteRefusal`, vault.ts:1645 `#boxReadRefusal`: refusal builders that also
  mutate state (`#letGo`, `#readAt`). Memory "handlers only align" says refusal builders set kind +
  context and never throw. These don't throw, but they do act. It is the only place the act can
  happen, so KEEP, but it is worth naming.

**A parse wrapped only to change the kind, where a Validator call of the right kind could do it:**

* vault-db.ts:416 `checked(BoxRecord, box, invalidBox)`: a `Validator('invalid_box', ...)` wrapping
  `BoxRecord`, or row 2's coarsening, would remove the wrapper. Unknown: whether `Validator` may
  re-wrap an already-wrapped schema.
* vault-db.ts:949 `checkOutgoing`: same kind in and out (row 3).
* The `damaged_*` uses of `checked` (:971, :1041) and `checkAnswer` (:1060) stay. One schema serves
  several kinds by direction, and STYLE names this catch-and-rethrow as the pattern for damaged_*.
* The five option/name prefixers (idb-opts.ts:26, options.ts:21, vault-opts.ts:174, :186,
  bank.ts:644): same kind, prefix only. STYLE endorses them, but they are five copies of one
  shape. A shared `prefixedParse(validator, kind, say)` saves ~12-15 lines.

**The same error caught and re-thrown at two layers of one chain:**

* Box write: `Box.seal` `checkedBoxRecord` (`bad_record`) -> `VaultDB.putBox` `invalid_box` ->
  `#writeOver` `bad_record`. This is one bug-only failure, checked twice and mapped twice (rows 2/2a).
* `vault_mismatch` is mapped differently per direction: `#boxReadRefusal` makes it `vault_gone` and
  lets the Vault object go; `#writeOver` makes it `stale_write` and lets nothing go. The vault.putBox
  doc promises `stale_write`, so this stays until the Coach rules. Unifying both on `vault_gone` +
  letGo would delete `#writeOver`'s branch and its try/catch (~6 lines) but changes a contract.
  QUESTION.
* Outcome -> throw -> Outcome: heed turns each VaultDB Outcome into a throw, and the vault re-wraps
  five of those calls in `outcomeOf` (vault.ts:721, :1291, :1326, :1626, :1682) to run dAW on them.
  It is line-neutral. A heed that hands back Outcomes (heard, not thrown) would drop one round, but
  this is structure, not a saving.
* Device stores: `guarded` over `memoryDeviceDB`/`idbDeviceDB`'s own `deviceOutcomeOf` is a no-op
  for in-tree stores. It is right for a host's store (the boundary belongs to the export).

**Seen in passing (not a catch):** bank.ts:413-416 `#publish` calls listeners with no guard, where
vault-db, string-store and change-bell all guard theirs. A throwing bank listener would surface as
the refusal of whatever bank call published (tryHello, a birth). QUESTION: guard it like the others,
or let it throw?

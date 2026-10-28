# Sprint catchsweep: progress (2026-10-27)

*Orchestrator:* the plan is `catchsweep-plan.md` beside this file; this file is newer wherever they
disagree. Thread 1 (#316) filed 2026-10-28 at `a4bbef6b`, rebased onto main (`f2af68e4`) after #311 and
#301 merged; every later thread meets the same catch-up rebase at its filing.

## The ground, from the audit (2026-10-27)

* ~99 `try` blocks under `packages/*/src`; no `.catch(`; one `.finally(`. Six cross-cutting
  translators exist: `outcomeOf`, `adapterAnswer`/`asStorageTrouble` (+ `startedWatch`), convex
  `refusing`, idb `withheldShelfOf`, postgres `sent`. The adapters add only narrow mappers.
* `deviceTrouble` (`device-db.ts`) and `unexpectedError` (`outcome.ts`) keep the raw throw as
  `cause`; the logger hands the error whole to the host's logger. `vault.ts` `#takeUpFromPantry`
  and `#takeUpAtBirth` already say nothing because the record holds key material.
* `proving.ts` `#unwrap` is a bare `catch` whose `try` holds `wayinCtxOf`; `lease.ts` maps every
  non-VaultError in its try to `damaged_box`, `#boxCtxOf` included.

## Rulings (2026-10-28)

* The throwing form owns the catch that fixes its refusals; the `try` form is one `outcomeOf` hop.
  Thread 2 applies it to the Lease and Box forms thread 1 made; thread 7 (new) to the Vault and Bank
  pairs. The passkey `SecurityError` branch stays.

## Rulings and requests (2026-10-28, later)

* The Coach: no operation is named `read` or `write`; `find` (first by criterion), `get` (by unique
  key), `ensure` (get, creating if absent), or the mutation's own verb. Thread 8 (`read_names`) in
  the plan carries the survey; `vault-db.ts`'s own `read`/`write` names are thread 3's.
* The Coach wants #316 and #317 as one mergeable line first: #317 is restacked onto #316 once it
  files; thread 2 then stands on #317. A large rename is coming on main; each thread meets it at
  its catch-up rebase.

## Discoveries by thread

* **Thread 1 (trythrow, #316):** the `try` form is `outcomeOf(() => this.x(...))`, one hop, not a
  written-out try/catch. `KeptLease.read` is `tryRead`; no throwing `read` exists (all three callers
  `valOf` after a `Promise.all` or a demand). The inner AEAD `outcomeOf` calls sit one indent level up,
  inside the throwing methods, exactly as they were. `notes/guarantees.md` names the methods holding
  the bodies (vaultKey/boxKey/whisper access points, G5, G6). Catch-up over #301: the `checked*`
  helpers in `lease.ts` and `box.ts` are gone; the bodies call `serializedBytes.parse`,
  `BoxSparse.parse`, `CipheredShape.parse`, `LeaseSealProps.parse`, `SealBoxProps.parse`,
  `MadeShape.parse`, `BoxRecord.parse` and `VaultOfBox` from `src/shapes/`.
* **Thread 6 (store_trynames, #321), filed 2026-10-28 at `53226d32`, restacked onto #324:** the catch-up over
  #301 moved the rename into `src/shapes/bank-opts.ts`: `vaultDBShape`/`deviceDBShape` name the try forms,
  so a host's hand-rolled VaultDB fake must carry `tryDelDamagedVault` (`Bank.make` refuses 'bad_option'
  without it; said in the PR body). `tests/vault/world.ts` `VaultDBVerbsUsed` gained it. `vault-races.test.ts`
  took main's expectation (the store's `invalid_box` passes through as itself). Restack with the
  316-317-324 line met three one-line conflicts (`KeptLease.tryRead` beside `tryEnsureVault`/`tryGetLease`),
  both sides taken. Earlier: every public `VaultDB` verb (`getVaultRecords`/`ensureVaultRecords`
  included, beyond the plan's list) and every `DeviceDB` verb is a try pair; bodies moved whole into the
  throwing form, `tryX = outcomeOf(() => this.X(...))`. ``DeviceVerb = Exclude<keyof DeviceDB, `try${string}`>``;
  `HeededVaultDB = Pick<VaultDB, HeededVerb | 'subscribe'>` (`Thrown<>` gone); `heed` calls the try forms.
  `ServedVaultDB` (graphql), `VaultDBVerbs` (`safebyok/testing`) and `vault-opts.ts`'s duck-type shapes
  name the try forms. `ProvingTools.putLease` is `tryPutLease` (pulled forward from *Not in this sprint*).
  The private helpers `readVault`/`ensuredVault`/`deletedVault` are still shared by two public verbs
  each (thread 3's ground). The `outcomeOf(() => this.#vaultDB.X(...))` rewraps in `vault.ts` stay:
  each feeds a `#demandAfterWait` before the answer is judged. *Orchestrator:* the DeviceDB throwing
  forms came out rejecting with the store's raw error (the mapping sat in `deviceOutcomeOf`, the try
  wrapper); by the Coach's ruling the worker is moving the mapping into each throwing body, one catch
  around the one `do*` call, before review. `KeptLease.read`'s store call is `deviceDB.tryGetLease(scope)`
  (thread 1 renamed the method `tryRead`: a small restack conflict in `lease.ts`).
* **Thread 5 (one_sanitizer, #324), ready 2026-10-28:** `Sanitizer.refusalFor(foreign, kind, message)` keeps
  its signature and is the one place a host function's throw becomes a refusal: `deriverThrewRefusal`
  (`proving.ts`), `guardStrengthChecker`'s catch (`passphrase-strength.ts`), `requestThrewRefusal`
  (`vault-opts.ts`, was `requestThrewError`), react's `adviceFailed`/`forBoundary`, convex's `refusing`.
  `notes/guarantees.md` names it under G8 and beneath the *Where the guarantees are kept* table;
  `guardRequestCleartext` replaces a stale `parseRequestCleartext` there. The react misuse-dialog test
  flaked once in threads 4, 5 and 6's justify runs; #320 (open) is its fix.
* **Thread 2 (aead_narrow, #325), ready 2026-10-28:** a module-private `refusalOf(thrown)` in `outcome.ts`
  (a VaultError as it came, else `unexpectedError`), not exported; the five Lease/Box throwing forms end
  `catch (err) { throw refusalOf(err) }`, the catch before any zeroing `finally`. `Lease.#openedOrNull`
  holds `unwrapKeyUnder` and `decipherBytes` each in its own catch. `deviceTrouble` carries no `cause`;
  36 tests flipped. Two declared deviations, rows for the Coach: no inner catch in the cipher body (a
  failing `wrapKeyUnder`/`cipherBytes` refuses `unexpected_error` before the post-wait demand); a vault
  stamp failing its check refuses `bad_record` from `cipheredWith`/`decipherWith` where
  `#vaultKeyOrNull` made it `damaged_lease` and locked the vault. **Thread 7's model**: `try { body }
  catch (err) { throw refusalOf(err) }`; for Vault/Bank the catch also tells bad news, so `refusalOf`
  sits inside their `#heardRefusal`-style helper; `vault.ts` `#badOutcome` (~l.1754) is the same
  expression. **Restack of #321 with #325**: thread 2's `device-db.ts` change is `deviceTrouble` alone
  (doc block and the two `new VaultError` calls); the `DeviceDB` class doc clause "that throw its
  `cause`" (l.22) is dropped by whichever lands second.
* **Thread 7 (vault_bank_flip, #327), ready 2026-10-28:** 12 Vault pairs (not 18) and 5 Bank pairs hold their
  bodies whole in the throwing form inside one `try`; the Vault's catch is `throw this.#heardRefusal(err)`
  (`#badOutcome` renamed; maps, tells the news once, rethrows), the Bank's `throw refusalOf(err)` (a
  module-private helper in `bank.ts`, since the Bank tells bad news at birth, not in a pair's catch); each
  `tryX` is `outcomeOf(() => this.X(...))`. `GatingTools.badOutcome` → `heardRefusal`, its three catches in
  `gating.ts` wrap in `bad()`. No test changed; empty changeset. Restack note: `refusalOf` exists twice
  (`bank.ts` here, `outcome.ts` in #325); fold by exporting `outcome.ts`'s from the module. Handoff
  corrections: the route handing `#badOutcome` out was `#gatingTools`, not `[provingTools]`.
* **Thread 4 (where_prefix, #317), filed 2026-10-28 at `9f8fa55b`:** the catch-up over #301 also retired
  `optionsRefusal` (`options.ts`), the helper #301 had lifted the options catch-rewrap into, converting its
  three further callers (`parseStaleMinutes`, `parseRenewMinutes` in `vault-opts.ts`, `localVaultDB` in
  `local-vault-db.ts`): nine sites. A check of options is now `schema.parse(opts, { where, advice })`,
  and STYLE.md *Validation* names `optionsCheck` and `readBankOpts`. Threads touching `vault-opts.ts`,
  `options.ts`, `local-vault-db.ts` or either `idb-opts.ts` (5, 8) meet this at their catch-up.
  Earlier: a validator's `parse` takes a saying, `parse(val, { where?,
  advice? })`, framed in `refusalOf`. Zod has no whole-message framing hook. `Refusing<SchemaT>` must
  stay `SchemaT & {...}`: `Omit<SchemaT, 'parse'>` breaks every place a validator is handed to a
  function typed on `Z.ZodType` (`vault-db.ts`). The two `idb-opts.ts` stay two files (no shared
  schema; `parseDbName` reaches no entry point). `parseDbName`'s `said` parameter is `callname` in
  both. Thread 5's `vault-opts.ts` edits (`requestThrewError`, l.348) are clear of thread 4's
  (l.163-175 and the import line).

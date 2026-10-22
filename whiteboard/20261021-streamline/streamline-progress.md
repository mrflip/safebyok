# streamline: progress

What the sprint's threads have taught, newest wins. Workers look things up here; the orchestrator
keeps it. Newer than the plan and the preplan wherever they disagree.

## Rulings in force

* **Row 1, a whisper asked before a lock (2026-10-22):** keep the current contract; a sync
  `checkUnlocked` inside each call's turn, with a TODO. No contract-level calls without a ruling.
* **Row 2, when a lease stops counting (the Coach's model, awaiting confirmation):** unlocked
  until a lock lands; the twilight only makes `ensureLease` prompt; expiry at `askPassphraseAt`.

Otherwise, until the Coach rules on an Open Matter, threads take its Rec (the plan, *Ground
rules* 3).

## Threads

| # | Label | Status | PR |
|---|---|---|---|
| 1 | renames | filed | #243 |
| 2 | get_vault | filed | #244 |
| 3 | turns | building | |
| 4 | bank | planned | |
| 5 | device_id | planned | |
| 6 | proving | planned | |
| 7 | gate | planned | |
| 8 | gating | planned | |
| 9 | react | planned | |
| 10 | docs | planned | |

## What the threads found

### Thread 1, renames (#243)

*Orchestrator:* every name is `vault_tok` / `gate_epoch` (`vaultTok`, `gateEpoch`,
`Expectations.vaultTokMeets`, `standingVaultTok`, `StoredVaultTok`). Convex `watchVault` answers
`{ vault_tok, gate_epoch, boxes }`; Postgres constraints are `..._vault_tok_key` and
`..._vault_tok_fkey`. ctx binds values positionally, not field names, so ctx bytes did not
change. VOCABULARY's rule: an `_id` is a hard identifier, a `_tok` is only compared. Postgres
tests run on PGlite locally; CI also has a live Postgres job; `SAFEBYOK_PG_URL` is unset in
this environment, so the live suites skip here.

### Thread 2, get_vault (#244)

*Orchestrator:*

* **Reads:** `vaultDB.getVault(scope)` and `vaultDB.ensureVault(scope, draft)` resolve
  `ListedVault` = `{ vaultProps, boxes }` from one consistent read. Servers use
  `getVaultRecords`/`ensureVaultRecords` (beside `listBoxRecords`).
* **Shapes:** `VaultProps` = `GatedVaultProps | GatelessVaultProps` (a `Z.union`); `isGated`
  narrows (not exported). Tests build a draft with `TH.gatelessOf(userId)`.
* **The first gate:** `putVaultProps(gated, { vault_tok, gate_epoch: 0 })`.
* **Stale writes:** a stale `putVaultProps` carries the winner as `err.meta.vault_props_stored`.
  `Refusals.staleVaultProps(standing)` replaced `staleWrite('vaultProps')`. The vault strips
  that meta from `putWayin`/`delWayin`'s rethrow (security note).
* **Interim, for thread 4 to replace:** gateless props read as `absent`, and a first unlock over
  gateless props made elsewhere refuses `created_elsewhere` (`gatelessElsewhereError`). Thread 4
  writes the first gate with `putVaultProps` expecting `gate_epoch: 0`.
* **Old verbs:** `ensureVaultProps` goes in thread 4. After it, `getVaultProps`, `listBoxes`,
  `listBoxRecords` and their `do*` hooks go, and `delDamagedVault` reads `doGetVault`.
* **The device mark:** its `gate_epoch` is positive-only, so a novel vault cannot be marked.
  Thread 4 raises no mark for a novel vault; thread 5 drops the epoch.
* **Postgres:** reads and ensures in one statement; an `ensureVault` that loses the insert race
  can return a listing lagging the props, never another vault's. Existing tables need
  `ALTER ... DROP NOT NULL` on `passphrase`.
* **Contract lines now untrue** are listed in `thread-2-get_vault.md` for thread 10.

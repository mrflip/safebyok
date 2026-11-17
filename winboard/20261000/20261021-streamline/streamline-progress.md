# streamline: progress

What the sprint's threads have taught, newest wins. Workers look things up here; the orchestrator
keeps it. Newer than the plan and the preplan wherever they disagree.

## Rulings in force

* **PAUSED (2026-10-22): lock() stays out of the line, writes are not serialized,** each write
  awaits unlock, at most one unlocking at a time, and work that passed `checkUnlocked()`
  completes or throws as it does. This replaces the preplan's *Turns*; the design that replaces
  it is open (`human/20261022-sprint_streamline_paused.md`).
* **Cancel declines this prompt only** (2026-10-22): it never locks an unlocked vault (thread 8).

* **Row 1, a whisper asked before a lock (2026-10-22):** keep the current contract; a sync
  `checkUnlocked` inside each call's turn, with a TODO. No contract-level calls without a ruling.
* **When a lease stops counting (confirmed 2026-10-22):** unlocked until a lock lands (`lock()`,
  the expiry at `askPassphraseAt`, or `checkUnlocked` finding the deadline passed); the twilight
  before `askPassphraseAt` only makes `ensureLease` prompt.
* **Consistency (2026-10-22):** no props/listing check in the core; the VaultDB checks server
  side, in its transaction, and reports `damaged_vault`; a missing adapter check is a TODO.
* **`putVaultProps` resolves the stored props** (2026-10-22): the new contract, built when first
  needed (thread 4).
* **Rollback (2026-10-22):** a `vault_epoch` counter, tombstoned vaults, a device refusing storage
  behind what it has seen, `clearCachedVault`: thread 5, rewritten, pending three rulings.
* **`ensureVault(draft)`**, one argument (2026-10-22; thread 4).
* **Tombstones** on `del()` and `delDamagedVault`, `clearCachedVault` with them (2026-10-22;
  thread 5).
* **Pull anticipated changes forward** (the plan, *Ground rules* 9).
* **Security notes:** the subagent may modernize an entry it touches; the Coach audits the file
  after the sprint, and no agent rewrites it.
* **vault_epoch moves on writes to the vault's core fields only** (2026-10-22); box rollback is
  toldjaso entry 1.
* **Wire meta:** over GraphQL, what a write's answer carries goes in the response body, never in
  error extensions (thread 11).
* **`streamlined-toldjaso.md`** in this directory lists every guarantee relaxed; a thread that
  relaxes one more reports it for the list.
* **No back-compat** for pre-rename vaults (confirmed); pending changesets stay as written.

Otherwise, until the Coach rules on an Open Matter, threads take its Rec (the plan, *Ground
rules* 3).

## Threads

| # | Label | Status | PR |
|---|---|---|---|
| 1 | renames | filed | #243 |
| 2 | get_vault | filed | #244 |
| 3 | turns | flagged, waits on a ruling | #245 |
| 4 | bank | planned | |
| 5 | vault_epoch | waits on rulings | |
| 6 | proving | planned | |
| 7 | gate | planned | |
| 8 | gating | planned | |
| 9 | react | planned | |
| 10 | docs | planned | |
| 11 | wire_meta | in review | #246 |

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

### Thread 3, turns (#245): flagged, waiting

*Orchestrator:* each call's work is one turn in a `p-limit(1)` queue (`p-limit` 7.3.3, no Node
built-in); `lock()`, `del()`, `close()`'s key drop and the expiry are turns. `hello` reads
`getVault` beside the lease, the mark and the strength checker's load in one round, judges,
commits, then erases a dropped lease and raises the mark (logged on failure). Props and their mark
are held together (`#held`). An attempt's turn refuses `vault_locked` when its prompt ended first,
off Ask's `promptOver` (thread 8 takes it over). The sync `#checkUnlocked()` sits in each turn
before the lease is used. Thread 3 moved `getVault`/`ensureVault`'s checks into module functions
(`foundVault`, `ensuredVault`) so `Object.create(vaultDB)` works; `byCodeUnit` is exported from
`vault-db.ts`. The review's significant finding (a hung storage call keeps the key and blocks the
lock) waits on the Coach.

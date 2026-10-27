# Thread 4: retire_standing (2026-10-27)

Branch `20261027-retire_standing`, PR pending, stacked on #298 (line main → #297 → #299 → #298 →
this). Justify: not yet run (single-file lint and per-package tests green while building).

The spec is `unstanding.md` in this folder, whole; its *Done when* grep is the check.

* **Built**: "standing" and "stands" no longer name anything in the code, doc blocks, READMEs,
  `VAULTDB.md`, VOCABULARY.md or TODO.md. Each meaning has its own word:
  - the row a VaultDB call compares or reads: **stored** (`storedVaultRecord`, `storedBox`,
    `storedRevision`, `storedText`, `storedBytes`, `StoredBoxSql`); the Expectations each take
    `stored`. Postgres: the CTE `standing` is `prior`, the aliases `stands` and `vault_stands` are
    `found` and `vault_found`.
  - the vault record in hand: **held** (`sealLeaseRecord(held, …)`, `#wayinsOf`, `#wayinListOf`,
    `grantLease`'s local, lease.test.ts's const; `badStanding` is `badHeld`).
  - a gating not yet settled: **pending** (vault.ts's locals, every "gating standing").
  - a lease not yet ended: **in force**; `standsBeside` is `leavesInForce`.
  - the Vault object not gone: `#checkStanding()` is `#demandNotGone()`, banner too.
  - `StandingGating` is `OutsideGating` (confirmed in no `src/index.ts` first).
  - tests: `boxesStanding` is `boxesStored` (e2e), `standingVault`/`inStanding` are
    `storedVault`/`expectedVault` (conformance), `StandingCases`/`StandingPropsCases` are
    `StoredBoxCases`/`StoredVaultRecordCases`.
  - gating.ts's `#freshGatedRecord` is `#freshenGated`, its `[Chains]` banner too (thread 2's
    review asked for it); `DeclinedWords`' `stands` field is `remains`.
  - `notes/old_vocabulary.md` has four rows for the retired names.
* **Decisions taken**:
  - Ordinary English stays: "stands for" (represents), "stand-in", "stands in for", "stands down",
    "notwithstanding", "where the bank stands" (its lifecycle, as VOCABULARY.md's *lifecycle*
    says it), "what it did stands" (a result remains valid). The grep's leftovers, 83 lines, are
    all these, plus every package's `eslint.config.mjs` ("stands guard"), out of scope.
  - "a vault that stands", in the sense of an existing vault with its passphrase, became "a vault
    that has its passphrase" (errors.ts, passphrase-strength.ts, README's error table).
  - The `@example`s on the expectation types say `vaultRecord.vault_tok`, as their neighbours do,
    not `held.`.
  - The refusal and log messages that said "stands" say "stored" (`StaleBoxMessage`,
    `StaleVaultRecordMessage`, `VaultMismatchMessage`, `goneError`, `remadeError`, `absentBox`,
    `noWhisper`, vault-db.ts's `corrupt_record` messages). No test asserted their text.
  - The adapters, e2e, demos and the core's tests were reworded by helper agents working to one
    brief, file sets disjoint; I reviewed their diffs and committed them.
* **Deviations**:
  - `fitsLease`'s parameter is `vaultRecord`, not the brief's `held`: two of its three callers
    hand it a record just read from storage (`fresh`, `next`), and `held` is already the lease at
    those call sites.
  - convex `vaults.ts`: beside the renamed `storedRow`, the row a write produced (was `stored`) is
    `written`, so the before-write and after-write rows do not read alike.
* **Discoveries**:
  - The pattern misses "stood"; a few "as it stood" remain where they are plain past tense.
  - Meanings 1 and 2 were hard to tell apart in three places: the expectation types' `@example`
    (what the writer holds, sent as what storage must still have); `#wayinListOf(fresh)` in
    `#takePicture` (a record just read, becoming the one in hand); convex's test fixture
    `storedVaultRecord`, which the test gates and then asserts is still stored.
* **For the Coach**: see the PR's open questions.

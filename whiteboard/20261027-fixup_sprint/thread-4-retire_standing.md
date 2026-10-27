# Thread 4: retire_standing (2026-10-27)

Branch `20261027-retire_standing`, PR #300, stacked on #298 (line main → #297 → #299 → #298 →
this). Justify: green at 7dbce2c5: core 3403 passed (37 skipped), convex 350, graphql 344,
postgres 322, react 309, demo 229, indexeddb 167, e2e 107, fastkey 49, scripts 266; size in budget.

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
  - `notes/security.md`: one `sonnet` subagent, as its header says, made about 78 rewordings in
    one pass. In the same pass it corrected two entries on `deviceOutcomeOf` (see *Discoveries*),
    said `isOutcomeShaped` has been removed, and trimmed thread 1's two `outcome_default`
    amendments from 10 and 8 lines to 7 and 6, still a little longer than their neighbours. It
    also dropped `standingPassphraseOf`, a name the code no longer has.
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
  - **`deviceOutcomeOf` is not gone.** It is off the exports, but it is still a module-private
    helper in `device-db.ts` (line 267), which the seven DeviceDB verbs call. The handoff said
    thread 3 removed it, and so does 599634c0's message. The security.md subagent checked the code
    and wrote what is built: off the exports, still a private helper.
  - The pattern misses "stood"; a few "as it stood" remain where they are plain past tense.
  - Meanings 1 and 2 were hard to tell apart in three places: the expectation types' `@example`
    (what the writer holds, sent as what storage must still have); `#wayinListOf(fresh)` in
    `#takePicture` (a record just read, becoming the one in hand); convex's test fixture
    `storedVaultRecord`, which the test gates and then asserts is still stored.
* **For the Coach** (the PR's open questions):
  - **security.md pass**: accept it; one line (around 565) now says "the Vault object is not gone
    after each wait", where the check may also include consistency. Worth a glance.
  - **`OutsideGating` to the test helpers?** Only tests use it. Rec: move it in a later thread.
  - **`fitsLease`'s `vaultRecord`**, not `held`: rec keep (see *Deviations*).
  - **Convex `written`**: rec keep.
  - **Empty changeset despite reworded refusal messages**: rec empty, as the brief says; `patch`
    if a message's wording counts as a change.
  - **`deviceOutcomeOf`**: nothing to change in code; the sprint's record should say it is only
    off the exports.

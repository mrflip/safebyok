# Thread 1: vault_size_cap (2026-10-15)

Branch `20261015-vault_size_cap`, PR [#34](https://github.com/mrflip/safebyok/pull/34), rebased onto `origin/main` after #27, #28 and
#29. Justify: green (safebyok 267, safebyok-convex 217, safebyok-react 7, demo 24, root 72).

* **Built**:
  - `VaultDB.maxVaultBytes` (abstract, documented for adapter authors in `vault-db.ts`):
    `convexVaultDB` 8 MiB (half of Convex's 16 MiB read budget, as erase reads twice);
    `idbVaultDB` and `localVaultDB` `Infinity`. The adapter suite checks each declares one, no
    smaller than its `maxRecordBytes`.
  - `OpenVaultOpts.maxLockboxes`, default `MaxLockboxes = 100` (exported from `types.ts` beside
    `MaxWhisperBytes`). `openVault` refuses as `bad_option` a pair that might not fit, naming
    `maxLockboxes`, `maxWhisperBytes`, the adapter's `maxVaultBytes` and how many lockboxes
    *would* fit (or that not one does); and an adapter that declares no `maxVaultBytes` or no
    `maxRecordBytes` (a JS adapter from before).
  - `store()` of a new boxlabel in a full vault refuses as `vault_full` (new kind, a condition);
    the message quotes no label. Replacing a standing box is never refused.
  - `VaultProvider` passes `maxLockboxes` through.
  - Tests: `tests/vault.test.ts` *the lockbox limit* (13 cases); per-adapter declarations; two
    Convex component tests that fill a vault past what the core admits and list, watch and erase
    it under convex-test's real 16 MiB read limit. Convex README rewritten; a `notes/security.md`
    line; a real changeset (minor, breaking for adapter authors).

* **Decisions taken**:
  - **Where the count comes from.** The snapshot's `boxes`, which every write's closing
    `refresh()` and every push from storage keep current, so a store costs no extra full-vault
    read (on Convex, listing reads every row). `readBox` (already done) decides new-or-replace
    authoritatively; the count excludes the boxlabel being stored. When the vault *looks* full,
    `ensureRoomFor` calls `refresh()` and recounts before refusing, so a refusal is always made
    on storage's current state. It sits right after `readBox` inside `store()`: thread 7's retry
    re-runs it per attempt, and a `stale_write`'s refresh feeds the recount.
  - **Devices storing at once can overshoot the cap** (each counts before the other's write
    lands). Accepted: the fit check reserves ample margin, and the overshoot is bounded by the
    number of concurrent writers. Recorded in `notes/security.md`.
  - `WhisperShareOfRecord` renamed `WhisperShareOfStorage` (internal), since it now governs both
    limits. The fit check and the record check moved into `ensureLimitsFit`, beside the option
    parsers, leaving the top of `openVault` three lines shorter for thread 2.

* **Deviations**:
  - **The fit check is not the plan's `maxLockboxes * maxWhisperBytes > maxVaultBytes`.** That
    check admits 207 lockboxes at the default whisper on Convex, which convex-test confirms
    cannot be erased (whisper bytes and stored bytes are different units: base64 adds a third,
    and each row carries ~0.7-1.7 KB of other fields). Built instead, by the pattern
    `maxWhisperBytes` already follows: `maxLockboxes * (maxWhisperBytes + 1 KiB) >
    maxVaultBytes / 2` refuses. The 1 KiB (`LockboxFieldsBytes`) is for tiny whispers: without
    it, 4096 lockboxes of 1 KiB whispers pass the check and cannot be erased (measured). The
    defaults still fit: 100 at 40444 needs 4,146,800 of 4,194,304 bytes. Most admitted on
    Convex: 101 at the default whisper, 1365 at 2 KiB, 4092 at 1 byte -- all three erase
    within budget (probes; the first two are now tests).

* **Review and rebase**: the reviewer's 095b116 widened the security note (stores running at
  once on one handle overshoot too). Of its findings I took the two cheap ones: an undeclared
  `maxRecordBytes` is now refused like an undeclared `maxVaultBytes` (NaN compared false), and
  "at most 0 lockboxes fit" became "not even one lockbox fits". The rebase over #29 (strict
  configs) took `| undefined` on both options and lifted the Convex test helpers to module scope.

* **Discoveries**:
  - convex-test enforces Convex's 16 MiB per-function read limit, so the component tests are a
    real measurement, not arithmetic.
  - TODO.md's *Error families* (on #26) should list `vault_full` as a condition, beside
    `whisper_too_large`. Not edited here: #26 owns TODO.md.
  - For thread 2: `OpenVaultOpts` gained `maxLockboxes` after `maxWhisperBytes`; option parsing
    is now `parseMaxWhisperBytes`, `parseMaxLockboxes`, `ensureLimitsFit(vaultDB, ...)`. The
    provider's destructure, `openOpts` and effect deps each gained `maxLockboxes` at the end.

* **For the Coach**:
  - YOLO calls to confirm or overturn: the adapter declares `maxVaultBytes` in bytes; the kind is
    `vault_full`; the fit check's share and 1 KiB allowance (above) in place of the plan's bare
    product.
  - Open questions (also in the PR): `maxVaultBytes` abstract (any third-party `VaultDB` must
    add it; the changeset says how) or defaulting to `Infinity` (gentler, but an adapter with a
    real limit could forget to say so); `vault_full` for TODO.md's *Error families*, as a
    condition; a server-side cap in the Convex component's `updateBox`, since the client cap is
    all that stands between a vault and one too large to erase.

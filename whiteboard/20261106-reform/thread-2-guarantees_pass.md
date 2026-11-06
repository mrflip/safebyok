# Thread 2: the guarantees pass for G8's stale names (2026-11-06)

Branch `20261106-guarantees_pass`, PR [#517](https://github.com/mrflip/safebyok/pull/517), off `main` 57f33ee9. Justify: green (safebyok 1827, safebyok-old 3537 + 37 skipped, react 326, scripts 302, every package; lint, types, build, size).

* **Built**: `notes/guarantees.md`, names and paths only, every guarantee G1-G10, the table, the
  host-function paragraph, *Bytes*, the secret values and the access points, checked against
  `packages/safebyok` on `main`; an amendment line in the head. The claims the code no longer bears
  stand as written and are listed, with the contradicting code by file:line, in
  [thread-2-findings.md](thread-2-findings.md) (the Coach, and whoever rewrites them, should read it).
  Changeset empty.
* **Decisions taken**:
  - *One rule per citation.* A name the core has, doing what the claim says, is cited in the core
    (`Proving.grantLease` to `buildLease`, `checkWayin` to `checkOpens`, `sealWayins` and
    `resealWayinFor` to `buildWayin`, `#unwrap` to `#unwrapVaultKey`, `wrappedWith` to `#wrapVaultKey`,
    `sealLeaseRecord` to `Lease.buildGranted`, `Lease.cipheredWith` / `decipherWith` / `#vaultKeyOrNull` /
    `#openedOrNull` to `sealWith` / `unsealWith` / `#vaultKey` / `#opened`, `deviceTrouble` to `storeFailed`,
    `idbDeviceDB.putLease` and `DeviceDB.putLease` to `DeviceDB.cache`, `isLeaseKey` to `shapes-gateish.ts`,
    `current === next` to `antePassphraseClear === nextPassphraseClear`, `vault.tryCheckStrength` (G9) to
    `Proving.checkStrength` and `invokeStrengthChecker`, and the tests to `tests/models/`,
    `tests/storage/`). A name with no counterpart doing the same stays verbatim and becomes a finding.
  - *The table's old-core rows* (proving, lease, gating, box) point at `packages/safebyok-old/src/`,
    where those files are: a path fix, since the table names them "the old core's six".
  - *Old-core clauses beside a models twin* (G1, G2, G6, the passkey chain) stay verbatim: renaming them
    to the core's names would make them false where the twin already says what the core does (G2's
    zeroing). They are finding F1.
  - *G8's WebCrypto sentence and its `refusalOf` tail, and the two `isSafelyAllZero` edits,* are #511's,
    verbatim, so that #511's restack meets identical text. The passkey chain's `isSafelyAllZero` sits in
    an old-core sentence (F1); kept for the restack all the same.
  - *Set aside*: rewriting the passphrase, whisper and leaseKey access chains from the core's code. That
    is new text, not a name; the gloss forbids it here. Recommended as a follow-up (F1).
* **Deviations**: none from the gloss. `storeFailed` is fenced (ground rule 3), and is cited as it stands.
* **Discoveries**:
  - `models/proving.ts` has no module header; G2's "(`proving.ts` header)" now cites the file, whose
    public methods return no wayinKey or vaultKey.
  - The tests the old guarantees cite all live on, unchanged, in `packages/safebyok-old/tests/`.
  - `refusalOf` (`refusals/outcome.ts`) has no caller in the core (F4).
* **For later threads**: G8 and *Where the guarantees are kept* cite the host guards as they stand:
  `deriveKeyBytes` / `keyDeriverThrew` (`models/proving.ts`), `invokeStrengthChecker`
  (`helpers/passphrase-strength.ts`), `Gating.#askHost` / `requestCleartextThrew` (`models/gating.ts`).
  Thread 7, wrapping the host functions once in Bank's constructor, moves all three, and should rewrite
  those sentences with F2. Thread 5, taking the clock out of the public options, should check G4's
  "Both go by the host's clock" sentence. No guarantee cites `parseLogger`.
* **For the Coach**: findings F1-F11, each with a recommendation, in
  [thread-2-findings.md](thread-2-findings.md).

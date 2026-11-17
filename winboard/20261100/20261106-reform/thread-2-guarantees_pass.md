# Thread 2: the guarantees pass for G8's stale names (2026-11-06)

Branch `20261106-guarantees_pass`, PR [#517](https://github.com/mrflip/safebyok/pull/517), off `main` 57f33ee9. Justify: green after the F12 amend (safebyok 1850, safebyok-old 3537 + 37 skipped, react 326, scripts 302, every package; lint, types, build, size).

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
    `vault.tryCheckStrength` (G9) to
    `Proving.checkStrength` and `invokeStrengthChecker`, and the tests to `tests/models/`,
    `tests/storage/`). A name with no counterpart doing the same stays verbatim and becomes a finding.
  - *The table's old-core rows* (proving, lease, gating, box) point at `packages/safebyok-old/src/`,
    where those files are: a path fix, since the table names them "the old core's six".
  - *Old-core clauses beside a models twin* (G1, G2, G6, the passkey chain) stay verbatim: renaming them
    to the core's names would make them false where the twin already says what the core does (G2's
    zeroing). They are finding F1.
  - *G8's WebCrypto sentence and the passkey chain's zero check* are #511's, verbatim, so that #511's
    restack meets identical text (corrected in both after review; see below).
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
* **After review** (the reviewer's comment on #517, the orchestrator's calls), one commit each:
  - #511 `ac7ecf8e9`: G8's route sentence says what the code does. A grant or a wayin runs inside the
    gating's `outcomeOf`; a seal's WebCrypto error reaches the host thrown from `putBox`, `box.put` and
    `putExposed`, and an `unexpected_error` only from their `try*` forms. The passkey chain's zero check is
    `passkeyAnswer`'s inline `reduce`, not `isSafelyAllZero` (private to `models/proving.ts`, passphraseKey
    bytes only). #511's changeset tells a host `putBox` can throw a DOMException as it came.
  - `360725479` carries those two sentences here word for word.
  - `06bafa49a` (F4) G8 names `outcomeOf`, the catch ending each Lease and Box `try*` form, for `refusalOf`.
  - `d017f7fe8` (F6) G9: the entry points export neither `Lease` nor `Proving`.
  - `418a31be2` (F7) open item 2: "not yet exported" struck.
  - `a66efc475` (F10) the ctx row: "for a wayin its `format`" dropped.
  - `794ff5481` G2 cites `tests/wayin.test.ts` as written again: the pass's swap to
    `tests/models/wayin.test.ts` named a file testing none of G2. Finding F12. F11 records the correction.
  - Amend, F12 (the Coach: "make it be well tested and refer to that"): `8d5c2e6a2` adds to
    `tests/models/proving.test.ts` *the ctx a wayin is wrapped under* (every stamp field, and a header's
    `device_id` and `registered_at`, keep a passphrase or passkey wayin shut through `buildStored`) and *a
    passkey proving's key* (HKDF info built in the test as stamp, purpose and header opens the wrap; another
    vault's stamp does not). Before, the core bound only `vault_tok`, and showed the HKDF info only through
    `wayinCtxOf` itself. Dropping the header from `wayinCtxOf` fails five. `e42662118` G2 cites them.
    The rule "a claim the code no longer bears is not rewritten" was read too strongly for a test citation.
  - `62f1874eb` (minor) G1's old-core sentence keeps `current === next` in `change_passphrase` verbatim; the
    pass had half renamed it. Still true of `packages/safebyok-old/src/gating.ts:370`.
  - `52bb27626` findings: F1 gains `Lease.cipheredWith`, `grantLease` (twice), `DeviceDB.getLease`, G1's
    comparison and the *Bytes* IndexedDB bullet; F2 names `guardStrengthChecker` among the old core's guards.
  - Read as the thread's rule, not the handoff's letter: G2's line restores the old citation verbatim and
    the findings file says it is a finding; no marker was written into `notes/guarantees.md`, as no other
    finding has one.

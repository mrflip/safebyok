# Thread 13: guarantees_models (2026-11-06)

Branch `20261106-guarantees_models`, PR #528, base main. Cut from #517's tip 0cbf038d7, since merged into main
(4e63ae760), so no rebase was needed. Justify: green at the F1 commit (safebyok 1998 tests, safebyok-old 3537 + 37
skipped).

* **Built**:
  * F3: `packages/safebyok/tests/helpers/validator.test.ts`, *every checker a shapes module exports*. A values
    sweep hands each refusing checker of `deriver/shapes.ts` and the five `shapes/` modules a marked value, whole,
    per field and one level down, and finds the marker in no refusal's message, stack, meta or cause. G8 now
    promises only that no refusal quotes a *value*, and cites the sweep. A key the host chose may still be named.
  * F9: G10 names `crypto.randomUUID`.
  * F8: G10 says where the supplied-label check lives (`checkSuppliedSpecKept`, reached only through
    `argon2idDeriver`). It also says a host's own deriver is checked by its interface (`keyDeriverShape`), not its
    parameters. No check was added.
  * G8's two leftovers are tidied. Its seal list now also names `box.put`, `putExposed`,
    `vault.boxListing.create` and `vault.sealStampedString`. Its WebCrypto list now names making a proving's key.
  * F1: the old core's clauses are struck from G1, G2, G4, G6 and G9. Struck likewise from the secret-values table,
    the four access chains (passphrase, passkey, leaseKey, whisper), the minimal path, the IndexedDB bullet, the
    files table, open item 1 and the header. Each is rewritten from `packages/safebyok/src` and cites the core's
    site and test by path and title. Where the core has no counterpart, the note says so: `vaultRecordHeldBy`, a
    whisper's sizing copy, `mask`, and an IndexedDB `DeviceDB`.
  * Second-review tidies: open item 2's "the core's `Box` of G6 holds no whisper" is struck. Item 2 is now item 1,
    since item 1 went. G9's friend sentence now says the published surface has no route for a host to hand a
    friend to `proving.buildLease`, as `Proving` is not exported.
* **Decisions taken**:
  * Clauses about `safebyok-react` stay, each marked "on the old core until the package moves". They describe a
    package outside the core that still ships, not the old core itself. The same goes for `safebyok-indexeddb` and
    fastkey's deriver.
  * The "In `src/models/`" qualifiers are dropped wherever the sentence was rewritten, since the whole note is the
    core now.
* **Deviations**:
  * *Where the guarantees are kept*: I touched more than the host-function lines here. The four `safebyok-old`
    rows are struck and the file count is restated. The host-function paragraph itself is untouched, for thread 7.
  * G8's host-guard sentence: the old-core names `deriverThrewRefusal`, `guardStrengthChecker` and
    `guardRequestCleartext` are replaced by the core's sites. Those are `deriveKeyBytes` (`keyDeriverThrew`),
    `invokeStrengthChecker` through `HostErrorSanitizer.refusalFor`, and `Gating.#askHost`
    (`requestCleartextThrew`). The old "(kind only, logged)" is dropped, because the core logs neither. Thread 7
    owns the rest of the sentence (F2).
* **Discoveries** (each is also in the PR's open questions):
  * Only `invokeStrengthChecker` calls `HostErrorSanitizer.refusalFor`. `deriveKeyBytes` and `Gating.#askHost`
    throw their own factories. The host-function paragraph under *Where the guarantees are kept* still says each
    guard hands what it caught to `refusalFor`. That paragraph is thread 7's, so I left it.
  * No test checks that `Lease.sealWith` and `unsealWith` zero their bytes. G6 now says so.
  * The core has no size check on a whisper, which the old core's `#checkWhisperFits` had.
  * The entry points export no Argon2id deriver (`argon2idDeriver`, `argon2idWebV1Deriver`), and no core test
    reaches `deriver/`. `TestDeriverNotice` names a deriver the host cannot import.
  * G8's WebCrypto list left out making a proving's key. It is now listed.
  * `passkeyAnswer`'s doc block (`shapes/shapes-gateish.ts`) still says the bytes are "zeroed by the proving sealed
    of it". In the core, the gating's `spendClears` zeroes them. Doc blocks are out of scope here, so I left it.
* **For the Coach**: the six discoveries above. None changes a guarantee's meaning, and each is a row.

What I looked up outside the handoff: only the thread-2 findings file, for the F-numbers.

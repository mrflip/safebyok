# Slop survey of whiteboard/20261013-relic/ (2026-10-14)

Commissioned per the Coach ("survey the relic files for slop, perhaps deploying a high-powered
agent"); run by a review agent against src/ and VOCABULARY.md before the rewrite. Condensed here
so the rewrite can be audited against it; line numbers refer to the files as they were before the
rewrite landed.

## High severity

1. **Recovery-kit machinery throughout** (outline: VaultBundle.recovery, RecoveryKit,
   create/unlock/revoke methods; README: deps and whole section) — ruled cut; done.
2. **Browser fetch examples missing the browser-access header** the prose itself admits is
   required: as written they fail CORS. Fixed in the rewrite (SDK `dangerouslyAllowBrowser` or
   the `anthropic-dangerous-direct-browser-access` header).
3. **`meta.note` used in every example but absent from LockboxMetaSchema** — moot: the built
   Lockbox has a single optional `note`, no service/hint.
4. **Three incompatible `findOrCreate` signatures** across the files; also its doc contradicted
   its own name ("does not initialize an absent vault"). Superseded by `openVault`.
5. **Invented classes**: RestVaultDB, BrowserDeviceDB, BrowserCryptoProvider existed nowhere.
   Cut; the real factories are `localVaultDB`, `memoryDeviceDB`, `idbVaultDB`, `idbDeviceDB`.
6. **React provider example had a stale-closure bug** (cleanup read mount-time state, so dispose
   never ran) and used `destroy()` to mean dispose — copying it would delete user data on
   unmount. The built surface splits `close()` (dispose) from `destroy()` (delete).
7. **Stored-field casing self-contradictory** (passphrase_epoch beside vaultId/createdAt);
   recovery sub-object had a field named `vaultKey` holding a *wrapped* vaultKey. Underbar_case
   and Wrapped-naming throughout now.
8. **WrongPassphrase vs IntegrityFailure overstated**: claimed a "separate trusted path" could
   distinguish them on the passphrase envelope; none exists. Real rule now documented: AEAD
   failure on the passphrase envelope reads as `wrong_passphrase`; failure on a lockbox under a
   known-good vaultKey is `corrupt_record`.

## Medium — design dead ends the built interface rejected

9. Schema registry + typed/dynamic store/use split → one untyped `Whisper`, plain verbs.
10. Principal machinery → absorbed by `VaultScope`; "principal" vocabulary dropped; two insights
    kept (AAD binds the user; Alice/Bob shared-browser motivation).
11. Five-state status union (+ a sixth state only one file had) and PascalCase error codes →
    four-state `VaultState` + snake_case `kind`s.
12. Method surface (initialize/refresh/list/remove/rotateLockbox/lock-options/status) →
    superseded wholesale; changePassphrase was the one missing verb worth building, and was.
13. Label grammar allowing `anthropic:personal` → every example label was invalid against the
    built `Label`; branded VaultLabel/BoxLabel types not adopted.
14. DeviceDB capability flags, active-principal marker, split key/cache records → one
    DeviceUnlock record, scope-keyed.
15. Invented `vaultManager.handleSignedOut()` / `destroyRemoteVault({ confirmation })` APIs →
    sign-out is `lock()` + `deviceDB.eraseAll()`; destruction is `destroy()`.
16. Install section taught apps to install safebyok's internals directly, under a wrong package name.

## Low — redundancy and padding

17. Key-hierarchy explanation appeared 4×; now once per document, VOCABULARY's diagram canonical.
18. "WASM-blocked browser" sentence 3× — moot entirely: the noble deriver needs no WASM.
19. Sign-out policy stated 3× in outline-with_user → once.
20. outline-with_user opened mid-conversation ("Not explicitly. ...") — rewritten with its
    question stated.
21. Generic padding (browser-support reassurances, provider-hygiene advice) cut; the honest
    limitations and the two real CSP facts kept.
22. Unused machinery (KeyBytesSchema; `allowExtractableDeviceCache`, whose name contradicted its
    own doc) cut.
23. "BYOKVault" naming throughout → safebyok / `Vault` / `openVault`. (The root README still says
    BYOKVault — fixed this thread.)
24. `isVaultError` was used but never defined → real helper documented.

## Overall

outline.md's crypto core (pinned spec, three-layer wrap, AAD binding, GCM-as-verifier) was sound
and survives as the design narrative; its method surface was rebuilt from src. outline-with_user
survives as two paragraphs (identity binding; preserve-don't-delete). proposed-README kept its
skeleton; every code sample was rewritten against the real API.

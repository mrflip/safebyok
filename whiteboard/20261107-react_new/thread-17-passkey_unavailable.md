# Thread 17: passkey_unavailable (2026-11-07)

Branch `20261107-passkey_unavailable`, PR #PRNUM, stacked on #583 (thread 13, `20261107-react_tidy`).
Justify: green (safebyok 2447 tests, safebyok-react 225; every package green).

* **Built**:
  * Core: a refusalkind `passkey_unavailable` in `refusalkindVals` (`refusals/errors.ts`), family
    `condition`, listed in the condition family's doc paragraph, and in `correctablekindVals`
    (`shapes/shapes-enums.ts`). The core never throws it, so it has no thrower and no phrase
    (phrases are per throw site, not per kind). Tests: `errors.test.ts`'s FamilyCases row,
    `index.test.ts`'s `correctablekindVals` list.
  * safebyok-react `passkey.ts`: every refusal that is not a passkey failing to unlock now says
    `passkey_unavailable`: no WebAuthn (`demandWebAuthn`), no PRF (`noPrf`, which also covers an
    answer for a credential not offered), and a browser failure (`askAuthenticator`'s fallthrough,
    `Messages.passkeyAskFailed`). Nothing in safebyok-react refuses `wrong_passkey` now; the
    module's head comment says so.
  * `Messages.noWebAuthn` and `Messages.noPrf` reworded for an end user (no "WebAuthn", no "PRF
    extension"); both name the passphrase as the way still open, and noPrf another device or key.
  * Tests: `passkey.test.ts`'s five assertions switched kind; `attempt-refusals.test.ts` gains a
    row (`passkey_unavailable` is shown in place). The button and add-passkey dialog already had
    tests showing `passkeyAskFailed` and `noPrf` in place; they pass unchanged, now through the new
    kind.
  * Ride-along (sprint Cleanup, #573 review): `host-error-sanitizer.test.ts` gains a case list for
    `HostErrorSanitizer.refusalFor` handed `undefined`, a bare string quoting a fake secret, and an
    object whose `message` and `name` getters throw.
  * One changeset, `.changeset/20261107-passkey_unavailable.md`, minor for safebyok and
    safebyok-react, saying a host matching `wrong_passkey` for these cases now sees
    `passkey_unavailable`.

* **Decisions taken**:
  * **Correctable.** `correctablekindVals` is "the refusals an attempt leaves its gating open
    under, for the user to try again", and safebyok-react's dialogs show exactly those in place
    (`InPlaceKinds`). The user's correction here is the other wayin (the passphrase) or another
    authenticator, in the same dialog; a non-correctable kind would flavor `close` and shut the
    dialog as `declined` while its message says "use your passphrase". In the core it changes no
    behaviour: no attempt can meet it, since the core never asks WebAuthn and every host function
    that could throw inside an attempt is replaced by a refusal of the core's own (G8), so G2's
    spending of PRF bytes is untouched.
  * **Condition, not misuse or bad news**: the app handles it at run time and it reaches the user.

* **Deviations**:
  * **The browser-failure case moved too.** The gloss named no WebAuthn and no PRF; I also moved
    `askAuthenticator`'s "the browser failed" refusal (any DOMException but NotAllowed, Abort and
    Security, or any other throw) off `wrong_passkey`, since it is no more the user's passkey's
    fault than the other two, and leaving it would keep `wrong_passkey` meaning two things. Reverting
    is one line in `passkey.ts`, one assertion in `passkey.test.ts` and a clause of the changeset.
    Open question below.

* **Discoveries**:
  * chai's `include({ cause: undefined })` asks for an own `cause` property; a VaultError without
    one fails it. Assert `refusal.cause` to be undefined on its own line.
  * `notes/design-models.md` and `notes/design-proof.md` tables list refusal kinds per operation;
    `passkey_unavailable` belongs to no core operation, so they are untouched. VOCABULARY.md lists
    no refusal kinds.

* **For the Coach**:
  * **Browser failure as passkey_unavailable** (the deviation above): keep, or put back to
    `wrong_passkey`? Rec: keep.

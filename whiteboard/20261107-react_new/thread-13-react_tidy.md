# Thread 13: react_tidy (2026-11-07)

Branch `20261107-react_tidy`, PR #TBD, cut from `origin/main` (a80589274). Justify: green
(safebyok-react 220 tests; every package green).

* **Built**:
  * `passkey.ts`: one module-level `Checkers('bad_option', ...)` call, `PasskeyChecks`, checks
    `createPasskey`'s options (strict: `rp.name`, `user.name` non-blank, `rp.id` non-blank if
    given, `displayName` any string, `timeout` a positive integer), `askPasskey`'s header and options
    in one parse (header: null, a passphrase header, or a passkey header with `credential_id` and a
    base64url `prf_salt_b64`, extras stripped; options strict), and `attemptOnce`'s
    `{ passkey: { prfBytes: bytes() }, attempt: fn() }`. Each parse is the export's first line,
    with a `where` story. `Checkers` comes from `safebyok/storage`, the one door that exports it.
  * `passkey-unlock-button.tsx`: `aria-disabled` in place of `disabled`, with a guard in `press`,
    so the button keeps the focus while the browser asks and Escape still reaches `ModalForm`.
  * `bank-provider.tsx`: `passkeyRpId` prop, forwarded to `GatingModal`.
  * `add-passkey-modal.tsx`: an empty passphrase field is met with `Messages.passphraseFirst`
    (new) and the focus on the field, before `createPasskey` (the Coach's ruling, folded in mid-thread).
  * Tests: sloppy-input case lists for `createPasskey` and `askPasskey`, `attemptOnce`'s refusals and
    one that a refusal quotes none of a malformed answer; the button's focusability; BankProvider's
    `passkeyRpId` reaching `navigator.credentials.get`; the add-passkey dialog's empty-field check.
  * VOCABULARY line 22; `.changeset/20261107-provider_handlers.md` names `onBadNews: null` and
    `requestCleartext: null`; TODO.md *Roadmapped* gets the void vault, and *A passkey made for a
    refused putWayin* notes the empty-field check. New changeset `20261107-react_tidy.md`.
* **Decisions taken**:
  * **Header salt `bad_option`, credential id still `bad_record`.** The core checks a stored passkey
    wayin's salt as 32 bytes of base64url as it reads the vault, so a gating's header always has a good
    salt: a bad one came from the host. It checks `credential_id` only as text, so a non-base64url one
    may be a damaged record: `credentialBytesOf` keeps refusing `bad_record`, and its test stands.
  * **`attemptOnce` checks only what it touches** (`prfBytes` as bytes, `attempt` a function), so any
    answer with bytes is still zeroed, and the gating's attempt judges the rest, as it did. The full
    `passkeyAnswer` checker is not exported from the core, and would refuse a used answer twice.
  * **Header `undefined` is refused**, not read as "no passkey": it is likelier a typo
    (`gating.passkeyheader`) than a vault without one.
  * **Parse before `demandWebAuthn`**, so misuse surfaces in a browser without WebAuthn too.
  * **aria-disabled over refocusing**: no effect or ref to time a refocus; the browser returns focus
    to the button after its prompt, which only works if the button never lost it. The test checks the
    button is not `disabled`, since jsdom keeps focus on a disabled button where browsers do not.
* **Deviations**: none. Doc blocks untouched but for BankProviderProps' "two" -> "three for its
  dialogs" and the new prop's line (thread 14 may meet that line).
* **Discoveries**: `Checkers` is reachable outside the core only through `safebyok/storage`; the
  size budgets did not move.
* **For the Coach**: the add-passkey dialog still leaves an unused passkey after a wrong (non-empty)
  passphrase; TODO's existing *A passkey made for a refused putWayin* holds that question.

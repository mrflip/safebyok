# Thread 17: confirm_passphrase (2026-10-24)

Branch `20261024-confirm_passphrase`, PR #TBD, stacked on #252, in the line main → #265 → #252 →
#this → #250. Justify: green (react 308, was 300; demo 227 + 17 skipped; core 3139 + 37 skipped).

From the Coach's "y" on the final review's finding 26: a typo in a new passphrase becomes the
vault's, and at a change it drops the passkey too, so the vault is lost once the lease ends.

* **Built**:
  * `packages/safebyok-react/src/modal.tsx`: `useConfirmation(setGripe)` (a ref, the live
    region's id, and `differs(chosen)`, asked at a submit before anything is attempted) and
    `ConfirmField`, a `new-password` `PassphraseField` with no advice. `PassphraseField` takes
    `invalidBy` (an id: sets `aria-invalid` and adds the id to `aria-describedby`). `ModalForm`
    takes `gripeId` for its `role="alert"` region. `Gripe` gains `mismatched?: true`.
  * `passphrase-modal.tsx`: for `initialize_gate` only, a confirmation field under the
    passphrase. A mismatch sets the gripe and returns: no `gating.attempt`, no key derived.
  * `gating-modal.tsx`: `change_passphrase` gets a confirmation under the new passphrase, the
    same check before `gating.attempt(current, next)`.
  * `messages.ts`: `confirmField` ('confirm vault passphrase'), `confirmNewField` ('confirm new
    passphrase'), and `passphrasesDiffer`: "The new passphrase and its confirmation don't match:
    type the same one in both." It names only the passphrase, so "Vault unlocker" does not apply.
  * README (*The passphrase field*, plus the `GatingModal` bullet), the doc blocks, the
    changeset (safebyok-react, minor), and budgets: BankProvider 9.3 → 9.6 kB, reactEverything
    9.7 → 10 kB (measured 6.26 → 6.54 kB and 6.66 → 6.94 kB).
  * Tests: `TH.typeNewPassphrase(passphrase, { fieldlabel?, confirming? })` in react's
    `tests/test-helpers.ts`. passphrase-modal 66 → 72 and gating-modal 42 → 44: a mismatch
    refused in place, attempting nothing; no key derived (a real vault stays novel, its
    `deriveKeyBytes` spy unasked); a match proceeds; the gripe is tied to the confirmation and
    goes once the user types; the strength check and advice hear the new passphrase only; the
    markup is uncontrolled and keeps typed text out; and unlock has no confirmation.
* **Decisions taken**:
  * The mismatch goes in the form's existing `role="alert"` gripe, as every in-place refusal
    does, and the confirmation field points at it through `aria-describedby` and
    `aria-invalid`. There is no second message region. Focus stays where it is.
  * Plain `===` on the two typed strings. Both are user input in the same page with no secret
    held against them, so there is no timing oracle and nothing for a cryptographic comparison
    to guard.
  * Both new fields keep `name="new-password"`: the form never submits natively, and two
    `new-password` fields is the pattern password managers know as "new + confirm".
  * The change form's confirmation clears the gripe on change but does not consult the advice.
* **Deviations**: none from the handoff. `tests/bank-provider/world.tsx` and
  `bank-provider-dialog.test.tsx` now import react's `TH` (`../test-helpers`) where they imported
  `safebyok/testing`, which is the one-`TH` rule in STYLE.md *Tests*. It re-exports the core's
  helpers, so nothing else changed.
* **Discoveries**:
  * The demo fills these dialogs in `tests/App.test.tsx`, `tests/components/WaysIn.test.tsx` and
    `tests/test-helpers.tsx` (`answerPassphraseDialog` fills a confirmation when one shows).
    Its README and `WaysIn.tsx` doc block now say the next passphrase is typed twice. e2e
    touches no dialog.
  * Ground rule 1: no test retired. Retitled: gating-modal's "is a change-password form a
    password manager knows: the username, the current passphrase, and the new one twice, in one
    form" (was "... the current passphrase and the new, in one form").
  * A host's own tests that fill `PassphraseModal` for a first passphrase, or the change dialog,
    must now fill the confirmation too. The changeset says so.
* **For the Coach**: the mismatch wording, the two field labels, and whether focus should move
  to the confirmation on a mismatch (it does not; the alert is announced).

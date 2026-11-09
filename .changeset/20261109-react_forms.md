---
"safebyok-react": minor
---

The bank alone closes a dialog: `onDone` is gone from `GatingModal`, each modal and `PasskeyUnlockButton`, and with it the `DialogAnswer` type. A host showing a modal from its own `requestCleartext` keeps the gating until `gating.whenConcluded`. Cancel and Escape call `gating.dismiss()`.

The dialogs are native `<dialog>` elements opened with `showModal()`, so Tab stays inside and the page behind is inert. The `modal-scrim` class is gone: style `.modal::backdrop`. A host's jsdom tests that show a dialog need a stand-in for `showModal` and `close`.

`react-dom` is now a peer dependency, for `useFormStatus`. The forms run on React form actions. The submit button says what it is doing and is disabled while an attempt runs, and until a new passphrase is strong and confirmed; a live line says whether the confirmation matches. React empties the fields after each attempt. A refusal stays shown until the next submit, marks its field `aria-invalid` and returns the focus to it. A shown passphrase is masked again at submit, a Caps Lock warning shows, passphrase fields are `required`, and the fields are named `current-password`, `new-password` and `confirm-password`.

A passkey answer that returns while an Activity hides its dialog is now tried, not zeroed: the user's press authorized it.

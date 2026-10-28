---
"safebyok-react": patch
---

A dialog now hears the answer to an attempt the user makes the moment it shows. PassphraseModal, GatingModal and PasskeyUnlockButton dropped the answer when the attempt settled before React had run the dialog's passive effects, which a busy page can put off: a refusal the vault returns at once (a misuse such as unknown_key_deriver, or a blank passphrase) showed nothing, and the dialog stayed up. Each now shows the refusal or closes as its contract says, however soon the attempt settles.

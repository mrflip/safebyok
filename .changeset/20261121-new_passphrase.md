---
---

safebyok-react-lean, private: the kit's CreateVaultForm and ReplacePassphraseForm keep their strength meter and confirmation through one hook, `useNewPassphrase`, which the kit now exports with its types `NewPassphrase` and `NewPassphraseFieldProps`, for a host's own new-passphrase form; `WhisperText` and `useDraft` show a whisper's field through one private hook, `useReveal`. The new core (`safebyok`, private): `Bank.birthGating`'s third argument is `attachBank`, and a gating whose cleartexts fail their check zeroes its own copies of the passkey answers as well as the host's. safebyok-big quotes `WhisperFieldAttributes`'s keys with `"`, which changes nothing it does. Nothing published changes.

---
---

safebyok-react-lean, private: the kit's CreateVaultForm and ReplacePassphraseForm keep their strength meter and confirmation through one private hook, `useNewPassphrase`, and `WhisperText` and `useDraft` show a whisper's field through one private hook, `useReveal`. Nothing a host sees changes, and nothing published changes.

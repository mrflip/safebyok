---
"safebyok-react": patch
---

**`createPasskey`, `askPasskey` and `attemptOnce` check what they are handed, and refuse misuse as `bad_option`.** A malformed `createPasskey` or `askPasskey` option (a misspelt field, a blank name, a `timeout` that is no positive whole number), a passkey header that is not one, or an answer without its bytes is refused before the browser is asked, where it used to reach the user as a passkey to try again. A passkey header whose salt is not base64url is refused `bad_option`; one whose `credential_id` is not base64url still refuses `bad_record`. `BankProvider` takes `passkeyRpId` and hands it to its dialogs. The passkey button stays focusable while the browser asks (`aria-disabled`), so Escape still reaches its dialog. The add-passkey dialog asks for the passphrase before the browser makes a passkey, rather than leaving an unused one behind when the field is empty. **Stored format:** unchanged.

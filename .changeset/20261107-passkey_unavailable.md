---
"safebyok": minor
"safebyok-react": minor
---

safebyok adds the refusalkind passkey_unavailable, a condition and correctable (in correctablekindVals): no passkey answer is to be had in this browser. safebyok-react's createPasskey and askPasskey now refuse it, not wrong_passkey, when the browser offers no WebAuthn, the authenticator no PRF, or the browser fails to ask; a host matching wrong_passkey for those cases sees passkey_unavailable instead, and wrong_passkey now means only a passkey whose answer did not unlock the vault. The words for no WebAuthn and no PRF are plainer.

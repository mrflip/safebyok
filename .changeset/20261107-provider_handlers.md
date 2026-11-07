---
"safebyok-react": patch
---

**`BankProvider` refuses a handler that is no function again, and an inline `onPanic` no longer remakes the bank.** An `onBadNews`, `onPanic` or `requestCleartext` that is no function reaches `Bank.make` as given and is thrown to the error boundary as `bad_option`. `onPanic` is held as `onBadNews` is, so writing it inline at each render no longer sweeps the bank and closes an open dialog; with none given, a vault whose lease survived its erase is vacated, as the core does. A panic from a bank the provider has let go goes to the platform's `reportError`, never to the next user's handler. A `logger`, `keyDeriver`, `strengthChecker`, `vaultDB` or `deviceDB` that changes identity between renders is warned of once through the bank's logger. **Stored format:** unchanged.

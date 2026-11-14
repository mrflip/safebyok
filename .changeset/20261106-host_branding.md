---
"safebyok-big": minor
---

**A bank holds each host function wrapped, once, from `Bank.make`.** A host still passes `requestCleartext`, `onPanic`, `keyDeriver` and `strengthChecker` to `Bank.make` as before; the bank now holds `askUser` (true once the dialog closes, false if it threw; it never throws) and `panic` (false when there is no `onPanic`) in place of `requestCleartext` and `onPanic`, and `keyDeriver` and `strengthChecker` as checked wraps of the host's. The new types `AskUser`, `Panic`, `PanicHandler`, `BadNewsHandler`, `GuardedKeyDeriver` and `GuardedStrengthChecker` are exported. **A `keyDeriver` whose `load()` fails** now refuses `bank.hello()` as 'unexpected_error', with what it threw as the cause, as a failed `strengthChecker.load()` already did. **Stored format:** unchanged.

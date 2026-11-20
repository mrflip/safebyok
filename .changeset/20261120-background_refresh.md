---
---

Empty: the new `safebyok` is private, and `safebyok-big` is untouched. What a caller of the new core will see: **`minder.backgroundRefresh(scope, opts)`** replaces `minder.refresh`. It gets a car in the background unless it is timely and returns at once. It throws nothing and tells no one of a refusal, misuse included: a refusal from the vaultDB shows as `lastErr` in the next `minder.tryAt`. Its `opts` are `{ staleTime }`. `silenceErrors` and the type **`MinderRefreshOpts`** are gone, and `minder.refresh` no longer tells a refusal to the bank's bad news. `vault.withWhisper` calls it, so an `unexpected_error` met by its early get is no longer sent to the device's `onBadNews` either. **Stored format:** unchanged.

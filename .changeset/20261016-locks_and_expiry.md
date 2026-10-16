---
"safebyok": minor
"safebyok-react": minor
---

**Renamed: every `Ms` is now `Millis`.** `ForeverMs` is `ForeverMillis`, and a vault's `reentryWindowMs` is its `reentryWindowMillis`. Rename them where your app reads them. New exports: `MinuteMillis`, and `MaxReentryHours` (588).

**The unlock window has a hard edge.** `forcePassphraseReentryHours` takes a number of hours up to 588 (24.5 days), or `Infinity` for "until `lock()`"; a finite number past 588 is now refused with `bad_option`, where it used to be clamped. From `askPassphraseAt` no new work starts, and a minute later a timer drops the vaultKey, with no call needed; a timer that runs late is caught at the next call. The timer is `unref`'d, so it never keeps a Node or Bun process alive. Compare `askPassphraseAt` (and `reentryWindowMillis`) against `FarFuture - MinuteMillis` (`ForeverMillis - MinuteMillis`) to say "until locked", never for equality.

**The window renews whenever the user types a passphrase and it proves**: `changePassphrase()`, and `addPassphrase()`, `addPasskey()` or `removeUnlock()` with a passphrase as proof, start it again from then, as `unlock()` does. A passkey proving such a change keeps the deadline that stands. Reads, stores and refreshes never move it. A window that runs out while an `unlock()` or `changePassphrase()` is under way is no lock: the call ends unlocked, with a window of its own. `lockSoon()` on a key already past its deadline gets no more than the minute it had left.

**A lock in one tab now defeats an unlock under way in another.** The device mark gains `lock_generation`, raised by `lock()`, `lockSoon()` and a sign-out's lock; an unlock writes its remembered record only while the mark stands where it found it. Its format moves to `safebyok-mark-v2`. For a host's own `DeviceDB`: `writeUnlock(unlock, expected)` now takes an `UnlockExpectation` and refuses with `stale_write` when the scope's mark stands at another `lock_generation`, and `writeMark` keeps the higher `lock_generation` of the mark it replaces; the `describeDeviceDB` battery in `safebyok/testing` checks both. A device mark written before this reads as none: the device starts its rollback check again from what storage holds now, once, and says so through the logger's `warn`.

**`close()` is not a lock**: an unlock under way when the handle closes leaves the record it wrote, and the next open picks it up. **A device store that fails while `openVault` reads the remembered unlock** now rejects with kind `storage_unavailable`, the store's error as its cause, so `VaultProvider` shows it in `openError` with a retry, not the error boundary.

---
"safebyok": minor
"safebyok-react": minor
---

**The bank's handlers hear a bag, and their defaults are exported.** `onBadNews` hears `{ news, bank }` where it heard the refusal alone, and `onPanic` hears `{ refusal, vault }` where it heard the refusal alone. Left out, they are `DefaultOnBadNews`, which tells the bank's logger, and `DefaultOnPanic`, which reports to the platform; both are exported, so a host's own handler can call them. The exported `BadNews` type is new, and `GuardedPanicHandler` is how a bank keeps its `onPanic`.

**BankProvider no longer runs autolock.** It set a one-minute timer to call `bank.autolock()`; the right cadence is hours or days, and the host's to choose. Call `bank.autolock()` on a schedule of your own, as the core README says.

**BankProvider makes a fresh bank for each signed-in user and device.** It finds this device's `device_id` in the `deviceDB` before it makes the bank, and hands down no bank meanwhile, as before. It makes the bank before the browser paints, sweeps it when the user signs out, and never reuses a swept bank. After a revoked identity, `DefaultOnPanic` vacates the bank and it stays spent: sign the user out, or in again, and the provider makes another.

**safebyok-react needs React 19.2 or later**, for `useEffectEvent`: its peer range is `^19.2.0`.

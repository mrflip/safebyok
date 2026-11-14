---
"safebyok-big": minor
"safebyok-react": minor
---

**`DefaultOnPanic` also logs.** It tells the bank's logger of each panic at error, with the refusal's message, its `refusalkind` and `call: 'Bank.onPanic'`, as well as handing the refusal to the platform's `reportError`, so a panic in Node or during SSR, where there is no `reportError`, is no longer lost. A disabled bank's panics are logged the same way.

**A vacate forgets the bank's row in the deviceDB.** `bank.vacate()` now erases this bank's bank row too, after its leases, so the next `deviceDB.ensureBank` for that user and app mints a new `device_id`, as on a fresh device; a sweep leaves the row. A bank row the vacate cannot erase reaches the host's `onPanic`, as a lease it cannot erase does. **`DeviceDB` gains `forgetBank(scope)` and `tryForgetBank(scope)`**, and the protected hook `doForgetBank(scope)`, which a host's own `DeviceDB` subclass must now write: it removes whatever row is stored at that bank scope, in one step. `MemoryDeviceDB` and `IdbDeviceDB` write it.

**`bank.tellBadNews`, `vault.tellBadNews` and `bank.askUser` are no longer public.** The bank hands them, with its panic, to its vault listing and each vault as a `BankFriend`, so the `Vault` constructor's fourth argument is now a `BankFriend` where it was a `BankPanic`; the new exported type `BankFriend` names it. To hand a refusal of your own to an `onBadNews` the way the bank does, awaiting nothing and sending the handler's throw to the platform, call the new export `tellBadNewsTo(onBadNews, bank, badnews)`. safebyok-react's provider, hooks and vault controls tell the host's latest `onBadNews` through it, and tell it nothing once the bank is swept or vacated.

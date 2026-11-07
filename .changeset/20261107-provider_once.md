---
"safebyok-react": minor
---

**`BankProvider` takes no `device_id`, and makes its bank once per `applabel` and `user_id`.** Before making a bank, the provider asks its `deviceDB` for the device_id it keeps for that scope (`deviceDB.ensureBank`), minting a random one the first time; drop the `device_id` prop. Every other prop is read as the bank is made: a later change to one is ignored, and said once through the bank's logger. The handlers (`onBadNews`, `onPanic`, `requestCleartext`) are still called as last rendered; an `onBadNews` or `onPanic` dropped after the bank is made leaves the one it was made with in place, and one given only later is ignored. To make a fresh bank, give the `<BankProvider>` a new `key`. A refusal from `ensureBank` reaches the nearest error boundary, as a refused `Bank.make` does, and so does a `deviceDB` that is no DeviceDB, refused `bad_option`. **Stored format:** unchanged.

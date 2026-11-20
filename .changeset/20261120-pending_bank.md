---
---

Empty: the new `safebyok` is private, and the giver is on no entry of `safebyok-react`. What a caller of the new core will see: **`device.getSnapshot().bank`** is never null: until the device holds a bank it is the new export **`PendingBank`** (stage `'starting'`, locked), and `DeviceSnapshot.bank` is typed `BankSnapshot`. The giver imports `PendingBank` from `safebyok` instead of defining it. **Stored format:** unchanged.

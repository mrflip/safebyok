---
---

Empty: the new `safebyok` and `safebyok-react-lean` are private, and nothing published changes. A caller of the new core now births a bank with `device.birthGating(cleartexts)`, which hands the device the bank it births; `device.adoptBornBank` is gone. `Bank.birth` and `device.birthGating` refuse `disabled` until the device's `hello` answers, and `Bank.birthGating` takes the bank's keeper as a third argument. **Stored format:** unchanged.

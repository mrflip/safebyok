---
---

Empty, as the new `safebyok` is private. What a host of `safebyok` will see:

- The new core names the user `userid` wherever a host meets it, as its Things already do. A host passes `{ userid, banklabel, device_tok }` to `Device.make`, and a record naming the user `user_id` instead refuses `bad_option`. `DeviceRecord` is that record's type, no longer big's device row picked.
- `device.userid` replaces `device.user_id`, and a device's `toJSON` carries `userid`. `device.scope` is the new core's `BankScope`, `{ userid, banklabel }`.
- A gating exposes `userid` in place of `user_id`. `gating.scope` is `{ userid, banklabel }`, and its snapshot (`toJSON`, `GatingSnapshot`) carries `userid`.
- `Bank.mintStamps(scope)` and `Proving.judgeStrength(device, scope, passphraseCleartext)` (`safebyok/core`) take `{ userid, banklabel }`.
- Nothing stored changes: a Thing, a wayin and a lease already named the user `userid`, and a device's record is not stored by the new core.

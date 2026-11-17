---
---

Empty, as the new `safebyok` is private. What a host of `safebyok` will see:

- The new core names the user `userid` wherever a host meets it, as its Things already do. A host passes `{ userid, banklabel, device_tok }` to `Device.make`. `DeviceRecord` is that record's type, no longer big's device row picked.
- A device record refuses any key it does not define as `bad_option`: a record naming the user `user_id`, instead of `userid` or beside it, refuses.
- `device.userid` replaces `device.user_id`, and a device's `toJSON` carries `userid`. `device.scope` is the new core's `BankScope`, `{ userid, banklabel }`.
- A gating exposes `userid` in place of `user_id`. `gating.scope` is `{ userid, banklabel }`, and its snapshot (`toJSON`, `GatingSnapshot`) carries `userid`.
- `Bank.mintStamps(scope)` and `Proving.judgeStrength(device, scope, passphraseCleartext)` (`safebyok/core`) take `{ userid, banklabel }`.
- The host's strength checker hears the scope as `{ userid, banklabel }`. `safebyok` exports its own `StrengthChecker`, `GuardedStrengthChecker`, `guardStrengthChecker` and `DefaultStrengthChecker`, in place of re-exporting safebyok-big's `StrengthChecker`; `safebyok/core` exports `ProvingDevice`, what a proving is given of its device.
- safebyok-big's `zxcvbnStrengthChecker` (`safebyok-big/browser`) fits the new core: it hears the user as `user_id`, or as `userid` when `user_id` is absent, and gives zxcvbn the user either way.
- Nothing stored changes: a Thing, a wayin and a lease already named the user `userid`, and a device's record is not stored by the new core.

---
"safebyok": minor
---

A DeviceDB now keeps a bank row per bank scope, { applabel, user_id, device_id }: `deviceDB.ensureBank({ applabel, user_id })` answers it, minting a random `device_id` on the first call, for the host to hand `Bank.make` (with `tryEnsureBank`, and `listRawBanks` for an inspector). A host's own DeviceDB subclass must now implement `doEnsureBank` and `doListBanks`. `IdbDeviceDB` keeps the rows in a database of their own, `${dbName}:bank-v001-001-001`, so no device forgets its remembered unlocks.

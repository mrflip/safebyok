---
"safebyok-big": minor
---

`mash(text)` now answers the SHA-256 as 43 characters of unpadded base64url, not 64 hex characters: a host that stored mashed ids gets different ones for the same text. The DeviceDB verbs are renamed: `cache` is `stow`, `vacate` is `forget`, `leasesProvedBefore(cutoff)` is `listLeases()`, which takes no cutoff and answers every stowed lease, oldest first; `peek` stays, and each try form follows. A host's DeviceDB subclass writes `doStow`, `doPeek`, `doForget` and `doListLeases`, which answers every lease row in any order (the base checks and sorts). The `cutoff` checker is gone from `safebyok/storage`. `safebyok/testing` adds `describeDeviceDBBattery`, the cases every DeviceDB must pass. The lease row's stored shape is unchanged. safebyok is not yet released, so none of this keeps a compatibility layer.

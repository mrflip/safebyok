---
"safebyok": minor
---

`safebyok/testing`: the handles of `vaultDBTimingChecks` are camelCase (`rivalFirstWrites`, not `rival_first_writes`); `MakeDevices` is the one shape of a device factory, which `MakeVaultDBDevices` and a race's `makeDevices` both take; a race whose move hangs fails naming its schedule. The built `dist/` is flat: its modules no longer sit under `dist/src/`, and none of them was an entry point. The READMEs state the platform floor: Node 22 and evergreen browsers.

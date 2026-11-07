---
"safebyok": minor
"safebyok-indexeddb": minor
"safebyok-fastkey": minor
---

Each IndexedDB database now carries a layout version in its name, three zero-padded parts: the device store's is `${dbName}:device-v001-001-001`, and `safebyok-indexeddb`'s vault store is `${dbName}:vaults-v001-001-001`. Each store deletes, unread and on its first call, its older databases of that `dbName`: the old core's `device_db`, `device-v1` and any lower version, and the unversioned `vaults` and any lower `vaults-v...`. A browser that held vaults in `${dbName}:vaults` finds them gone, as safebyok is not yet released and keeps no migration; a host that runs the old and the new device store under one `dbName` has the new one wipe the old one's live database. `safebyok/storage` adds `versionedShelfOf` and `VaultsDBVersion`, for an IndexedDB adapter's own versioned shelf. A key deriver's spec must now ask for a `salt_bytes` of 16 to 32, not 8 to 32, as the stored `salt_b64` already did, and `safebyok-fastkey` refuses the same specs; `salt_b64` is checked as 22 to 43 base64url characters through `Patterns.b64url`, which joins the label and user_id patterns in one internal `Patterns`.

A passphrase wayin whose stored `salt_b64` passes that check but will not decode (a length no unpadded base64url has, or stray padding bits in its last character) now refuses a passphrase unlock as `bad_record`, not with a raw Error.

`DeviceDB` gains `delRawLease(scope)` and `tryDelRawLease(scope)`, which delete whatever row stands at a vault scope, unchecked, so a host can clear a lease row that fails its check (neither `listLeases` lists it nor `forget` erases it); a `DeviceDB` subclass writes one more hook, `doDelRawLease(scope)`.

`versionedShelfOf` now answers one shelf for each database name on a page, so a store made again under the same `dbName` (a hot reload, or several banks) shares one connection and the wipe of older databases runs once; it checks its spec on entry, refusing `bad_option` for an empty name or a `version` that is not three zero-padded parts.

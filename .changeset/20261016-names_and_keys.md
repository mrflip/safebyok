---
'safebyok': minor
'safebyok-indexeddb': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
'safebyok-convex': minor
---

Names are held to a floor, the key-value stores join their ckeys on `^`, and the `VaultDB` verbs take no validators.

- **A vault kept in `localVaultDB` or `idbVaultDB` before this release reads as absent** (its rows, filed under the old JSON-tuple ckeys, are left as they were), and a remembered unlock or device mark in `idbDeviceDB` is swept: the user unlocks, or makes the vault, again. Rows are now filed under `kind^applabel^user_id^vaultlabel[^boxlabel]`; each key-value store takes a `ckeyDelimiter` option for another delimiter, and refuses (`bad_label`) a name holding the one it joins on. `Ckeys` is now `Ckeys.joiner(delimiter?)` and `Ckeys.DefaultDelimiter`.
- **Every `VaultDB` verb loses its trailing `validators` argument.** A server or wrapper calling them drops it. Each verb holds every name to the floor and to two facts every adapter now declares, `maxNameBytes` and `reservedNameChars` (VAULTDB.md 7.3, 7.4): an adapter of your own adds both. Postgres declares 640 bytes, and the GraphQL client the same.
- **The floor** (`NameFloor`, `NoteFloor`, exported with `NameFloorBytes` and `NoteFloorBytes`): every name is one character to 1 KiB of UTF-8, every note at most 4 KiB, each well-formed Unicode in NFC with no control character (a note may hold tab and newline), whatever validators a host passes. A stored record below it reads back as damaged. `AnyTextValidators` is now the floor itself, so it refuses an empty name, a control character or text not in NFC, as it did not before.
- **A host's validators run at the vault's entry only**: a lockbox stored under a name or note they refuse now lists, reads and erases as sound, where it listed as damaged.
- **`UserId`'s default is 1 to 100 ASCII letters, digits and `-_.:@+|`** (`UserIdPattern`), refusing spaces, other punctuation and text outside ASCII it used to admit: a host whose ids hold more passes its own `validators.userId`.
- `listBoxes` sorts by code unit, never by the runtime's locale.

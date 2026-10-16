---
'safebyok': minor
'safebyok-indexeddb': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
'safebyok-convex': minor
---

Names are held to a floor, the key-value stores join their ckeys on `^`, and the `VaultDB` verbs take no validators.

- **A vault kept in `localVaultDB` or `idbVaultDB` before this release reads as absent** (its rows, filed under the old JSON-tuple ckeys, are left as they were), and a remembered unlock or device mark in `idbDeviceDB` is swept: the user unlocks, or makes the vault, again. Rows are now filed under `kind^applabel^user_id^vaultlabel[^boxlabel]` (`Ckeys`, whose functions are as before, with `Ckeys.Delimiter`).
- **Every `VaultDB` verb loses its trailing `validators` argument.** A server or wrapper calling them drops it. Each verb holds every name to the floor and to a fact every adapter now declares, `maxNameBytes` (VAULTDB.md 7.3): an adapter of your own adds it. Postgres declares 640 bytes, and the GraphQL client the same.
- **The floor** (`NameFloor`, `NoteFloor`, exported with `NameFloorBytes` and `NoteFloorBytes`): every name is one character to 1 KiB of UTF-8, every note at most 4 KiB, each well-formed Unicode in NFC with no control character (a note may hold tab and newline), and no name holds `^`, which the key-value stores join names on, whatever validators a host passes and whatever store holds the vault. A stored record below it reads back as damaged. `AnyTextValidators` is now the floor itself, so it refuses an empty name, a control character, a `^` or text not in NFC, as it did not before. A host on Convex, Postgres or GraphQL whose names hold `^` meets `bad_label` at `openVault`: there is no option to join on another character.
- **A host's validators run at the vault's entry only**: a lockbox stored under a name or note they refuse now lists, reads and erases as sound, where it listed as damaged.
- **`UserId`'s default is 1 to 100 ASCII letters, digits and `-_.:@+|`** (`UserIdPattern`), refusing spaces, other punctuation and text outside ASCII it used to admit: a host whose ids hold more passes its own `validators.userId`.
- `listBoxes` sorts by code unit, never by the runtime's locale.

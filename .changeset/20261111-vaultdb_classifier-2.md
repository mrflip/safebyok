---
"safebyok-postgres": minor
---

**The Postgres tables have a column for each field of a row**, where each row was one `jsonb` column: `revision_tok`, `revision_seq`, `am`, `fmt`, the times and the tokens are columns of their own, and `gate`, `sidecar`, `box_key_wrapped` and `whisper_ciphered` are `jsonb`. A box row has a foreign key to the vault row at its scope, so a `DELETE` of a vault row is refused while it has box rows. Tables made by an earlier version are dropped and made again with `VaultTablesSql`.

**A row is written by a function in the database**, which `VaultFunctionsSql` creates (also shipped as `vault-functions.sql`): run it after `VaultTablesSql`, and again with each upgrade. A function tests a record against the row stored, stores it and sends its notification in one call. A notification is one JSON object, `{ at, vault, box }`, and a box's carries its vault's row where there is room, so a watch hears a box with a `world`.

**The tables check each row's shape**, so a row safebyok could not read back is refused by Postgres as it is stored. A row of a later `fmt` is held, and nothing is stored over it.

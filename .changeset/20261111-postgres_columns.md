---
"safebyok-postgres": minor
---

**The Postgres tables have a column for each field of a row**, where each row was one `jsonb` column: `revision_tok`, `revision_seq`, `am`, `fmt`, the times and the tokens are columns of their own, and `gate`, `sidecar`, `box_key_wrapped` and `whisper_ciphered` are `jsonb`. A box row has a foreign key to the vault row at its scope, so a `DELETE` of a vault row is refused while it has box rows. Tables made by an earlier version are dropped and made again with `VaultTablesSql`.

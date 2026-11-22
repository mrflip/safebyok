---
"safebyok-postgres": minor
---

**The bank table carries a `lifetok`.** `safebyok_bank_things` has a new `lifetok` text column, NOT NULL, which the bank's write function stores; it refuses a write over a live bank that changes it, and reports that verdict as `lifetok_ok`. The vault functions keep their names. Drop the three vault tables (`safebyok_bank_things`, `safebyok_gate_things` and `safebyok_box_things`) and create them again, drop the bank's write function (`DROP FUNCTION safebyok_a010501_r000_write_bank(jsonb, jsonb)`), whose result gains a column that Postgres will not add in place, then run `VaultFunctionsSql` again: a bank row written before has no lifetok and fails today's checks, and the bank's write function, which keeps its name, must be the one built for the new column.

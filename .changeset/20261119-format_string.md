---
"safebyok-postgres": minor
---

**Thing rows carry a string format.** The `fmt` column of safebyok-postgres's three vault tables is now `text`, holding `'a010501'`, and its SQL functions are named for it (`safebyok_a010501_r000_write_box`, not `safebyok_t01_r000_...`). A table or row written before fails today's checks: the tables are created only when missing, so a database with the old `integer` column needs its vault tables dropped and created again.

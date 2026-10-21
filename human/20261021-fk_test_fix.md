# 2026-10-21: The postgres CI job's foreign-key race is fixed in #222 -- one question on what it tests

[#222](https://github.com/mrflip/safebyok/pull/222), stacked on #218, fixes the `postgres` job
that has failed since #217. The test helper found the blocked write by its SQL text in
`pg_stat_activity`, which keeps only the first 1023 bytes. #217's `standing` CTE moved the INSERT
past that point. The helper now asks `pg_blocking_pids` which connection the eraser blocks.

**Open question:** the test's header says only the foreign key's `23503` can refuse the write. But
the write waits at its `FOR SHARE` read of the vault row, and after the delete commits it likely
refuses through `vault_stands = false`, never reaching the foreign key. This predates #217. My
recommendation: a later thread checks it on a real Postgres and either finds a race that reaches
`23503` or rewords the header.

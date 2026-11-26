---
"safebyok-postgres": minor
---

VaultFunctionsSql's functions take new arguments and return the manifest's parts: each write function takes the ask's if_absent and if_present and returns the write's tags and its actual row, where it returned ok and a verdict per check, and birth_roots returns tags where it returned ok. Postgres will not replace a function whose arguments or result changed, and the version and revision in their names are unchanged before 1.0, so drop every function named safebyok_a010501_r000_* before running this version's VaultFunctionsSql. The tables are unchanged. A write function that wrote nothing where the vaultDB finds a write, as one of another version may, now refuses storage_issue, where it refused unexpected_error.

```sql
DO $$ DECLARE fn regprocedure; BEGIN
  FOR fn IN SELECT oid::regprocedure FROM pg_proc WHERE proname LIKE 'safebyok\_a010501\_r000\_%' LOOP EXECUTE 'DROP FUNCTION ' || fn; END LOOP;
END $$;
```

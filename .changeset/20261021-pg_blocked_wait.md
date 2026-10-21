---

---

The Postgres foreign key test finds the write held by the vault's deleter by what blocks it, no longer by its statement's text, which the server cut short once the first-write statement grew. A test-only change; no package changes.

# Thread 10: sprint_tidy (2026-11-26)

Branch `20261126-sprint_tidy`, PR #946, stacked on #945. Proved: safebyok 2,425, safebyok-indexeddb 130, safebyok-postgres 168, safebyok-convex 232 tests green after the battery change.

* **Built**
  * **The battery's incompatible bank, real everywhere.** "carries a bank incompatible outside its lifetok forward" planted a stray `auth`, which Postgres's `jsonb_populate_record` and Convex's plant drop, so it ran on a sound bank there. It now plants `written_at: Number.MAX_SAFE_INTEGER` (past `FarFuture`, so `epochMillis` refuses it), a column both tables hold with no CHECK against it, and the case first expects a get of the bank to refuse `incompatible_row`, so a plant that loses its damage fails loudly.
  * **Lint configs.** The cognitive-complexity note named the deleted `storage/classifier.ts`; it now names no file, in every non-big config (the core, react, indexeddb, postgres, convex, fastkey, root, e2e and the four demos), not only indexeddb's and the dojo's. Big's frozen configs keep it.
  * **safebyok-postgres's privileges and upgrades.** Only the write functions, `birth_roots`, `tell_thing` and `thing_record` are revoked from PUBLIC; the README and the SQL header now say so. "an upgrade adds its functions beside the old ones" was untrue until 1.0 (no name bumps then; see vault-functions.ts's `[Names]` comment): the README says an upgrade replaces them and a changed signature is dropped first; the header drops the clause.
* **Decisions made**
  * **Why written_at.** The bank table admits few damages the bank's checks refuse: `label` is CHECKed to `'bank'`, `fmt` and the citation fields must match the ask for the write to go through, `born_at` must equal the proposed record's, and `lifetok` is the one field the title rules out. `written_at` is compared by nothing in a write.

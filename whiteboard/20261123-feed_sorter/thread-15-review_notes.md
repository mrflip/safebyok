# Thread 15: review_notes (2026-11-24)

Branch `20261124-review_notes`, PR #881, cut from #879 (`20261124-fingerpaint`), built beside #880 (thread 14) on the
same base. Proved: safebyok 2160 passed, 7 failed -- exactly the seven red `vault-minder` tests (listen 4, writes 2,
staleness 1); safebyok-idb-lean 115, safebyok-postgres 356; typecheck clean in every dependent package and demo. Red
by the seven alone, so `blocked` by design.

The notes answered, one by one, and the Part 3 list: [thread-15-review_notes-notes.md](thread-15-review_notes-notes.md).

* **Built**:
  - The Coach's commit a18f6c8dc, kept as he left it; each of its eight notes acted on and removed.
  - A concrete adapter's report is one hardened type: `ActualBeside` (`world`, `tracked: Tracked | null`, `read_tc`),
    no optional field, read through one check, `ActualChecks`, in the new `shapes/shapes-answers.ts`. That module now
    holds every answer type too; `storage/vault-db.ts` is the interface alone. Memory, IndexedDB and Postgres each make
    their `read_tc` with the world fetch, and supply `tracked` as null for an ask that tracks nothing.
  - `watch` wraps the host's `onNotice` with `bulletproofHandlerOf`, through the new `Throwers.refusalOfThrown`.
  - Body getters for Box, Gate and Bank (answer A); the agerank rule switching on undefined (B); the frozen-records
    sentence (C); VOCABULARY's agerank row (D).
  - Part 3: passphrase-strength's host call through `bulletproofAsyncHandlerOf`; Postgres write verdicts all required;
    `ReadTc` beside its check, `Received` beside the reports.
* **Decisions made**:
  - AdapterVaultDB, not the classifier, checks `read_tc`: it is the module's entry for a report, and the classifier no
    longer sees one.
  - A listing's `kids` carry no `read_tc` in the report; the answer's `val` takes the report's.
  - No answer checker (note 5): answers are built of checked parts; said in a comment above them.
  - `Throwers.refusalOfThrown` names the ternary rather than reaching for `sanitizeForeignError`, which makes a plain
    Error, not a refusal.
  - The classifier's `born` plan has `tracked: null`: nothing is stored before a birth for an ask to track; each
    adapter reports what it reads after the write.
* **Deviations**:
  - Note 4: the second try/catch (around `onNotice`) is not kept opened: it became the bulletproof wrapper note 3
    points to. The first is kept as he opened it.
  - Answer A needed more than the getters: the checks of a Thing handed in (sealable, cited) and the `Sealable` and
    `CitedOf` types accept a body field present and undefined. Citing a shell Thing worked before and still does.
  - `helpers/bulletproof.ts`: `BulletproofTellOpts<ErrT>` is generic, so `onBadNews` may take a VaultError.
  - Thread 14's `sorted-vault-db.ts`: two import lines only (answers from shapes-answers, `ReadTc` from
    shapes-vault-event). Red file `vault-minder-listen.test.ts`: one import path only.
  - One `plan:` commit at the end for this file and the notes file, so no thread file was pushed mid-build.
* **Discoveries**:
  - A getter on the prototype makes `'field' in thing` true, so `exactOptional` refuses a Thing over the shell even
    with no own prop: zod reads each key.
  - Every adapter's report already had a world fetch to hang `read_tc` on; Postgres makes it just before each
    statement, so it is never later than the read.
  - `safebyok-postgres/src/postgres-bank-db.ts` is safebyok-big's adapter: its `listenOrNull` try/catch is left.
* **Tests whose promise changed** (before -> after):
  - adapter-vault-db: "answers a read_tc made when the report arrives, where a concrete adapter reports none, each
    later than the one before" and "refuses ... a read_tc ... that is no UUID version 7" (get only) -> "refuses, as a
    broken store, a report from a get, a write, a list or a birth with no read_tc, or one that is no UUID version 7".
    Added: "answers a listing's read_tc as its Kids value's own"; "refuses ... a report whose world or tracked is
    neither null nor an object".
  - memory-vault-db: the classifier's "refuses ... a read_tc that is no UUID version 7" removed; AdapterVaultDB's covers
    it.
  - box: "answers every field of its record by name, its body hidden" -> "... its Thing fields as its own props, its
    body by getters"; "sets every field non-writable, ..." -> "sets every Thing field non-writable, ..., and its body
    read-only". Added: a box record with an undefined or no `sidecar` refused; a box over the shell sealable and
    citable.
* **For the Coach**:
  - Held, host-visible: `GoodAnswer`/`BadAnswer` `tracked?` could be `Tracked | null` as the report is; `VaultEvent`
    `read_tc` could be required, since every vaultDB says. Both recommended, firmly, as a later thread.
  - The fetched types in `thing-classifier.ts` belong in shapes (note 5). Recommended, mildly.
  - Thread 14's files carry note 3's ternary and bare `listener.hear`; listed in the notes file for it.

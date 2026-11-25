# Thread 4 rework: the shell under the nearest stored ancestor (2026-11-24)

For the Coach, and for whoever picks up thread 4: Changes H, I and J on the Coach's rulings of 2026-11-24, commit
`39a1b59e5` on `20261124-sorted_feed`. The seven Minder tests still fail, unchanged (same assertions).

## Change H: the backing store reports the nearest stored ancestor

* **The report** rides beside the world each get and write step already hands the classifier
  (`packages/safebyok/src/storage/thing-classifier.ts`):
  `export type AboveFetched = WorldFetched & Readonly<{ ancestor: unknown }>`, `ancestor` the raw row of the nearest Thing
  stored above the scope (of the bank's Things whose labelpath and a `/` begin the ask's, the longest; live or a
  tombstone; null for none, as for a root). It replaces the bank's three roots a get was handed (`BankRootsFetched` is a
  birth's alone now). The classifier checks it (`ancestorOf`): not an object, or not `/`-bounded above the scope,
  `storage_issue`; failing `storedCited`, `damaged_row`. The labelpath, lifepath and revision are read from that row.
* **Each adapter, one step**: `MemoryVaultDB.#aboveOf` and `IdbVaultDB`'s `aboveFetchedIn` (in its transaction) look up
  each labelpath above, nearest first (`Labelpath.ancestorsOf`, new), and take the first stored. `PostgresVaultDB`: a
  subquery in its get statement and beside the write function's call in its write statement (`ancestorSqlOf` in
  `vault-queries.ts`): `starts_with(<labelpath>, above.labelpath || '/')`, `ORDER BY length(above.labelpath) DESC LIMIT
  1`, same table (an ancestor is of its Thing's kind). No `LIKE`. The get statement no longer returns `root` (it still
  reads it for `tracked`).
* **The shell** is built by `Shell.under(scope, ancestor)` (new, `shapes-thing.ts`): the ancestor's lifepath, then the
  shell's lifeseq for each level below it; with none, the shell's lifeseq at every level; through `Shell.of`'s lifepath
  form. It refuses an ancestor not above the scope (`Validator.demandConsistent` on the labelpath).
* **Not carried on the answer**: the ancestor's labelpath and revision. The shell's lifepath already names the
  ancestor's life, and its labelpath by count; no consumer asks for the revision; a field would widen every answer and
  make the SortedVaultDB decide whether a partial record is news. Adapters report the whole row, so carrying it later is
  a classifier change alone. Open matter.

## Change I: every answer that says nothing is stored carries the shell

* A write refused over nothing stored (`void`, `ahead`) carries the shell (`unwrittenWriteOf`). A birth never refuses
  over nothing (its puts cite the shell under `ifAbsent: 'add'`); `unwrittenBirthOf` gives a root's shell there, so its type narrows.
* Types: `Actual`'s record defaults to `ThingRecord | VoidSentinel` (no null); `GotActual = Actual<EX.GotAct>`; new
  `WroteActual = Actual<EX.PutAct | EX.DelAct>` (exported); `BirthBankActual`'s refused record `ThingRecord |
  VoidSentinel`; `BadAnswer`'s default `ThingRecord | VoidSentinel | null`, so `GetThingAnswer` ends `| BadAnswer`.
* **Where null remains, it means the verb threw**: a `BadAnswer` from `answerForThrown` or `refusedAnswerOf` whose
  refusal names no Thing (a bad ask, the `dubdel` the ask check throws, `damaged_row`, `storage_issue`,
  `storage_unavailable`), and a thrown listing's. The answer types cannot narrow further without a discriminant: a thrown
  answer may carry a refused act (`dubdel`), so null stays in `BadAnswer`, documented. Outside the vaultDB, the minder's
  cached `GotAnswer` keeps `gotvoid`'s `dbhas: null` (out of scope).
* Consumers: `SortedVaultDB`'s `writtenRecordsOf` and `bornRecordsOf` now return `SeenThing[]` (they notify a refused
  write's shell, as a get's); `IdbVaultDB` drops a `record !== null` test its types no longer allow. `answerOf` keeps its
  null check on a good report (the implementation signature admits null: a concrete adapter's report is the entry). No
  model, minder or React code tested these for null.
* A listing refused `void` keeps `dbhas: []`; its doc says `parentage` holds the tombstone under `gone` and nothing of
  the life above under `void`: **a refused `void` listing has no way to say it** (reported, nothing added).

## Change J: the note

`notes/answer-contract.md` gains a paragraph after DX0's, marked as the new core's. Rows that now read wrong for the new
core, left as they are: GV1, GV2, PV2, PV3, DV2 (the paragraph covers them), and *Returning*'s bullets "A get's
`gotgone` and `gotvoid` ... the tombstone, or null" and "`void` returns dbnil".

## Tests

Battery: refused writes of nothing at a root (`void`, `ahead`), under a live parent, a tombstone parent and a parent not
stored (`void` and `ahead` each), the del of nothing; a get and a refused write at `box/openai` and `box/open_ai` beside a
stored `box/open`. Postgres, past the adapter: the longest ancestor (`box/aa` for `box/aa/bb`, `box` for `box/aab/cc`),
and `box/a_`, `box/a%` no ancestor of `box/ab/cc`. `Shell.under`, `Labelpath.ancestorsOf`, the classifier's checks of an
ancestor, and the SortedVaultDB notifying a refused write's shell.

## Approaches set aside

* `Shell.of`'s parent form: it checks the parent's lifepath as a stored one, so fits only an ancestor one level up.
* The ancestor as a new output of the Postgres write functions: changes their result (a drop for hosts) inside the
  functions marked "discuss first"; the subquery beside the call reads it in the same statement.
* Escaped `LIKE`: `starts_with` is plainer.

## Discoveries

* While labelpaths are two deep only a root is ever above a scope, so longest-first is proved at the SQL level and by
  `Labelpath.ancestorsOf`, not through an adapter.
* `Kids.parentlife` for a void parent is the shell's lifeseq alone; right for the roots that are listed today, but a
  nested listing would need the ancestor rule.
* `%` is no label character; `_` is.
* VOCABULARY.md (not changed): the Void Sentinel row's "the life of its parent" would read "the life of the nearest Thing
  stored above it".

# Thread 1: manifest_things (2026-11-26)

Branch `20261126-manifest_things`, PR [#934](https://github.com/mrflip/safebyok/pull/934), cut from origin/main. Proved: `packages/safebyok` lint, typecheck,
test (2,392 tests, 39 files) green. Red by design: `safebyok-indexeddb`, `safebyok-postgres`, `safebyok-convex`
typechecks (their `doGetThing`/`doWriteThing` still return the old `GotActual`/`WroteActual`, and they call the
classifier functions that went); threads 3 (idb), 4 (postgres) and 5 (convex) mend them.

* **Built**:
  - `src/shapes/shapes-manifest.ts`: `ManifestChecks` (tag, `tracked`, `read_tc` checks, `storage_issue`), `PolicyVerdict(s)`,
    `GetTags`, `WriteTags` (+ `Presence`, `RevtokCmp`, `RevseqCmp`, `SameCmp`), `GetManifest`, `WriteManifest` (raw, from the
    datastore), `CheckedManifestRows`, `Checked{Get,Write}Manifest`, `Scribed{Get,Write}Manifest` (carry `ok` and `act`,
    `actual` narrowed by act).
  - `src/storage/manifest-tags.ts`: the shared tag functions over raw rows, never throwing on a primitive: `fieldOf`,
    `banktokOf`, `presenceOf`, `getTagsOf`, `writeTagsOf(ask, ante, written)`, `policiesOf`, `trackedOf` (was the
    classifier's `trackedFetchedOf`), `TrackedRows`. Exported as `ManifestTags` from `safebyok/storage`.
  - `src/storage/manifest-acts.ts`: `checkGetObservations` / `checkWriteObservations` (assertion functions; each row
    read once, `.parse` without the address), the get/put/del tables over tags (`putActOf` exported for the birth
    scaffolding), `scribeGetAct` / `scribeWriteAct`, `getAnswerOf` / `writeAnswerOf`, `checkedBanktokOf`.
  - `src/storage/three-way.ts`: `demandGetConsistency`, `demandWriteConsistency`.
  - `src/storage/memory-datastore.ts`: `MemoryDatastore` (getThing, writeThing, listThings, birthRoots, getWorld, stats,
    watch) with `isWritable`, a TS copy of the Postgres write function's `WHERE` plus the flags. `MemoryVaultDB` is
    now one line per `do*` for get and write.
  - `AdapterVaultDB.tryGetThing/tryWriteThing` follow the design's accumulator exactly; abstract `doGetThing` /
    `doWriteThing` return `GetManifest` / `WriteManifest`. The `//` reason "never optimize it away" sits above the class doc.
  - Throwers/phrases: `writtenOfOtherAct`, `proposedNotWritten`, `tagsOfOtherRow`, `tagsOfOtherAsk`,
    `answerOfOtherManifest`; `gateIssue`, `bornAtNotStored`, `lifetokNotStored` take a `meta`.
  - Tests: `tests/storage/manifest-acts.test.ts` (every row PV1…PL13, DV1…DL9, '@' expanded to each flag, plus clash
    on life/liveness and `policied`), `three-way.test.ts` (a doctored manifest or answer per check),
    `manifest-tags.test.ts`; `adapter-vault-db.test.ts` and `memory-vault-db.test.ts` moved to manifests.
* **Decisions made**:
  - Two functions, `demandGetConsistency` and `demandWriteConsistency`, not one overloaded `demandThreeWayConsistency`:
    one overload over a get and a write needs casts to narrow the manifest with the ask.
  - The scribed manifest carries `ok` as well as `act` (resembles the Answer), so the answer function narrows by a
    literal; `actual` is typed by act, trusted from the tags, and three-way refuses a row that disagrees.
  - Policies are moot (`{ ok: true }`) wherever the ante row is no live gate, as `born_at_cmp`/`lifetok_cmp` are
    `'moot'`; so `scribeWriteAct` applies them to any write act uniformly. `policied` picks born_at, then the first
    failed policy (in the ask's order), then lifetok: today's order.
  - The ancestor is read only where `actual` is null (a datastore hands null otherwise), and is checked whole.
  - The birth scaffolding in the classifier now uses `writeTagsOf` + `putActOf`, so the put table exists once and
    `StoredCited`, `ThingChecks.storedCited`, `PerKindChecks.storedWayins`, `GateChecks.storedWayins`,
    `BankChecks.storedLifetok` all go. (`PerKindChecks.storedLifetok` stays: three shapes read its lifetok.)
  - `Received.banktok` is `unknown`; the watch reads it through `checkedBanktokOf`, since the memory datastore checks nothing.
  - `MemoryDatastore.birthRoots` writes unconditionally; `MemoryVaultDB.doBirthBank` decides from `getWorld` +
    `classifyBirthBank` (Scaffolding until thread 2).
* **Deviations**:
  - The ancestor's address is checked where it is read (`checkedAncestorOf`), not in three-way: the shell is built
    from it, and `Shell.under` would otherwise refuse `bad_record` first.
  - Answers that change, all on a broken or incompatible state: `policied` answers carry the step's banktok, tracked
    and read_tc (were void/'unread'/now, as thrown); a bank row with a sound lifetok gives it as banktok even when the
    rest is incompatible (design's YOLO); a void Thing under an incompatible ancestor refuses `damaged_row` (only its
    revision slice was read); a write over an incompatible ante row whose cited revision matches is written (the ante
    is unread when written). The design's two `storage_issue` cases are in.
  - `demandAnswerCopied` refuses `storage_issue` per the design, though a mismatch there is our bug.
* **Discoveries**:
  - The battery requires writes over rows damaged outside their cited slice to succeed: this falls out of the
    manifest (a written write's `actual` is the written row).
  - A tracked root missing where the ask tracks a revision refuses `storage_issue` (unchanged from before).
  - Thread 2: `MemoryDatastore`'s list/birth/world/stats and `AdapterVaultDB`'s `classify*` are Scaffolding;
    `ActualChecks.beside` and the classifier's `trackedOf`/`banktokOf` survive only for them. The `Received` widening
    may want the adapters' watches (threads 3–5) to stop calling `Classifier.banktokOf`.
* **For the Coach**: see the PR's Open questions.

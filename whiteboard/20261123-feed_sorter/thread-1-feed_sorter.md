# Thread 1: FeedSorter, VaultEvent and the feed table (2026-11-23)

Branch `20261123-feed_sorter`, PR #867, stacked on #865. Proved: `pnpm --filter safebyok test` 1670 passed (the
feed-sorter file alone 188: 169 table rows, 19 direct), typecheck and lint clean. After the rework: an `agerankWas`
dropped on same-life events turns 34 rows red, `>=` for `>` in the comparison 36, folding into another life's revseqs 42.

* **Built**:
  * `packages/safebyok/src/shapes/shapes-vault-event.ts`: `VaultEvent` (`VaultItemEvent | VaultLifeEvent |
    VaultAgedEvent`, each a `VaultEventOf<kind>`), `Agerank`, `SeenThing`, and the four kind lists
    (`recordkindVals`, `lifekindVals`, `agekindVals`, `vaultEventkindVals`) with their types.
  * `packages/safebyok/src/storage/feed-sorter.ts`: `class FeedSorter implements BankScope`, made with a bank
    scope; `eventify(seen)` answers a frozen list of frozen events; `agerankAt(scoped)` reads a Thing's agerank. One
    private `Map<Labelpath, Agerank>`, nothing else.
  * `packages/safebyok/tests/storage/feed-sorter.test.ts`: the 169 rows from `tablegen/table.ts.txt`, the six starts,
    a harness from shorthand to real records at `box/openai`, and direct tests (scope and identity of the record told,
    frozen, two Things apart, a sparse tombstone, revseq past one base-32 digit, a root, the refusals).
  * Exports from `safebyok/storage`: `FeedSorter`, every type above and the four lists.
* **Decisions made**:
  * **A sparse tombstone is `gone`, counted whole.** They do occur (below). Counting one whole keeps gen.py's
    principle that a dead life always reads here; a dead life has one revision, so the sparse record says all of it.
  * **The entrypoint checks citation, not body**: `ThingChecks.scopedCited`, plus a lifepath as deep as the labelpath
    and the own life odd exactly for a tombstone, then `parseConsistent` against the sorter's bank. That is the level
    `Thing.isTombstone` and its sibling guards check at. A bag with a sound citation and no body passes, as `soon`.
  * **The event's `record` is the caller's own object**, neither parsed (which would strip it) nor copied.
  * **Ageranks are parsed privately** (`partsOf`, by `lastIndexOf('|')`), not exported: a host compares ageranks as
    strings, and reads the agekind from the events. No helper object on `Agerank`, so no export to validate.
  * **`raisedOf` prepares, then compares strings** (the Coach's directive, in the rework): the record's revseqs fold into
    the life before where its lifepath is the same, or else into `UnseenLife` (-1, -1), and the record is taken where the
    joined string is greater than the one before. No branch on the lifepath, no `Thing.cmp`. The `Math.max` on a whole
    record's item is unobservable (a lower item makes a lower string, which is refused anyway), and kept as directed.
  * **Absent is `undefined`**, as `MinderEvent` has it: `agerank`, `agerankWas`, `agekindWas`. A life or aged event
    always has its `agerank`.
* **Deviations**:
  * The two refinements `isLifepathDeep` and `isParityRight` are copied from `shapes-thing.ts`, where they are
    private: the thread was new files only. Exporting them from `shapes-thing.ts` and deleting the copies is a
    two-line follow-up.
  * The table's strings, inputs and expected values alike, are double-quoted in the test, per STYLE.md's table rule;
    `table.ts.txt` keeps gen.py's single quotes. To re-paste: regenerate, then quote every string double but the blurb.
  * Titles carry the start and row number (`a soon, from void (row 34)`): gen.py's blurbs repeat.
* **Rework after review (2026-11-24)**:
  * The table is regenerated from the base checkout's gen.py: every life one flat number, a void `['void', -1, -1]` or
    `['void', n, -1]` for a void of a later life (5 or 9), and the row's `agerank` the joined string `life|high|item`.
    Only the void rows' chains and `streamed` changed against the old table; no other row's `streamed` did.
  * **The harness's lifepaths**, stated at the head of its section: a record of life n is at `n/n`, a void of life n at
    `n/-000000001` (each n a lifeseq), so lifepaths sort as the lives do. The void of life -1 sits at
    `0000000000/-000000001`: the checks refuse the shell's lifeseq anywhere but last, so it cannot be its own parent,
    and under life 0 it sorts below every record of life 0 and up. No row has a void of life 0. The expected agerank
    puts the lifepath the row's records gave that life in the first field, then compares strings.
  * **Each event is tied to the map**: every event a record tells carries `agerankWas` equal to `agerankAt` read before
    `eventify`, and `agerank` equal to it after. This replaced the check that all of one record's events agree.
  * Doc blocks: `eventify` opens with the act and says the sorter remembers the agerank; `VaultItemEvent.record` says it
    is the caller's own object; the test's `Life`, `Seen` and `Told` have one-line `/** */` phrases.
* **Discoveries**:
  * **Sparse tombstones reach a watch.** `classifyListThings` (`thing-classifier.ts`) sends `parentage` as
    `Thing.sparseOf(stored)` even when the parent is a tombstone, and its `deltas` carry tombstoned children made
    sparse. This contradicts VOCABULARY's "a tombstone is never sparse" and the rule's "tombstones always arrive whole".
  * **A void's lifepath must come from the caller.** `nullCitedOf` answers `Shell.Cited`, whose lifepath is the
    root's `-000000001` at any depth: on `box/openai` it neither carries the parent's lives nor has the scope's depth,
    and as a string it sorts below every record of the Thing, so a void under a parent born again would tell nothing.
    The sorter refuses it (a test shows this). A `gotvoid` answer has no lifepath either: the wiring thread must take
    the parent's lifepath (the root box's record, or `Kids.parentlife`) and pass `Shell.of({ ...scope, lifepath })`.
  * **`/` against `|` is sound within one Thing.** Every lifeseq and padded revseq is ten characters, the shell's
    `-000000001` too, so two ageranks of one labelpath (same depth, enforced at the entrypoint) have each `/` and `|`
    at the same offsets, and comparison is decided inside aligned fields; `-` sorts below `0`. Across depths it would
    not hold (`0/x` against `0|y`), which no caller should compare. Labelpaths are at most two deep today.
* **For the Coach**:
  * **Sparse tombstones**: count them whole (built), or have the classifier send tombstones whole?
  * **Export the two refinements** from `shapes-thing.ts` in a later thread, to drop the copies.

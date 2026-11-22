# Thread 11: dead_record (2026-11-22)

Branch `20261122-dead_record`, PR to be filed (see the PR's **Tests:** line), stacked on [#853](https://github.com/mrflip/safebyok/pull/853). Docs and titles only; empty changeset.

* **Built**
  - **The dead record.** "dead entry" is "dead record" in prose: VOCABULARY.md's row and its `item` row, the minder's class
    doc and Invariants, `deadAt`, `DeadEvent`, shapes-minder.ts, vault.ts, TODO.md, and test titles/comments. Code names
    (`deadAt`, `DeadEvent`, `'dead'`, `deadQueryKey`, `Deadkind`, `EntrykindIdx`, `EntryRecord`, `isEntryVal`) stay.
  - **The ban on "entry", checked on the rest of the minder's prose.** What TanStack's cache holds under a key is a
    query (its own word), so "entry"/"entries" about it became "query"/"queries": minder.ts, minder-keys.ts,
    shapes-minder.ts (`MinderEventkind`, `eventkind`, the options doc), newer-thing.ts, giver-defaults.ts, two test
    titles (minder-persist, vault-minder-shared-client). VOCABULARY's `item` row said "`item` names the entry": now "names
    what the cache has". Its `soon` row said "the host's entry for the item": now "the host's query for the item".
  - **A listing test retitled** (vault-minder-cache.test.ts): "marks nothing stale for a list's own children, which land
    while it is under way" checks only that the root listing is not stale after `list('box')` over a stored box, so it now
    says "leaves the root listing not stale once it has been listed over a stored box".
  - **`useBox`'s doc block** (react-giver.tsx): a `select` returning a record should return it or the item's own null,
    never a null of its own, since the hook reads null as nothing stored.
* **Decisions made**
  - "query" over "slot" or "what the cache holds": TanStack's QueryCache holds queries, and the minder's docs already say
    "its query key" beside them.
  - Left alone: the `entrykind` segment name in prose beside `EntrykindIdx` (a code name), `entry point`/package entries
    in tsdown, index.ts, browser.ts, utils.ts and docs (a module's entry, not the cache's), and TODO.md's "the host's
    entry/entries" lines about React Query, which are another file's wording.
* **Discoveries**
  - The brief named giver-defaults, use-draft, react-giver, docs/ and notes/answer-contract.md; only giver-defaults had
    "entry" prose about the cache, and none of the others said "dead entry" at all.

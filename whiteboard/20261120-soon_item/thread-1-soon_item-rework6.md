# Thread 1: soon_item, rework 6 (2026-11-21)

Branch `20261120-soon_item`, PR #790, stacked on #767. On the Coach's rulings of 2026-11-21, after rework 5.

* **Built**
  * The thrower `boxNewestUnread` and its phrase `BoxNewestUnread` are `boxSoonestBare` and `BoxSoonestBare`; the phrase now reads
    "This device has heard of a newer revision of the box but has not fetched it yet." The refusal kind stays `stale_read`.
  * `vault.withWhisper`: where its `tryGet` was refused and `minder.at` and `minder.soonAt` are both undefined, it rethrows the get's own
    refusal before the demand; everywhere else the demand judges as before. Doc block says so in one clause.
  * VOCABULARY: the *soon* row says when a box is **bare** in a minder's cache (only a sparse record of its newest life: a soon with no item,
    or a soon of a newer life than the item), beside the listing's sense.
  * `isStaleAt`'s doc block: "True when the item is not timely for a `get` with these `opts`."
  * Changeset updated for all of it.
* **Tests** (`tests/models/vault.test.ts`): a refused get with nothing cached rejects `storage_unavailable`; a refused get with only a soon
  cached (no item) keeps `stale_read`.
* **Decisions made**: the sparse-only test seals a shell of the box and lists it, so the minder holds a soon and no item; the
  existing deleted-then-reborn test (a soon of a newer life over a tombstone item) is unchanged.

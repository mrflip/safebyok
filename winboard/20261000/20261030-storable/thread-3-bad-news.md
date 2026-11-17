# Thread 3: bad news that reaches no one (2026-10-30)

For whoever takes up bad-news handling next (thread 9, by the plan's look-ahead) and for the Coach: the
inventory the Coach asked for of news the listing or a storable meets that reaches nobody, or reaches
the wrong party. Spun out of `thread-3-listing_pipeline.md` at the second rework.

The rule now (the Coach, 2026-10-30): a call that cannot give what it asked for throws; news nobody asked
about goes to `onBadNews`; reporting never replaces a throw owed.

## Open
1. `Storable.settle()` returns `{ badnews: [] }` always; the base can produce none, and `Listing.settle(thing)`
   returns `void`, so a source of bad news found at settle has nowhere to go but `onBadNews`.
3. `tellBadNews` does `this.#onBadNews?.(news)`: with no `onBadNews` given the news is dropped. Now only
   news nobody asked about goes this way (a refused cache save or load, a notice's refusal, a background
   refresh refused), so a host without `onBadNews` loses no refusal it awaited.
6. `Storable.receive` ends silently with `{ badnews: [] }` when `reconcileCentral`'s verdict is not a
   `receivedAct` ('older', 'same', 'skip'); a 'skip' (a record that cannot be judged against central) is
   news to no one.
8. A `hydrateAll` that joins a launch the timer made tells that launch's refusal twice: once through the
   trigger's `onTimerRefusal`, once by `hydrateAll`. Rare (both at once), harmless, left.

## Closed
2. `build`'s news: a record `receive` refuses is thrown to the `build(record)` caller; a refused save is told.
4. A malformed notice: `MSX.notice.parse` now runs inside the notice's `outcomeOf`, so it is told as
   'bad_record' rather than thrown into the store's watch callback.
5. `hydrateAll` tells each refused hydrate.
7. A refresh the timer launches: its refusal, storage's or one `receive` throws on the record it brings,
   reaches `onBadNews` through the trigger's `onTimerRefusal`. A `hydrate` caller still has it thrown.
9. `hello`: a refused cache load, and a cached copy that cannot be revived, are told, and hello goes on
   (a cache miss).

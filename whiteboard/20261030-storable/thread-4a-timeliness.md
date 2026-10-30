# Thread 4a: Hydrate and timeliness (2026-10-30)

Branch `20261030-timeliness`, PR #PR, stacked on #370. Justify: green (core 3838 pass, 37 skipped as before, 1 todo, new here).

* **Built**: the Coach's three fixes, each a line or two.
  * (a) `isWholeRecord(record)` in `Storable`, protected, beside `classifyRecordShape` (same banner): `MSX.isTombstone(record) || this.isFullRecord(record)`. `receive` notes success on `this.isWholeRecord(answer)`.
  * (b) `hydrate` passes `this.isWholeRecord(this.#central) ? opts.maxMillisSinceRefresh : 0` to `ensureTimelyWithin`. A draft's central, the never-stored tombstone, is whole.
  * (c) `Trigger.isTimelyWithin` opens with `if (maxMillis === Infinity) { return true }`, and has a doc block now.
  * Tests: `tests/helpers/trigger.test.ts` (new; no test of the trigger existed before, and only `storable.ts` imports it), `tests/models/storable.test.ts` (four describes of `storable.hydrate(opts)`, under a `// == [Timeliness, thread 4a]` banner), `tests/models/box.test.ts` (one describe of `box.receive(rcvd)`). Both model files were new on this branch: their tops are imports and `const held = useModelsWorld()`. No helper was added to `models-world.ts`; `storable.test.ts` has two file-local ones (`timelyBoxOf`, `holdOf`).
  * Word fixes, comments only: three in `storable.ts` (the `#snapshot` and `#replaceSnapshot` docs' "first read", `cacheable`'s "writes to the device cache"), one in `trigger.ts` ("an own write's answer"), and the `MaxTimerMillis` / `MaxTimerHours` docs in `consts.ts`, which said a span past it is "never stale", against the trigger and the Coach's test.
* **Decisions taken**:
  * A damaged record's tombstone ('d') is whole, so `receive` now notes success on it, where it did not before (`'full' || 'gone'` left out `'ouch'`). The Coach's definition says tombstone, and a fetch again would only bring the same damage. Tested in `box.test.ts`.
  * `isWholeRecord` is protected, like `classifyRecordShape`: tests observe it through `isTimely` and the store's `get` calls.
  * The "no launch after a failed fetch" test lets the scheduled timer fire into a scripted refusal, then checks `vi.getTimerCount()` is 0 and nothing more is fetched; a second case fails an on-demand `hydrate` of a draft (no timer ever armed).
* **Discoveries** (for 4b, and anyone on timeliness):
  * `hydrate` calls the world's `ensureTimely` three times when it fetches: `hydrate`'s `ensureReadyToFetch`, the launched `fetch`'s `ensureReadyToFetch`, and `listing.fetch`'s `ensureTimelyWorld`. The trigger launches `tryFetch()` with no opts, so the last two get `{}` and not the caller's `maxWorldMillis`. Left alone (ground rule 1). The tests assert the world comes first and that the `get` comes after it, not the exact sequence, so 4b can change this freely.
  * `mw.setNow` skips a timer that falls due; the timer is still armed and fires on the next `advance`. To test "no timer", start from a draft (none is armed at birth) or let it fire with `advance`.
  * A trigger is born due (`launchAt` = birth), so a thing never fetched is untimely under the listing's horizon whatever it is, Infinity too. Only the per-call `maxMillisSinceRefresh: Infinity` skips the first fetch. 4b's *`send` of a draft with `maxMillisSinceRefresh: Infinity` fetches nothing* passes the option to the verb, which reaches `hydrate` through `ensureReadyToSend`; that works now. The listing-horizon case is an `it.todo` (open question below).
  * With `maxMillisSinceRefresh: Infinity`, a `hydrate` made during a fetch does not join it: it resolves at once. A per-call horizon timely now never joins.
  * A sparse central is fetched by every `hydrate`, Infinity or not, until a whole record lands. A store that only ever answers sparse would be fetched on every verb; nothing loops.
  * `receive` of a sparse record at the same revision as a full central notes no success, as the Coach's definition says.
* **For the Coach**:
  * **Listing horizon of Infinity, thing never fetched**: should a thing made with `maxMillisSinceRefresh: Infinity` skip its first fetch? Today it fetches once (the trigger is born due), then never again; `hello` relies on that to hydrate what it revived from the cache. Recommendation: keep it; the per-call Infinity is the way to say go ahead. `it.todo` in `storable.test.ts`.
  * **"whole" in the spec**: the Coach named it a term; the spec's *Record forms* does not list it yet (the trigger section uses it). Worth a bullet there.

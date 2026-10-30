# Thread 11: ifPresent 'replace', and two listing guards (2026-10-30)

Branch `20261030-if_present_replace`, PR to follow (base `main`), stacked on #384. Justify: green (safebyok 4295 passed).

* **Built**:
  * `ifPresent?: 'replace'` is back in `models-shapes.ts`: `ifPresentVals = ['replace']`, the `ifPresent` checker, the `IfPresent` type, `sendOpts = timelyOpts.extend({ ifPresent: ifPresent.optional() })`. `Store.put(record, expected, ifPresent?)`.
  * `send` parses `sendOpts` first (an `ifPresent` other than `'replace'` refuses `bad_option` before anything is staged), hands the timely rest to `edit`, and `ifPresent` to `listing.put(duck, ifPresent?)` (new second argument, also on `tryPut`), which checks it and passes it to `store.put`. The listing never judges it; storage does.
  * The fake store (`tests/test-helpers/models-world.ts`) honours it: with `expected` null and a live box stored, `put` refuses `stale_write` carrying the box, unless `ifPresent === 'replace'`; a stored tombstone is put over as before. Call log and `willPut` carry `ifPresent`.
  * Guard 1, `#deliver(answer, asked, ifAbsent?)`: an answer whose `scope` differs from the scope asked refuses `bad_record` (`Phrases.AnswerOfOtherScope`), before the world is taken and before any delivery; thrown to the fetch/put/del caller, nothing held or saved. For a refusal answer the scope guard comes first too, so the answer's own refusal is not thrown in its place.
  * Guard 2, `#demandRecordOfVault` now checks every record a cached copy would make an instance of: its central and its staged (`#recordsOf` replaces `#centralOf`). A copy with another vault_tok in either is a cache miss told to `onBadNews`.
  * Spec note in `whiteboard/20261028-storable_base/storable-spec.md` under `ifPresent`; nothing else there touched.
  * Tests: `models-shapes.test.ts`, `box.test.ts` (send), `listing.test.ts` (put, scope guard, staged vault_tok), each in describes appended at the end.
* **Decisions taken**:
  * The fake compares only `expected === null` against a stored live box. Comparing `expected` given to the stored revision broke an existing listing test (a put over a different seeded record), and the plan asks the fake only to honour `ifPresent`; a "compare-and-set holds with `expected` given" case is a scripted `stale_write` plus the call log showing `expected` and `ifPresent` both handed over.
  * `send` with `ifPresent: 'replace'` on a never-stored box needs `maxMillisSinceRefresh: Infinity` (and `maxWorldMillis`) to be meaningful: the default edit hydrates first, and the fetch teaches the box what storage holds, so `expected` is then given. The tests pin this.
  * `listing.put` takes `ifPresent` as a second argument and not an options bag; it is the one option.
* **Deviations**: none. `cacheable`/`ToCacheable` untouched (the Coach has not ruled).
* **Discoveries**: the scope guard overlaps `#demandRecordOfScope` (record against the answer's scope) from #383; together they pin answer scope = scope asked = record scope.
* **For the Coach**: whether `send(…, { ifPresent: 'replace' })` should itself skip the hydrating fetch of `edit` (today the host passes `maxMillisSinceRefresh: Infinity`). Left to the host; say if `'replace'` should imply it.

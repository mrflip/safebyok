# Thread 10: The listing's loose ends (2026-10-30)

Branch `20261030-listing_ends`, PR #TBD, stacked on #382 (thread 9). Justify green: safebyok
4241 passed, 37 skipped, 1 todo; every other package green; build and size budgets unmoved.
Changeset: empty.

## Built

All in `packages/safebyok/src/`, tests beside each (`tests/models/listing.test.ts` has new
top-level describes at the end; `tests/helpers/trigger.test.ts`, `tests/models/storable.test.ts`):

1. **The timer reschedules after any launch that completes.** `Trigger.#launchAlone`: an ok
   outcome schedules the next launch at `eagerFrac` of the horizon after it completes, whether or
   not the launch noted success (`notesOwnSuccess` now means only that `lastSucceededAt` is not
   set by the trigger). A refused launch schedules nothing, so the timer still stops. Effect: a
   box answered by an older record, or a sparse one where nothing whole is held, is retried at
   its horizon instead of waiting for the next call; `isTimely` reads true until that launch is
   due, but `hydrate`'s horizon check (`isTimelyWithin`) still reads `lastSucceededAt`, so a
   hydrate with a horizon still fetches.
2. **`onBadNews` is guarded.** `Listing.tellBadNews` calls the handler in an async wrapper: a
   throw or a rejection goes to `reportToPlatform` and no further (as `Bank.#tellBadNews` does;
   the listing has no logger). `ListingOpts.onBadNews` now returns `unknown`, so a promise-returning
   handler type-checks.
3. **A record whose scope is not the answer's scope is refused `bad_record`**
   (`Phrases.RecordOfOtherScope`), in `#buildOrReceive` (every answer, notice and stale_write
   record passes there), before anything is made or changed. Not in `MSX.answer`, which does not
   know a kind's `scopeOf`.
4. **`hello` checks the cache's load**: `MSX.cacheLoaded` (an array) on the result, and
   `MSX.cacheable` on each copy; a miss is told to `onBadNews`. See *Decisions*.
5. **`Storable` is handed `tell`** (6th constructor argument, `MSX.Tell`, checked by
   `storableArgs`); `Listing.tellBadNews` is protected again. `makeThing(central, staged, tell)`
   takes it from the listing. Tests that build a `Box` by hand pass `mw.tell`.
6. **A refusal reaches `onBadNews` once** when `hydrate` or `hydrateAll` joins a timer launch:
   the listing keeps a `WeakSet` of the news told, as `Vault.#told` does.
7. **TODO.md**, *Soonish*: "Making a box seals it, so a box is never sparse".
8. **The `vault_tok` check before birth**: `#demandRecordOfVault` in `#buildOrReceive`, only where
   no instance is held, throws `unexpected_error` (`Phrases.OtherVaultTokAtBirth`) for a received
   record or a cached copy's central under another `vault_tok` than `BoxWorld.vault_tok`. New
   abstract `Listing.vaultTokOfWorld()`: the box listing's is the world's, the vault listing's is
   null (a vault's `vault_tok` is its own). Held instances still meet `reconcileCentral`'s check.

## Decisions taken

* **Item 4, per copy.** The array is checked whole, but each copy on its own, so one malformed
  copy is a cache miss told to `onBadNews` and the others are revived (the existing "cannot
  revive" test pins that). Checking the whole array as cacheables would drop every good copy.
* **Item 3 sits in `#buildOrReceive`, not `#deliver`**, so `build(record)` and the stale_write
  record share it for free.
* **Item 8 for a cached copy** checks the copy's central; a bad one is told by `hello` as a cache
  miss. A draft is not checked (the box listing stamps the world's own `vault_tok`).
* **`tell` as a sixth positional argument**, not in `StorableOpts`: opts is data a host can read.

## Deviations

None from the plan. `ListingOpts.onBadNews` widened from `void` to `unknown` return (a lint rule
forbids a promise-returning handler for a `void`-returning property).

## Discoveries

* `isTimely` reads true after an older-record fetch now; item 1 changed one thread-5 test's
  assertion (it asserted `isTimely` false) to the next-hydrate-fetches-again behaviour.
* ESLint's `.eslintcache` can serve a stale type for a test file after a type widens; `eslint
  --no-cache` settles it.

## For the Coach

Nothing blocking.

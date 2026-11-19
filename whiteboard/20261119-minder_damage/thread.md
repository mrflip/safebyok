# Thread 4 (sentinel_audit): minder_damage (2026-11-19)

Branch `20261119-minder_damage`, PR [#761](https://github.com/mrflip/safebyok/pull/761), stacked on [#759](https://github.com/mrflip/safebyok/pull/759) (the giver_needs minder line). Proved: `vitest run tests/minding` 268 passed; safebyok lint and `tsc --noEmit` clean; `pnpm justify` at ready (see the PR's **Tests:** line).

What it does: the ThingMinder now reports what it drops, and keeps another bank's records out of its cache.

* **Built**
  * **B1, list's damaged rows** (`ThingMinder.list`). When `answer.damaged_rows` is non-empty, the minder tells the bank's `tellBadNews` one `damaged_row` refusal, `Throwers.childrenStoredDamaged(ask, damaged_rows)`. Its `meta.ask` is the loggable list ask and its `meta.labelpaths` names each damaged child. The news goes out before the TSQ batch, so nothing thrown later can lose it. `list`'s answer is unchanged.
    * The only other consumer of list answers is `Bank.tryListBoxes`, and it is not the same drop: it hands `damaged_rows` to its caller.
    * To carry the labelpaths, big's `RefusalMeta` gains `labelpaths?: readonly string[]` (`packages/safebyok-big/src/refusals/errors.ts`). This is a broadening, which big allows, and it needed no cast.
    * The phrase is `Phrases.ChildrenStoredDamaged`.
  * **C4, local catches answer `unexpected_error`**. Changed: `tryAt`'s catch and `tryWrite`'s pre-check catch. Neither try calls the vaultDB, so each now answers `Errors.isVaultError(err) ? err : Throwers.unexpectedError(err)`.
    * Kept: `#answerOfTSQ`'s `lastErr: Outcome.storageRefusalOf(lastErr)`. The queryFn wraps the vaultDB get.
    * #758's write path calls `vaultDB.tryWriteThing` outside any catch, so there was nothing to change there.
  * **D, `#fetchCar`** now branches on `answer.act === 'gotvoid'`, as `Bank.tryGetBox` does.
  * **E, records of another bank or Thing**
    * A new private `#demandDelivered(record, scoped)` checks a record with `ThingChecks.thingScope.refusingAs('unexpected_error').parseConsistent(...)`, using `Phrases.DeliveredOfOtherScope`.
    * `#sendToTSQ` runs it against the minder's bank scope. This covers notices, write answers and list records.
    * `#fetchCar` runs it against the ask, so the labelpath is checked as well.
    * `bestCarOf` throws `Throwers.carsOfOtherThings()` (`unexpected_error`) for cars of two Things, where it used to answer `delivered`.
* **Where each throw lands, and how it is reported**
  * **Notice:** `hello`'s onNotice now wraps `#sendToTSQ` in a try and tells the bank's `tellBadNews`. `AdapterVaultDB.watch` already catches what onNotice throws, but the `VaultDB` interface does not promise that.
  * **Write answer:** rejects `tryWrite`.
  * **List record:** rejects `list`.
  * **Get:** the queryFn throws, so TanStack puts the query in its error state and the get rejects. A background refresh shows the refusal as `tryAt`'s `lastErr`.
  * **`bestCarOf`:** it runs inside TanStack's fetch and `setQueryData`. Every delivery is now checked before it reaches `bestCarOf`, so its throw is a tripwire for a bug in safebyok.
* **Tests:** one or more for each of items 1, 2 and 4, in `tests/minding/thing-car.test.ts` and `tests/minding/thing-minder/thing-minder-{reads,cache,writes,lifecycle}.test.ts`.
  * The `tryWrite` catch change has no test, because no plausible non-refusal reaches it.
  * D needs no new test: its behaviour is unchanged.
* **Decisions made**
  * **One refusal per list**, not one per damaged row. One refusal gives a device-level handler the bank scope (in `meta.ask`) and the whole set at once.
  * **One check for both kinds of delivery.** A minder scope has no labelpath, so `parseConsistent` compares only userid and banklabel against it, and the labelpath as well against a get's ask. That let one helper serve both.
  * **The list gap, left simple.** In `list`, the listing is set before the records land, so a foreign record's labelpath enters the listing before `#sendToTSQ` throws. I did not add a pre-check loop or reorder. Reordering would change the order of listener events, and the case is an adapter bug.
* **Deviations** (each a contract change, directed or declared)
  * **`bestCarOf`, directed by the Coach's "go".** Before, cars of another scope answered `delivered`, as its doc and a test said. Now it refuses `unexpected_error`. The doc and the test (now the `OtherThings` table) say so.
  * **`#fetchCar` checks scope, pulled forward from E.** The brief named `#sendToTSQ` and `bestCarOf`. Without this check, a fetched record of another Thing with no prior car would land unchecked, and the brief's problem statement names fetched records. Before, such a record was cached under the ask's key. Now the get rejects `unexpected_error`.
  * **`tryWrite` can now reject.** Before, a write answer carrying a record of another bank was cached silently. Now `tryWrite` rejects `unexpected_error`, after the write is made. The broken state is reported where it is met. The alternative was to tell it to `tellBadNews` and answer as the vaultDB did, which would keep `try` from rejecting. See *For the Coach*.
* **Discoveries**
  * `damaged_row` is the bad_news family's kind for this. No new refusal kind was needed.
  * `notes/security.md` has a 2026-11-19 entry for this thread (at the top of *Of Interest*).
* **For the Coach**
  * **tryWrite rejects vs tellBadNews.** I recommend keeping the rejection. The brief says to report damage by throwing where it is detected.
  * **The list gap.** I recommend leaving it, since the case is an adapter bug.

# Thread 1: minder_matrix (2026-11-23)

Branch `20261123-minder_matrix`, PR [#866](https://github.com/mrflip/safebyok/pull/866), from `origin/main` at `c0912015b`. It is a workshop thread, so there is no plan or progress doc. Proved: `pnpm --filter safebyok test` 1615/1615 (the new file has 169), and lint and typecheck are clean. The `pnpm justify` result is in the PR.

* **Built**: `packages/safebyok/tests/minding/vault-minder/vault-minder-chains.test.ts`, with no `src/` changes.
  * It holds 69 rows, run by fetch, by the feed, and mixed, plus 4 checks on the table itself.
  * `tablegen/` beside this file generates the table: `wanted` comes from the principles, and `today` / `todayBy` from a run. To regenerate, run `cycle.sh` twice. The first run dumps, the second writes `today`. Read it before reworking a principle.
* **Rows**: 5 seeds from nothing, the 50-row cross, 12 "newer in its life" rows and 2 "older in its life" rows.
  * The cross is a start a onto a state b, with b's records all older or all newer than a. The states are live+soon, live, dead, dead+soon and bare+soon.
  * A second meaning gets a row only where it ends differently:
    * "Newer in its life" applies to the live starts and dead+soon, for b live+soon, live or bare+soon. It differs in the listing, and a sparse arrival leaves the item in place.
    * "Older in its life" applies only on bare+soon, for b live+soon or live. There the item fills under the soon, whereas an earlier life is ended by principle 5.
  * (a), (b) and (c) are cross cells, found by their blurbs.
* **History**: life 0 at revs 0-2, life 1 at rev 3, life 2 at revs 4-7, life 3 at rev 8, life 4 at revs 9-14, life 5 at rev 15, life 6 at revs 16-19, life 7 at rev 20, life 8 at revs 21-22.
  * A lifenum ticks at each birth and each death; an odd lifenum is a tombstone's, with one revision.
  * Revseq counts on across lives, as `TH.boxTombOf` and `TH.boxRebornOf` make it.
  * Every start sits in lives 4 to 6.
* **Decisions made**:
  * **The listing rule.** `wanted.isListingStale` holds just where the life of the newest record changes. Each row seeds the listing current, through a list. A soon by fetch arrives by a list, which reads the listing anew, so for such a route the runner expects a mark only for a change of life after the last list.
  * **dead+soon is a start earned by its `today`.** Principle 5 makes it bare+soon, but the minder reaches it today.
  * **Mixed mode.** No chain has more than two steps, so the only mixes are gf and fg. That is two per two-step row, deterministic, with no RNG: within "3 draws per row".
* **Deviations**:
  * **The void step was dropped** under the Coach's cap. These rows were cut: a get of nothing stored, the questions from nothing, and the longer chains. The 94-row version had them; see `git log` on the PR.
  * **No sparse tombstone.** The Coach says none can arrive.
* **Ruled out**:
  * `gone` with an even lifenum, and `item`/`soon` with an odd one. `recordOf` throws on these.
  * Older-in-its-life on dead or dead+soon, and newer-in-its-life on dead. A tombstone's life has one revision, and life 6 is born at its soon's revision.
  * The Coach's tuples that restart revseq at a new life (`gone,3,0`, `item,4,0`, `soon,4,0`, `soon,2,2`+`item,2,1`). They were mapped onto the history above.
* **Discoveries (today against wanted, 40 rows)**:
  * **Listing never marked after the seed** (12 rows, listing alone; ordinary). A later life by any route leaves the listing unmarked. Only the first record stored marks it (the seeds).
  * **A dead record is kept after a later life is live** (6 rows; ordinary). These are dead ← live+soon newer and (c), and dead+soon ← each live b.
  * **Principle 5 is not applied** (11 rows; ordinary). An earlier life's item, or null plus a dead record, stays under a later life's soon. These are (a); live, live+soon and bare+soon ← dead+soon newer; dead ← soon 6,17 and dead+soon newer; dead+soon ← newer soons and dead+soon newer; and the dead+soon seed.
  * **dead+soon ← each older b** (5 rows). The start's own departure carries through.
  * **An earlier life lands under a later soon** (4 rows; not ordinary: feed redelivery, or a lagging replica). bare+soon ← gone 1,3, by every route, gives item null + dead 1,3 + soon 4,12. bare+soon ← item 0,1, by the feed, gives item 0,1 + soon 4,12.
  * **stale_read** (2 rows; get only; lagging replica). bare+soon ← item 4,9 is refused, and the item stays undefined.
  * **Get against feed**: only the last two groups' item rows differ. The feed lands an earlier life's item; a get refuses it, which matches `wanted`. A get refuses a same-life older item; the feed lands it, which matches `wanted`.
  * A tombstone delivered by a get lands through the watch even when the get throws `stale_read` (minder.ts: the answer's dbhas is delivered before the verb resumes).
* **For the Coach**:
  * **bare+soon ← item 4,9.** `wanted` contradicts the get contract (minder.ts: "refuses `stale_read`, and changes nothing"). Rule on which gives way.
  * **dead+soon as a start.** Keep it as earned by `today`?
  * **The original tuples.** Confirm the helpers' rule that revseq counts on across lives.

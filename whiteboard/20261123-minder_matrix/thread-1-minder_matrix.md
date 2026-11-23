# Thread 1: minder_matrix (2026-11-23)

Branch `20261123-minder_matrix`, PR [#866](https://github.com/mrflip/safebyok/pull/866), from `origin/main` at `c0912015b`. It is a workshop thread, so there is no plan or progress doc. Proved: see the PR's **Tests:** line; the file has 180 tests over 74 rows, and lint and typecheck are clean.

* **Built**: `packages/safebyok/tests/minding/vault-minder/vault-minder-chains.test.ts`, with no `src/` changes.
  * It holds 74 rows, run by fetch, by the feed, and mixed, plus 4 checks on the table itself.
  * `tablegen/` beside this file generates the table: `wanted` comes from the principles, and `today` / `todayBy` from a run. To regenerate, run `cycle.sh` twice. The first run dumps, the second writes `today`. From a deleted `dump.json`, two runs reproduce the committed table byte for byte. **Once the minder changes, regenerate `wanted` only** (gen.py's head says how): regenerating `today` would re-baseline every tripwire.
* **Rows**: 5 seeds from nothing, the 50-row cross, 12 "newer in its life" rows, 2 "older in its life" rows, and 5 redelivery rows.
  * The cross is a start a onto a state b, with b's records all older or all newer than a. The states are live+soon, live, dead, dead+soon and bare+soon.
  * A second meaning gets a row only where it ends differently:
    * "Newer in its life" applies to the live starts and dead+soon, for b live+soon, live or bare+soon. It differs in the listing, and a sparse arrival leaves the item in place.
    * "Older in its life" applies only on bare+soon, for b live+soon or live. There the item fills under the soon, whereas an earlier life is ended by principle 5.
  * Redelivery: a record the start has cached, again. The item on live and live+soon, the soon on live+soon and bare+soon, the tombstone on dead.
  * (a), (b) and (c) are cross cells, found by their blurbs.
* **History**: life 0 at revs 0-2, life 1 at rev 3, life 2 at revs 4-7, life 3 at rev 8, life 4 at revs 9-14, life 5 at rev 15, life 6 at revs 16-19, life 7 at rev 20, life 8 at revs 21-22.
  * A lifenum ticks at each birth and each death; an odd lifenum is a tombstone's, with one revision. Revseq counts on across lives (the Coach confirmed it).
  * Every start sits in lives 4 to 6.
* **Decisions made**:
  * **Seeds are checked against the correct state.** Each start is seeded by the row from nothing whose chain is its records, and `run.seeded` is checked against that row's `today ?? wanted` by the feed (`seededOf`). Every row's `wanted` is computed from that row's `wanted`, so it starts from the correct state. One source: a seed's departure is a tripwire on its own row only.
  * **A get's refusal is stated only where it matters.** `EndPrecis` adds an optional `isRefused`, which `arrive` reports. A row states `isRefused: false` where a get brings a whole record that is the one cached, or one older than a bare soon of its own life. Today's refusal goes in the get route's `todayBy`. Elsewhere a row says nothing, and the runner does not compare it.
  * **Named caches.** `BareSoon6`, `LiveSoonLater`/`LiveLater` (4,13), `LiveSoon6`/`Live6`, `LiveSoon6Later`/`Live6Later`, `Dead7`, `LiveSoon8`/`Live8`. A state is written as the largest named cache it holds plus spreads (`{ ...BareSoon, item: … }`), and `marked(…)` for a marked listing. The widest row is 204 columns; the three rows past 205 put today/todayBy/blurb on a second line.
  * **The listing rule.** `wanted.isListingStale` holds just where the life of the newest record changes. A soon by fetch arrives by a list, which reads the listing anew, so for such a route the runner expects a mark only for a change of life after the last list.
  * **dead+soon stays in the cross** (the Coach's ruling). Its seed is `BareSoon6` by the principles; today it is `DeadSoon`, the seed row's tripwire.
  * **Mixed mode.** No chain has more than two steps, so the only mixes are gf and fg: two per two-step row, with no RNG.
* **Deviations**:
  * **The void step was dropped** under the Coach's cap, with the questions from nothing and the longer chains. The 94-row version had them; see `git log`.
  * **No sparse tombstone.** None can arrive.
* **Ruled out**:
  * `gone` with an even lifenum, and `item`/`soon` with an odd one. `recordOf` throws on these.
  * Older-in-its-life on dead or dead+soon, and newer-in-its-life on dead. A tombstone's life has one revision, and life 6 is born at its soon's revision.
  * Comparing `isRefused` on every row: it would put a refusal in every older-record row's wanted, which no principle states.
* **Discoveries (today against wanted, 41 rows)**:
  * **Listing never marked after the seed** (12 rows, listing alone; ordinary). A later life by any route leaves the listing unmarked. Only the first record stored marks it (the seeds).
  * **A dead record is kept after a later life is live** (6 rows; ordinary). These are dead ← live+soon newer and (c), and dead+soon ← each live b.
  * **Principle 5 is not applied** (11 rows; ordinary). An earlier life's item, or null plus a dead record, stays under a later life's soon. These are (a); live, live+soon and bare+soon ← dead+soon newer; dead ← soon 6,17 and dead+soon newer; dead+soon ← newer soons and dead+soon newer; and the dead+soon seed.
  * **dead+soon ← each older b** (5 rows). Their `wanted` is `BareSoon6`, now derived from the correct seed; their `today` is `DeadSoon`, the seed's own departure carried through, not a finding of their own.
  * **An earlier life lands under a later soon** (4 rows; not ordinary: feed redelivery, or a lagging replica). bare+soon ← gone 1,3, by every route, gives item null + dead 1,3 + soon 4,12. bare+soon ← item 0,1, by the feed, gives item 0,1 + soon 4,12.
  * **A get refuses an older item of a bare soon's life** (2 rows; get only; lagging replica). bare+soon ← item 4,9 refuses `stale_read` and the item stays unset. `wanted`: the item lands and the get answers.
  * **A get refuses the item already cached under a soon** (1 row, new; get only; lagging replica). live+soon ← item 4,11 by get refuses `stale_read`: the prior is the soon, 4,12. The feed redelivery matches `wanted`. The other four redelivery rows match `wanted` by every route.
  * **Get against feed**: the feed lands an earlier life's item; a get refuses it, which matches `wanted`.
  * A tombstone delivered by a get lands through the watch even when the get throws `stale_read` (minder.ts: the answer's dbhas is delivered before the verb resumes).
  * **The tripwires bite**: with `today` ignored, the failing cases are exactly the row-routes whose tripwire differs from `wanted` (91), plus the table check that reads the dead+soon seed's today. Four rows with a `today` pass by fetch, as before: their today differs only in the listing, which a list step reads anew.
* **For the Coach**:
  * **The two refusals are one rule.** Both come from `#fetchRecord` comparing the answer against the soon. If the minder lands a full record of the soon's life (the ruling), the redelivered-item refusal should go with it.

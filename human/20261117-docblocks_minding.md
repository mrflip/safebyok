# 2026-11-17: Doc blocks of `src/minding/` rewritten on #718 -- one claim the code contradicts, three questions

The doc blocks of `thing-car.ts`, `thing-minder.ts` and `shapes-minder.ts` (`packages/safebyok/src/minding/`), rewritten to
STYLE.md *Writing* and *Comments and doc blocks*, on #718's branch (`20261117-thing_car`), commit `vault: the minder's doc
blocks say ...`. Doc blocks only: no code, name, running comment or `@example` changed, except `CarFreshness`, whose
one-line interface now runs over several lines so that each field has a block.

| File               | Doc-block lines before | After |
| ------------------ | ---------------------: | ----: |
| `shapes-minder.ts` |                     17 |    17 |
| `thing-car.ts`     |                     26 |    25 |
| `thing-minder.ts`  |                     62 |    78 |

`thing-minder.ts` grows by the five field blocks of `CarFreshness` (+10), and by four first lines that were one long line and
now wrap.

## Where the code and the old prose disagreed

* **The class block said "a get or a list refuses until the bank is stored".** The code does not. `list` asks with
  `ifAbsent: 'nil'`, so an unborn root answers `gotvoid` with no children, and `list` resolves `[]`. A get of a root
  resolves its void car. Only a get of a box the vaultDB holds nothing for refuses (`bad_option`, `RootNotCached`), and only
  while no root car is cached. The block now says that, on `get`, with what to do: get the root box first.
* **`staleTime` was "how long a full car stays timely"** (`QueryCacheOpts.staleTime`, `DefaultQueryCacheOpts`,
  `MinderOpts.queryCacheOpts`). `staleTimeFnOf` gives every car but a `behind` or `bare` one the full `staleTime`, so a `gone`
  or `void` car is timely too, and answers `gotgone` or `gotvoid`. The blocks now say "a car".
* **`GotAnswer`'s `untimely` was "older than asked, or lacks the newest record whole".** It also follows any refused get:
  TanStack marks the query invalidated on an error. The `untimely` line now says so.
* **`listen` said what the listener throws goes to "the device's `onBadNews`".** The minder calls the bank's `tellBadNews`,
  which forwards to the device's `onBadNews` (Bank's own doc). Not wrong, but the block now names the call the minder makes.
* **The car check was "on the way out of `mergedCarOf`".** `isThingCar` uses it too, so the phrase is gone.

## Member by member

`thing-car.ts`

* `ThingCar` -- names the cache value as a ThingMinder's, and frozen. Its `fullest` line is kept.
* `DeliverableThing` -- "a record a car is made from". It points to the void sentinel, and no longer redefines it.
* `carOf` -- drops the mapping from records to livenesses, which `ThingCar`'s rows give, and keeps the surprise: a sparse
  tombstone's car is `gone`.
* `mergedCarOf` -- the short headline the reviewer asked for. The second line says when it returns `prior` itself and when
  `landed`.
* `isVaultDBNewer` -- the first clause alone. The reviewer flagged the colon, which repeated the body.
* `isWholeRecord`, `cmpRecords`, `carOfParts`, `newerWholeOf`, `ArgChecks`, `Checks` -- shortened. Unchanged: `Tombstone`,
  `BoxCar`, `GateCar`, `carLivenessVals`, `isThingCar`, `carOfPair`, `sharedCarOf`, `isSameScope`, `isLiveSparse`, and the
  module block.

`shapes-minder.ts`

* `QueryCacheOpts.staleTime`, `DefaultQueryCacheOpts` -- "a car", not "a full car" (above).
* The exported `Checks` destructure -- one line, not the list of what each check covers.
* `MinderGetAsk` -- "a get ask with `ifAbsent: 'nil'` and a `track`", sent exactly as given.
* `MinderAskOpts` -- its option list uses `*` at the top level (the reviewer's `tryAt` finding). It is now the one home of
  that list, and `tryAt` points to it.
* `MinderFriend` -- "the parts of a {@link Bank} a minder uses". The "What a minder reads" opener and the "Internal." are gone.
* Unchanged: the module block, `gcTime`, `MaxGcTime`, `MinderGetAskOpts`, `ThingTies`.

`thing-minder.ts`

* `GotAnswer` -- an act list (`vacant`, `untimely`) under a short headline, not two long sentences.
* `CarFreshness` -- a headline, with a block for each field: `refreshedAt` is 0 for none, and `isTimely` is false wherever
  the act is `vacant` or `untimely`.
* `TSQGotAnswer` -- points to `CarFreshness`, and no longer lists its fields.
* `TSQAnswer` -- "`tryAt`'s answer".
* `MinderOpts` -- "Options for ...". Its `queryCacheOpts` points to `QueryCacheOpts` and no longer restates it.
* Class -- the headline is kept. "Internal: the layers above the core build on it, and a host does not call it." It may be
  made before the bank's birth. `get`, `tryAt` and `list` answer only between `hello` and `goodbye`, and refuse `disabled`
  outside them (a class block may say in one sentence what misuse refuses).
* `make` -- no longer walks its parameters.
* `hello` -- what the minder does until `goodbye`, not the steps of starting. It keeps one consequence of the query defaults
  for a host: a TanStack observer of a `queryKey` fetches and merges cars too.
* `goodbye` -- a get still waiting refuses `disabled` (moved here from `get`).
* `tryAt` -- the option list moves to `MinderAskOpts`. The block keeps what an untimely answer lacks (`val`), and what
  `ifStale: 'refresh'` adds.
* `get` -- a short headline. `stale_read`, with what to do ("A later get asks again"), in place of the state left behind,
  which the reviewer flagged. Also the root-box refusal, with what to do.
* `list` -- what it lists and in what order. Then the cache facts the brief fixes: each record is cached sparse, a `behind`
  or `bare` car is fetched whole by the next get, and a tombstone's car is `gone` and answers from the cache.
* `isStaleAt` -- one line.
* `listen` -- a headline that fits under its signature. Then the four facts: what counts as a change, `isTimely` by the
  minder's own `staleTime`, what it does not do (with "use a TanStack observer for either"), and where a throw goes.
* Private members get a phrase: `#isReady`, `#startVaultDBWatch`, `#backgroundRefresh`, `#doGet`, `#tsqFind`, `#receive`,
  `#doDeliverRecord`, `#tsqGetAskOf`, `#fetchCar`, `#shellAt`, `#demandOwnAsk`, `#demandOwnScope`, `staleRead`,
  `gotAnswerOf`, `staleTimeFnOf`, `keptValOf`. `keyPrefix` and `scope` are reworded.

## Facts dropped that STYLE.md does not plainly cut

* `carOf`: the liveness for each kind of record (`full` whole and live, `bare` sparse, `void` the sentinel). `ThingCar`'s
  rows carry it.
* `mergedCarOf`: "A tombstone newest leaves no fullest record, since a tombstone is whole." `ThingCar` says `fullest` is null
  when gone.
* `isVaultDBNewer`: "its liveness is `behind` or `bare`" (the body, one line below).
* `isWholeRecord`: "passes its kind's record check".
* `cmpRecords`: "(a later life, or a later revision of the same life)", now "life first". The running comment above it keeps
  the detail.
* `ArgChecks`: "as a whole record, a sparse one or the void sentinel has them".
* The `shapes-minder.ts` `Checks`: the list of what each check covers.
* `MinderGetAsk`: that it is "the bank's get ask", made by `makeGetAsk`.
* `MinderOpts.queryCacheOpts`: its restatement of `staleTime` and `gcTime`, now a pointer.
* `make`: "asking `opts.vaultDB` and caching in `opts.tsq`".
* `#startVaultDBWatch`: that the watch's trouble goes to the bank's `tellBadNews`.
* `goodbye`: that it also clears this minder's query defaults.
* `tryAt`: "and whether it is timely" (the answer's `isTimely` says it), and `staleTime`'s unit (still on `QueryCacheOpts`).
* `get`: "That car stays cached, and no longer counts as timely." What a caller acts on is now there instead: a later get
  asks again.
* `isStaleAt`: "`staleTime` overrides the minder's own" (on `MinderGetAskOpts`), and "Never asks the vaultDB".
* `#backgroundRefresh`: that a fetch under way is joined. `get` says a get under way is shared.
* `keyPrefix`: "its root's, without the final '.', selecting the root and everything under it". The running comment above
  `queryKey` keeps the reason.
* `#demandOwnAsk`, `#demandOwnScope`: "Throws `bad_option`".
* `gotAnswerOf`: the act for each case, which `GotAnswer` carries.
* `staleTimeFnOf`: "so that the next get fetches it".

## Proposed renames

* `#doDeliverRecord` -> `#cacheRecord`. Its line is "Merge `record` into its cached car, while minding": "deliver" names the
  vaultDB's side, not what the minder does. Weak, and private.

No other name fails its first line.

## Open questions

1. **The callers by name.** The brief says the minder's callers are a ReactBridge and, later, a Listing class. STYLE.md
   bars naming callers (`#three-questions`) and the future (`#purpose-not-path`), so the class block says "Internal: the
   layers above the core build on it, and a host does not call it." Should it name ReactBridge?
2. **Exports.** `TSQGotAnswer` is exported, but it is built from `GotAnswer` and `CarFreshness`, which are not. By *Be
   generous with exports*, both should be exported. That is a code change, outside a doc-block pass.
3. **`*` or `-` for the top-level bullets.** STYLE.md says `*` at the top level and `-` below. Every Gallant list in
   `notes/gallant-docblocks.md` uses `-` at the top level. I followed STYLE.md, as the reviewer did. One of the two documents
   is wrong.
4. **`ThingCar` could carry its intended use.** VOCABULARY.md's `car` says a host shows the fullest and writes against the
   newest. That is the line a caller most needs, but the code cannot show it, so I left it out. Should it go in?

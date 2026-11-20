# Thread 2: minder_feed (2026-11-20)

Branch `20261120-minder_feed` (the handoff said `20261119-`; the worktree was cut as `20261120-`), PR [#771](https://github.com/mrflip/safebyok/pull/771), stacked on [#769](https://github.com/mrflip/safebyok/pull/769) (`20261119-car_agerank`). Proved: `pnpm justify` green after the catch-up onto 2e14d2b61 (safebyok 1267, safebyok-react 301, safebyok-big 2946, e2e 576).

* **Built**:
  * Each `MinderEvent` (`src/shapes/shapes-minder.ts`) is TanStack's cache event spread into ours, with `car` and `labelpaths` gone. It carries:
    * `type` (`'updated'` or `'removed'`)
    * `action` (`{ type: 'success' | 'error' | 'invalidate' }`, undefined on a removal)
    * a frozen copy of `queryKey`
    * a frozen shallow copy of `state`
    * `userid`, `banklabel`, `labelpath`, `modelkind`
    * `carkind`, which is `'thing'` or `'listing'`
  * A `ThingEvent` also carries `agerank` and its newest record's `revtok`, `revseq`, `am`, `lifeseq` and `lifepath`. Each is undefined where no car is cached. A `ListingEvent` keeps `tag: 'kids'`. The generic form is exported as `MinderEventOf<DataT>`.
  * `InvalidationEvent` is gone. An invalidation is a listing event whose `action.type` is `'invalidate'` and whose `state.isInvalidated` is true.
  * `listen(listener, version)` takes `ThingFormat` and refuses any other value as `bad_record` (`Phrases.FeedVersionOther`).
  * The query key's head is `'sok'` (`#bankKeyHead`).
  * In the giver, `minder-bank.ts` reads `event.state.data` and passes `ThingFormat` to `listen`. Nothing else in the giver changed.
  * The YOLO fix is its own commit, d039cd18a. `list` and `tryWrite` capture `#minding` before their vaultDB await, and cache nothing when a `goodbye` (and perhaps a fresh `hello`) came between. Each still answers what the vaultDB said. The tests are `LateListVaultDB` in `world.ts` and two cases in `thing-minder-lifecycle.test.ts`. Both cases fail without the fix.
* **Decisions made**:
  * **A removal tells no data.** On a removal, `state` is TanStack's state as it stands but with `data` set to undefined, `action` is undefined, and every decoration is undefined. This keeps the class doc's "only a removal breaks the run: it tells no car".
  * **Freezing.** The event, `action`, the `queryKey` copy and the `state` copy are frozen, but not deeply. A deep freeze would freeze TanStack's own error object in place. `state.data` is already frozen: cars are deep-frozen, and listings are frozen by `stableListingOf`.
  * **`state.error` is passed raw**, as TanStack holds it (typed `DefaultError`). The minder's own refusal is what lands there, since the query function throws it.
  * **Kept** `carkind` and the listing's `tag`, so that a consumer can tell the two kinds of event apart without parsing the key. **Dropped** `of.parentpath`: it duplicated `labelpath`.
  * **A version mismatch refuses `bad_record`.** No `bad_option` refusal kind exists, and I did not add one.
  * **A late `list` still answers its labelpaths and does not refuse.** That matches what it did after a plain `goodbye` before this thread. Contrast `#doGet`, which refuses `disabled`. A late `tryWrite` still returns its answer, as its doc says.
* **Deviations**:
  * **TanStack's names are kept as they come**: `type`, `action.type`, `state`, `queryKey`. STYLE.md bars `type` for a kind and `state` as a public name. I kept them because they are someone else's interface, spread under the Coach's ruling. A `//` comment in `shapes-minder.ts` says so.
* **Approaches set aside**:
  * Passing the live `Query`, or `state` itself. The live `Query` is barred by the handoff, and `state` itself would let a listener mutate TanStack's cache.
  * Deep-freezing the event. Rejected for the reason under *Freezing*.
  * Mapping `state.error` through `Outcome.storageRefusalOf` as `tryAt` does. That is not a plain spread any more; see *Open questions*.
  * A `card`/`tag` shape for invalidations. That was the Coach's opinion, not a ruling, and `state.isInvalidated` already says it.
* **Discoveries**:
  * The base checkout holds the Coach's uncommitted hand edits to `thing-minder.ts` (`Labelpathed`, `childrenQueryKey`) and to `thing-minder-keys.test.ts`. They will meet this thread's `'sok'` key-head change and the `#minderEventOf` rewrite when they are swept in.
  * The host keys in `react-giver.ts` still spell `'safebyok'`. They belong to thread 8.
  * Thread 8's bridge can copy `event.state.data` under `event.queryKey` and compare `event.agerank` without parsing the key.
* **Open questions**:
  * **Raw `state.error`.** Should the event map `state.error` to a storage refusal, as `tryAt` does? I recommend keeping it raw: the error is already ours, and mapping it is not a spread.
  * **Late `list`: answer or refuse?** Should a `list` answered after `goodbye` refuse `disabled`, as `get` does? I recommend answering, as it did before this thread, and leaving a contract change to a later thread.

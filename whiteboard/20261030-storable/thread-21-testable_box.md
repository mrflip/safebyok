# Thread 21: TestableBox, in place of keptOf (2026-10-31)

Branch `20261031-testable_box`, PR #TBD, stacked on #390. Justify: see the PR's Tests line.

* **Built**: in `packages/safebyok/tests/test-helpers/models-world.ts`, `TestableBox extends Box` with `get _cheat_central()` and `get _cheat_staged()` (the storable's protected `central` and `staged`), and `TestableBoxListing extends BoxListing`, whose `makeThing` makes a `TestableBox` and whose `build`, `fetch`, `put`, `del` and `at` are typed to give one (each asserts the instance is one). `boxListingOf` and `fakeSealBoxListingOf` return a `TestableBoxListing`; `FakeSealBox` extends `TestableBox`. `keptOf`, `mw.kept` and `KeptBoxListing` are gone, and with them the test-side recording through `[MSX.KeepCopy]`. No change under `src/`; the changeset is empty.
* **Decisions taken**:
  * Typing by the narrow override, not by a `cheatsOf(box)` helper: no cast at a call site, and a box any other route hands out (`things`, `tryFetch`) is not typed testable until a test needs it.
  * Where `keptOf` was compared with a save, the save is compared with the cheat getters: `expect(save.cacheable).to.deep.include({ central: box._cheat_central, staged: box._cheat_staged })`.
  * Where `keptOf` was snapshotted before and after, the pair `{ central, staged }` is.
  * Boxes made by hand (`new Box(...)`, `SpiedBox`) are `TestableBox`es now, so the getters reach them.
  * `listing.test.ts` spies `makeThing` on `TestableBoxListing.prototype`, as `BoxListing.prototype`'s is overridden.
* **Deviations**: two `eslint-disable-line unicorn/prefer-private-class-fields`, on the two cheat getters: the Coach named them with the underbar, and a `#`-name would not be visible to a test.
* **Discoveries**: the `storable.test.ts` "cacheable" describe tested the copy `settle` hands the listing. It now reads the copy the listing saved (`lastSaveOf`) where the box was built (shape, frozen, no sidecar), and `box.sparse` with the cheat getters where an edit staged a record, as an edit saves nothing to the cache. So the copy's frozen-ness after an edit is no longer asserted anywhere; the listing's `#copies` is private. The Coach may want a test through the `[KeepCopy]` channel itself when its name is settled.
* **For the Coach**: the two disables above.

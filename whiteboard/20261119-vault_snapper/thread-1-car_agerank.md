# Thread 1: car_agerank (2026-11-19)

Branch `20261119-car_agerank`, PR [#769](https://github.com/mrflip/safebyok/pull/769), on main. Proved: `safebyok` 1259 tests, `safebyok-react` 301, both typecheck and lint clean; `pnpm justify` at ready.

* **Built**:
  * The orchestrator's invariant patch, as its own commit (893ad4c40): a listener's run of cars and listings never goes back.
  * `ThingCar.agerank` (`src/minding/thing-car.ts`, `agerankOf`), made once in `carOf` through `frozenCarOf`. It joins with `~` four fields:
    * the newest's lifepath
    * the newest's revseq, padded
    * the liveness
    * the revseq of `fullest ?? newest`, padded, or `'----------'` for a bare car
  * `Revseq.padded` (`src/shapes/primitives.ts`), exported from `core` and `storage` beside `Lifeseq`. It shares `paddedSeqOf` with `Lifeseq.ofLifenum`, so -1 spells `-000000001`.
  * `CarChecks.thingCar` refines `car.agerank === agerankOf(car)` (new phrase `CarAgerankNotOwn`), so every car through structural sharing is checked.
  * The liveness `behind` is now `bhnd` everywhere:
    * `carLivenessVals`, `ThingCar`, `CarChecks.bhndCar`, the phrase `CarBhndOfOtherRevision`
    * the minder's doc blocks, `react-bridge.ts`'s doc, the react fake `bhndCarOf`
    * VOCABULARY.md's *car* and *fullest* rows; the *car* row now names agerank and "frozen through".
  * Records are deep-frozen as they land, with es-toolkit's `deepFreeze` in `frozenCarOf`.
  * Goodbye then hello: `#minding` holds a symbol per stretch of minding (`#isReady` reads it), and `#doGet` refuses `disabled` when it resumes in a different stretch (2ea6a9c71).
* **Decisions made**:
  * **The agerank is a stored field**, not a getter, so that thread 8's structural sharing reads it at no cost.
  * **The placeholder for no fullest is `'----------'`**: as wide as a padded revseq, and below each, since `'-'` < `'0'`. It sorts below the shell's `-000000001` too, but a bare car never meets the shell's revseq: a bare car's newest is live and sparse.
  * **A gone car heard sparse and heard whole get the same agerank**. They have the same revisions and liveness, and `bestCarOf` keeps the prior on a tie. A test pins this.
  * **`carOf` freezes the bhnd pair before checking it**, so a pair it refuses is left frozen. This was simpler than a check before the freeze, and a refused pair is a bug or a bad record either way.
  * **A token, not a counter**, for the stretch of minding. A `symbol | null` field says both "minding?" and "which stretch?", with no arithmetic.
* **Deviations**: none from the plan. The car invariant is checked in the `thingCar` union's refine, not in each liveness's `obj`, so it is written once.
* **Discoveries**:
  * **Freezing happens in place.** It freezes the objects the vaultDB answered with (MemoryVaultDB's rows, test fixtures), not copies. Nothing in either package wrote into one, and every test passed.
  * **Reproducing the goodbye bug.** TanStack's `QueryCache.clear()` does not cancel a retryer that has already resolved, so its `#doGet` resumes a few microtasks later. The lifecycle test sweeps goodbye then hello across hops 0 to 11 after the vaultDB answers. Hops 3 to 6 put `box/openai` into the new root listing before the fix, and the sweep's tripwire asserts that it reaches both outcomes.
  * **The same gap is open for `list` and `tryWrite`.** A list or a write answered after goodbye then hello caches into the new stretch, against tryWrite's doc ("A write answered after `goodbye` caches nothing."). I did not fix it: it is outside this thread. Comparing the same token in `#doList` and the write's landing would close it.
* **For the Coach**:
  * **"Is deep freezing car in the plan?"**: yes. It is in the plan's thread 1 bullet ("Records deep-frozen as they land") and in vault-pieces.md, *Fixes riding along* ("A car's records are not frozen"). It is built here.
  * **Hatch**: an `eslint-disable-line unicorn/prefer-simple-sort-comparator` in `thing-car.test.ts`'s agerank ordering test. The lint rules refuse a bare sort as well; `<` is the comparison thread 8 will make, and `localeCompare` would not order by code unit as `<` does.

Approaches set aside:
* An agerank check through an intersection or a `custom` on each liveness: the union's refine says it once.
* A getter for agerank on a class: cars are plain frozen objects, and TanStack Query copies them as plain data.

# Thread 7: test_helpers (2026-10-15)

Branch `20261015-test_helpers`, PR [#80](https://github.com/mrflip/safebyok/pull/80), stacked on #75 (thread 6), which stands on #70,
then #66. Justify: green (root 109, safebyok 793, safebyok-convex 268, safebyok-react 28,
demo 124; `pnpm size` within every budget).

**Line counts** (every tracked test file and test-helper module): 9,976 before, 9,999 after (at filing; the figures below are from the ready report).
The call sites went from 8,893 to 8,429 lines (-464). The helper modules, their tests and the two
setup files went from 1,083 to 1,566 (+483). Of that growth, about 210 lines are the helpers' own
tests and doc blocks, which STYLE.md requires. Largest single drop: `vault.test.ts`, 3,015 to 2,770.

* **Built**:
  - **`safebyok/testing`** (published; changeset `20261015-test_helpers.md`, minor, additive):
    - `memoryVaultOpts(overrides?)`: everything `openVault` needs, over fresh memory stores.
    - `describeDeviceDB(title, make)`: the DeviceDB suite. memory and idb both run it, and it
      replaces their five near-duplicate tests.
    - `holdNextCall(target, verb)` and `beforeNextCall(target, verb, meanwhile)`: one
      interception helper in place of the racing world's four `holdNext*` copies and
      `twoDeviceWorld`'s if/else.
    - `tallyWatches(vaultDB)`: was byte-identical in the core and React tests.
    - `freshDbName()`: was in both `idb.test.ts` and `browser.test.ts`.
    - `noBoxYet` and `thisVault`: were defined in four files and written out about 14 times.
  - **Core tests**. `vault.test.ts`'s `makeWorld(defaults?)` gains five helpers:
    - `openUnlocked(passphrase, overrides?)`: 148 open-then-unlock pairs.
    - `stateOnOpen(overrides?)`: 24 open-then-check-state pairs whose handle was not used again.
    - `rememberedUnlock()`: one dialect for the plain and racing worlds.
    - `deafVaultDB()`: four hand-built copies.
    - `boxlabelsOf`, now used everywhere it fits.

    The racing world is `makeWorld({ keyDeriver })`, so `openUnlocked` reaches its deriver too.
    `vault-db.test.ts`'s six try/catch refusal captures became `TH.expectRefusal`, keeping their
    `instanceOf(VaultError)`.
  - **Convex** (`tests/test-helpers.ts`, ours only): one `convexRefusalOf`, typed
    `SafebyokErrorData`, replaces the two `refusalOf` copies. `openOver` sits on
    `memoryVaultOpts`. `convex-vault-db.test.ts` gains a local `settledWatch`.
  - **React** (`vault-provider.test.tsx`, local):
    - `makeWorld().props`, spread into each `<VaultProvider>`.
    - `shownState`, `expectShown`, `expectOutcome` and `putThroughNewVault`.
    - `grabber()` keeps the whole `useVault()` value, replacing two inline grabbers.
    - `TH.wakeupAtNextTick` and `TH.expectRefusal` where the test wrote them out by hand.
  - **Demo** (`tests/test-helpers.tsx`, ours only):
    - `makeWorld({ vaultDB? })` and `world.openUnlocked()`.
    - One `fakeAnthropic(status, jokeText)` replacing `fakeAnthropic` and `makeFakeAnthropic`.
      `KnockKnock.test.tsx` stubs the global `fetch` with it through a three-line local.
    - `VaultProbe` and `expectProbeState`, replacing two probes. SessionBar's `vault-state` test
      id became `state`.
  - **Root**: `tests/test-helpers.ts` with `makeScratchDir(prefix)`, which registers its own
    removal through vitest's `onTestFinished`. It replaces six beforeEach/afterEach pairs.
  - **Config** (library first, in place of hand-kept hooks):
    - `restoreMocks: true` in the core, React and demo vitest configs; `unstubGlobals: true` in
      the demo's.
    - A `tests/setup.ts` running Testing Library's `cleanup` after each test, in the React
      binding and the demo.
    - These removed about 20 `afterEach` hooks. Running without the setup file fails 20 React
      tests, which proves it is what unmounts.
    - The versioned-updates suite keeps its explicit restore-then-real-timers `afterEach`, for
      its ordering.
  - **eslint**: `vitest/expect-expect`'s `assertFunctionNames` is now `['expect*', 'TH.expect*']`
    in all five configs, so a test helper named `expect...` counts as the test's assertion.

* **Review** (`fixed`): d2ff093, Convex "hears nothing once unsubscribed" counts after its
  `unsubscribe()` again (`settledWatch` had moved the count earlier); f7e2447, the changeset
  names `AsyncVerbOf`, also exported. Then, by the worker: 9e1b457 freezes `noBoxYet` and
  `thisVault`. Left as PR open questions: `tallyWatches` counts every unsubscribe call, so a
  double close can hide a leaked watch; `beforeNextCall` on a verb already spied records a call
  twice; `convexRefusalOf` and `tallyWatches`' refused-open example have no test of their own;
  `stateOnOpen` leaves its vault open (as the inline code did).

* **Decisions taken**:
  - **Published or local.** Published: what a host or adapter author would want (memory options,
    the DeviceDB suite, interception, watch tally, fresh IndexedDB name, the `u1` expectations).
    Local: whatever leans on this repo's own components or fixtures.
  - **`expect*` as a naming convention for assertion helpers.** This is better than listing each
    helper by name in five configs.
  - **Mid-flight race narratives left as written.** The survey proposed `landMidway(gate,
    operation, meanwhile)` for about 25 blocks (hold, start, reached, act, release, await).
    Those blocks are the record of the lock-race security property, and they read as a story.
    Squeezing each into one call saves about 75 lines and hides the order.
  - **Not taken, as line-neutral or obscuring**:
    - a steerable clock helper; `signedOut()`/`stuckWatch` factories;
    - `boxCkey`/`tamperBox`, `loggedLevels`, `TH.FakeKey`, `seedAndRender`/`readAsOwner`;
    - Convex `putBox`/`boxIn`/`deployedVaultDB`, `stageWith` in `release.test.ts`, `itEach`.
  - **Not taken, as changes to what is asserted**: "quotes nothing" checks through `thrownText`
    would strengthen the tests, which this thread was told not to do.

* **Deviations**:
  - The React "passes every option through" test now checks its two refusals with
    `TH.expectRefusal` (name and kind) rather than `isVaultError` (class and kind). The test is
    about the options reaching the vault, not about the class.
  - `describeDeviceDB` checks the idb adapter's round trip with `deep.equal`, as the memory
    test did, where the idb test checked only `vault_id`. That adds an assertion and drops none.
  - `passphrase-modal.test.tsx` keeps its own `afterEach(cleanup)`. #67 owns the file, and a
    second cleanup is harmless.

* **Discoveries**:
  - In `convex-vault-db.test.ts`, the "unsubscribes once" test must count after its double
    unsubscribe. Taking the count when the watch settles would weaken it, so that site still
    counts late.
  - `onTestFinished` works from a `beforeEach`. `makeScratchDir`'s test proves it.
  - **Candidates once #67 merges**: the modal test's `vaultUnlockingWith`, `submitPassphrase`,
    `Catcher` and `wrong`, beside `vault-provider.test.tsx`'s Probe, world and `expectShown`.
    They might move to a React `tests/test-helpers.ts`. Once two files share them, they should.

* **For the Coach**:
  - Three new runtime imports in `safebyok/testing` (`localVaultDB`, `memoryStore`,
    `memoryDeviceDB`, for `memoryVaultOpts`). The build is unbundled, so they resolve to the
    same `dist/` modules `safebyok` uses: there is no second copy of `VaultError`.
  - `beforeNextCall` casts its target to a string-keyed record (`as unknown as`) after its
    signature has typed the call. Vitest's `spyOn` cannot be typed over a generic key.

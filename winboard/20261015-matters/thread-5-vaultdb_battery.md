# Thread 5: vaultdb_battery (2026-10-16)

Branch `20261016-vaultdb_battery`, PR [#114](https://github.com/mrflip/safebyok/pull/114),
stacked on [#113](https://github.com/mrflip/safebyok/pull/113) (rebased at filing onto `5c0c0a7`).
Justify: green -- safebyok 1268 passed, 22 skipped; indexeddb 135/9; postgres 215/9; graphql
203/9; convex 325/18; react 101; argon2-wasm 44; demo 148/11; root 123. `pnpm size` green.

* **Built**:
  - **The battery grew** (`packages/safebyok/tests/test-helpers.ts`, `describeVaultDB`), taking
    what adapters proved by hand that is really the contract: 1.1 text read back exactly, never
    Unicode-normalized (from Postgres); 1.2 two user ids differing only in how a letter is
    composed kept apart (from Postgres); 3.2 two updates of one bundle at once, one lands and one
    is `stale_write` (from IndexedDB); 3.3 two first writes of one lockbox, and two replacements of
    one revision, likewise (from IndexedDB); 3.4 an erase made at once with a replacement wins;
    3.5 an erase of the vault made at once with a write into it leaves nothing (from IndexedDB).
  - **A new option, `pushes: true`**, runs 6.1's push tests: a subscriber hears each kind of write
    (create, update bundle, write, erase lockbox, erase vault), and an unsubscribed one hears no
    more, unsubscribing twice, while another watch still hears. Wired for `localVaultDB`,
    `idbVaultDB`, `postgresVaultDB` (with `listen`) and `graphqlVaultDB`. Checked to pass over
    Convex's both clients too, but not wired there (below).
  - **Options wired where an adapter can**: `makeVaultDBFor` for the README route recipe
    (Postgres) and the README Yoga recipe (GraphQL), so line 5.4 runs across both wires.
  - **Bespoke tests trimmed** to what is each adapter's own. Core: the colon-user test (1.2).
    IndexedDB: its four races, its push test, and a field-stripping test that was the base
    class's. Postgres: text normalization, a bundle's changed `vault_id` (base class, 5.1).
    GraphQL: a stale and a signed-out refusal. Both recipes: their refusal-kind and signed-out
    tests (5.4 now runs over them).
  - IndexedDB's README says what the battery checks. Changeset (minor: `safebyok/testing` grows).
* **Decisions taken** (YOLO):
  - **A flag, not a factory, for push.** 6.1 lets a backend with no push never call, so the battery
    cannot require it; `pushes: true` says the adapter does. "From another device" needs a second
    adapter over one backend, which is thread 6's (below).
  - **A watch settles by a read and 50 ms** before the push tests count (`watchSettled`): a
    backend serving calls in order has the watch by the read; GraphQL's subscription starts on
    its own time, as its own tests already allowed for.
  - **The recipes' stand-in session header is now URI-encoded.** The new 1.2 test signs in as a
    user id holding U+0301, which an HTTP header (Latin-1) refuses; the header is the test's
    stand-in for a session cookie, not the recipe, so nothing in the README changes.
  - **Kept, though near the battery**: Postgres's per-verb `identity_revoked` tests (they prove no
    statement reaches the database, which the battery cannot see), GraphQL's "never lets the
    Client's cache answer" (2.1 across devices, and urql's cache is the adapter's own risk), every
    cross-device push test, IndexedDB's "rings for no write that was refused" (stricter than 6.1).
* **Discoveries**:
  - **Convex gets no capped factory, cheaply.** Its limit (`MaxVaultLockboxes`, 8000) is a
    constant inside the component's server code: a Convex component takes no configuration a test
    could lower, and `vi.mock` cannot reach the constant's uses inside `tallies.ts` itself. Filling
    8000 lockboxes per test is seconds each, and planting a tally would not be honest. Its
    component tests prove the count limit (and 4.3) at 8000, once. A test-only lower limit needs a
    source change (a limit passed into the tally functions), not worth it for four lines it
    already proves by hand.
  - **After #111, `safebyok-convex` runs no battery of its own**: the whole Convex run moved to
    `e2e/` (thread 15 flags it). TODO's "each package runs the battery itself" then holds for
    every adapter but Convex.
  - The duplicated test helpers across adapters -- `refusalOf` (Postgres, GraphQL, IndexedDB),
    `eventually`, `changeCounter`, `aWhile` -- are looser than the core's `TH.expectRefusal`
    (which checks `instanceOf(Error)`, name and kind). Not contract; a cleanup for later.
* **What is left, proposed as threads** (the audit, by package):
  - **Convex, after #111 lands** (sonnet, small): in `e2e/tests/convex/convex-vault-db.test.ts`,
    pass `pushes: true` (passes today) and `makeVaultDBFor` if #111's restack lost it; drop "leaves
    another user's vault as it was" (5.4), "hears nothing once unsubscribed" (6.1), and fold the
    per-verb `identity_revoked` loops to one verb's message-and-cause check (5.4 runs every verb).
    In `packages/safebyok-convex/tests/component/vaults.test.ts`, the groups getBundle/createBundle,
    updateBundle, getBox/updateBox, listBoxSummaries, eraseBox and eraseVault repeat lines 1.1 to
    3.5 a layer down; keep what is the component's (Convex fields stripped, validator refusals,
    `watchVault`'s signature, tallies, the weight and count limits, large vaults). Do not move files.
  - **Postgres's cap tests, after thread 12**: "never refuses a replacement for the count",
    "refuses a first write under a boxlabel already taken" (4.3) and "makes room with an erase"
    (4.4) repeat the battery, which runs them given `makeCappedVaultDB`. Thread 12 can drop them
    as it rewrites that section, or a sweep after.
  - **Helpers sweep, after threads 7 and 12** (sonnet): adapters' `refusalOf` and its `.kind`
    checks to `TH.expectRefusal`; `eventually`/`changeCounter`/`aWhile` into `safebyok/testing`.
* **For thread 6 (race_helper)**: every race line in the battery (3.1; 3.2, 3.3, 3.4, 3.5's new
  races; 3.7; 4.5) makes its writes at once through **one** adapter, and every in-tree backend
  serializes them (PGlite, fake-indexeddb, convex-test, a Map), so they prove the outcome, not the
  race. They need: (a) a second-device factory -- two adapters over one fresh backend sharing no
  connection or lock -- which also answers 2.1's "on any device" and 6.1's "from another device";
  (b) a deliberately broken adapter: checked here by hand, a `MapVaultDB` whose check and write
  straddle an `await` fails 3.1 and all five new races (3.7 rightly passes), so they do catch a
  check-then-write within one process; whether they catch it across connections is (a)'s; (c) for
  4.5, writers that really overshoot a best-effort limit, so "nothing is lost" is checked past the
  limit and not only at it. `watchSettled` is the battery's one timing guess; a helper that knows
  when a watch is live would replace it.
* **Thread 12 (#113)** made NOTIFY opt-in (`VaultNotifySql`); its test database installs it, so
  Postgres's `pushes: true` holds. Its rewritten cap group still repeats 4.3 and 4.4 (above).
* **Review** (`thread-reviewer`, verdict `clean`, no commits): nothing lost in the trim, and each
  new test caught a scratch break. Minor, left: IndexedDB's stray-field test is covered by the
  core's base-class test, not a battery test over `idbVaultDB` (sound: it overrides no public
  verb); 6.1's push tests count "more calls than before" and give a leaked listener one tick, so an
  adapter pushing twice or late could slip past (for thread 6's watch-is-live helper); the race
  tests prove outcomes within one process, not races across connections (thread 6).
* **Filing**: rebased onto #113; one conflict, IndexedDB's tests, where #109's key-range erase
  test sat beside the races removed here: kept it, dropped the races.
* **For the Coach**: whether `safebyok-convex` should run the `ConvexClient` half of the battery in
  its own package again (thread 15's question, with a cost: a test-only entry for the fake
  deployment).

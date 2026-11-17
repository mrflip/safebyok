# Thread 6: race_helper (2026-10-16)

Branch `20261016-race_helper`, PR [#119](https://github.com/mrflip/safebyok/pull/119), filed stacked on
[#111](https://github.com/mrflip/safebyok/pull/111) (cut from #114, now on main). Justify: green -- safebyok 1435 passed, 33 skipped;
indexeddb 139/10; postgres 221/13; graphql 208/13; convex 337/16; react 101; argon2-wasm 44; demo
148/15; root 123. `pnpm size` green.

* **Built**:
  - **A race driver** in `safebyok/testing` (`packages/safebyok/tests/test-helpers.ts`):
    `raceEveryWay(race)` runs a race under every schedule it can make, each over fresh devices on a
    fresh backend, checking the verdict after each -- the moves together; staggered 1-3 microtasks
    and 1-2 ticks, each way round; and one move held before each of its round trips while the other
    moves, each way round (four racers: each held midway, all let go together). A **`Turnstile`** is
    where a device's round trips pass; `throughTurnstile(turnstile, client, verbs)` wraps a client's
    methods in it. A device that cannot move while another waits at the turnstile fails the race
    (a shared lock or queue, or a lock held across round trips -- which the baseline rules out). A
    move making more than 12 round trips fails loudly, rather than leave the gaps past them unheld.
  - **`describeVaultDB` takes `makeDevices(turnstile)`**: devices over one backend, sharing nothing
    else. Every race line (3.1, 3.2, 3.3 twice, 3.4, 3.5, 3.7 twice, 4.5's four racers) runs under
    the driver; without `makeDevices`, through one adapter, its title saying so. New: 2.1 across
    devices (and a check that the devices are two adapters over one backend), 4.5 past the limit
    (a vault filled by a device allowed more, read and listed by a tighter one), 6.1 from another
    device. All are exported, runnable alone, as `vaultDBTimingChecks(...)[handle].check()`.
  - **Push tests that know a watch is live**: `watchSettled`'s 50 ms is gone. A probe write heard
    says a watch is live; each call reads the vault, and some read must find each write (an early
    push, or none, fails). Unsubscribe is fenced by three writes, not one tick. `push_from_the_start`
    holds a watch's start at the turnstile while a write lands.
  - **`expectRoundTripsThroughTurnstile(makeDevices)`**: an adapter shows its factory wires the
    turnstile into every write. Every in-tree adapter is wired: local and the core's `MapVaultDB`
    (in-process, no round trips), Postgres (each device its own client over the one PGlite; `query`
    and `listen` through the turnstile), GraphQL (each device its own browser and server; the
    turnstile at the server's database client), IndexedDB (`idb-keyval`'s `createStore` mocked in
    its test file, so each transaction passes the turnstile of the database a race made), Convex
    (`query`/`mutation` through it).
  - **Proof the races are honest** (`test-helpers.test.ts`), over an in-memory backend reached by
    round trips: honest adapters pass (one counting apart really overshoots, four landing where two
    had room); each broken one is caught -- a check-then-write split by an await or across round
    trips; the same with the second device six round trips late (only the holds catch it: unwired,
    all six races pass, and a test says so); a split behind a lock the devices share (unwired, it
    fools the battery); one adapter for both devices, or a backend each; a listing cut at the limit;
    a bell rung early, leaked, deaf to other devices, or a watch that starts late and never calls.
  - **`postgresVaultDB` calls a subscriber once as its listen begins** (and so GraphQL's subscription
    sends one as it starts): a write made while the watch was starting was never heard. VAULTDB.md
    6.1 now asks a late watch to call once live. VAULTDB.md gains *Proving the races*; README,
    `notes/security.md`, changeset (safebyok minor; postgres, graphql patch).
* **Decisions taken** (YOLO):
  - **What is generic, and what the adapter's.** Generic, in the battery: the races and their
    verdicts (the contract is the same for every adapter), the schedules (interleaving is about
    time, not the adapter), and the honesty checks (devices distinct, one backend, no waiting on a
    held device). The adapter's: how to make a second device over the same backend, and where its
    round trips are -- only it knows its client. **Not a hook between check and write**: an honest
    adapter's check and write are one round trip, so there is no between to mark, and asking an
    author to mark it presumes what the test exists to find. A turnstile at *every* round trip
    finds a gap wherever a broken adapter left one. Helpers offered: `throughTurnstile`,
    `expectRoundTripsThroughTurnstile`, and `raceEveryWay` for an adapter's own races beyond the
    contract.
  - **One turnstile per backend, not per device.** IndexedDB's devices share one `idb-keyval` store
    per database, so no per-device boundary exists there. It suffices: a held schedule starts the
    held move alone, so the nth pass is its own.
  - **GraphQL's turnstile is at the database**, where a server's write is one statement, not at
    the wire.
  - **Convex wired with `pushes: true`** (pulled forward from thread 5's proposed Convex thread:
    found passing, left unwired; push from another device needs it).
  - **Four lint configs aligned** to the core's `assertFunctionNames: ['expect*', 'TH.expect*']`
    (postgres, indexeddb, graphql, argon2-wasm had drifted), so a `TH.expect*` helper asserts.
* **Deviations**: a product change in a test thread (`postgresVaultDB`'s call as its listen
  begins): the honest push check exposed it, and the fix is three lines. It touches
  `convex-vault-db.test.ts`, which #111 would move: expect a small conflict there at #111's restack.
* **Discoveries**:
  - **Every symmetric split was caught by "made together"** (both checks run before either write).
    The turnstile earns its place on asymmetric paths, and in finding shared locks.
  - **The first sweep stopped silently at six round trips** and missed a late device's gap; now it
    fails at twelve.
  - **The liveness check first passed on Postgres and GraphQL by luck** (the turnstile's microtask
    let LISTEN in first); holding the listen at the turnstile made it fail honestly, then the fix.
  - Yoga's SSE push test went vacuous after the fix; push tests now count from `liveWatch`.
  - **Test time**: the core's tests ~2 s to ~18 s (the honesty proofs' 2 s deadlines); Convex's
    package 5 s to ~10 s (a fresh deployment per schedule). Justify ~52 s to ~60 s.
* **What the races prove, and do not** (VAULTDB.md, *Proving the races*): no round trip is ever
  split, and every in-tree backend runs one call at a time -- Convex's and IndexedDB's real promise,
  but **not Postgres's at READ COMMITTED**: its one-statement writes under concurrent connections
  rest on thread 11's verdict, not a test.
* **For the Coach**:
  - **A real-Postgres CI job** -- a service container, a `pg` Pool per device -- is the only way to
    test lines 3.x under concurrent statements. The Coach has since put a test container for every
    backend on TODO; this is that item's case for Postgres.
  - The 6.1 change: `postgresVaultDB` (and so GraphQL) calls once at the start of a watch. A host
    counting calls sees one more.
  - **`vaultDBTimingChecks`'s handles are snake_case** (`rival_first_writes`), named like labels,
    though code reads them as properties, which STYLE spells camelCase. Rec: camelCase before a
    release; one commit.

## Review follow-up

* **Review** (`thread-reviewer`, verdict `fixed`), two commits on the branch:
  - `b7b57bc7`: `makeDevices`'s and `expectRoundTripsThroughTurnstile`'s docs claimed every round
    trip is shown to pass the turnstile; the check counts at least one pass per write, so a second
    round trip that skips the turnstile would go unheld. Both now say so.
  - `6859dba3`: an honesty proof that 4.5's crowd race fails an adapter whose refused racers leave
    their lockboxes behind (no proof had shown that race failing anything).
  - Its other findings were minor and left; none was relayed with a change asked of the code.
* **The 6.1 behaviour change kept**, by the orchestrator's YOLO ruling.
* **Filing** onto #111 (`606270ea`), with `--onto` from `6c8aa59`. Git's rerere replayed a stale
  resolution into the 3.5 group of `test-helpers.ts`, reviving the one-adapter race test this
  thread replaced; removed, the rest checked line for line against the original commit. #111
  split Convex's suite: the `ConvexClient` half took the wiring as it stood, and the
  `ConvexReactClient` copy in `e2e/tests/convex/` gained the same (`makeDevices`, `pushes`, the
  wiring test). Justify at the top: safebyok 1465 passed, 33 skipped; indexeddb 143/10; postgres
  223/13; graphql 210/13; convex 261/8; e2e 84/8; react 109; argon2-wasm 44; demo 153/15; root
  155. `pnpm size` green. No flakes seen.

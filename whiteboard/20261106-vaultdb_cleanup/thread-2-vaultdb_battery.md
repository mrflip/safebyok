# Thread 2: vaultdb_battery (2026-11-06)

Branch `20261106-vaultdb_battery`, PR #558, stacked on #555. Justify: green (safebyok 2265 tests in
68 files; memory-vault-db and vault-db-new 100 between them).

* **Built**:
  * **`describeVaultDBBattery(label, opts)`**, exported from `safebyok/testing`
    (`tests/test-helpers/vault-db-battery.ts`, with `-gets`, `-puts`, `-dels`, `-races` beside it).
    An adapter hands it `makeVaultDB(opts?)` and `_cheat_rowsOf(vaultDB)`, a `VaultDBRowCheats`:
    `plantVaultRow`, `plantBoxRow`, `vaultRowOf`, `boxRowsOf`. Each may be async. `boxRowsOf`
    answers a Map snapshot, not a live map. Optional: `makeTwin` (a second store over the same
    rows; without it the races run over one store), `makeCappedVaultDB(maxBoxes)`,
    `_cheat_failNextCall`, `watches` (default true). A case needing a missing hook is skipped
    (`it.skipIf`), and the stand-in hook throws a TypeError if reached.
  * Thread 1's tests (`vault-db-new-puts.test.ts`, `vault-db-new-dels.test.ts`, the store-facing
    half of `vault-db-new.test.ts`) moved into the battery and were deleted. `vault-db-new.test.ts`
    keeps only what tests the base itself (FailingVaultDB, RefusingVaultDB, plain-vs-try parity).
    `tests/storage/memory-vault-db.test.ts` runs the battery over MemoryVaultDB, with a
    `failNextCall` that spies every do* to throw once.
  * New cases: delVault landing between a gate verb's doGetVault and doPutVault answers
    `vault_gone` (ride-along a); delete and rebirth there answers `vault_mismatch`; two devices
    racing (births, replacements, first writes, two boxes, delVault vs putBox, two gate verbs, a
    cap); bank isolation over near user_ids (`u1:`, `u1|`, `u1%3A`, ...); box isolation under a
    near vaultlabel and another applabel; a sidecar kept byte for byte; 25 boxes listed; watch
    scope (bank vs vault), unwatch, a twin's writes heard; a store's own failure answering a
    VaultError, then the next call working.
  * **`safebyok/storage`**, a new package entry (`src/storage/index.ts`; tsdown entry;
    package.json `typesVersions` by hand, as `dom`). It exports VaultDB, DeviceDB, MemoryVaultDB,
    MemoryDeviceDB, the answer and do* types, Awaitable, ckeyOf, every storage shape, checker and
    row helper, the lease shapes, and the throwers with VaultError, outcomeOf and their types.
    `gateIssue` is left out: only the base raises it. Proof: every name `memory-vault-db.ts` and
    `memory-device-db.ts` import is exported there (checked by hand).
  * Storage fixtures (`bankScope`, `vaultScope`, `boxscope`, `vaultScopeOf`, `boxscopeOf`,
    wayins, `vaultAt`, `boxAt`, the tombstone builders) exported from `safebyok/testing`, so an
    adapter's own tests can share them. `storage-world.ts` holds fixtures only now.
  * Ride-alongs: (b) `Phrases.RegisteredAtNotStored`; (c) VOCABULARY's **damaged** row; (d)
    models-world's `factsOf` lost its `meta`.
* **Decisions taken**:
  * A separate `safebyok/storage` entry rather than the front door: a host's autocomplete never
    meets the adapter contract, and an adapter's imports name one door.
  * Named `describeVaultDBBattery`, not `describeVaultDB`, so nobody mistakes it for the old
    battery in `safebyok-old`.
  * Watch cases wait with `vi.waitFor` and assert order-free members, and negative checks wait
    `aWhile` first. Nothing relies on microtask timing, for threads 3, 4 and 6.
  * The twin defaults to the store itself. An adapter whose twin is a second client (Postgres,
    Convex) gives `makeTwin` for the real race.
  * No teardown hook. An adapter that must close connections tracks what its factory made and
    closes it in its own afterEach.
  * Titles carry no refusal kind (#549); a kind is asserted where it is the behaviour.
* **Deviations**: I pulled the storage fixtures' export forward, since adapters will want them.
  The battery's doc blocks are one line; the `@example` was dropped for that reason.
* **Discoveries**:
  * attw (strict) needs node10 resolution, and tsdown does not write `typesVersions`, so a new
    entry needs its line added by hand.
  * `beforeNextCall` intercepts only the first call; a nested same-name call passes through. That
    is what lets `slipInFront`'s meanwhile call twin.delVault on the same store.
  * Lint rules a battery author meets: `unicorn/no-await-expression-member`,
    `unicorn/max-nested-calls` (pull `priorOf(box)` out), `prefer-smaller-scope`.
* **For the Coach**:
  * STYLE.md says "outside the core, the main entry exports each validator by name". Adapters
    now import storage validators from `safebyok/storage`. Should I add a STYLE line saying so?
  * Pre-existing `eslint-disable`s in `memory-vault-db.ts` are unchanged. I added none, and no
    `ts-expect-error`.

# Thread 4: refusals_and_catchup (2026-10-16)

Branch `20261016-refusals_and_catchup`, PR [#132](https://github.com/mrflip/safebyok/pull/132),
stacked on [#127](https://github.com/mrflip/safebyok/pull/127). Justify: green; core 1677 passed /
33 skipped, React 111, demo 162, every other package as on #127. `pnpm size`: openVault
**24.7 kB** against main's 23 kB (thread 1's 30 kB covers it), everything 31.81 kB.

The per-row ledger the orchestrator sweeps by is beside this file:
`thread-4-refusals_and_catchup-ledger.md` (every G### closed or not, and where).

* **Built**:
  - **Refresh, one at a time** (`refresh`, `readStorageAlone`, `refreshAfterThat` in `vault.ts`):
    one in flight, every request meanwhile sharing one more run after it.
  - **One catch-up before a kind is named**: `refreshOnStale`/`catchUp` after a stale refusal;
    `decipherOrCatchUp` before `damaged_lockbox`. A failed catch-up is `stale_write` with its
    cause, never retried blind (`isCaughtUpStale`). `VaultSnapshot.syncing`.
  - The storage watch (`watchRefresh`) warns once per failing streak and `log`s once on recovery.
  - `newer_format` (errors.ts; `newerBundle()` in vault-db.ts, its own constructor), thrown by
    `readBundle`/`createBundle`'s `checkBundle` and by `eraseDamagedVault`.
  - `DamagedLockbox.revision_id` (`listedOrDamaged`); `store()` over a damaged box writes over the
    listed revision (`listedRevisionOf`), erasing first only when there is none.
  - A lockbox under an epoch neither the bundle's nor the prior's lists damaged (`isUnderHeldKey`).
  - `openVault`/`eraseDamagedVault` take only `instanceof VaultDB`. `destroy()` on a handle that
    saw no vault refreshes first. After a change to the ways in has landed, a failed mark write
    or remembered-unlock write is logged, not thrown (`raiseMarkAfter`).
  - **The Coach's rulings, mid-build**: `lockSoon()` is soft (an unlock or change under way
    finishes; no generation raised); a hard lock refuses a `read()`/`use()` in flight after its
    last await (G119, part two); `whenIdentityRevoked` is gone, from core and `VaultProvider`
    (G119, part one); `rolled_back` locks as `identity_revoked` does, one rule in
    `RefusalPolicy.decide` (G516, first bullet).
  - **Thread 3's leftovers, all six**: (1) the drop timer waits `dueAt - clockNow()` after a late
    ring, and the timed test world now fakes `Date` so clock and timers move together; (2) and (3)
    the device mark is `safebyok-mark-v3` with a nullable `seen`, so `destroy()` keeps the lock
    generation and a lock with no mark writes one at generation 1; (5) `store()`'s stale catch uses
    `keyInHand()`; (6) every device-store verb is wrapped (`deviceTroubleAsConditions`), not just
    the remembered-unlock read; (7) `keptMark(call)` tags its warning with the caller.
  - Docs: README (two locks, untrusted storage, damaged lockboxes, `newer_format`, logging),
    VAULTDB.md (*Who does what*, 3.5, 5.5), VOCABULARY, errors.ts, React and Convex READMEs,
    `notes/security.md` (five entries at the end, three older ones marked revised), the changeset.

* **Decisions taken**:
  - **The mark's shape, not `eraseMark`-skipping**, fixes (2) and (3): a lock before any vault is
    seen must persist a generation somewhere, so the mark can stand with `seen: null`.
  - **Every device-store failure is `storage_unavailable`** (leftover 6 asked for the open only):
    a kind for every condition is a non-negotiable, and `lock()` now tells the snapshot `locked`
    even when the device store fails.
  - **`store()` over a damaged box takes its revision from the snapshot's listing**, not a fresh
    read: no new VaultDB verb (thread 5's base is next), and storage arbitrates, so a stale
    listing costs one refusal and retry, never a record.
  - **Who hears `vault_locked` after a catch-up relocks**: `store()`, `read()`, `use()`. `erase()`,
    `destroy()` and the ways-in changes stay `stale_write` (strawman: news the user must hear).
  - **A `read()` whose catch-up fails throws the catch-up's own refusal**: whether the box is
    damaged is unknown, so neither `damaged_lockbox` ("erase it") nor `stale_write` fits.
  - `syncing` goes false on any failed refresh, foreground ones too; recovery is said at `log`.
  - Soft `lockSoon()` still forgets the remembered unlock at once (thread 3's choice), and with no
    key held it is soft too; only a failed clock read makes it hard.
  - `rolled_back` at open forgets the remembered unlock, as `identity_revoked` at open does.
  - Logger story calls: `untrustedStorage` (was `whenIdentityRevoked`), `expiry` (new).

* **Deviations**:
  - **The single-flight refresh queue is hand-rolled** (about 20 lines). Library-first says find
    one: `p-limit` and kin serialize but do not coalesce, the debounce family is time-based, and
    a runtime dependency is no two-way door this sprint. Raised for the Coach below.
  - Touched `safebyok-react` (the `whenIdentityRevoked` prop, `syncing` in its empty snapshot, a
    README line) and the demo's dashboard test, which now waits for its read before locking: a
    lock landing mid-read now refuses it, correctly. G333 untouched, as struck.

* **Discoveries**:
  - **A pre-existing race**: during a ways-in change, this handle's own bell refresh can read the
    new bundle before `reviseUnlocks` sets it, judge the key `outlived`, drop it and erase the
    remembered unlock. `takeUpUnlock` restores the key in memory, but that erase can land after
    the new record, so the next open asks for the passphrase. Safe direction; serialization does
    not cure it. A small later thread: don't judge `outlived` against a bundle this handle wrote.
  - Thread 2: the format snapshot lists `safebyok-mark-v3`, and `DamagedLockbox` has a field.
  - Thread 5: `listedOrDamaged` returns `revision_id`; `eraseDamagedVault` checks `mayBeNewer`
    before soundness; `newer_format`'s constructor is `newerBundle()`.
  - Restack with thread 7: three lines of `vault-provider.tsx` (the dropped prop), mechanical.
  - `vi.setSystemTime` shifts pending fake timers, so `advance` (clock alone) makes them ring
    late: what the late-ring test relies on.

* **For the Coach**: the *Open matters* list in the PR body and the report: the hand-rolled
  queue, the pre-existing race, and five calls above that a reviewer may want to see.

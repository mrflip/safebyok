# Thread 1d: lease_thing (2026-11-25)

Branch `20261125-lease_thing`, PR #TBD, stacked on #903 (line #900 -> #902 -> #903). Proved: `pnpm --filter safebyok
lint` and `typecheck` clean; the package's whole suite 2114 tests in 33 files (lease 102, proving, ctx-bytes, both
deviceDB batteries green).

* **Built**:
  - `src/shapes/shapes-stamps.ts`: `LeaseRecord` is `discrim('am', [live, tombstone])`. Live: every Thing sparse field
    at `labelpath` `lease/<gate label>` (`LeaseLabelpath`, `leaseLabelpathOf`), the stamp, `lease_key`,
    `bank_key_lease_wrapped`, `ends_at`, `gate_revseq`; refined by `isLabelLast`, `isLifepathOwn` (lifepath is the
    lifeseq alone), `isParityRight`, `isOfItsGate` (labelpath agrees with `gate_labelpath`). Tombstone: the Thing fields
    alone, the first three refines. Also `liveLeaseRecord`, `leaseTombstone`, `leaseShell`, `liveLeaseSparse`,
    `leaseSparseOrShell` (the last two strip, so a `Lease` passes). `LeaseTombstone = TombstoneOf<LeaseRecord>`.
    `isLabelLast` is now exported from `shapes-thing.ts`.
  - `src/models/lease.ts`: `Lease implements LeaseStamp, Sparse<LiveOf<LeaseRecord>>`; `make` takes a
    `LiveOf<LeaseRecord>` and tattoos every field but the keys (the `label`/`labelpath`/`am`/`written_at` getters are
    gone; `scope` stays a getter). Statics, section `[Records]`: `shellOf(gateScope)`, `nextRevisionOf(followed,
    written_at?)` (Thing fields only; same life +1 revseq after a live lease, keeping `born_at`; next life after a
    tombstone or the shell, born at `written_at`), `makeNextRecord(live, { ends_at })` (same keys and stamp: the
    softlock), `tombstoneOf(live, written_at?)` (accepts a `Lease`).
  - `Proving.buildLease(gate, cited, followed)`: `followed` is `Sparse<LeaseRecord>` (a live record, a `Lease`, a
    tombstone, or `Lease.shellOf`); it checks the revision's scope against `Lease.shellOf(cited)` (refuses
    `LeaseOfOtherGate`); `ends_at = min(proved_at + gate.leaseMillis, FarFuture)`; `gate_revseq = cited.revseq`. The wrap
    still binds `[bankStamp, stamp]` only.
  - `LeaseGate.leaseMillis` (WorldLeaseGate reads `device.leaseMillis`); `GateRevisionedStamp` gains `revseq`;
    `WorldGateFriend.renewal()` answers the world's Lease (typed `Sparse<LeaseRecord>`) and the gate falls back to
    `Lease.shellOf(this)`; a birth's lease follows `Lease.shellOf(cited)`.
  - deviceDB: every `row` name is gone (`storedLeaseOf`, `MemoryDeviceDB._cheat_leases()`, `stowLease(record)`).
    Tests: `liveLeaseRecordOf` (was `liveLeaseRowOf`), `leaseTombstoneOf` kept, `TH.leaseShellOf`, `TH.FakeLeaseMillis`.
  - Exports: `safebyok/storage` adds `LeaseLabelpath`, `leaseLabelpathOf`, `LeaseScopepath`, drops `LeaseRow` and
    `LiveLeaseRow`; `safebyok/core` adds `LeaseLabelpath`, `LeaseTombstone`, `LeaseFormat`, `leaseLabelpathOf`;
    `safebyok/browser` adds `scopepathOf`, `LeaseScopepath`.
  - Type test in `tests/models/lease.test.ts` (*a lease record, as a Thing's types read it*): `Tombstone<Lease |
    LeaseRecord>` equals `LeaseTombstone`, `Sparse`, `ShellOf`, `LiveOf` and `BaseThing.cmp` ordering.
  - Docs: VOCABULARY *lease record* rewritten, *lease row* dropped; G4 drift entry and the two-tabs wontfix row say
    lease record; a `notes/security.md` entry (ends_at and revision fields are unauthenticated: the wrap binds the
    stamp alone; no exposure beyond G4).
* **Decisions made**:
  - **Lifepath stays the lifeseq alone**, though the labelpath has two segments: a lease has no life above its own, and
    its life must not reset with a gate's or bank's. So it fails a Thing's `isLifepathDeep`, which is fine, since no
    Thing check ever sees it (`'lease'` stays out of `Thingkind`).
  - **revseq keeps counting across lives**, as `BaseBox.nextRevisionOf` and `tombstoneOf` do: after the shell (-1) it is
    0; after a tombstone at n, n+1. `cmp` orders by lifepath first, so this is only bookkeeping.
  - **`born_at` is one field**: the stamp's (bound into the wrap) and the Thing's life birth coincide, since a renewal
    keeps the life and the born_at, and a new life is born at its `proved_at`.
  - **`ends_at` comes from `LeaseGate.leaseMillis`**, since `proved_at` is minted inside `buildLease`. Capped at
    `Consts.FarFuture` so an `autolockMinutes: Infinity` host (ForeverMillis) still passes `epochMillis`.
  - **The gate gets the Lease itself from `renewal()`**, typed as its Thing fields. Set aside: `BaseThing.sparseOf(lease)`
    does not type-check (TypeScript relates `Pick<Lease>` to `Pick<LeaseRecord>` by variance, and a Lease lacks the
    keys), and `{ ...lease }` trips `no-misused-spread`. The gate already holds a new Lease before `attachLease`.
  - Statics named after their models: `shellOf` (BaseThing), `nextRevisionOf`, `tombstoneOf` (BaseBox),
    `makeNextRecord` (Gate). `makeNextRecord` takes `{ ends_at }` only: the one revision 1b writes.
  - `leaseTombstoneOf` (the test builder) keeps its name: it has no "row" in it; `liveLeaseRowOf` became
    `liveLeaseRecordOf`.
* **Deviations**: `world.leaseEndsAt` still reads `proved_at + leaseMillis` (1b moves it to `ends_at`; the two agree but
  for the FarFuture cap). `LeaseSparse` (= `LeaseStamp`) is left as it was.
* **Discoveries**:
  - `Sparse<X>` of anything not assignable to `X`'s constraint member fails by variance: `Sparse<Lease>` is not a
    `Sparse<LeaseRecord>`, though `Lease` is. Pass a Lease where `Sparse<LeaseRecord>` is wanted; don't pick it.
  - zod's `discriminatedUnion` accepts refined objects here.
  - The deviceDB files by bank scope alone, while a lease's labelpath names its gate: two gates' leases would share
    one slot. Only the main gate exists today.
  - For 1b, each move is one call: stow on attach needs the Lease's record (only `Lease.#record` has the keys; a
    method on Lease that stows it, or a peek, is 1b's call); lock is `deviceDB.stowLease(Lease.tombstoneOf(lease))`;
    take-up is `Lease.make(record, { gate })`; softlock is `Lease.makeNextRecord(record, { ends_at })`; a grant after
    a tombstone is `proving.buildLease(gate, cited, peekedTombstone)`.
* **For the Coach**: the wrap deliberately binds no life, revision or `ends_at` (so a softlock needs no proof);
  `ends_at` is therefore unauthenticated on disk, which G4's trust boundary already covers.

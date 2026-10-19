# Thread a_sec2: security follow-up to a_sec (2026-10-19)

Branch `20261019-a_sec2`, PR (draft, number on push), stacked on #205 (B2 `lease`). Justify: green
at the first milestone (core 2640 incl. 35 skipped).

* **Built** (so far):
  * **The create window** (`src/vault.ts`). A first unlock's make captures `#makesStandDown`'s
    signal as it writes its vault props; a read's revocation (now `#heedRevocation`, split out of
    `#takeStorage`) aborts it and makes a new one (`#standDownMakes`), so one signal serves every
    make in flight. An aborted make puts no vault props back; the grant then finds its props
    outrun, takes nothing up and writes no lease; the unlock refuses `vault_locked`. Race test in
    `tests/vault/vault-races.test.ts` (*a first unlock's make, and a read that finds the vault gone
    while it is under way*), failing at base.
  * **The stale-read rollback**: `isNewerCopy(inHand, fresh)` (same `vault_id`, a lower
    `unlock_epoch` or `vault_key_epoch` read) is no revocation, and never replaces the props in
    hand at the read's end. Race test: *a read that began before this device's own change to the
    ways in landed*, failing at base. No new reads.
  * **`#checkListed` reads nothing**: synchronous, from the listing in hand; `#ensureLease`'s
    `beforeAsking` is synchronous and `why` is not read twice. Tests reworked in
    `vault-lease.test.ts` (the listing is as fresh as `staleMinutes` keeps it); the a_fixes
    changeset's sentence edited to match.
  * TODO.md *Soonish*: cross-device invalidation, by a token each device authenticates.
* **Decisions taken**:
  * One shared stand-down signal, replaced at each revocation, rather than a field per make (as
    `#takeUp` has): two unlocks may make at once on one handle, and a single field would let one
    overwrite the other's.
  * The make captures the signal just before `ensureVaultProps`, not at the start of the make: a
    revocation before the write cannot be of the vault it writes.
  * The stale read is told by epochs (same vault, lower epoch), not a read sequence: storage never
    takes a vault's epochs back (the mark refuses one that does), so the comparison is obviously
    right, and no counter is added. The read's box listing is still taken.
* **Discoveries**:
  * A make stood down by a revocation of *another* device's vault (V0 made and deleted elsewhere
    while this make wrote V1) refuses `vault_locked` though V1 stands. Fails safe: the next read
    takes V1 up, and the next unlock opens it.
  * The stale-read fix covers the same vault only. A read that began before the make's write and
    resolves `null` after the make put its props in hand still revokes them (the make then
    refuses `vault_locked`); fails safe, and catching it needs a read sequence.

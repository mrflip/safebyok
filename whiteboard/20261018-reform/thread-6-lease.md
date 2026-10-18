# Thread 6: lease (2026-10-18)

Branch `20261018-lease`, PR #TBD, stacked on #163 (line main → #159 → #160 → #161 → #162 → #163).
Justify: green -- core 2115 passed | 35 skipped; react 218; indexeddb 135 | 10; convex 258 | 8;
postgres 246 | 14; graphql 239 | 14; fastkey 49; demo 190 | 16; e2e 81 | 89; root scripts 258.

* **Built**: the device unlock is the lease, repo-wide, in one `crypto:` commit. `DeviceUnlock` →
  `Lease` (format `safebyok-lease-v1`, fields `lease_key`, `vault_key_lease_wrapped`);
  `makeLocalUnlockKey` → `makeLeaseKey`; the DeviceDB's `readLease`/`writeLease`/`eraseLease`;
  `UnlockExpectation` → `LeaseExpectation`; `forcePassphraseReentryHours` → `leaseHours` (option
  and react prop), `reentryWindowMillis` → `leaseMillis`, `LeaseHours`, `MaxLeaseHours`; internal
  `rememberDevice` → `grantLease`, `rememberedUnlock` → `takeUpLease`, `takeUpUnlock` →
  `takeUpVaultKey`. The lease ctx's format and purpose moved; `ctx-bytes.test.ts`'s lease literal
  moved in the same commit, nothing else there. Every "remembered unlock" in code, docs, test
  titles, the demo's DeviceDB panel and TH's DeviceDB battery is a lease. The `Lease` schema
  snapshot is rewritten under its new format. `notes/security.md` has the entry (sonnet subagent).
* **Decisions taken** (derived names, YOLO):
  * `Ckeys.unlock` → `Ckeys.lease`, `Ckeys.isUnlock` → `Ckeys.isLease`, the stored ckey kind
    `unlock^` → `lease^`. Public (Ckeys is exported), so added to VOCABULARY.md's *Old names*.
  * `TH.unlockOf` → `TH.leaseOf` (published in `safebyok/testing`).
  * Internal: `forgetUnlock` → `forgetLease`, `forgetUnreadableUnlock` → `forgetUnreadableLease`;
    the zod pieces behind `leaseHours` are `leaseHoursOrDefault`, `someMillis`,
    `leaseHoursAsMillis`; the test world's `rememberedUnlock()` → `readLease()`,
    `rememberedDeadlineOf` → `leaseDeadlineOf`, `holdNextRemember` → `holdNextLease`; react's
    `windowCount` → `leaseCount` and its TH `DefaultWindowMillis` → `DefaultLeaseMillis`.
  * The device-store failure messages say "the lease it keeps for this vault"; the `stale_write`
    from a lease write says "no lease was granted"; the open's warning says "This device's lease
    could not be read or would not open".
  * "Window", where it meant how long a lease lasts, became "lease" in the docs I was already
    editing (types, vault, README, react dialog). The react dialog's `windowLine` and
    `messages.ts`'s "The window" doc lines were left: not retired words.
* **Deviations**:
  * **No IndexedDB version bump.** The handoff expected an object store to rename. There is none:
    the lease and the device mark share one store (`records` in `<dbName>:device_db`, from
    `safebyok/idb`), told apart by ckey; `safebyok-indexeddb` holds only the vault store and has
    no lease store. What follows the rename is the ckey kind, `unlock^` → `lease^`.
    `idbDeviceDB`'s existing stray sweep (rows under any ckey but a lease's or a mark's are
    deleted unread at the next `readLease`/`eraseLease`) drops the old row; the mark survives.
    A new test in `tests/idb.test.ts` writes a lease under `unlock^` beside a mark and shows
    exactly that. `safebyok-indexeddb` changed only its README (and a ckeys test row).
  * The changeset lists `safebyok`, `safebyok-react` and `safebyok-indexeddb` (minor). Convex,
    postgres and graphql changed only README lines or test titles; the group is `fixed`, so they
    bump regardless.
* **Discoveries**:
  * A host DeviceDB that hands back an old record makes the vault erase it and warn once (the
    "could not be read" warning): the changeset says so.
  * `takeUpLease` is one function with the contract thread 8's `hello()` wants: called once the
    bundle is read, it unlocks from the lease when one fits and opens, and otherwise erases what
    does not fit and leaves the vault as it stands. Its doc block says so.
* **Retirement grep** (handoff's patterns, quoted in the PR): survivors are VOCABULARY.md's
  *Old names*, the old `notes/security.md` entries, the verb "unlocks" (incl. VOCABULARY's lease
  row, "lets this device unlock again", which matches `device unlock` case-insensitively), and
  `unlock^…`/`["unlock",…]` as an earlier version's ckey in the `isLease` example and the sweep
  tests (none match the patterns).
